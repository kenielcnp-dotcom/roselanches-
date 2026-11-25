-- =============================================================================
-- 1300 · Relatórios: indicadores do período, locais (três métricas separadas)
--        e lista de vendas com filtros de pagamento e confirmação
-- =============================================================================
-- Tudo calculado na hora a partir dos lançamentos (nada é gravado), no fuso do
-- negócio. Só a equipe do negócio consulta. Volume pequeno (centenas de
-- clientes): a alocação FIFO por cliente é recalculada a cada consulta.

-- Intervalo [início do dia p_from, início do dia seguinte a p_to) no fuso do negócio.
create or replace function private.report_window(p_business uuid, p_from date, p_to date)
returns tstzrange
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := private.business_timezone(p_business);
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    perform private.raise_ldr('LDR_INVALID_RANGE');
  end if;
  return tstzrange(p_from::timestamp at time zone v_tz, (p_to + 1)::timestamp at time zone v_tz, '[)');
end;
$$;

-- Dívidas em aberto (FIFO) de todos os clientes do negócio, ou de um só.
create or replace function private.business_open_debits(p_business uuid, p_customer uuid)
returns table (
  customer_id      uuid,
  kind             text,
  entry_id         uuid,
  occurred_at      timestamptz,
  establishment_id uuid,
  open_cents       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, d.kind, d.entry_id, d.occurred_at, d.establishment_id, d.open_cents
  from public.customers c
  cross join lateral private.customer_open_debits(c.id) d
  where c.business_id = p_business
    and (p_customer is null or c.id = p_customer)
    and d.open_cents > 0
$$;

-- Vendas do período (ativas e canceladas), com os filtros de local e cliente.
create or replace function private.report_sales_in(p_business uuid, p_window tstzrange, p_establishment uuid, p_customer uuid)
returns setof public.sales
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.sales s
  where s.business_id = p_business and s.occurred_at <@ p_window
    and (p_establishment is null or s.establishment_id = p_establishment)
    and (p_customer is null or s.customer_id = p_customer)
$$;

-- -----------------------------------------------------------------------------
-- Indicadores do período
-- -----------------------------------------------------------------------------
create or replace function public.report_summary(
  p_from          date,
  p_to            date,
  p_establishment uuid default null,
  p_customer      uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_window   tstzrange;
  v_tz       text;
  v_sales    jsonb;
  v_conf     jsonb;
  v_periods  jsonb;
  v_received jsonb;
  v_days     jsonb;
  v_top_c    jsonb;
  v_top_p    jsonb;
  v_open     jsonb;
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_window := private.report_window(v_business, p_from, p_to);
  v_tz := private.business_timezone(v_business);

  select jsonb_build_object(
           'sales_count', count(*) filter (where s.status = 'ACTIVE'),
           'sales_cents', coalesce(sum(s.total_cents) filter (where s.status = 'ACTIVE'), 0),
           'credit_count', count(*) filter (where s.status = 'ACTIVE' and s.payment_kind = 'CREDIT'),
           'credit_cents', coalesce(sum(s.total_cents) filter (where s.status = 'ACTIVE' and s.payment_kind = 'CREDIT'), 0),
           'paid_now_cents', coalesce(sum(s.total_cents) filter (where s.status = 'ACTIVE' and s.payment_kind = 'PAID_NOW'), 0),
           'customers_count', count(distinct s.customer_id) filter (where s.status = 'ACTIVE'),
           'cancelled_count', count(*) filter (where s.status = 'CANCELLED'),
           'cancelled_cents', coalesce(sum(s.total_cents) filter (where s.status = 'CANCELLED'), 0)
         )
  into v_sales
  from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s;

  select jsonb_build_object(
           'PENDING', count(*) filter (where s.confirmation_status = 'PENDING'),
           'SIGNED', count(*) filter (where s.confirmation_status = 'SIGNED'),
           'CONFIRMED_ONLINE', count(*) filter (where s.confirmation_status = 'CONFIRMED_ONLINE'),
           'DISPUTED', count(*) filter (where s.confirmation_status = 'DISPUTED')
         )
  into v_conf
  from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s
  where s.status = 'ACTIVE';

  select jsonb_object_agg(p.period, jsonb_build_object('count', coalesce(x.n, 0), 'cents', coalesce(x.cents, 0)))
  into v_periods
  from (values ('MORNING'), ('AFTERNOON'), ('NIGHT')) p (period)
  left join (
    select s.period, count(*) as n, sum(s.total_cents) as cents
    from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s where s.status = 'ACTIVE' group by s.period
  ) x on x.period = p.period;

  -- Pagamentos não têm local: com filtro de local, o recebido não se aplica.
  if p_establishment is null then
    select jsonb_build_object(
             'received_count', count(*),
             'received_cents', coalesce(sum(p.amount_cents), 0),
             'received_cash_cents', coalesce(sum(p.amount_cents) filter (where p.method = 'CASH'), 0),
             'received_pix_cents', coalesce(sum(p.amount_cents) filter (where p.method = 'PIX'), 0)
           )
    into v_received
    from public.payments p
    where p.business_id = v_business and p.status = 'CONFIRMED' and p.source <> 'SALE_PAID_NOW'
      and p.received_at <@ v_window
      and (p_customer is null or p.customer_id = p_customer);
  else
    v_received := jsonb_build_object('received_count', null, 'received_cents', null,
                                     'received_cash_cents', null, 'received_pix_cents', null);
  end if;

  select jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(x.n, 0),
                                      'cents', coalesce(x.cents, 0)) order by d.day)
  into v_days
  from generate_series(p_from, p_to, interval '1 day') d (day)
  left join (
    select (s.occurred_at at time zone v_tz)::date as day, count(*) as n, sum(s.total_cents) as cents
    from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s where s.status = 'ACTIVE' group by 1
  ) x on x.day = d.day::date;

  select coalesce(jsonb_agg(jsonb_build_object('customer_id', t.customer_id, 'name', t.full_name,
                                               'count', t.n, 'cents', t.cents) order by t.cents desc, t.full_name), '[]'::jsonb)
  into v_top_c
  from (
    select s.customer_id, c.full_name, count(*) as n, sum(s.total_cents) as cents
    from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s join public.customers c on c.id = s.customer_id
    where s.status = 'ACTIVE'
    group by s.customer_id, c.full_name
    order by sum(s.total_cents) desc, c.full_name
    limit 5
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', t.product_id, 'name', t.name,
                                               'quantity', t.qty, 'cents', t.cents) order by t.cents desc, t.name), '[]'::jsonb)
  into v_top_p
  from (
    select i.product_id, pr.name, sum(i.quantity) as qty, sum(i.subtotal_cents) as cents
    from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s
    join public.sale_items i on i.sale_id = s.id
    join public.products pr on pr.id = i.product_id
    where s.status = 'ACTIVE'
    group by i.product_id, pr.name
    order by sum(i.subtotal_cents) desc, pr.name
    limit 5
  ) t;

  -- Retrato de AGORA (não depende do período): quanto está em aberto e há quanto tempo.
  select jsonb_build_object(
           'open_cents', coalesce(sum(d.open_cents), 0),
           'customers_with_open', count(distinct d.customer_id),
           'aging', jsonb_build_object(
             'd0_7', coalesce(sum(d.open_cents) filter (where d.occurred_at > now() - interval '7 days'), 0),
             'd8_30', coalesce(sum(d.open_cents) filter (where d.occurred_at <= now() - interval '7 days'
                                                            and d.occurred_at > now() - interval '30 days'), 0),
             'd31_60', coalesce(sum(d.open_cents) filter (where d.occurred_at <= now() - interval '30 days'
                                                             and d.occurred_at > now() - interval '60 days'), 0),
             'd60_plus', coalesce(sum(d.open_cents) filter (where d.occurred_at <= now() - interval '60 days'), 0)
           )
         )
  into v_open
  from private.business_open_debits(v_business, p_customer) d
  where p_establishment is null or d.establishment_id = p_establishment;

  return v_sales || v_received || jsonb_build_object(
    'confirmation', v_conf,
    'periods', v_periods,
    'days', v_days,
    'top_customers', v_top_c,
    'top_products', v_top_p,
    'open_now', v_open,
    'from', p_from,
    'to', p_to,
    'timezone', v_tz,
    'as_of', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Por estabelecimento: três métricas que NÃO se somam entre si
--   sales_cents           vendas feitas no local, no período
--   originated_open_cents dívida em aberto AGORA que nasceu de vendas no local (FIFO)
--   linked_balance_cents  saldo devedor AGORA dos clientes vinculados ao local
--                         (inclui compras em outros locais; o mesmo cliente
--                         aparece em todos os locais a que pertence)
-- -----------------------------------------------------------------------------
create or replace function public.report_establishments(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_window   tstzrange;
  v_rows     jsonb;
  v_no_place bigint;
  v_total    bigint;
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_window := private.report_window(v_business, p_from, p_to);

  select coalesce(jsonb_agg(jsonb_build_object(
           'establishment_id', e.id,
           'name', e.name,
           'is_active', e.is_active,
           'sales_count', coalesce(sv.n, 0),
           'sales_cents', coalesce(sv.cents, 0),
           'originated_open_cents', coalesce(op.cents, 0),
           'linked_customers', coalesce(lk.n, 0),
           'linked_with_balance', coalesce(lk.owing, 0),
           'linked_balance_cents', coalesce(lk.cents, 0)
         ) order by coalesce(sv.cents, 0) desc, e.name), '[]'::jsonb)
  into v_rows
  from public.establishments e
  left join (
    select s.establishment_id, count(*) as n, sum(s.total_cents) as cents
    from public.sales s
    where s.business_id = v_business and s.status = 'ACTIVE' and s.occurred_at <@ v_window
    group by s.establishment_id
  ) sv on sv.establishment_id = e.id
  left join (
    select o.establishment_id, sum(o.open_cents) as cents
    from private.business_open_debits(v_business, null) o where o.establishment_id is not null group by o.establishment_id
  ) op on op.establishment_id = e.id
  left join (
    select ce.establishment_id, count(*) as n,
           count(*) filter (where b.balance_cents > 0) as owing,
           sum(greatest(b.balance_cents, 0)) as cents
    from public.customer_establishments ce
    join public.customer_balances b on b.customer_id = ce.customer_id
    where ce.business_id = v_business
    group by ce.establishment_id
  ) lk on lk.establishment_id = e.id
  where e.business_id = v_business;

  select coalesce(sum(o.open_cents) filter (where o.establishment_id is null), 0), coalesce(sum(o.open_cents), 0)
  into v_no_place, v_total
  from private.business_open_debits(v_business, null) o;

  return jsonb_build_object(
    'establishments', v_rows,
    -- Saldo anterior do caderno e ajustes não têm local.
    'no_place_open_cents', v_no_place,
    'total_open_cents', v_total,
    'from', p_from,
    'to', p_to
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Lista de vendas do relatório (com totais do filtro inteiro em cada linha)
--   p_payment: ALL (ativas) | OPEN (fiado com valor em aberto) | PARTIAL
--              (fiado pago em parte) | SETTLED (fiado quitado) | PAID_NOW
--              | CANCELLED
--   p_confirmation: ALL | PENDING | SIGNED | CONFIRMED_ONLINE | DISPUTED
-- -----------------------------------------------------------------------------
create or replace function public.report_sales(
  p_from          date,
  p_to            date,
  p_establishment uuid default null,
  p_customer      uuid default null,
  p_payment       text default 'ALL',
  p_confirmation  text default 'ALL',
  p_limit         integer default 50,
  p_offset        integer default 0
)
returns table (
  sale_id             uuid,
  occurred_at         timestamptz,
  period              text,
  customer_id         uuid,
  customer_name       text,
  establishment_name  text,
  summary             text,
  total_cents         bigint,
  payment_kind        text,
  paid_method         text,
  open_cents          bigint,
  status              text,
  cancel_reason       text,
  confirmation_status text,
  total_count         bigint,
  sum_cents           bigint,
  sum_open_cents      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_window   tstzrange;
begin
  if not private.is_staff(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  v_window := private.report_window(v_business, p_from, p_to);
  if coalesce(p_payment, 'ALL') not in ('ALL', 'OPEN', 'PARTIAL', 'SETTLED', 'PAID_NOW', 'CANCELLED')
     or coalesce(p_confirmation, 'ALL') not in ('ALL', 'PENDING', 'SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED') then
    perform private.raise_ldr('LDR_INVALID_FILTER');
  end if;

  return query
  with base as (
    select s.* from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s
  ),
  open_debits as (
    select d.entry_id, d.open_cents
    from (select distinct b.customer_id from base b) x
    cross join lateral private.customer_open_debits(x.customer_id) d
  ),
  rows as (
    select b.*, case when b.status = 'ACTIVE' and b.payment_kind = 'CREDIT' then coalesce(od.open_cents, 0) end as open_now
    from base b left join open_debits od on od.entry_id = b.id
  ),
  filtered as (
    select r.* from rows r
    where case coalesce(p_payment, 'ALL')
            when 'ALL' then r.status = 'ACTIVE'
            when 'CANCELLED' then r.status = 'CANCELLED'
            when 'PAID_NOW' then r.status = 'ACTIVE' and r.payment_kind = 'PAID_NOW'
            when 'OPEN' then r.open_now > 0
            when 'PARTIAL' then r.open_now > 0 and r.open_now < r.total_cents
            when 'SETTLED' then r.open_now = 0
          end
      and (coalesce(p_confirmation, 'ALL') = 'ALL' or r.confirmation_status = p_confirmation)
  )
  select f.id, f.occurred_at, f.period, f.customer_id, c.full_name, e.name,
         case when f.mode = 'ITEMS' then (
           select string_agg(i.quantity::text || '× ' || i.product_name, ' + ' order by i.position)
           from public.sale_items i where i.sale_id = f.id
         ) else f.description end,
         f.total_cents, f.payment_kind,
         (select p.method from public.payments p where p.sale_id = f.id order by p.created_at limit 1),
         f.open_now, f.status, f.cancel_reason, f.confirmation_status,
         count(*) over (), sum(f.total_cents) over ()::bigint, coalesce(sum(f.open_now) over (), 0)::bigint
  from filtered f
  join public.customers c on c.id = f.customer_id
  join public.establishments e on e.id = f.establishment_id
  order by f.occurred_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 2000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke all on function
  private.report_window(uuid, date, date),
  private.report_sales_in(uuid, tstzrange, uuid, uuid),
  private.business_open_debits(uuid, uuid)
from authenticated;
grant execute on function
  public.report_summary(date, date, uuid, uuid),
  public.report_establishments(date, date),
  public.report_sales(date, date, uuid, uuid, text, text, integer, integer)
to authenticated;
