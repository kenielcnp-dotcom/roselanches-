-- =============================================================================
-- 0200 · Cadastros: estabelecimentos, clientes, vínculos, produtos e convites
-- =============================================================================
-- Cadastros não são financeiros: a equipe escreve direto (RLS + privilégio por
-- coluna). business_id e created_by vêm de valores padrão do servidor e não
-- podem ser informados pelo app.

-- -----------------------------------------------------------------------------
-- Estabelecimentos (lugares onde a Rose vende)
-- -----------------------------------------------------------------------------
create table public.establishments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.my_business_id() references public.businesses (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 2 and 60 and name !~ '[[:cntrl:]]'),
  nickname    text check (nickname is null or (char_length(btrim(nickname)) between 1 and 30 and nickname !~ '[[:cntrl:]]')),
  address     text check (address is null or char_length(address) <= 200),
  notes       text check (notes is null or char_length(notes) <= 300),
  is_active   boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, business_id)
);

create unique index establishments_name_uq on public.establishments (business_id, lower(btrim(name)));

create trigger establishments_touch before update on public.establishments
  for each row execute function private.touch_updated_at();
-- Estabelecimento com histórico não some: desativa.
create trigger establishments_no_delete before delete on public.establishments
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default private.my_business_id() references public.businesses (id) on delete restrict,
  full_name    text not null check (char_length(btrim(full_name)) between 2 and 80 and full_name !~ '[[:cntrl:]]'),
  -- Celular (+55 DD 9XXXXXXXX) ou fixo (+55 DD [2-5]XXXXXXX). Igual a src/domain/phone.ts.
  phone_e164   text check (phone_e164 is null or phone_e164 ~ '^\+55[1-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$'),
  notes        text check (notes is null or char_length(notes) <= 300),
  is_active    boolean not null default true,
  -- Conta do portal. Só a RPC de convite preenche; o app nunca escreve aqui.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  linked_at    timestamptz,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, business_id),
  check (auth_user_id is null or linked_at is not null)
);

create index customers_name_idx on public.customers (business_id, lower(full_name));
create index customers_phone_idx on public.customers (business_id, phone_e164) where phone_e164 is not null;

create trigger customers_touch before update on public.customers
  for each row execute function private.touch_updated_at();
create trigger customers_no_delete before delete on public.customers
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Grupos: cliente × estabelecimento (muitos-para-muitos)
-- -----------------------------------------------------------------------------
-- Remover um vínculo não mexe em vendas: a venda guarda o próprio estabelecimento.
create table public.customer_establishments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null default private.my_business_id(),
  customer_id      uuid not null,
  establishment_id uuid not null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (business_id, customer_id, establishment_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (establishment_id, business_id) references public.establishments (id, business_id)
);

create index customer_establishments_establishment_idx on public.customer_establishments (establishment_id);
create index customer_establishments_customer_idx on public.customer_establishments (customer_id);

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.my_business_id() references public.businesses (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 2 and 60 and name !~ '[[:cntrl:]]'),
  price_cents bigint not null check (price_cents between 1 and 10000000),
  category    text check (category is null or (char_length(btrim(category)) between 1 and 30 and category !~ '[[:cntrl:]]')),
  is_active   boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, business_id)
);

create unique index products_name_uq on public.products (business_id, lower(btrim(name)));

create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();
create trigger products_no_delete before delete on public.products
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Convites para o portal do cliente (uso único; só o hash do token fica no banco)
-- -----------------------------------------------------------------------------
create table public.customer_invites (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  customer_id  uuid not null,
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by      uuid,
  cancelled_at timestamptz,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  check (used_at is null or used_by is not null),
  check (expires_at > created_at)
);

-- No máximo um convite em aberto por cliente: gerar outro cancela o anterior.
create unique index customer_invites_one_open on public.customer_invites (customer_id)
  where used_at is null and cancelled_at is null;

create trigger customer_invites_no_delete before delete on public.customer_invites
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Cliente logado no portal
-- -----------------------------------------------------------------------------
create or replace function private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c where c.auth_user_id = (select auth.uid()) limit 1
$$;

-- Quem sou eu? O app usa isto para escolher a área (Rose ou portal); o servidor
-- continua aplicando as regras em cada tabela e RPC.
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
      select jsonb_build_object('business_id', b.id, 'business_name', b.name, 'role', m.role)
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      where m.user_id = (select auth.uid()) and m.is_active
      limit 1
    ),
    'customer', (
      select jsonb_build_object('customer_id', c.id, 'full_name', c.full_name, 'business_name', b.name)
      from public.customers c
      join public.businesses b on b.id = c.business_id
      where c.auth_user_id = (select auth.uid())
      limit 1
    )
  )
$$;

revoke all on function private.current_customer_id() from public;
grant execute on function private.current_customer_id() to authenticated, service_role;
