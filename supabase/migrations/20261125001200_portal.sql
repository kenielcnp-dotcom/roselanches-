-- =============================================================================
-- 1200 · Portal do cliente: convite e vínculo da conta, leitura da própria
--        conta, confirmação/contestação online, Pix e "Já paguei"
-- =============================================================================
-- O cliente NÃO lê nenhuma tabela: tudo passa pelas RPCs portal_*, que só
-- enxergam o cadastro ligado a auth.uid() (private.current_customer_id()).
-- O vínculo nasce de um convite de uso único: token de 192 bits que só existe
-- no link enviado pela Rose; o banco guarda apenas o SHA-256.

-- -----------------------------------------------------------------------------
-- Tentativas de usar convite (limite contra chute de token)
-- -----------------------------------------------------------------------------
create table private.invite_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  outcome      text not null,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_idx on private.invite_attempts (user_id, attempted_at);
alter table private.invite_attempts enable row level security;
revoke all on private.invite_attempts from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rose: gerar, cancelar convite e desvincular conta
-- -----------------------------------------------------------------------------
create or replace function public.create_customer_invite(p_customer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_customer public.customers%rowtype;
  v_token    text;
  v_id       uuid;
  v_expires  timestamptz := now() + interval '72 hours';
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  select * into v_customer from public.customers c
  where c.id = p_customer and c.business_id = v_business
  for update;
  if not found then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_FOUND');
  end if;
  if v_customer.auth_user_id is not null then
    perform private.raise_ldr('LDR_CUSTOMER_ALREADY_LINKED');
  end if;
  if not v_customer.is_active then
    perform private.raise_ldr('LDR_CUSTOMER_INACTIVE');
  end if;

  -- Gerar outro cancela o anterior (no máximo um convite em aberto).
  update public.customer_invites i set cancelled_at = now()
  where i.customer_id = p_customer and i.used_at is null and i.cancelled_at is null;

  -- 24 bytes aleatórios = 32 caracteres base64url, sem "=".
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.customer_invites (business_id, customer_id, token_hash, expires_at, created_by)
  values (v_business, p_customer, sha256(convert_to(v_token, 'UTF8')), v_expires, (select auth.uid()))
  returning id into v_id;

  -- O token sai daqui uma única vez; o banco não consegue mostrá-lo de novo.
  return jsonb_build_object('invite_id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.cancel_customer_invite(p_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
begin
  if not private.is_staff(v_business)
     or not exists (select 1 from public.customers c where c.id = p_customer and c.business_id = v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  update public.customer_invites i set cancelled_at = now()
  where i.customer_id = p_customer and i.used_at is null and i.cancelled_at is null;
end;
$$;

-- Só a dona: tira o acesso do cliente (ex.: perdeu a senha, conta errada).
create or replace function public.unlink_customer_account(p_customer uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_reason   text;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_reason := private.check_reason(p_reason);
  update public.customers c set auth_user_id = null, linked_at = null
  where c.id = p_customer and c.business_id = v_business and c.auth_user_id is not null;
  if not found then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_LINKED');
  end if;
  perform private.audit(v_business, 'PORTAL_UNLINK', 'customers', p_customer, null, v_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Cliente: usar o convite. Devolve um estado em vez de lançar exceção, para a
-- tentativa ficar registrada (e contar no limite) mesmo quando falha.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_customer_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_invite   public.customer_invites%rowtype;
  v_customer public.customers%rowtype;
  v_status   text;
begin
  if v_user is null then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;

  if (select count(*) from private.invite_attempts a
      where a.user_id = v_user and a.outcome in ('INVALID', 'EXPIRED', 'USED', 'CANCELLED')
        and a.attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'TOO_MANY_ATTEMPTS');
  end if;

  -- A conta da Rose (ou de quem trabalha com ela) não vira conta de cliente.
  if exists (select 1 from public.business_members m where m.user_id = v_user and m.is_active) then
    return jsonb_build_object('status', 'STAFF_ACCOUNT');
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    v_status := 'INVALID';
  else
    select * into v_invite from public.customer_invites i
    where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
    for update;
    if not found then
      v_status := 'INVALID';
    else
      select * into v_customer from public.customers c where c.id = v_invite.customer_id for update;
      if v_customer.auth_user_id = v_user then
        v_status := 'ALREADY_LINKED';
      elsif v_invite.used_at is not null then
        v_status := 'USED';
      elsif v_invite.cancelled_at is not null then
        v_status := 'CANCELLED';
      elsif v_invite.expires_at <= now() then
        v_status := 'EXPIRED';
      elsif v_customer.auth_user_id is not null then
        v_status := 'CUSTOMER_IN_USE';
      elsif exists (select 1 from public.customers c where c.auth_user_id = v_user) then
        v_status := 'ACCOUNT_IN_USE';
      else
        update public.customers c set auth_user_id = v_user, linked_at = now() where c.id = v_customer.id;
        update public.customer_invites i set used_at = now(), used_by = v_user where i.id = v_invite.id;
        v_status := 'LINKED';
      end if;
    end if;
  end if;

  insert into private.invite_attempts (user_id, outcome) values (v_user, v_status);

  if v_status in ('LINKED', 'ALREADY_LINKED') then
    return jsonb_build_object(
      'status', v_status,
      'customer_name', v_customer.full_name,
      'business_name', (select b.name from public.businesses b where b.id = v_customer.business_id)
    );
  end if;
  return jsonb_build_object('status', v_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Extrato com filtros (a versão sem filtro continua igual para a Rose)
-- -----------------------------------------------------------------------------
--   p_filter: ALL | SALES | PAYMENTS | TO_CONFIRM (compras sem confirmação)
--             | OPEN (dívidas com valor em aberto)
--   p_establishment: só as compras daquele local
create or replace function private.statement_entries(
  p_customer      uuid,
  p_before_at     timestamptz,
  p_before_id     uuid,
  p_limit         integer,
  p_filter        text,
  p_establishment uuid
)
returns table (
  kind                text,
  entry_id            uuid,
  occurred_at         timestamptz,
  period              text,
  establishment_id    uuid,
  establishment_name  text,
  mode                text,
  description         text,
  items               jsonb,
  amount_cents        bigint,
  payment_kind        text,
  method              text,
  status              text,
  status_reason       text,
  confirmation_status text,
  open_cents          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with open_debits as (
    select d.entry_id, d.open_cents from private.customer_open_debits(p_customer) d
  ),
  entries as (
    select 'SALE'::text as kind, s.id as entry_id, s.occurred_at, s.period, s.establishment_id,
           e.name as establishment_name, s.mode, s.description,
           case when s.mode = 'ITEMS' then (
             select jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity,
                                                 'unit_price_cents', i.unit_price_cents,
                                                 'subtotal_cents', i.subtotal_cents) order by i.position)
             from public.sale_items i where i.sale_id = s.id
           ) end as items,
           s.total_cents as amount_cents, s.payment_kind,
           (select p.method from public.payments p where p.sale_id = s.id order by p.created_at limit 1) as method,
           s.status, s.cancel_reason as status_reason, s.confirmation_status,
           case when s.status = 'ACTIVE' then coalesce(od.open_cents, 0) end as open_cents
    from public.sales s
    join public.establishments e on e.id = s.establishment_id
    left join open_debits od on od.entry_id = s.id
    where s.customer_id = p_customer
    union all
    select 'PAYMENT', p.id, p.received_at, null, null, null, null, p.note, null, p.amount_cents, null, p.method,
           p.status, p.reverse_reason, null, null
    from public.payments p
    where p.customer_id = p_customer and p.source <> 'SALE_PAID_NOW'
    union all
    select 'OPENING_BALANCE', o.id,
           (o.reference_date::timestamp at time zone private.business_timezone(o.business_id)),
           null, null, null, null, o.note, null, o.amount_cents, null, null, o.status, o.cancel_reason, null,
           case when o.status = 'ACTIVE' then coalesce(od.open_cents, 0) end
    from public.opening_balances o
    left join open_debits od on od.entry_id = o.id
    where o.customer_id = p_customer
    union all
    select 'ADJUSTMENT_' || a.direction, a.id, a.occurred_at, null, null, null, null, a.reason, null, a.amount_cents,
           null, null, a.status, a.cancel_reason, null,
           case when a.direction = 'DEBIT' and a.status = 'ACTIVE' then coalesce(od.open_cents, 0) end
    from public.financial_adjustments a
    left join open_debits od on od.entry_id = a.id
    where a.customer_id = p_customer
  )
  select x.kind, x.entry_id, x.occurred_at, x.period, x.establishment_id, x.establishment_name, x.mode,
         x.description, x.items, x.amount_cents, x.payment_kind, x.method, x.status, x.status_reason,
         x.confirmation_status, x.open_cents
  from entries x
  where (p_before_at is null
         or (x.occurred_at, x.entry_id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    and (p_establishment is null or x.establishment_id = p_establishment)
    and case coalesce(p_filter, 'ALL')
          when 'SALES' then x.kind = 'SALE'
          when 'PAYMENTS' then x.kind in ('PAYMENT', 'ADJUSTMENT_CREDIT')
          when 'TO_CONFIRM' then x.kind = 'SALE' and x.status = 'ACTIVE' and x.confirmation_status = 'PENDING'
          when 'OPEN' then coalesce(x.open_cents, 0) > 0
          else true
        end
  order by x.occurred_at desc, x.entry_id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

create or replace function private.statement_entries(
  p_customer  uuid,
  p_before_at timestamptz,
  p_before_id uuid,
  p_limit     integer
)
returns table (
  kind                text,
  entry_id            uuid,
  occurred_at         timestamptz,
  period              text,
  establishment_id    uuid,
  establishment_name  text,
  mode                text,
  description         text,
  items               jsonb,
  amount_cents        bigint,
  payment_kind        text,
  method              text,
  status              text,
  status_reason       text,
  confirmation_status text,
  open_cents          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.statement_entries(p_customer, p_before_at, p_before_id, p_limit, 'ALL', null)
$$;

-- -----------------------------------------------------------------------------
-- Portal: leitura
-- -----------------------------------------------------------------------------
create or replace function private.portal_customer_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.current_customer_id();
begin
  if v_customer is null then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  return v_customer;
end;
$$;

create or replace function public.portal_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.portal_customer_id();
  v_result   jsonb;
begin
  select jsonb_build_object(
    'customer_name', c.full_name,
    'business_name', b.name,
    'timezone', private.business_timezone(c.business_id),
    'balance_cents', coalesce(cb.balance_cents, 0),
    'last_payment_at', cb.last_payment_at,
    'to_confirm', (select count(*) from public.sales s
                   where s.customer_id = c.id and s.status = 'ACTIVE' and s.confirmation_status = 'PENDING'),
    'disputed', (select count(*) from public.sales s
                 where s.customer_id = c.id and s.status = 'ACTIVE' and s.confirmation_status = 'DISPUTED'),
    'pix_configured', (select s.pix_key is not null from public.business_settings s where s.business_id = c.business_id),
    'establishments', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.name)
      from (select distinct e.id, e.name from public.sales s join public.establishments e on e.id = s.establishment_id
            where s.customer_id = c.id) x
    ), '[]'::jsonb),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'amount_cents', n.amount_cents, 'note', n.note,
                                          'status', n.status, 'resolution_note', n.resolution_note,
                                          'created_at', n.created_at, 'resolved_at', n.resolved_at)
                       order by n.created_at desc)
      -- Pendentes e os resolvidos nos últimos 7 dias (o cliente vê a resposta da Rose).
      from (select * from public.payment_notifications n
            where n.customer_id = c.id
              and (n.status = 'PENDING' or n.resolved_at > now() - interval '7 days')
            order by n.created_at desc limit 10) n
    ), '[]'::jsonb)
  )
  into v_result
  from public.customers c
  join public.businesses b on b.id = c.business_id
  left join public.customer_balances cb on cb.customer_id = c.id
  where c.id = v_customer;
  return v_result;
end;
$$;

create or replace function public.portal_statement(
  p_before_at     timestamptz default null,
  p_before_id     uuid default null,
  p_limit         integer default 30,
  p_filter        text default 'ALL',
  p_establishment uuid default null
)
returns table (
  kind                text,
  entry_id            uuid,
  occurred_at         timestamptz,
  period              text,
  establishment_id    uuid,
  establishment_name  text,
  mode                text,
  description         text,
  items               jsonb,
  amount_cents        bigint,
  payment_kind        text,
  method              text,
  status              text,
  status_reason       text,
  confirmation_status text,
  open_cents          bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.portal_customer_id();
begin
  if coalesce(p_filter, 'ALL') not in ('ALL', 'SALES', 'PAYMENTS', 'TO_CONFIRM', 'OPEN') then
    perform private.raise_ldr('LDR_INVALID_FILTER');
  end if;
  return query
    select * from private.statement_entries(v_customer, p_before_at, p_before_id, p_limit, p_filter, p_establishment);
end;
$$;

-- Detalhe de uma compra do próprio cliente, com o texto de confirmação vigente
-- e o hash do resumo canônico que ele vai confirmar ou contestar.
create or replace function public.portal_sale_detail(p_sale uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.portal_customer_id();
  v_sale     public.sales%rowtype;
  v_terms    public.consent_texts%rowtype;
begin
  select * into v_sale from public.sales s where s.id = p_sale and s.customer_id = v_customer;
  if not found then
    perform private.raise_ldr('LDR_SALE_NOT_FOUND');
  end if;
  select * into v_terms from public.consent_texts t order by t.created_at desc, t.version desc limit 1;

  return jsonb_build_object(
    'id', v_sale.id,
    'occurred_at', v_sale.occurred_at,
    'period', v_sale.period,
    'establishment_name', (select e.name from public.establishments e where e.id = v_sale.establishment_id),
    'mode', v_sale.mode,
    'description', v_sale.description,
    'items', case when v_sale.mode = 'ITEMS' then (
      select jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity,
                                          'unit_price_cents', i.unit_price_cents,
                                          'subtotal_cents', i.subtotal_cents) order by i.position)
      from public.sale_items i where i.sale_id = v_sale.id
    ) end,
    'total_cents', v_sale.total_cents,
    'payment_kind', v_sale.payment_kind,
    'paid_method', (select p.method from public.payments p where p.sale_id = v_sale.id order by p.created_at limit 1),
    'status', v_sale.status,
    'cancel_reason', v_sale.cancel_reason,
    'cancelled_at', v_sale.cancelled_at,
    'confirmation_status', v_sale.confirmation_status,
    'open_cents', case when v_sale.status = 'ACTIVE' then coalesce(
      (select d.open_cents from private.customer_open_debits(v_customer) d where d.entry_id = v_sale.id), 0) end,
    'terms_version', v_terms.version,
    'terms_body', v_terms.body,
    'document_hash', private.sale_document_hash(v_sale.id, v_terms.version),
    'signature', (
      select jsonb_build_object('path', c.signature_storage_path, 'received_at', c.received_at,
                                'status', c.confirmation_status)
      from public.sale_confirmations c
      where c.sale_id = v_sale.id and c.confirmation_type = 'DRAWN_SIGNATURE'
      order by c.received_at desc limit 1
    ),
    'online', (
      select jsonb_build_object('id', c.id, 'status', c.confirmation_status, 'dispute_reason', c.dispute_reason,
                                'received_at', c.received_at, 'resolved_at', c.resolved_at,
                                'resolution_note', c.resolution_note)
      from public.sale_confirmations c
      where c.sale_id = v_sale.id and c.confirmation_type = 'ONLINE_CONFIRMATION'
        and c.confirmation_status in ('CONFIRMED_ONLINE', 'DISPUTED')
      order by c.received_at desc, c.id desc limit 1
    )
  );
end;
$$;

create or replace function public.portal_pix_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.portal_customer_id();
begin
  return (
    select jsonb_build_object(
      'business_name', b.name,
      'key', s.pix_key,
      'key_type', s.pix_key_type,
      'receiver_name', s.pix_receiver_name,
      'city', s.pix_city
    )
    from public.customers c
    join public.businesses b on b.id = c.business_id
    join public.business_settings s on s.business_id = c.business_id
    where c.id = v_customer
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Portal: confirmar ou contestar uma compra (idempotente pelo id gerado no app)
-- -----------------------------------------------------------------------------
-- Mudar de ideia é permitido: a manifestação anterior é invalidada (não
-- apagada) e a nova entra no lugar. A contestação NÃO mexe na dívida.
create or replace function private.portal_respond_sale(p_body jsonb, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_customer uuid := private.portal_customer_id();
  v_id       uuid := private.try_uuid(p_body ->> 'id');
  v_sale_id  uuid := private.try_uuid(p_body ->> 'sale_id');
  v_terms    text := p_body ->> 'terms_version';
  v_hash     text := p_body ->> 'document_hash';
  v_reason   text;
  v_sale     public.sales%rowtype;
  v_existing public.sale_confirmations%rowtype;
  v_open     public.sale_confirmations%rowtype;
begin
  if v_id is null or v_sale_id is null then
    perform private.raise_ldr('LDR_INVALID_CONFIRMATION');
  end if;
  if p_kind = 'DISPUTED' then
    v_reason := btrim(coalesce(p_body ->> 'reason', ''));
    if char_length(v_reason) not between 3 and 300 or v_reason ~ '[[:cntrl:]]' then
      perform private.raise_ldr('LDR_INVALID_REASON');
    end if;
  end if;

  select * into v_existing from public.sale_confirmations c where c.id = v_id;
  if found then
    if v_existing.customer_id = v_customer and v_existing.sale_id = v_sale_id
       and v_existing.confirmation_type = 'ONLINE_CONFIRMATION'
       and v_existing.confirmation_status in (p_kind, 'CANCELLED')
       and v_existing.dispute_reason is not distinct from v_reason then
      return jsonb_build_object('status', 'DUPLICATE', 'confirmation_id', v_id);
    end if;
    perform private.audit(v_existing.business_id, 'SYNC_CONFLICT', 'sale_confirmations', v_id, null,
                          'Confirmação do portal reenviada com o mesmo id e dados diferentes');
    return jsonb_build_object('status', 'CONFLICT', 'confirmation_id', v_id);
  end if;

  -- Trava a venda: duas abas do cliente não criam duas manifestações.
  select * into v_sale from public.sales s where s.id = v_sale_id and s.customer_id = v_customer for update;
  if not found then
    perform private.raise_ldr('LDR_SALE_NOT_FOUND');
  end if;
  if v_sale.status <> 'ACTIVE' then
    perform private.raise_ldr('LDR_SALE_ALREADY_CANCELLED');
  end if;
  if not exists (select 1 from public.consent_texts t where t.version = v_terms) then
    perform private.raise_ldr('LDR_UNKNOWN_TERMS');
  end if;
  if v_hash is distinct from private.sale_document_hash(v_sale.id, v_terms) then
    perform private.raise_ldr('LDR_HASH_MISMATCH');
  end if;

  if p_kind = 'CONFIRMED_ONLINE' and v_sale.confirmation_status in ('SIGNED', 'CONFIRMED_ONLINE') then
    return jsonb_build_object('status', 'ALREADY', 'confirmation_status', v_sale.confirmation_status);
  end if;

  select * into v_open from public.sale_confirmations c
  where c.sale_id = v_sale.id and c.confirmation_type = 'ONLINE_CONFIRMATION'
    and c.confirmation_status in ('CONFIRMED_ONLINE', 'DISPUTED') and c.resolved_at is null;
  if found then
    if v_open.confirmation_status = p_kind then
      return jsonb_build_object('status', 'ALREADY', 'confirmation_status', v_sale.confirmation_status);
    end if;
    update public.sale_confirmations c set
      confirmation_status = 'CANCELLED',
      invalidated_at = now(),
      invalidated_by = v_user,
      invalidation_reason = case when p_kind = 'DISPUTED' then 'Cliente contestou depois de confirmar'
                                 else 'Cliente confirmou depois de contestar' end
    where c.id = v_open.id;
  end if;

  insert into public.sale_confirmations (
    id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
    signed_document_hash, consent_text_version, confirmed_by_user_id, dispute_reason
  ) values (
    v_id, v_sale.business_id, v_sale.id, v_customer, 'ONLINE_CONFIRMATION', p_kind,
    v_hash, v_terms, v_user, v_reason
  );

  return jsonb_build_object(
    'status', 'CREATED',
    'confirmation_id', v_id,
    'confirmation_status', (select s.confirmation_status from public.sales s where s.id = v_sale.id)
  );
end;
$$;

create or replace function public.portal_confirm_sale(p_confirmation jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.portal_respond_sale(p_confirmation, 'CONFIRMED_ONLINE')
$$;

create or replace function public.portal_dispute_sale(p_confirmation jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.portal_respond_sale(p_confirmation, 'DISPUTED')
$$;

-- -----------------------------------------------------------------------------
-- Portal: "Já paguei" (aviso; só a Rose transforma em pagamento)
-- -----------------------------------------------------------------------------
create or replace function public.portal_notify_payment(p_notice jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer uuid := private.portal_customer_id();
  v_business uuid;
  v_id       uuid := private.try_uuid(p_notice ->> 'id');
  v_amount   bigint;
  v_note     text := nullif(btrim(coalesce(p_notice ->> 'note', '')), '');
  v_found    public.payment_notifications%rowtype;
begin
  if v_id is null then
    perform private.raise_ldr('LDR_INVALID_NOTICE');
  end if;
  begin
    v_amount := (p_notice ->> 'amount_cents')::bigint;
  exception when others then
    perform private.raise_ldr('LDR_INVALID_AMOUNT');
  end;
  if v_amount is not null and v_amount not between 1 and 100000000 then
    perform private.raise_ldr('LDR_INVALID_AMOUNT');
  end if;
  if v_note is not null and (char_length(v_note) > 200 or v_note ~ '[[:cntrl:]]') then
    perform private.raise_ldr('LDR_INVALID_NOTE');
  end if;

  select * into v_found from public.payment_notifications n where n.id = v_id;
  if found then
    if v_found.customer_id = v_customer and v_found.amount_cents is not distinct from v_amount
       and v_found.note is not distinct from v_note then
      return jsonb_build_object('status', 'DUPLICATE', 'notification_id', v_id);
    end if;
    perform private.audit(v_found.business_id, 'SYNC_CONFLICT', 'payment_notifications', v_id, null,
                          'Aviso de pagamento reenviado com o mesmo id e dados diferentes');
    return jsonb_build_object('status', 'CONFLICT', 'notification_id', v_id);
  end if;

  select c.business_id into v_business from public.customers c where c.id = v_customer for update;
  if (select count(*) from public.payment_notifications n
      where n.customer_id = v_customer and n.status = 'PENDING') >= 5 then
    perform private.raise_ldr('LDR_TOO_MANY_NOTICES');
  end if;

  insert into public.payment_notifications (id, business_id, customer_id, amount_cents, note, created_by)
  values (v_id, v_business, v_customer, v_amount, v_note, (select auth.uid()));
  return jsonb_build_object('status', 'CREATED', 'notification_id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Rose: encerrar uma contestação (a compra segue valendo; o motivo fica salvo)
-- -----------------------------------------------------------------------------
create or replace function public.resolve_sale_dispute(p_sale uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_note     text;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_note := private.check_reason(p_note);
  update public.sale_confirmations c set
    resolved_at = now(),
    resolved_by = (select auth.uid()),
    resolution_note = v_note
  where c.sale_id = p_sale and c.business_id = v_business
    and c.confirmation_status = 'DISPUTED' and c.resolved_at is null;
  if not found then
    perform private.raise_ldr('LDR_NO_OPEN_DISPUTE');
  end if;
end;
$$;

-- Contestações em aberto, para o painel e a lista da Rose.
create view public.sale_dispute_list
with (security_invoker = true) as
select s.id as sale_id, s.business_id, s.customer_id, c.full_name as customer_name, e.name as establishment_name,
       s.total_cents, s.occurred_at, sc.dispute_reason, sc.received_at as disputed_at
from public.sale_confirmations sc
join public.sales s on s.id = sc.sale_id
join public.customers c on c.id = s.customer_id
join public.establishments e on e.id = s.establishment_id
where sc.confirmation_status = 'DISPUTED' and sc.resolved_at is null;

grant select on public.sale_dispute_list to authenticated;

-- -----------------------------------------------------------------------------
-- Painel: acrescenta as contestações em aberto
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
    'open_disputes', (select count(*) from public.sale_confirmations c
                      join public.sales s on s.id = c.sale_id
                      where c.business_id = v_business and c.confirmation_status = 'DISPUTED'
                        and c.resolved_at is null and s.status = 'ACTIVE'),
    'timezone', v_tz,
    'today', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'as_of', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke all on function
  private.statement_entries(uuid, timestamptz, uuid, integer, text, uuid),
  private.portal_customer_id(),
  private.portal_respond_sale(jsonb, text)
from authenticated;
grant execute on function
  public.create_customer_invite(uuid),
  public.cancel_customer_invite(uuid),
  public.unlink_customer_account(uuid, text),
  public.redeem_customer_invite(text),
  public.portal_summary(),
  public.portal_statement(timestamptz, uuid, integer, text, uuid),
  public.portal_sale_detail(uuid),
  public.portal_pix_info(),
  public.portal_confirm_sale(jsonb),
  public.portal_dispute_sale(jsonb),
  public.portal_notify_payment(jsonb),
  public.resolve_sale_dispute(uuid, text)
to authenticated;
