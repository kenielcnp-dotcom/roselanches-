-- =============================================================================
-- 1400 · Equipe: vendedores com conta própria (papel OPERATOR)
-- =============================================================================
-- O vendedor usa o mesmo app da Rose, no próprio celular e com o próprio login.
-- Ele vende, recebe, cadastra cliente e vê o saldo dos clientes. Só a dona
-- cancela venda, estorna, confere aviso de Pix, mexe em produtos, locais e
-- configurações, vê os relatórios e cuida da equipe.
-- A entrada na equipe é por convite de uso único (igual ao do cliente: token de
-- 192 bits que só existe no link; o banco guarda o SHA-256).

-- -----------------------------------------------------------------------------
-- Convites de vendedor
-- -----------------------------------------------------------------------------
create table public.staff_invites (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete restrict,
  invitee_name text not null check (char_length(btrim(invitee_name)) between 2 and 60),
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by      uuid,
  cancelled_at timestamptz,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  check (used_at is null or used_by is not null),
  check (expires_at > created_at)
);

create index staff_invites_open_idx on public.staff_invites (business_id)
  where used_at is null and cancelled_at is null;

create trigger staff_invites_no_delete before delete on public.staff_invites
  for each row execute function private.forbid_delete();
create trigger audit_staff_invites after insert or update on public.staff_invites
  for each row execute function private.audit_row();

alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from public, anon, authenticated;
create policy staff_invites_select on public.staff_invites for select to authenticated
  using (private.is_owner(business_id));
grant select (id, business_id, invitee_name, expires_at, used_at, used_by, cancelled_at, created_by, created_at)
  on public.staff_invites to authenticated;

-- -----------------------------------------------------------------------------
-- Rose: convidar, cancelar convite, desativar e reativar vendedor
-- -----------------------------------------------------------------------------
create or replace function public.create_staff_invite(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_name     text := btrim(coalesce(p_name, ''));
  v_token    text;
  v_id       uuid;
  v_expires  timestamptz := now() + interval '72 hours';
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  if char_length(v_name) not between 2 and 60 or v_name ~ '[[:cntrl:]]' then
    perform private.raise_ldr('LDR_INVALID_NAME');
  end if;
  if (select count(*) from public.staff_invites i
      where i.business_id = v_business and i.used_at is null and i.cancelled_at is null
        and i.expires_at > now()) >= 5 then
    perform private.raise_ldr('LDR_TOO_MANY_INVITES');
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.staff_invites (business_id, invitee_name, token_hash, expires_at, created_by)
  values (v_business, v_name, sha256(convert_to(v_token, 'UTF8')), v_expires, (select auth.uid()))
  returning id into v_id;

  -- O token sai daqui uma única vez; o banco não consegue mostrá-lo de novo.
  return jsonb_build_object('invite_id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create or replace function public.cancel_staff_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  update public.staff_invites i set cancelled_at = now()
  where i.id = p_invite and i.business_id = v_business and i.used_at is null and i.cancelled_at is null;
end;
$$;

-- Desativar tira o acesso na hora (o servidor recusa tudo o que vier daquela
-- conta). Nada é apagado: as vendas dele continuam com o nome dele.
create or replace function public.set_member_active(p_member uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_member   public.business_members%rowtype;
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  select * into v_member from public.business_members m
  where m.id = p_member and m.business_id = v_business
  for update;
  if not found then
    perform private.raise_ldr('LDR_MEMBER_NOT_FOUND');
  end if;
  if v_member.role = 'OWNER' then
    perform private.raise_ldr('LDR_CANNOT_CHANGE_OWNER');
  end if;
  if v_member.is_active = coalesce(p_active, false) then
    return;
  end if;
  if p_active and (
    exists (select 1 from public.business_members m where m.user_id = v_member.user_id and m.is_active)
    or exists (select 1 from public.customers c where c.auth_user_id = v_member.user_id)
  ) then
    perform private.raise_ldr('LDR_ACCOUNT_IN_USE');
  end if;
  update public.business_members m set is_active = p_active where m.id = p_member;
end;
$$;

-- Equipe e convites em aberto, para a tela "Equipe" da Rose.
create or replace function public.team_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
begin
  if not private.is_owner(v_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', m.id,
               'user_id', m.user_id,
               'name', coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)),
               'email', u.email,
               'role', m.role,
               'is_active', m.is_active,
               'joined_at', m.created_at,
               'last_sale_at', (select max(s.occurred_at) from public.sales s
                                where s.business_id = v_business and s.created_by = m.user_id)
             ) order by (m.role = 'OWNER') desc, m.is_active desc, lower(coalesce(p.display_name, '')))
      from public.business_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.business_id = v_business
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invite_id', i.id, 'name', i.invitee_name, 'expires_at', i.expires_at, 'created_at', i.created_at
             ) order by i.created_at desc)
      from public.staff_invites i
      where i.business_id = v_business and i.used_at is null and i.cancelled_at is null and i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Vendedor: usar o convite. Devolve um estado (não lança exceção) para a
