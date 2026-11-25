-- =============================================================================
-- 1100 · Recebimentos: pagamentos (idempotentes), estorno, saldo anterior,
--        ajustes, confirmação/recusa dos avisos de Pix e painel atualizado
-- =============================================================================
-- Mesmo padrão das vendas: id gerado no app, CREATED / DUPLICATE / CONFLICT,
-- validação no servidor, nada apagado (só cancelado/estornado com motivo).
-- Pagamento comum: equipe (pode vir da fila do celular, sem internet).
-- Estorno, saldo anterior e ajustes: só a DONA (são correções autorizadas).

create or replace function private.request_hash(p_body jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_body::text, 'UTF8')), 'hex')
$$;

create or replace function private.check_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v) not between 3 and 200 or v ~ '[[:cntrl:]]' then
    perform private.raise_ldr('LDR_INVALID_REASON');
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pagamento (dinheiro ou Pix recebido direto pela Rose)
-- -----------------------------------------------------------------------------
create or replace function public.register_payment(p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_id       uuid;
  v_hash     text;
  v_found    record;
  v_customer uuid;
  v_amount   bigint;
  v_method   text := p_payment ->> 'method';
  v_received timestamptz;
  v_note     text := nullif(btrim(coalesce(p_payment ->> 'note', '')), '');
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_id := private.try_uuid(p_payment ->> 'id');
  if v_id is null then
    perform private.raise_ldr('LDR_INVALID_PAYMENT');
  end if;
  v_hash := private.request_hash(p_payment);

  select p.business_id, p.request_hash into v_found from public.payments p where p.id = v_id;
  if found then
    if v_found.business_id = v_business and v_found.request_hash = v_hash then
      return jsonb_build_object('status', 'DUPLICATE', 'payment_id', v_id);
    end if;
    perform private.audit(v_business, 'SYNC_CONFLICT', 'payments', v_id,
                          jsonb_build_object('request_hash', v_hash), 'Pagamento reenviado com o mesmo id e dados diferentes');
    return jsonb_build_object('status', 'CONFLICT', 'payment_id', v_id);
  end if;

  begin
    v_amount := (p_payment ->> 'amount_cents')::bigint;
    v_received := (p_payment ->> 'received_at')::timestamptz;
  exception when others then
    perform private.raise_ldr('LDR_INVALID_PAYMENT');
  end;
  if v_amount is null or v_amount not between 1 and 100000000
     or v_method is null or v_method not in ('CASH', 'PIX') or v_received is null
     or (v_note is not null and (char_length(v_note) > 200 or v_note ~ '[[:cntrl:]]')) then
    perform private.raise_ldr('LDR_INVALID_PAYMENT');
  end if;
  if v_received > now() + interval '10 minutes' then
    perform private.raise_ldr('LDR_PAYMENT_IN_FUTURE');
  end if;
  if v_received < now() - interval '30 days' then
    perform private.raise_ldr('LDR_PAYMENT_TOO_OLD');
  end if;

  select c.id into v_customer from public.customers c
  where c.id = private.try_uuid(p_payment ->> 'customer_id') and c.business_id = v_business;
  if v_customer is null then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_FOUND');
  end if;

  begin
    insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, note,
                                 request_hash, created_by)
    values (v_id, v_business, v_customer, v_amount, v_method, 'MANUAL', v_received, v_note, v_hash, (select auth.uid()));
  exception when unique_violation then
    select p.business_id, p.request_hash into v_found from public.payments p where p.id = v_id;
    if found and v_found.business_id = v_business and v_found.request_hash = v_hash then
      return jsonb_build_object('status', 'DUPLICATE', 'payment_id', v_id);
    end if;
    return jsonb_build_object('status', 'CONFLICT', 'payment_id', v_id);
  end;
  return jsonb_build_object('status', 'CREATED', 'payment_id', v_id);
end;
$$;

