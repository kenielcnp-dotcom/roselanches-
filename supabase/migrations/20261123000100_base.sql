-- =============================================================================
-- 0100 · Base: schema privado, negócio, perfis, membros, configurações e termos
-- =============================================================================
-- Convenções deste projeto:
--   * Dinheiro é sempre bigint em centavos (exato, sem ponto flutuante).
--   * "Negócio" (businesses) é o dono dos dados (a Rose). "Estabelecimento" é um
--     lugar onde ela vende. Toda tabela de negócio tem business_id e FKs
--     compostas (x_id, business_id): nenhuma linha aponta para outro negócio.
--   * Funções privilegiadas ficam no schema "private" (não exposto pela API)
--     ou são RPCs SECURITY DEFINER com search_path vazio e checagem explícita.
--   * Nada financeiro é apagado: cancela/estorna com autor, data e motivo.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- As políticas de RLS chamam funções deste schema com o papel de quem consulta.
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Registros financeiros e de histórico nunca são apagados.
create or replace function private.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'LDR_DELETE_FORBIDDEN';
end;
$$;

-- Converte texto em uuid sem lançar erro (para caminhos de arquivo vindos de fora).
create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Negócio
-- -----------------------------------------------------------------------------
create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_touch before update on public.businesses
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Perfis (um por conta do Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Equipe do negócio. Na v1 só existe a dona (OWNER); OPERATOR fica preparado.
-- -----------------------------------------------------------------------------
create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('OWNER', 'OPERATOR')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Uma pessoa trabalha em no máximo um negócio ativo: o servidor sempre sabe
-- de qual negócio é cada pedido, sem confiar no que o app informa.
create unique index business_members_one_active on public.business_members (user_id) where is_active;

create trigger business_members_touch before update on public.business_members
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Configurações do negócio (1 linha por negócio, criada junto com ele)
-- -----------------------------------------------------------------------------
create table public.business_settings (
  business_id                uuid primary key references public.businesses (id) on delete cascade,
  require_signature          boolean not null default false,
  allow_online_confirmation  boolean not null default true,
  signature_retention_months integer not null default 60 check (signature_retention_months between 6 and 120),
  -- null = período sugerido pela hora do dia
  default_sale_period        text check (default_sale_period in ('MORNING', 'AFTERNOON', 'NIGHT')),
  sale_max_cents             bigint not null default 50000 check (sale_max_cents between 100 and 10000000),
  item_max_qty               integer not null default 50 check (item_max_qty between 1 and 999),
  pix_key                    text check (pix_key is null or char_length(btrim(pix_key)) between 1 and 77),
  pix_key_type               text check (pix_key_type in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP')),
  pix_receiver_name          text check (pix_receiver_name is null or char_length(btrim(pix_receiver_name)) between 2 and 60),
  pix_city                   text check (pix_city is null or char_length(btrim(pix_city)) between 2 and 30),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check ((pix_key is null) = (pix_key_type is null))
);

create trigger business_settings_touch before update on public.business_settings
  for each row execute function private.touch_updated_at();

create or replace function private.create_business_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_settings (business_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger businesses_settings after insert on public.businesses
  for each row execute function private.create_business_settings();

-- -----------------------------------------------------------------------------
-- Textos de confirmação de compra, versionados e imutáveis
-- -----------------------------------------------------------------------------
create table public.consent_texts (
  version    text primary key check (version ~ '^v[0-9]+$'),
  body       text not null check (char_length(body) between 10 and 1000),
  created_at timestamptz not null default now()
);

create trigger consent_texts_no_delete before delete on public.consent_texts
  for each row execute function private.forbid_delete();

create or replace function private.consent_texts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'LDR_CONSENT_TEXT_IMMUTABLE';
end;
$$;

create trigger consent_texts_no_update before update on public.consent_texts
  for each row execute function private.consent_texts_immutable();

-- Igual a src/domain/consent.ts (CONSENT_TEXTS.v1).
insert into public.consent_texts (version, body) values
  ('v1', 'Confirmo que recebi os produtos ou valores descritos nesta compra e reconheço o lançamento informado.');

-- -----------------------------------------------------------------------------
-- Helpers de autorização (usados pelas políticas de RLS e pelas RPCs)
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER evita recursão de políticas em business_members.
create or replace function private.my_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
  from public.business_members m
  where m.user_id = (select auth.uid()) and m.is_active
  limit 1
$$;

create or replace function private.is_staff(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business is not null and exists (
    select 1 from public.business_members m
    where m.business_id = p_business and m.user_id = (select auth.uid()) and m.is_active
  )
$$;

create or replace function private.is_owner(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business is not null and exists (
    select 1 from public.business_members m
    where m.business_id = p_business and m.user_id = (select auth.uid())
      and m.is_active and m.role = 'OWNER'
  )
$$;

-- -----------------------------------------------------------------------------
-- Primeira configuração: torna uma conta já cadastrada a dona de um negócio novo.
-- Rodar UMA vez no SQL Editor do painel (papel postgres). Ninguém pelo app executa.
--   select private.bootstrap_owner('email-da-rose@exemplo.com', 'Lanches da Rose');
-- -----------------------------------------------------------------------------
create or replace function private.bootstrap_owner(p_email text, p_business_name text)
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
  insert into public.business_members (business_id, user_id, role) values (v_business, v_user, 'OWNER');
  return v_business;
end;
$$;

revoke all on all functions in schema private from public;
revoke all on function private.bootstrap_owner(text, text) from public, anon, authenticated, service_role;
grant execute on function
  private.my_business_id(),
  private.is_staff(uuid),
  private.is_owner(uuid),
  private.try_uuid(text)
to authenticated, service_role;