-- tentativa contar no mesmo limite do convite de cliente.
-- -----------------------------------------------------------------------------
create or replace function public.redeem_staff_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_invite   public.staff_invites%rowtype;
  v_existing public.business_members%rowtype;
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

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    v_status := 'INVALID';
  else
    select * into v_invite from public.staff_invites i
    where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
    for update;
    if not found then
      v_status := 'INVALID';
    else
      select * into v_existing from public.business_members m
      where m.business_id = v_invite.business_id and m.user_id = v_user
      for update;
      if found and v_existing.is_active then
        v_status := 'ALREADY_MEMBER';
      elsif v_invite.used_at is not null then
        v_status := 'USED';
      elsif v_invite.cancelled_at is not null then
        v_status := 'CANCELLED';
      elsif v_invite.expires_at <= now() then
        v_status := 'EXPIRED';
      elsif exists (select 1 from public.business_members m where m.user_id = v_user and m.is_active) then
        v_status := 'OTHER_BUSINESS';
      elsif exists (select 1 from public.customers c where c.auth_user_id = v_user) then
        -- Conta de cliente não vira conta de vendedor (e vice-versa).
        v_status := 'CUSTOMER_ACCOUNT';
      else
        if v_existing.id is not null then
          -- Já trabalhou aqui e foi desativado: o convite novo reativa.
          update public.business_members m set is_active = true where m.id = v_existing.id;
        else
          insert into public.business_members (business_id, user_id, role)
          values (v_invite.business_id, v_user, 'OPERATOR');
        end if;
        update public.staff_invites i set used_at = now(), used_by = v_user where i.id = v_invite.id;
        update public.profiles p set display_name = v_invite.invitee_name
        where p.id = v_user and btrim(p.display_name) = '';
        v_status := 'JOINED';
      end if;
    end if;
  end if;

  insert into private.invite_attempts (user_id, outcome) values (v_user, v_status);

  if v_status in ('JOINED', 'ALREADY_MEMBER') then
    return jsonb_build_object(
      'status', v_status,
      'business_name', (select b.name from public.businesses b where b.id = v_invite.business_id)
    );
  end if;
  return jsonb_build_object('status', v_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Ações que passam a ser só da dona. A função original vai para o schema
-- privado (sem acesso direto) e a pública vira uma porta que confere o papel.
-- -----------------------------------------------------------------------------
-- Quem não é da equipe recebe "sem permissão"; o vendedor, "só a dona".
create or replace function private.require_owner(p_business uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff(p_business) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;
  if not private.is_owner(p_business) then
    perform private.raise_ldr('LDR_OWNER_ONLY', '42501');
  end if;
end;
$$;
alter function public.cancel_sale(uuid, text) set schema private;
alter function private.cancel_sale(uuid, text) rename to owner_cancel_sale;

create function public.cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner(private.my_business_id());
  return private.owner_cancel_sale(p_sale_id, p_reason);
end;
$$;

alter function public.confirm_payment_notification(uuid, uuid, bigint, timestamptz, text) set schema private;
alter function private.confirm_payment_notification(uuid, uuid, bigint, timestamptz, text)
  rename to owner_confirm_payment_notification;

create function public.confirm_payment_notification(
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
begin
  perform private.require_owner(private.my_business_id());
  return private.owner_confirm_payment_notification(p_notification_id, p_payment_id, p_amount_cents, p_received_at, p_note);
end;
$$;

alter function public.reject_payment_notification(uuid, text) set schema private;
alter function private.reject_payment_notification(uuid, text) rename to owner_reject_payment_notification;

create function public.reject_payment_notification(p_notification_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner(private.my_business_id());
  return private.owner_reject_payment_notification(p_notification_id, p_reason);
end;
$$;

alter function public.report_summary(date, date, uuid, uuid) set schema private;
alter function private.report_summary(date, date, uuid, uuid) rename to owner_report_summary;

create function public.report_summary(
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
begin
  perform private.require_owner(private.my_business_id());
  return private.owner_report_summary(p_from, p_to, p_establishment, p_customer);
end;
$$;

alter function public.report_establishments(date, date) set schema private;
alter function private.report_establishments(date, date) rename to owner_report_establishments;

create function public.report_establishments(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_owner(private.my_business_id());
  return private.owner_report_establishments(p_from, p_to);
end;
$$;

-- Produtos e locais: a equipe lê; só a dona cria e altera.
drop policy products_insert on public.products;
drop policy products_update on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (private.is_owner(business_id));
create policy products_update on public.products for update to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));

drop policy establishments_insert on public.establishments;
drop policy establishments_update on public.establishments;
create policy establishments_insert on public.establishments for insert to authenticated
  with check (private.is_owner(business_id));
create policy establishments_update on public.establishments for update to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));

-- -----------------------------------------------------------------------------
-- "Vendido por" e "Recebido por" nas listas (colunas novas no fim). As visões
-- rodam com o RLS de quem consulta: o nome vem do perfil, que a equipe lê.
-- -----------------------------------------------------------------------------
create or replace function private.member_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1))
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user
$$;

