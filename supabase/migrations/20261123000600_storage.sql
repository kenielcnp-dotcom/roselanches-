-- =============================================================================
-- 0600 · Storage privado das assinaturas
-- =============================================================================
-- Bucket privado, até 200 KB, só PNG. Caminho determinístico:
--   <business_id>/<sale_id>/<confirmation_id>.png
-- NÃO existe política de INSERT/UPDATE/DELETE para usuários: só a Edge Function
-- signature-upload (service_role) grava, depois de validar o arquivo, a venda e
-- o hash. Assim ninguém escolhe caminho, sobrescreve ou troca uma assinatura.
-- A leitura acontece por URL assinada de curta duração.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-signatures', 'sale-signatures', false, 204800, array['image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O cliente só enxerga o arquivo das confirmações da própria conta.
create or replace function private.signature_visible_to_customer(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sale_confirmations c
    where c.signature_storage_path = p_path
      and c.customer_id = private.current_customer_id()
  )
$$;

revoke all on function private.signature_visible_to_customer(text) from public, anon;
grant execute on function private.signature_visible_to_customer(text) to authenticated;

create policy sale_signatures_staff_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sale-signatures'
    and private.is_staff(private.try_uuid(split_part(name, '/', 1)))
  );

create policy sale_signatures_customer_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sale-signatures'
    and private.signature_visible_to_customer(name)
  );
