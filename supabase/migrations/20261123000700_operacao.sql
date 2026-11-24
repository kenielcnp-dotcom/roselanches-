-- =============================================================================
-- 0700 · Operação básica: fuso do negócio, painel, visões dos cadastros e
--        gravação atômica de cliente + estabelecimentos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fuso do negócio. "Hoje", períodos e datas seguem o lugar onde a Rose vende,
-- não o fuso do servidor nem o do aparelho. Lista igual a src/domain/timezone.ts.
-- -----------------------------------------------------------------------------
alter table public.business_settings
  add column timezone text not null default 'America/Sao_Paulo'
  check (timezone in (
    'America/Noronha', 'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife',
    'America/Maceio', 'America/Belem', 'America/Araguaina', 'America/Santarem', 'America/Cuiaba',
    'America/Campo_Grande', 'America/Manaus', 'America/Porto_Velho', 'America/Boa_Vista',
    'America/Rio_Branco', 'America/Eirunepe'
  ));

grant update (timezone) on public.business_settings to authenticated;

create or replace function private.business_timezone(p_business uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.timezone from public.business_settings s where s.business_id = p_business),
    'America/Sao_Paulo'
  )
$$;

revoke all on function private.business_timezone(uuid) from public, anon, authenticated;

-- whoami passa a informar o fuso (o app guarda junto com a identidade e usa
-- mesmo sem internet).
create or replace function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'display_name', (select p.display_name from public.profiles p where p.id = (select auth.uid())),
    'staff', (
      select jsonb_build_object('business_id', b.id, 'business_name', b.name, 'role', m.role,
                                'timezone', private.business_timezone(b.id))
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      where m.user_id = (select auth.uid()) and m.is_active
      limit 1
    ),
    'customer', (
      select jsonb_build_object('customer_id', c.id, 'full_name', c.full_name, 'business_name', b.name,
                                'timezone', private.business_timezone(b.id))
      from public.customers c
      join public.businesses b on b.id = c.business_id
      where c.auth_user_id = (select auth.uid())
      limit 1
    )
  )
$$;

-- Primeira configuração, agora com o fuso:
--   select private.bootstrap_owner('email-da-rose@exemplo.com', 'Lanches da Rose', 'America/Cuiaba');
drop function private.bootstrap_owner(text, text);

create function private.bootstrap_owner(p_email text, p_business_name text, p_timezone text default 'America/Sao_Paulo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid;
  v_business uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Nenhuma conta com o e-mail %. Crie a conta pelo app primeiro.', p_email;
  end if;
  if exists (select 1 from public.business_members m where m.user_id = v_user and m.is_active) then
    raise exception 'Esta conta já administra um negócio.';
  end if;

  insert into public.businesses (name) values (btrim(p_business_name)) returning id into v_business;
  update public.business_settings set timezone = p_timezone where business_id = v_business;
  insert into public.business_members (business_id, user_id, role) values (v_business, v_user, 'OWNER');
  return v_business;
end;
$$;

revoke all on function private.bootstrap_owner(text, text, text) from public, anon, authenticated, service_role;

-- O saldo anterior conta a partir da meia-noite do dia de referência no fuso
-- do negócio (antes: fixo em Brasília). Mesmas colunas, na mesma ordem.
create or replace view public.customer_ledger
with (security_invoker = true) as
select s.business_id, s.customer_id, 'SALE'::text as kind, s.id as entry_id, s.occurred_at,
       s.establishment_id, s.total_cents as debit_cents, 0::bigint as credit_cents,
       (s.payment_kind = 'PAID_NOW' and exists (
          select 1 from public.payments p where p.sale_id = s.id and p.status = 'CONFIRMED'
       )) as settled_at_sale
from public.sales s
where s.status = 'ACTIVE'
union all
select o.business_id, o.customer_id, 'OPENING_BALANCE', o.id,
       (o.reference_date::timestamp at time zone coalesce(
          (select bs.timezone from public.business_settings bs where bs.business_id = o.business_id),
          'America/Sao_Paulo')),
       null::uuid, o.amount_cents, 0::bigint, false
from public.opening_balances o
where o.status = 'ACTIVE'
union all
select a.business_id, a.customer_id, 'ADJUSTMENT_' || a.direction, a.id, a.occurred_at, null::uuid,
       case when a.direction = 'DEBIT' then a.amount_cents else 0 end,
       case when a.direction = 'CREDIT' then a.amount_cents else 0 end,
       false
from public.financial_adjustments a
where a.status = 'ACTIVE'
union all
select p.business_id, p.customer_id, 'PAYMENT', p.id, p.received_at, null::uuid, 0::bigint, p.amount_cents,
       p.source = 'SALE_PAID_NOW'
from public.payments p
where p.status = 'CONFIRMED';

-- -----------------------------------------------------------------------------
-- Painel da Rose: total a receber, vendas de hoje e clientes com saldo.
-- "Total a receber" soma só saldos positivos: crédito de um cliente não abate a
-- dívida de outro.
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
  where s.business_id = v_business
    and s.status = 'ACTIVE'
    and s.occurred_at >= v_day_start
    and s.occurred_at < v_day_end;

  return v_balances || v_sales || jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'as_of', now()
  );
