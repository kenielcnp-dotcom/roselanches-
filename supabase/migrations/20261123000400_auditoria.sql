-- =============================================================================
-- 0400 · Auditoria: quem fez o quê, quando e por quê
-- =============================================================================
-- Só gatilhos e RPCs escrevem aqui. Ninguém altera nem apaga um registro de
-- auditoria, nem mesmo as funções privilegiadas. Conteúdo binário (assinaturas)
-- e hashes de convite nunca entram no log.

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  business_id   uuid not null,
  actor_user_id uuid,
  action        text not null check (char_length(action) between 2 and 40),
  entity        text not null check (char_length(entity) between 2 and 60),
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text check (reason is null or char_length(reason) <= 300),
  created_at    timestamptz not null default now()
);

create index audit_logs_business_time_idx on public.audit_logs (business_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'LDR_AUDIT_IMMUTABLE';
end;
$$;

create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

-- Registro explícito, chamado pelas RPCs (conflito de sincronização, flags etc.).
create or replace function private.audit(
  p_business  uuid,
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_after     jsonb default null,
  p_reason    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (business_id, actor_user_id, action, entity, entity_id, after, reason)
  values (p_business, (select auth.uid()), p_action, p_entity, p_entity_id, p_after, left(p_reason, 300));
end;
$$;

-- Gatilho genérico. Em UPDATE guarda só as colunas que mudaram.
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hidden text[] := array['token_hash', 'updated_at'];
  v_old    jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - v_hidden end;
  v_new    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - v_hidden end;
  v_row    jsonb := coalesce(v_new, v_old);
  v_before jsonb;
  v_after  jsonb;
  v_action text := tg_op;
  v_reason text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into v_after
    from jsonb_each(v_new) n
    where v_old -> n.key is distinct from n.value;
    if v_after is null then
      return null; -- nada mudou de verdade
    end if;
    select jsonb_object_agg(o.key, o.value) into v_before
    from jsonb_each(v_old) o
    where v_after ? o.key;

    -- Mudanças de estado ganham nome próprio (CANCEL, REVERSE, INVALIDATE…).
    if v_after ? 'status' or v_after ? 'confirmation_status' then
      v_action := 'STATUS:' || coalesce(v_after ->> 'status', v_after ->> 'confirmation_status');
    end if;
    v_reason := coalesce(v_after ->> 'cancel_reason', v_after ->> 'reverse_reason',
                         v_after ->> 'invalidation_reason', v_after ->> 'resolution_note');
  elsif tg_op = 'INSERT' then
    v_after := v_new;
  else
    v_before := v_old;
  end if;

  insert into public.audit_logs (business_id, actor_user_id, action, entity, entity_id, before, after, reason)
  values (
    coalesce((v_row ->> 'business_id')::uuid, (v_row ->> 'id')::uuid),
    (select auth.uid()),
    v_action,
    tg_table_name,
    private.try_uuid(v_row ->> 'id'),
    v_before,
    v_after,
    left(v_reason, 300)
  );
  return null;
end;
$$;

-- confirmation_status de sales é derivado e já aparece no log de sale_confirmations.
create trigger audit_businesses after insert or update on public.businesses
  for each row execute function private.audit_row();
create trigger audit_business_members after insert or update on public.business_members
  for each row execute function private.audit_row();
create trigger audit_business_settings after update on public.business_settings
  for each row execute function private.audit_row();
create trigger audit_establishments after insert or update on public.establishments
  for each row execute function private.audit_row();
create trigger audit_customers after insert or update on public.customers
  for each row execute function private.audit_row();
create trigger audit_customer_establishments after insert or delete on public.customer_establishments
  for each row execute function private.audit_row();
create trigger audit_products after insert or update on public.products
  for each row execute function private.audit_row();
create trigger audit_customer_invites after insert or update on public.customer_invites
  for each row execute function private.audit_row();
create trigger audit_sales after insert or update of status on public.sales
  for each row execute function private.audit_row();
create trigger audit_payments after insert or update on public.payments
  for each row execute function private.audit_row();
create trigger audit_opening_balances after insert or update on public.opening_balances
  for each row execute function private.audit_row();
create trigger audit_financial_adjustments after insert or update on public.financial_adjustments
  for each row execute function private.audit_row();
create trigger audit_payment_notifications after insert or update on public.payment_notifications
  for each row execute function private.audit_row();
create trigger audit_sale_confirmations after insert or update on public.sale_confirmations
  for each row execute function private.audit_row();

revoke all on function
  private.audit_logs_immutable(),
  private.audit(uuid, text, text, uuid, jsonb, text),
  private.audit_row()
from public, anon, authenticated;
