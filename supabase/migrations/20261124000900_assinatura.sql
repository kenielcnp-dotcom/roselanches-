-- =============================================================================
-- 0900 · Assinatura desenhada na tela: preparo e finalização (só service_role)
-- =============================================================================
-- Sequência da Edge Function signature-upload (Storage e Postgres não têm
-- transação comum, então cada passo é idempotente):
--   1. signature_prepare  — confere quem envia, a venda, o hash do resumo
--                           canônico e devolve o caminho DETERMINÍSTICO do arquivo
--   2. upload no Storage  — upsert:false; se já existe, compara o sha256
--   3. signature_finalize — grava a confirmação (repetir não duplica)
-- O app nunca chama estas funções: elas recebem o usuário já validado pela
-- função (getUser) e só o papel service_role pode executá-las.

-- Quem capturou a assinatura (a Rose). O cliente que assinou é o da venda.
alter table public.sale_confirmations add column captured_by uuid;

create or replace function private.signature_check(
  p_user            uuid,
  p_confirmation_id uuid,
  p_sale_id         uuid,
  p_document_hash   text,
  p_terms           text,
  p_file_sha256     text,
  p_size            integer,
  p_captured_at     timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sale     public.sales%rowtype;
  v_existing public.sale_confirmations%rowtype;
  v_path     text;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id;
  if not found or not exists (
    select 1 from public.business_members m
    where m.user_id = p_user and m.business_id = v_sale.business_id and m.is_active
  ) then
    perform private.raise_ldr('LDR_NOT_ALLOWED', '42501');
  end if;

  v_path := v_sale.business_id::text || '/' || v_sale.id::text || '/' || p_confirmation_id::text || '.png';

  select * into v_existing from public.sale_confirmations c where c.id = p_confirmation_id;
  if found then
    if v_existing.sale_id = p_sale_id and v_existing.signature_file_sha256 = p_file_sha256
       and v_existing.signed_document_hash = p_document_hash then
      return jsonb_build_object('status', 'ALREADY_FINALIZED', 'path', v_existing.signature_storage_path);
    end if;
    perform private.raise_ldr('LDR_CONFIRMATION_CONFLICT');
  end if;

  -- Venda cancelada antes de a assinatura chegar: não há o que confirmar.
  if v_sale.status <> 'ACTIVE' then
    return jsonb_build_object('status', 'SALE_CANCELLED', 'path', v_path);
  end if;

  if p_document_hash is null or p_document_hash !~ '^[0-9a-f]{64}$'
     or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$'
     or p_size is null or p_size not between 1 and 204800
     or p_captured_at is null or p_captured_at > now() + interval '10 minutes' then
    perform private.raise_ldr('LDR_INVALID_SIGNATURE');
  end if;
  if not exists (select 1 from public.consent_texts t where t.version = p_terms) then
    perform private.raise_ldr('LDR_UNKNOWN_TERMS');
  end if;
  -- A assinatura vale para o conteúdo EXATO que o cliente viu.
  if p_document_hash <> private.sale_document_hash(p_sale_id, p_terms) then
    perform private.raise_ldr('LDR_HASH_MISMATCH');
  end if;
  if exists (
    select 1 from public.sale_confirmations c
    where c.sale_id = p_sale_id and c.confirmation_type = 'DRAWN_SIGNATURE' and c.confirmation_status = 'SIGNED'
  ) then
    perform private.raise_ldr('LDR_ALREADY_SIGNED');
  end if;

  return jsonb_build_object('status', 'READY', 'path', v_path);
end;
$$;

create or replace function public.signature_prepare(
  p_user            uuid,
  p_confirmation_id uuid,
  p_sale_id         uuid,
  p_document_hash   text,
  p_terms           text,
  p_file_sha256     text,
  p_size            integer,
  p_captured_at     timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.signature_check(p_user, p_confirmation_id, p_sale_id, p_document_hash, p_terms,
                                 p_file_sha256, p_size, p_captured_at)
$$;

create or replace function public.signature_finalize(
  p_user            uuid,
  p_confirmation_id uuid,
  p_sale_id         uuid,
  p_document_hash   text,
  p_terms           text,
  p_file_sha256     text,
  p_size            integer,
  p_captured_at     timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_sale  public.sales%rowtype;
begin
  -- Repete todas as checagens (algo pode ter mudado entre o preparo e aqui).
  v_check := private.signature_check(p_user, p_confirmation_id, p_sale_id, p_document_hash, p_terms,
                                     p_file_sha256, p_size, p_captured_at);
  if v_check ->> 'status' = 'ALREADY_FINALIZED' then
    return jsonb_build_object('status', 'DUPLICATE', 'path', v_check ->> 'path');
  elsif v_check ->> 'status' = 'SALE_CANCELLED' then
    return jsonb_build_object('status', 'SALE_CANCELLED');
  end if;

  select * into v_sale from public.sales s where s.id = p_sale_id;
  begin
    insert into public.sale_confirmations (id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
                                           signed_document_hash, consent_text_version, signature_storage_path,
                                           signature_file_sha256, signature_size_bytes, captured_at, captured_by)
    values (p_confirmation_id, v_sale.business_id, v_sale.id, v_sale.customer_id, 'DRAWN_SIGNATURE', 'SIGNED',
            p_document_hash, p_terms, v_check ->> 'path', p_file_sha256, p_size, p_captured_at, p_user);
  exception when unique_violation then
    -- Corrida: outra assinatura válida chegou antes para a mesma venda.
    perform private.raise_ldr('LDR_ALREADY_SIGNED');
  end;
  return jsonb_build_object('status', 'FINALIZED', 'path', v_check ->> 'path');
end;
$$;

revoke all on function private.signature_check(uuid, uuid, uuid, text, text, text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.signature_prepare(uuid, uuid, uuid, text, text, text, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.signature_finalize(uuid, uuid, uuid, text, text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function private.signature_check(uuid, uuid, uuid, text, text, text, integer, timestamptz) to service_role;
grant execute on function public.signature_prepare(uuid, uuid, uuid, text, text, text, integer, timestamptz) to service_role;
grant execute on function public.signature_finalize(uuid, uuid, uuid, text, text, text, integer, timestamptz) to service_role;