end;
$$;

grant execute on function public.dashboard_summary() to authenticated;

-- -----------------------------------------------------------------------------
-- Visões dos cadastros para as telas da Rose. security_invoker: o RLS de quem
-- consulta continua valendo (cliente do portal não vê nada).
-- -----------------------------------------------------------------------------
create view public.establishment_overview
with (security_invoker = true) as
select e.id, e.business_id, e.name, e.nickname, e.address, e.notes, e.is_active, e.created_at, e.updated_at,
       (select count(*)
          from public.customer_establishments ce
          join public.customers c on c.id = ce.customer_id
         where ce.establishment_id = e.id and c.is_active)::integer as customer_count
from public.establishments e;

create view public.customer_overview
with (security_invoker = true) as
select c.id, c.business_id, c.full_name, c.phone_e164, c.notes, c.is_active,
       c.auth_user_id is not null as portal_linked, c.linked_at, c.created_at, c.updated_at,
       coalesce(b.balance_cents, 0)::bigint as balance_cents, b.last_sale_at, b.last_payment_at,
       coalesce(
         (select array_agg(ce.establishment_id order by ce.created_at, ce.establishment_id)
            from public.customer_establishments ce
           where ce.customer_id = c.id),
         '{}'::uuid[]
       ) as establishment_ids
from public.customers c
left join public.customer_balances b on b.customer_id = c.id;

-- "Mais vendidos": unidades nos últimos 90 dias (vendas ativas).
create view public.product_overview
with (security_invoker = true) as
select p.id, p.business_id, p.name, p.price_cents, p.category, p.is_active, p.created_at, p.updated_at,
       coalesce(u.units, 0)::integer as units_90d, u.last_sold_at
from public.products p
left join lateral (
  select sum(i.quantity) as units, max(s.occurred_at) as last_sold_at
  from public.sale_items i
  join public.sales s on s.id = i.sale_id
  where i.product_id = p.id and s.status = 'ACTIVE' and s.occurred_at >= now() - interval '90 days'
) u on true;

grant select on public.establishment_overview, public.customer_overview, public.product_overview to authenticated;

-- -----------------------------------------------------------------------------
-- Cliente + estabelecimentos numa transação só. SECURITY INVOKER: valem o RLS e
-- os privilégios por coluna de quem chama; a função só garante o "tudo ou nada".
-- O id vem do app, então repetir a chamada não cria um segundo cadastro.
-- -----------------------------------------------------------------------------
create or replace function public.save_customer(
  p_id                uuid,
  p_full_name         text,
  p_phone_e164        text,
  p_notes             text,
  p_is_active         boolean,
  p_establishment_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_places   uuid[] := coalesce(p_establishment_ids, '{}');
begin
  if p_id is null or not private.is_staff(v_business) then
    raise exception using errcode = '42501', message = 'LDR_NOT_ALLOWED';
  end if;
  if cardinality(v_places) > 50 then
    raise exception using errcode = '22023', message = 'LDR_TOO_MANY_ESTABLISHMENTS';
  end if;

  if exists (select 1 from public.customers c where c.id = p_id) then
    update public.customers c set
      full_name  = btrim(p_full_name),
      phone_e164 = nullif(btrim(p_phone_e164), ''),
      notes      = nullif(btrim(p_notes), ''),
      is_active  = coalesce(p_is_active, true)
    where c.id = p_id;
  else
    -- Id de cliente de outro negócio: o RLS esconde a linha e o INSERT falha
    -- na chave primária. Ninguém "assume" o cadastro alheio.
    insert into public.customers (id, full_name, phone_e164, notes, is_active)
    values (p_id, btrim(p_full_name), nullif(btrim(p_phone_e164), ''), nullif(btrim(p_notes), ''),
            coalesce(p_is_active, true));
  end if;

  delete from public.customer_establishments ce
  where ce.customer_id = p_id and not (ce.establishment_id = any (v_places));

  insert into public.customer_establishments (customer_id, establishment_id)
  select p_id, x.id
  from (select distinct unnest(v_places) as id) x
  where not exists (
    select 1 from public.customer_establishments ce
    where ce.customer_id = p_id and ce.establishment_id = x.id
  );

  return p_id;
end;
$$;

grant execute on function public.save_customer(uuid, text, text, text, boolean, uuid[]) to authenticated;