create or replace view public.sale_list
with (security_invoker = true) as
select s.id, s.business_id, s.customer_id, c.full_name as customer_name, c.phone_e164 as customer_phone,
       s.establishment_id, e.name as establishment_name, s.mode, s.period, s.description,
       (select string_agg(i.quantity::text || '× ' || i.product_name, ' + ' order by i.position)
          from public.sale_items i where i.sale_id = s.id) as items_summary,
       s.total_cents, s.payment_kind,
       (select p.method from public.payments p where p.sale_id = s.id order by p.created_at limit 1) as paid_method,
       s.status, s.cancel_reason, s.cancelled_at, s.confirmation_status, s.occurred_at, s.received_at,
       s.created_by, nullif(btrim(pr.display_name), '') as created_by_name
from public.sales s
join public.customers c on c.id = s.customer_id
join public.establishments e on e.id = s.establishment_id
left join public.profiles pr on pr.id = s.created_by;

create or replace view public.payment_list
with (security_invoker = true) as
select p.id, p.business_id, p.customer_id, c.full_name as customer_name, p.amount_cents, p.method, p.source, p.sale_id,
       p.notification_id, p.received_at, p.note, p.status, p.reverse_reason, p.reversed_at, p.created_at,
       p.created_by, nullif(btrim(pr.display_name), '') as created_by_name
from public.payments p
join public.customers c on c.id = p.customer_id
left join public.profiles pr on pr.id = p.created_by;

