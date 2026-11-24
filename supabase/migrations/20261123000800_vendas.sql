-- =============================================================================
-- 0800 · Vendas: create_sale (idempotente), cancel_sale, lista de vendas e
--        extrato do cliente
-- =============================================================================
-- create_sale recebe a venda montada no celular (id gerado lá, antes do
-- primeiro salvamento) e responde:
--   CREATED   — venda nova gravada (venda + itens + pagamento na hora, juntos)
--   DUPLICATE — mesmo id e mesmo conteúdo: já estava gravada (reenvio)
--   CONFLICT  — mesmo id com conteúdo diferente: registrado na auditoria e
--               devolvido SEM exceção, para o registro de auditoria não ser desfeito
-- Erros de validação lançam LDR_* (a fila do celular trata como permanentes).

create or replace function private.raise_ldr(p_code text, p_errcode text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_errcode, message = p_code;
end;
$$;

revoke all on function private.raise_ldr(text, text) from public, anon, authenticated;

create or replace function public.create_sale(p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business   uuid := private.my_business_id();
  v_user       uuid := (select auth.uid());
  v_id         uuid;
  v_hash       text;
  v_found_biz  uuid;
  v_found_hash text;
  v_settings   public.business_settings%rowtype;
  v_customer   public.customers%rowtype;
  v_place      public.establishments%rowtype;
  v_product    public.products%rowtype;
  v_mode       text;
  v_period     text;
  v_kind       text;
  v_occurred   timestamptz;
  v_total      bigint;
  v_desc       text;
  v_items      jsonb;
  v_item       jsonb;
  v_pos        integer := 0;
  v_qty        integer;
  v_unit       bigint;
  v_subtotal   bigint;
  v_name       text;
  v_sum        bigint := 0;
  v_flags      text[] := '{}';
  v_paid       jsonb;
  v_payment_id uuid;
  v_method     text;
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;

  v_id := private.try_uuid(p_sale ->> 'id');
  if v_id is null then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;

  -- jsonb::text é canônico (ordem de chaves e espaços normalizados): o mesmo
  -- envio repetido pela fila gera o mesmo hash.
  v_hash := encode(sha256(convert_to(p_sale::text, 'UTF8')), 'hex');

  select s.business_id, s.request_hash into v_found_biz, v_found_hash from public.sales s where s.id = v_id;
  if found then
    if v_found_biz = v_business and v_found_hash = v_hash then
      return jsonb_build_object('status', 'DUPLICATE', 'sale_id', v_id);
    end if;
    perform private.audit(v_business, 'SYNC_CONFLICT', 'sales', v_id,
                          jsonb_build_object('request_hash', v_hash), 'Venda reenviada com o mesmo id e dados diferentes');
    return jsonb_build_object('status', 'CONFLICT', 'sale_id', v_id);
  end if;

  -- --- Validação --------------------------------------------------------------
  v_mode := p_sale ->> 'mode';
  v_period := p_sale ->> 'period';
  v_kind := p_sale ->> 'payment_kind';
  if v_mode is null or v_mode not in ('ITEMS', 'AMOUNT')
     or v_period is null or v_period not in ('MORNING', 'AFTERNOON', 'NIGHT')
     or v_kind is null or v_kind not in ('CREDIT', 'PAID_NOW') then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;

  begin
    v_occurred := (p_sale ->> 'occurred_at')::timestamptz;
    v_total := (p_sale ->> 'total_cents')::bigint;
  exception when others then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end;
  if v_occurred is null or v_total is null then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;
  if v_occurred > now() + interval '10 minutes' then
    perform private.raise_ldr('LDR_SALE_IN_FUTURE');
  end if;
  if v_occurred < now() - interval '30 days' then
    perform private.raise_ldr('LDR_SALE_TOO_OLD');
  end if;

  select * into v_settings from public.business_settings bs where bs.business_id = v_business;
  if v_total < 1 then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;
  if v_total > v_settings.sale_max_cents then
    perform private.raise_ldr('LDR_SALE_OVER_LIMIT');
  end if;

  select * into v_customer from public.customers c
  where c.id = private.try_uuid(p_sale ->> 'customer_id') and c.business_id = v_business;
  if not found then
    perform private.raise_ldr('LDR_CUSTOMER_NOT_FOUND');
  end if;
  select * into v_place from public.establishments e
  where e.id = private.try_uuid(p_sale ->> 'establishment_id') and e.business_id = v_business;
  if not found then
    perform private.raise_ldr('LDR_ESTABLISHMENT_NOT_FOUND');
  end if;

  -- Desativado depois da venda feita no celular: a venda vale (o lanche foi
  -- entregue); fica registrado na auditoria.
  if not v_customer.is_active then
    v_flags := array_append(v_flags, 'INACTIVE_CUSTOMER');
  end if;
  if not v_place.is_active then
    v_flags := array_append(v_flags, 'INACTIVE_ESTABLISHMENT');
  end if;

  v_items := coalesce(p_sale -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    perform private.raise_ldr('LDR_INVALID_SALE');
  end if;

  if v_mode = 'AMOUNT' then
    v_desc := p_sale ->> 'description';
    if v_desc is null or char_length(btrim(v_desc)) not between 1 and 150 or v_desc <> btrim(v_desc) then
      perform private.raise_ldr('LDR_INVALID_DESCRIPTION');
    end if;
    if jsonb_array_length(v_items) > 0 then
      perform private.raise_ldr('LDR_SALE_AMOUNT_WITH_ITEMS', '23514');
    end if;
  else
    v_desc := null;
    if jsonb_array_length(v_items) not between 1 and 50 then
      perform private.raise_ldr('LDR_INVALID_ITEMS');
    end if;
  end if;

  v_paid := p_sale -> 'paid_now';
  if v_kind = 'PAID_NOW' then
    v_payment_id := private.try_uuid(v_paid ->> 'payment_id');
    v_method := v_paid ->> 'method';
    if v_payment_id is null or v_method is null or v_method not in ('CASH', 'PIX') then
      perform private.raise_ldr('LDR_INVALID_PAYMENT');
    end if;
  elsif v_paid is not null and jsonb_typeof(v_paid) <> 'null' then
    perform private.raise_ldr('LDR_INVALID_PAYMENT');
  end if;

  -- --- Gravação (tudo ou nada) -------------------------------------------------
  begin
    insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, description,
                              total_cents, payment_kind, occurred_at, request_hash, created_by)
    values (v_id, v_business, v_customer.id, v_place.id, v_mode, v_period, v_desc,
            v_total, v_kind, v_occurred, v_hash, v_user);

    for v_item in select x from jsonb_array_elements(v_items) as t(x) loop
      v_pos := v_pos + 1;
      select * into v_product from public.products p
      where p.id = private.try_uuid(v_item ->> 'product_id') and p.business_id = v_business;
      if not found then
        perform private.raise_ldr('LDR_PRODUCT_NOT_FOUND');
      end if;
      begin
        v_qty := (v_item ->> 'quantity')::integer;
        v_unit := (v_item ->> 'unit_price_cents')::bigint;
        v_subtotal := (v_item ->> 'subtotal_cents')::bigint;
      exception when others then
        perform private.raise_ldr('LDR_INVALID_ITEMS');
      end;
      v_name := v_item ->> 'product_name';
      if v_qty is null or v_qty < 1 or v_qty > v_settings.item_max_qty then
        perform private.raise_ldr('LDR_ITEM_QUANTITY');
      end if;
      if v_unit is null or v_unit < 1 or v_subtotal is distinct from v_qty * v_unit
         or v_name is null or char_length(btrim(v_name)) = 0 then
        perform private.raise_ldr('LDR_INVALID_ITEMS');
      end if;
      -- Vale o preço e o nome que o cliente viu na hora; mudança fica na auditoria.
      if v_product.price_cents <> v_unit or v_product.name <> v_name then
        v_flags := array_append(v_flags, 'PRICE_CHANGED:' || v_product.id::text);
      end if;
      if not v_product.is_active then
        v_flags := array_append(v_flags, 'INACTIVE_PRODUCT:' || v_product.id::text);
      end if;
      v_sum := v_sum + v_subtotal;

      insert into public.sale_items (business_id, sale_id, position, product_id, product_name, quantity,
                                     unit_price_cents, subtotal_cents)
      values (v_business, v_id, v_pos, v_product.id, v_name, v_qty, v_unit, v_subtotal);
    end loop;

    if v_mode = 'ITEMS' and v_sum <> v_total then
      perform private.raise_ldr('LDR_SALE_ITEMS_TOTAL', '23514');
    end if;

    -- Paga na hora: venda e recebimento juntos; o saldo do cliente não muda.
    if v_kind = 'PAID_NOW' then
      insert into public.payments (id, business_id, customer_id, amount_cents, method, source, sale_id,
                                   received_at, request_hash, created_by)
      values (v_payment_id, v_business, v_customer.id, v_total, v_method, 'SALE_PAID_NOW', v_id,
              v_occurred, v_hash, v_user);
    end if;
  exception when unique_violation then
    -- Outro envio da mesma venda chegou junto (corrida): responde como reenvio.
    select s.business_id, s.request_hash into v_found_biz, v_found_hash from public.sales s where s.id = v_id;
    if found and v_found_biz = v_business and v_found_hash = v_hash then
      return jsonb_build_object('status', 'DUPLICATE', 'sale_id', v_id);
    elsif found then
      perform private.audit(v_business, 'SYNC_CONFLICT', 'sales', v_id,
                            jsonb_build_object('request_hash', v_hash), 'Venda reenviada com o mesmo id e dados diferentes');
      return jsonb_build_object('status', 'CONFLICT', 'sale_id', v_id);
    end if;
    perform private.raise_ldr('LDR_PAYMENT_ID_CONFLICT');
  end;

  if cardinality(v_flags) > 0 then
    perform private.audit(v_business, 'SALE_FLAGS', 'sales', v_id, jsonb_build_object('flags', to_jsonb(v_flags)), null);
  end if;

  return jsonb_build_object('status', 'CREATED', 'sale_id', v_id, 'flags', to_jsonb(v_flags));
end;
$$;

grant execute on function public.create_sale(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Cancelamento: nunca apaga. Guarda autor, data e motivo; invalida confirmações
-- (gatilho da 0300) e estorna o pagamento de venda paga na hora. Repetir é seguro.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_user     uuid := (select auth.uid());
  v_status   text;
  v_reason   text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;

  select s.status into v_status from public.sales s
  where s.id = p_sale_id and s.business_id = v_business
  for update;
  if not found then
    perform private.raise_ldr('LDR_SALE_NOT_FOUND');
  end if;
  if v_status = 'CANCELLED' then
    return jsonb_build_object('status', 'ALREADY_CANCELLED', 'sale_id', p_sale_id);
  end if;
  if char_length(v_reason) not between 3 and 200 or v_reason ~ '[[:cntrl:]]' then
    perform private.raise_ldr('LDR_INVALID_REASON');
  end if;

  update public.sales s set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = v_user,
    cancel_reason = v_reason
  where s.id = p_sale_id;

  update public.payments p set
    status = 'REVERSED',
    reversed_at = now(),
    reversed_by = v_user,
    reverse_reason = left('Venda cancelada: ' || v_reason, 200)
  where p.sale_id = p_sale_id and p.status = 'CONFIRMED';

  return jsonb_build_object('status', 'CANCELLED', 'sale_id', p_sale_id);
end;
$$;

grant execute on function public.cancel_sale(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Lista de vendas para a Rose (security_invoker: o RLS de quem consulta vale)
-- -----------------------------------------------------------------------------
create view public.sale_list
with (security_invoker = true) as
select s.id, s.business_id, s.customer_id, c.full_name as customer_name, c.phone_e164 as customer_phone,
       s.establishment_id, e.name as establishment_name, s.mode, s.period, s.description,
       (select string_agg(i.quantity::text || '× ' || i.product_name, ' + ' order by i.position)
          from public.sale_items i where i.sale_id = s.id) as items_summary,
       s.total_cents, s.payment_kind,
       (select p.method from public.payments p where p.sale_id = s.id order by p.created_at limit 1) as paid_method,
       s.status, s.cancel_reason, s.cancelled_at, s.confirmation_status, s.occurred_at, s.received_at
from public.sales s
join public.customers c on c.id = s.customer_id
join public.establishments e on e.id = s.establishment_id;

grant select on public.sale_list to authenticated;

-- -----------------------------------------------------------------------------
-- Extrato do cliente (base para a Rose e, depois, para o portal). Mostra tudo,
-- inclusive cancelados e estornados (com o motivo), do mais novo para o mais
-- antigo, em páginas (cursor = data + id). open_cents = quanto daquela dívida
-- ainda está em aberto pela alocação FIFO derivada.
-- -----------------------------------------------------------------------------
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
  where p_before_at is null
     or (x.occurred_at, x.entry_id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by x.occurred_at desc, x.entry_id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke all on function private.statement_entries(uuid, timestamptz, uuid, integer) from public, anon, authenticated;

create or replace function public.customer_statement(
  p_customer  uuid,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit     integer default 30
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
  v_business uuid := private.my_business_id();
begin
  if not private.is_staff(v_business)
     or not exists (select 1 from public.customers c where c.id = p_customer and c.business_id = v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  return query select * from private.statement_entries(p_customer, p_before_at, p_before_id, p_limit);
end;
$$;

grant execute on function public.customer_statement(uuid, timestamptz, uuid, integer) to authenticated;