-- Estorno: o pagamento fica no histórico como estornado. Pagamento de venda paga
-- na hora não se estorna sozinho: cancela-se a venda (que estorna junto).
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_payment  public.payments%rowtype;
  v_reason   text;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  select * into v_payment from public.payments p where p.id = p_payment_id and p.business_id = v_business for update;
  if not found then
    perform private.raise_ldr('LDR_PAYMENT_NOT_FOUND');
  end if;
  if v_payment.status = 'REVERSED' then
    return jsonb_build_object('status', 'ALREADY_REVERSED');
  end if;
  if v_payment.source = 'SALE_PAID_NOW' then
    perform private.raise_ldr('LDR_PAYMENT_OF_SALE');
  end if;
  v_reason := private.check_reason(p_reason);
  update public.payments p set status = 'REVERSED', reversed_at = now(), reversed_by = (select auth.uid()),
    reverse_reason = v_reason
  where p.id = p_payment_id;
  return jsonb_build_object('status', 'REVERSED');
end;
$$;

-- -----------------------------------------------------------------------------
-- Saldo anterior (dívidas do caderno) e ajustes
-- -----------------------------------------------------------------------------
create or replace function public.create_opening_balance(p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_id       uuid := private.try_uuid(p_entry ->> 'id');
  v_customer uuid;
  v_amount   bigint;
  v_date     date;
  v_note     text := btrim(coalesce(p_entry ->> 'note', ''));
  v_existing public.opening_balances%rowtype;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  begin
    v_amount := (p_entry ->> 'amount_cents')::bigint;
    v_date := (p_entry ->> 'reference_date')::date;
  exception when others then
    perform private.raise_ldr('LDR_INVALID_ENTRY');
  end;
  select c.id into v_customer from public.customers c
  where c.id = private.try_uuid(p_entry ->> 'customer_id') and c.business_id = v_business;
  if v_customer is null then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_FOUND');
  end if;
  if v_id is null or v_amount is null or v_amount not between 1 and 100000000 or v_date is null
     or v_date > (now() at time zone private.business_timezone(v_business))::date
     or char_length(v_note) not between 1 and 200 or v_note ~ '[[:cntrl:]]' then
    perform private.raise_ldr('LDR_INVALID_ENTRY');
  end if;

  select * into v_existing from public.opening_balances o where o.id = v_id;
  if found then
    if v_existing.business_id = v_business and v_existing.customer_id = v_customer and v_existing.amount_cents = v_amount
       and v_existing.reference_date = v_date and v_existing.note = v_note then
      return jsonb_build_object('status', 'DUPLICATE', 'id', v_id);
    end if;
    return jsonb_build_object('status', 'CONFLICT', 'id', v_id);
  end if;

  insert into public.opening_balances (id, business_id, customer_id, amount_cents, reference_date, note, created_by)
  values (v_id, v_business, v_customer, v_amount, v_date, v_note, (select auth.uid()));
  return jsonb_build_object('status', 'CREATED', 'id', v_id);
end;
$$;

create or replace function public.create_adjustment(p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business  uuid := private.my_business_id();
  v_id        uuid := private.try_uuid(p_entry ->> 'id');
  v_customer  uuid;
  v_direction text := p_entry ->> 'direction';
  v_amount    bigint;
  v_reason    text;
  v_existing  public.financial_adjustments%rowtype;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  begin
    v_amount := (p_entry ->> 'amount_cents')::bigint;
  exception when others then
    perform private.raise_ldr('LDR_INVALID_ENTRY');
  end;
  select c.id into v_customer from public.customers c
  where c.id = private.try_uuid(p_entry ->> 'customer_id') and c.business_id = v_business;
  if v_customer is null then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_FOUND');
  end if;
  if v_id is null or v_direction is null or v_direction not in ('DEBIT', 'CREDIT')
     or v_amount is null or v_amount not between 1 and 100000000 then
    perform private.raise_ldr('LDR_INVALID_ENTRY');
  end if;
  v_reason := private.check_reason(p_entry ->> 'reason');

  select * into v_existing from public.financial_adjustments a where a.id = v_id;
  if found then
    if v_existing.business_id = v_business and v_existing.customer_id = v_customer and v_existing.direction = v_direction
       and v_existing.amount_cents = v_amount and v_existing.reason = v_reason then
      return jsonb_build_object('status', 'DUPLICATE', 'id', v_id);
    end if;
    return jsonb_build_object('status', 'CONFLICT', 'id', v_id);
  end if;

  insert into public.financial_adjustments (id, business_id, customer_id, direction, amount_cents, reason, created_by)
  values (v_id, v_business, v_customer, v_direction, v_amount, v_reason, (select auth.uid()));
  return jsonb_build_object('status', 'CREATED', 'id', v_id);
end;
$$;

-- Cancela um saldo anterior ou ajuste (fica no histórico, com motivo).
create or replace function public.cancel_entry(p_kind text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_status   text;
  v_reason   text;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  if p_kind = 'OPENING_BALANCE' then
    select o.status into v_status from public.opening_balances o where o.id = p_id and o.business_id = v_business for update;
  elsif p_kind = 'ADJUSTMENT' then
    select a.status into v_status from public.financial_adjustments a where a.id = p_id and a.business_id = v_business for update;
  else
    perform private.raise_ldr('LDR_INVALID_ENTRY');
  end if;
  if v_status is null then
    perform private.raise_ldr('LDR_ENTRY_NOT_FOUND');
  end if;
  if v_status = 'CANCELLED' then
    return jsonb_build_object('status', 'ALREADY_CANCELLED');
  end if;
  v_reason := private.check_reason(p_reason);
  if p_kind = 'OPENING_BALANCE' then
    update public.opening_balances o set status = 'CANCELLED', cancelled_at = now(), cancelled_by = (select auth.uid()),
      cancel_reason = v_reason where o.id = p_id;
  else
    update public.financial_adjustments a set status = 'CANCELLED', cancelled_at = now(), cancelled_by = (select auth.uid()),
      cancel_reason = v_reason where a.id = p_id;
  end if;
  return jsonb_build_object('status', 'CANCELLED');
end;
$$;

-- -----------------------------------------------------------------------------
-- Avisos "Já paguei" (Pix) dos clientes. O aviso NÃO reduz o saldo: só a
-- confirmação da Rose, com o valor que ela conferiu no banco, cria o pagamento.
-- Um aviso vira no máximo um pagamento (payments.notification_id é único).
-- -----------------------------------------------------------------------------
create or replace function public.confirm_payment_notification(
  p_notification_id uuid,
  p_payment_id      uuid,
  p_amount_cents    bigint,
  p_received_at     timestamptz,
  p_note            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_notice   public.payment_notifications%rowtype;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  select * into v_notice from public.payment_notifications n
  where n.id = p_notification_id and n.business_id = v_business
  for update;
  if not found then
    perform private.raise_ldr('LDR_NOTIFICATION_NOT_FOUND');
  end if;
  if v_notice.status = 'CONFIRMED' and v_notice.payment_id = p_payment_id then
    return jsonb_build_object('status', 'DUPLICATE', 'payment_id', p_payment_id);
  end if;
  if v_notice.status <> 'PENDING' then
    perform private.raise_ldr('LDR_NOTIFICATION_RESOLVED');
  end if;
  if p_payment_id is null or p_amount_cents is null or p_amount_cents not between 1 and 100000000
     or p_received_at is null or p_received_at > now() + interval '10 minutes'
     or (v_note is not null and (char_length(v_note) > 200 or v_note ~ '[[:cntrl:]]')) then
    perform private.raise_ldr('LDR_INVALID_PAYMENT');
  end if;

  insert into public.payments (id, business_id, customer_id, amount_cents, method, source, notification_id, received_at,
                               note, request_hash, created_by)
  values (p_payment_id, v_business, v_notice.customer_id, p_amount_cents, 'PIX', 'PIX_NOTIFICATION', v_notice.id,
          p_received_at, v_note,
          private.request_hash(jsonb_build_object('notification', v_notice.id, 'payment', p_payment_id, 'amount', p_amount_cents)),
          (select auth.uid()));
  update public.payment_notifications n set status = 'CONFIRMED', payment_id = p_payment_id,
    resolved_by = (select auth.uid()), resolved_at = now(), resolution_note = v_note
  where n.id = v_notice.id;
  return jsonb_build_object('status', 'CREATED', 'payment_id', p_payment_id);
end;
$$;

create or replace function public.reject_payment_notification(p_notification_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_status   text;
  v_reason   text;
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  select n.status into v_status from public.payment_notifications n
  where n.id = p_notification_id and n.business_id = v_business
  for update;
  if v_status is null then
    perform private.raise_ldr('LDR_NOTIFICATION_NOT_FOUND');
  end if;
  if v_status = 'REJECTED' then
    return jsonb_build_object('status', 'ALREADY_REJECTED');
  end if;
  if v_status <> 'PENDING' then
    perform private.raise_ldr('LDR_NOTIFICATION_RESOLVED');
  end if;
  v_reason := private.check_reason(p_reason);
  update public.payment_notifications n set status = 'REJECTED', resolved_by = (select auth.uid()), resolved_at = now(),
    resolution_note = v_reason
  where n.id = p_notification_id;
  return jsonb_build_object('status', 'REJECTED');
end;
$$;

-- -----------------------------------------------------------------------------
-- Listas para as telas de recebimentos (security_invoker: RLS de quem consulta)
-- -----------------------------------------------------------------------------
create view public.payment_list
with (security_invoker = true) as
select p.id, p.business_id, p.customer_id, c.full_name as customer_name, p.amount_cents, p.method, p.source, p.sale_id,
       p.notification_id, p.received_at, p.note, p.status, p.reverse_reason, p.reversed_at, p.created_at
from public.payments p
join public.customers c on c.id = p.customer_id;

create view public.payment_notification_list
with (security_invoker = true) as
select n.id, n.business_id, n.customer_id, c.full_name as customer_name, c.phone_e164 as customer_phone,
       n.amount_cents, n.note, n.status, n.payment_id, n.resolution_note, n.resolved_at, n.created_at,
       coalesce(b.balance_cents, 0)::bigint as customer_balance_cents
from public.payment_notifications n
join public.customers c on c.id = n.customer_id
left join public.customer_balances b on b.customer_id = n.customer_id;

grant select on public.payment_list, public.payment_notification_list to authenticated;

-- Configurações do Pix: só a dona altera (privilégio de coluna desde a 0500; o
-- tipo da chave e o formato são conferidos aqui).
alter table public.business_settings
  add constraint business_settings_pix_key_format check (
    pix_key is null
    or (pix_key_type = 'CPF' and pix_key ~ '^[0-9]{11}$')
    or (pix_key_type = 'CNPJ' and pix_key ~ '^[0-9]{14}$')
    or (pix_key_type = 'EMAIL' and pix_key ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(pix_key) <= 77)
    or (pix_key_type = 'PHONE' and pix_key ~ '^\+55[1-9]{2}9?[0-9]{8}$')
    or (pix_key_type = 'EVP' and pix_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

-- -----------------------------------------------------------------------------
-- Painel: acrescenta o recebido hoje e os avisos de Pix esperando a Rose
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business  uuid := private.my_business_id();
  v_tz        text;
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_balances  jsonb;
  v_sales     jsonb;
  v_received  jsonb;
begin
  if not private.is_staff(v_business) then
    raise exception using errcode = '42501', message = 'LDR_NOT_ALLOWED';
  end if;

  v_tz := private.business_timezone(v_business);
  v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day_end := (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz;

  select jsonb_build_object(
           'receivable_cents', coalesce(sum(b.balance_cents) filter (where b.balance_cents > 0), 0),
           'customers_with_balance', count(*) filter (where b.balance_cents > 0)
         )
  into v_balances
  from public.customer_balances b
  where b.business_id = v_business;

  select jsonb_build_object(
           'today_sales_count', count(*),
           'today_sales_cents', coalesce(sum(s.total_cents), 0),
           'today_credit_cents', coalesce(sum(s.total_cents) filter (where s.payment_kind = 'CREDIT'), 0)
         )
  into v_sales
  from public.sales s
  where s.business_id = v_business and s.status = 'ACTIVE'
    and s.occurred_at >= v_day_start and s.occurred_at < v_day_end;

  select jsonb_build_object(
           'today_received_cents', coalesce(sum(p.amount_cents), 0),
           'pending_notifications', (select count(*) from public.payment_notifications n
                                     where n.business_id = v_business and n.status = 'PENDING')
         )
  into v_received
  from public.payments p
  where p.business_id = v_business and p.status = 'CONFIRMED'
    and p.received_at >= v_day_start and p.received_at < v_day_end;

  return v_balances || v_sales || v_received || jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'as_of', now()
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on function
  public.register_payment(jsonb),
  public.reverse_payment(uuid, text),
  public.create_opening_balance(jsonb),
  public.create_adjustment(jsonb),
  public.cancel_entry(text, uuid, text),
  public.confirm_payment_notification(uuid, uuid, bigint, timestamptz, text),
  public.reject_payment_notification(uuid, text)
to authenticated;