-- -----------------------------------------------------------------------------
-- Painel: o vendedor vê os números DELE (vendas e recebimentos de hoje); o
-- total a receber e os avisos para conferir são da dona.
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
  v_user      uuid := (select auth.uid());
  v_owner     boolean;
  v_mine      uuid;
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
  v_owner := private.is_owner(v_business);
  v_mine := case when v_owner then null else v_user end;

  v_tz := private.business_timezone(v_business);
  v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day_end := (date_trunc('day', now() at time zone v_tz) + interval '1 day') at time zone v_tz;

  select jsonb_build_object(
           'receivable_cents', case when v_owner then coalesce(sum(b.balance_cents) filter (where b.balance_cents > 0), 0) end,
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
    and s.occurred_at >= v_day_start and s.occurred_at < v_day_end
    and (v_mine is null or s.created_by = v_mine);

  select jsonb_build_object(
           'today_received_cents', coalesce(sum(p.amount_cents), 0),
           'today_received_cash_cents', coalesce(sum(p.amount_cents) filter (where p.method = 'CASH'), 0),
           'pending_notifications', case when v_owner then (select count(*) from public.payment_notifications n
                                     where n.business_id = v_business and n.status = 'PENDING') else 0 end
         )
  into v_received
  from public.payments p
  where p.business_id = v_business and p.status = 'CONFIRMED'
    and p.received_at >= v_day_start and p.received_at < v_day_end
    and (v_mine is null or p.created_by = v_mine);

  return v_balances || v_sales || v_received || jsonb_build_object(
    'scope', case when v_owner then 'BUSINESS' else 'MINE' end,
    'open_disputes', case when v_owner then (select count(*) from public.sale_confirmations c
                      join public.sales s on s.id = c.sale_id
                      where c.business_id = v_business and c.confirmation_status = 'DISPUTED'
                        and c.resolved_at is null and s.status = 'ACTIVE') else 0 end,
    'timezone', v_tz,
    'today', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'as_of', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Relatórios: lista de vendas com filtro e coluna de vendedor (só a dona)
-- -----------------------------------------------------------------------------
drop function public.report_sales(date, date, uuid, uuid, text, text, integer, integer);

create function public.report_sales(
  p_from          date,
  p_to            date,
  p_establishment uuid default null,
  p_customer      uuid default null,
  p_payment       text default 'ALL',
  p_confirmation  text default 'ALL',
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_seller        uuid default null
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
  seller_name         text,
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
  perform private.require_owner(v_business);
  v_window := private.report_window(v_business, p_from, p_to);
  if coalesce(p_payment, 'ALL') not in ('ALL', 'OPEN', 'PARTIAL', 'SETTLED', 'PAID_NOW', 'CANCELLED')
     or coalesce(p_confirmation, 'ALL') not in ('ALL', 'PENDING', 'SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED') then
    perform private.raise_ldr('LDR_INVALID_FILTER');
  end if;

  return query
  with base as (
    select s.* from private.report_sales_in(v_business, v_window, p_establishment, p_customer) s
    where p_seller is null or s.created_by = p_seller
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
         private.member_name(f.created_by),
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
-- Relatório por vendedor: quanto cada pessoa vendeu e recebeu no período.
-- "Dinheiro recebido" inclui as vendas pagas na hora em dinheiro: é o que
-- ficou na mão de quem registrou (o acerto com a Rose é feito por fora).
-- -----------------------------------------------------------------------------
create or replace function public.report_team(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid := private.my_business_id();
  v_window   tstzrange;
begin
  perform private.require_owner(v_business);
  v_window := private.report_window(v_business, p_from, p_to);

  return jsonb_build_object('members', coalesce((
    select jsonb_agg(r order by (r ->> 'role' = 'OWNER') desc, (r ->> 'sales_cents')::bigint desc, r ->> 'name')
    from (
      select jsonb_build_object(
               'user_id', m.user_id,
               'name', private.member_name(m.user_id),
               'role', m.role,
               'is_active', m.is_active,
               'sales_count', coalesce(sa.sales_count, 0),
               'sales_cents', coalesce(sa.sales_cents, 0),
               'credit_cents', coalesce(sa.credit_cents, 0),
               'cancelled_count', coalesce(sa.cancelled_count, 0),
               'cash_cents', coalesce(pa.cash_cents, 0),
               'pix_cents', coalesce(pa.pix_cents, 0)
             ) as r
      from public.business_members m
      left join lateral (
        select count(*) filter (where s.status = 'ACTIVE') as sales_count,
               coalesce(sum(s.total_cents) filter (where s.status = 'ACTIVE'), 0)::bigint as sales_cents,
               coalesce(sum(s.total_cents) filter (where s.status = 'ACTIVE' and s.payment_kind = 'CREDIT'), 0)::bigint as credit_cents,
               count(*) filter (where s.status = 'CANCELLED') as cancelled_count
        from public.sales s
        where s.business_id = v_business and s.created_by = m.user_id and s.occurred_at <@ v_window
      ) sa on true
      left join lateral (
        select coalesce(sum(p.amount_cents) filter (where p.method = 'CASH'), 0)::bigint as cash_cents,
               coalesce(sum(p.amount_cents) filter (where p.method = 'PIX'), 0)::bigint as pix_cents
        from public.payments p
        where p.business_id = v_business and p.created_by = m.user_id and p.status = 'CONFIRMED'
          and p.received_at <@ v_window
      ) pa on true
      where m.business_id = v_business
        and (m.is_active or sa.sales_count > 0 or sa.cancelled_count > 0 or pa.cash_cents > 0 or pa.pix_cents > 0)
    ) x
  ), '[]'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke all on function
  private.owner_cancel_sale(uuid, text),
  private.owner_confirm_payment_notification(uuid, uuid, bigint, timestamptz, text),
  private.owner_reject_payment_notification(uuid, text),
  private.owner_report_summary(date, date, uuid, uuid),
  private.owner_report_establishments(date, date),
  private.member_name(uuid),
  private.require_owner(uuid)
from authenticated;
grant execute on function
  public.create_staff_invite(text),
  public.cancel_staff_invite(uuid),
  public.set_member_active(uuid, boolean),
  public.team_overview(),
  public.redeem_staff_invite(text),
  public.cancel_sale(uuid, text),
  public.confirm_payment_notification(uuid, uuid, bigint, timestamptz, text),
  public.reject_payment_notification(uuid, text),
  public.report_summary(date, date, uuid, uuid),
  public.report_establishments(date, date),
  public.report_sales(date, date, uuid, uuid, text, text, integer, integer, uuid),
  public.report_team(date, date)
to authenticated;
