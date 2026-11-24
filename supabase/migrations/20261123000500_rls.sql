-- =============================================================================
-- 0500 · Row Level Security e privilégios
-- =============================================================================
-- Modelo:
--   * anon (deslogado) não recebe NENHUM privilégio.
--   * Equipe do negócio (business_members ativo) lê tudo do próprio negócio e
--     escreve direto só nos cadastros não financeiros, coluna por coluna.
--   * Escrita financeira: somente por RPCs SECURITY DEFINER (próximas migrações).
--   * Cliente do portal: nenhuma tabela. Lê e escreve só pelas RPCs portal_*,
--     que filtram por private.current_customer_id(). Motivo: o cadastro do
--     cliente tem observações privadas da Rose, e o RLS não filtra colunas por
--     usuário.

-- -----------------------------------------------------------------------------
-- Começa do zero: tira tudo de anon/authenticated e de PUBLIC nas funções.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Objetos criados em migrações futuras também nascem sem privilégio.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- RLS ligado em todas as tabelas
-- -----------------------------------------------------------------------------
alter table public.businesses              enable row level security;
alter table public.profiles                enable row level security;
alter table public.business_members        enable row level security;
alter table public.business_settings       enable row level security;
alter table public.consent_texts           enable row level security;
alter table public.establishments          enable row level security;
alter table public.customers               enable row level security;
alter table public.customer_establishments enable row level security;
alter table public.products                enable row level security;
alter table public.customer_invites        enable row level security;
alter table public.sales                   enable row level security;
alter table public.sale_items              enable row level security;
alter table public.payment_notifications   enable row level security;
alter table public.payments                enable row level security;
alter table public.opening_balances        enable row level security;
alter table public.financial_adjustments   enable row level security;
alter table public.sale_confirmations      enable row level security;
alter table public.audit_logs              enable row level security;

-- -----------------------------------------------------------------------------
-- Leitura (só authenticated; o RLS decide quais linhas)
-- -----------------------------------------------------------------------------
grant select on
  public.businesses,
  public.profiles,
  public.business_members,
  public.business_settings,
  public.consent_texts,
  public.establishments,
  public.customers,
  public.customer_establishments,
  public.products,
  public.sales,
  public.sale_items,
  public.payment_notifications,
  public.payments,
  public.opening_balances,
  public.financial_adjustments,
  public.sale_confirmations,
  public.audit_logs,
  public.customer_ledger,
  public.customer_balances
to authenticated;

-- O hash do token do convite nunca é legível pelo app.
grant select (id, business_id, customer_id, expires_at, used_at, used_by, cancelled_at, created_by, created_at)
  on public.customer_invites to authenticated;

create policy businesses_select on public.businesses for select to authenticated
  using (private.is_staff(id));
create policy businesses_update on public.businesses for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));

-- Perfil: o próprio e o das pessoas da mesma equipe.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.user_id = profiles.id and private.is_staff(m.business_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy business_members_select on public.business_members for select to authenticated
  using (private.is_staff(business_id));

create policy business_settings_select on public.business_settings for select to authenticated
  using (private.is_staff(business_id));
create policy business_settings_update on public.business_settings for update to authenticated
  using (private.is_owner(business_id)) with check (private.is_owner(business_id));

-- Textos de confirmação: públicos para quem está logado (o portal mostra o texto).
create policy consent_texts_select on public.consent_texts for select to authenticated
  using (true);

-- Cadastros: a equipe lê e escreve no próprio negócio.
create policy establishments_select on public.establishments for select to authenticated
  using (private.is_staff(business_id));
create policy establishments_insert on public.establishments for insert to authenticated
  with check (private.is_staff(business_id));
create policy establishments_update on public.establishments for update to authenticated
  using (private.is_staff(business_id)) with check (private.is_staff(business_id));

create policy customers_select on public.customers for select to authenticated
  using (private.is_staff(business_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (private.is_staff(business_id));
create policy customers_update on public.customers for update to authenticated
  using (private.is_staff(business_id)) with check (private.is_staff(business_id));

create policy customer_establishments_select on public.customer_establishments for select to authenticated
  using (private.is_staff(business_id));
create policy customer_establishments_insert on public.customer_establishments for insert to authenticated
  with check (private.is_staff(business_id));
create policy customer_establishments_delete on public.customer_establishments for delete to authenticated
  using (private.is_staff(business_id));

create policy products_select on public.products for select to authenticated
  using (private.is_staff(business_id));
create policy products_insert on public.products for insert to authenticated
  with check (private.is_staff(business_id));
create policy products_update on public.products for update to authenticated
  using (private.is_staff(business_id)) with check (private.is_staff(business_id));

create policy customer_invites_select on public.customer_invites for select to authenticated
  using (private.is_staff(business_id));

-- Financeiro: só leitura pela equipe. Escrita apenas via RPC.
create policy sales_select on public.sales for select to authenticated
  using (private.is_staff(business_id));
create policy sale_items_select on public.sale_items for select to authenticated
  using (private.is_staff(business_id));
create policy payment_notifications_select on public.payment_notifications for select to authenticated
  using (private.is_staff(business_id));
create policy payments_select on public.payments for select to authenticated
  using (private.is_staff(business_id));
create policy opening_balances_select on public.opening_balances for select to authenticated
  using (private.is_staff(business_id));
create policy financial_adjustments_select on public.financial_adjustments for select to authenticated
  using (private.is_staff(business_id));
create policy sale_confirmations_select on public.sale_confirmations for select to authenticated
  using (private.is_staff(business_id));

-- Auditoria: só a dona lê.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.is_owner(business_id));

-- -----------------------------------------------------------------------------
-- Escrita direta permitida, coluna por coluna (business_id, created_by e
-- auth_user_id nunca são graváveis pelo app)
-- -----------------------------------------------------------------------------
grant update (display_name) on public.profiles to authenticated;
grant update (name) on public.businesses to authenticated;
grant update (require_signature, allow_online_confirmation, signature_retention_months, default_sale_period,
              sale_max_cents, item_max_qty, pix_key, pix_key_type, pix_receiver_name, pix_city)
  on public.business_settings to authenticated;

grant insert (id, name, nickname, address, notes, is_active) on public.establishments to authenticated;
grant update (name, nickname, address, notes, is_active) on public.establishments to authenticated;

grant insert (id, full_name, phone_e164, notes, is_active) on public.customers to authenticated;
grant update (full_name, phone_e164, notes, is_active) on public.customers to authenticated;

grant insert (customer_id, establishment_id) on public.customer_establishments to authenticated;
grant delete on public.customer_establishments to authenticated;

grant insert (id, name, price_cents, category, is_active) on public.products to authenticated;
grant update (name, price_cents, category, is_active) on public.products to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs disponíveis nesta etapa
-- -----------------------------------------------------------------------------
grant execute on function public.whoami() to authenticated;
grant execute on function public.sale_document_hash(uuid, text) to authenticated;
