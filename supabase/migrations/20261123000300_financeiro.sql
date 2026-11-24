-- =============================================================================
-- 0300 · Financeiro: vendas, itens, pagamentos, saldo anterior, ajustes,
--        avisos de pagamento Pix e confirmações de compra
-- =============================================================================
-- Regras que estas tabelas garantem sozinhas (além das RPCs):
--   * O saldo NÃO é guardado: é derivado (view customer_balances).
--   * Venda, pagamento e confirmação usam o id gerado no celular (idempotência).
--   * Nada é apagado; o que muda depois de gravado é só o estado (cancelado,
--     estornado, invalidado), com autor, data e motivo.

-- -----------------------------------------------------------------------------
-- Vendas
-- -----------------------------------------------------------------------------
create table public.sales (
  id                  uuid primary key, -- gerado no celular antes do primeiro salvamento
  business_id         uuid not null references public.businesses (id) on delete restrict,
  customer_id         uuid not null,
  establishment_id    uuid not null,
  mode                text not null check (mode in ('ITEMS', 'AMOUNT')),
  period              text not null check (period in ('MORNING', 'AFTERNOON', 'NIGHT')),
  description         text check (description is null or (char_length(btrim(description)) between 1 and 150 and description !~ '[[:cntrl:]]')),
  total_cents         bigint not null check (total_cents between 1 and 10000000),
  payment_kind        text not null check (payment_kind in ('CREDIT', 'PAID_NOW')),
  status              text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  cancelled_at        timestamptz,
  cancelled_by        uuid,
  cancel_reason       text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 200),
  -- Mantido por gatilho a partir de sale_confirmations (ver abaixo).
  confirmation_status text not null default 'PENDING'
                      check (confirmation_status in ('PENDING', 'SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED', 'CANCELLED')),
  occurred_at         timestamptz not null, -- relógio do celular, na hora da venda
  received_at         timestamptz not null default now(), -- relógio do servidor
  request_hash        text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, business_id),
  unique (id, business_id, customer_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (establishment_id, business_id) references public.establishments (id, business_id),
  -- Valor direto exige descrição; venda por produtos tira o resumo dos itens.
  check ((mode = 'AMOUNT') = (description is not null)),
  check ((status = 'CANCELLED') = (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null)),
  check (occurred_at <= received_at + interval '10 minutes')
);

create index sales_business_time_idx on public.sales (business_id, occurred_at desc);
create index sales_customer_time_idx on public.sales (customer_id, occurred_at desc);
create index sales_establishment_time_idx on public.sales (establishment_id, occurred_at desc);

-- Depois de gravada, a venda só muda de estado (cancelamento / confirmação).
create or replace function private.sales_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.business_id, new.customer_id, new.establishment_id, new.mode, new.period,
      new.description, new.total_cents, new.payment_kind, new.occurred_at, new.received_at,
      new.request_hash, new.created_by, new.created_at)
     is distinct from
     (old.id, old.business_id, old.customer_id, old.establishment_id, old.mode, old.period,
      old.description, old.total_cents, old.payment_kind, old.occurred_at, old.received_at,
      old.request_hash, old.created_by, old.created_at) then
    raise exception using errcode = '42501', message = 'LDR_SALE_IMMUTABLE';
  end if;
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception using errcode = '42501', message = 'LDR_SALE_ALREADY_CANCELLED';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger sales_guard before update on public.sales
  for each row execute function private.sales_guard();
create trigger sales_no_delete before delete on public.sales
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Itens da venda (cópia do nome e do preço do produto naquele momento)
-- -----------------------------------------------------------------------------
create table public.sale_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null,
  sale_id          uuid not null,
  position         smallint not null check (position between 1 and 50),
  product_id       uuid not null,
  product_name     text not null check (char_length(btrim(product_name)) between 1 and 60 and product_name !~ '[[:cntrl:]]'),
  quantity         integer not null check (quantity between 1 and 999),
  unit_price_cents bigint not null check (unit_price_cents between 1 and 10000000),
  subtotal_cents   bigint not null,
  unique (sale_id, position),
  foreign key (sale_id, business_id) references public.sales (id, business_id),
  foreign key (product_id, business_id) references public.products (id, business_id),
  check (subtotal_cents = quantity * unit_price_cents)
);

create index sale_items_product_idx on public.sale_items (product_id);

create or replace function private.sale_items_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'LDR_SALE_ITEMS_IMMUTABLE';
end;
$$;

create trigger sale_items_no_update before update on public.sale_items
  for each row execute function private.sale_items_immutable();
create trigger sale_items_no_delete before delete on public.sale_items
  for each row execute function private.forbid_delete();

-- No fim da transação: venda por produtos tem itens que somam o total; venda por
-- valor direto não tem itens. Nenhuma venda fica parcialmente registrada.
create or replace function private.check_sale_items()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id    uuid;
  v_mode  text;
  v_total bigint;
  v_count integer;
  v_sum   bigint;
begin
  -- Ramos separados: cada tabela só tem a sua coluna (sales.id / sale_items.sale_id).
  if tg_table_name = 'sales' then
    v_id := new.id;
  else
    v_id := new.sale_id;
  end if;

  select s.mode, s.total_cents into v_mode, v_total from public.sales s where s.id = v_id;
  if not found then
    return null;
  end if;
  select count(*), coalesce(sum(i.subtotal_cents), 0) into v_count, v_sum
  from public.sale_items i where i.sale_id = v_id;

  if v_mode = 'ITEMS' and (v_count = 0 or v_sum <> v_total) then
    raise exception using errcode = '23514', message = 'LDR_SALE_ITEMS_TOTAL';
  elsif v_mode = 'AMOUNT' and v_count > 0 then
    raise exception using errcode = '23514', message = 'LDR_SALE_AMOUNT_WITH_ITEMS';
  end if;
  return null;
end;
$$;

create constraint trigger sales_check_items after insert on public.sales
  deferrable initially deferred for each row execute function private.check_sale_items();
create constraint trigger sale_items_check_total after insert on public.sale_items
  deferrable initially deferred for each row execute function private.check_sale_items();

-- -----------------------------------------------------------------------------
-- Avisos de pagamento enviados pelo cliente ("Já paguei"). NÃO reduzem saldo.
-- -----------------------------------------------------------------------------
create table public.payment_notifications (
  id              uuid primary key, -- gerado no portal (reenvio não duplica)
  business_id     uuid not null references public.businesses (id) on delete restrict,
  customer_id     uuid not null,
  amount_cents    bigint check (amount_cents is null or amount_cents between 1 and 100000000),
  note            text check (note is null or char_length(note) <= 200),
  status          text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REJECTED')),
  payment_id      uuid unique,
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 200),
  created_by      uuid not null, -- conta do cliente
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  check ((status = 'CONFIRMED') = (payment_id is not null)),
  check ((status = 'PENDING') = (resolved_at is null)),
  check (resolved_at is null or resolved_by is not null)
);

create index payment_notifications_pending_idx on public.payment_notifications (business_id, created_at) where status = 'PENDING';

create trigger payment_notifications_touch before update on public.payment_notifications
  for each row execute function private.touch_updated_at();
create trigger payment_notifications_no_delete before delete on public.payment_notifications
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Pagamentos (só a Rose registra). Venda paga na hora = venda + pagamento juntos.
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key, -- gerado no celular
  business_id     uuid not null references public.businesses (id) on delete restrict,
  customer_id     uuid not null,
  amount_cents    bigint not null check (amount_cents between 1 and 100000000),
  method          text not null check (method in ('CASH', 'PIX')),
  source          text not null check (source in ('MANUAL', 'SALE_PAID_NOW', 'PIX_NOTIFICATION')),
  sale_id         uuid,
  notification_id uuid unique,
  received_at     timestamptz not null, -- quando o dinheiro entrou
  note            text check (note is null or char_length(note) <= 200),
  status          text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'REVERSED')),
  reversed_at     timestamptz,
  reversed_by     uuid,
  reverse_reason  text check (reverse_reason is null or char_length(btrim(reverse_reason)) between 3 and 200),
  request_hash    text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, business_id),
  unique (id, business_id, customer_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  -- O pagamento na hora é do mesmo cliente da venda.
  foreign key (sale_id, business_id, customer_id) references public.sales (id, business_id, customer_id),
  foreign key (notification_id, business_id) references public.payment_notifications (id, business_id),
  check ((source = 'SALE_PAID_NOW') = (sale_id is not null)),
  check ((source = 'PIX_NOTIFICATION') = (notification_id is not null)),
  check ((status = 'REVERSED') = (reversed_at is not null and reversed_by is not null and reverse_reason is not null))
);

-- Uma venda paga na hora gera exatamente um pagamento.
create unique index payments_one_per_sale on public.payments (sale_id) where sale_id is not null;
create index payments_customer_time_idx on public.payments (customer_id, received_at desc);
create index payments_business_time_idx on public.payments (business_id, received_at desc);

alter table public.payment_notifications
  add foreign key (payment_id, business_id) references public.payments (id, business_id);

create or replace function private.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.business_id, new.customer_id, new.amount_cents, new.method, new.source, new.sale_id,
      new.notification_id, new.received_at, new.note, new.request_hash, new.created_by, new.created_at)
     is distinct from
     (old.id, old.business_id, old.customer_id, old.amount_cents, old.method, old.source, old.sale_id,
      old.notification_id, old.received_at, old.note, old.request_hash, old.created_by, old.created_at) then
    raise exception using errcode = '42501', message = 'LDR_PAYMENT_IMMUTABLE';
  end if;
  if old.status = 'REVERSED' and new.status <> 'REVERSED' then
    raise exception using errcode = '42501', message = 'LDR_PAYMENT_ALREADY_REVERSED';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger payments_guard before update on public.payments
  for each row execute function private.payments_guard();
create trigger payments_no_delete before delete on public.payments
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Saldo anterior (dívidas antigas do caderno) — aparece como "Saldo anterior"
-- -----------------------------------------------------------------------------
create table public.opening_balances (
  id             uuid primary key, -- gerado no app (reenvio não duplica)
  business_id    uuid not null references public.businesses (id) on delete restrict,
  customer_id    uuid not null,
  amount_cents   bigint not null check (amount_cents between 1 and 100000000),
  reference_date date not null,
  note           text not null check (char_length(btrim(note)) between 1 and 200),
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  cancelled_at   timestamptz,
  cancelled_by   uuid,
  cancel_reason  text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 200),
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  check ((status = 'CANCELLED') = (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null))
);

create index opening_balances_customer_idx on public.opening_balances (customer_id);

-- -----------------------------------------------------------------------------
-- Ajustes financeiros (correções com justificativa)
-- -----------------------------------------------------------------------------
create table public.financial_adjustments (
  id                 uuid primary key,
  business_id        uuid not null references public.businesses (id) on delete restrict,
  customer_id        uuid not null,
  direction          text not null check (direction in ('DEBIT', 'CREDIT')),
  amount_cents       bigint not null check (amount_cents between 1 and 100000000),
  reason             text not null check (char_length(btrim(reason)) between 3 and 200),
  related_sale_id    uuid,
  related_payment_id uuid,
  occurred_at        timestamptz not null default now(),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  cancel_reason      text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 200),
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (related_sale_id, business_id, customer_id) references public.sales (id, business_id, customer_id),
  foreign key (related_payment_id, business_id, customer_id) references public.payments (id, business_id, customer_id),
  check ((status = 'CANCELLED') = (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null))
);

create index financial_adjustments_customer_idx on public.financial_adjustments (customer_id);

-- Saldo anterior e ajuste: só o estado muda depois de gravado.
create or replace function private.cancellable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'];
  v_new jsonb := to_jsonb(new) - array['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at'];
begin
  if v_old is distinct from v_new then
    raise exception using errcode = '42501', message = 'LDR_RECORD_IMMUTABLE';
  end if;
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception using errcode = '42501', message = 'LDR_RECORD_ALREADY_CANCELLED';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger opening_balances_guard before update on public.opening_balances
  for each row execute function private.cancellable_guard();
create trigger opening_balances_no_delete before delete on public.opening_balances
  for each row execute function private.forbid_delete();
create trigger financial_adjustments_guard before update on public.financial_adjustments
  for each row execute function private.cancellable_guard();
create trigger financial_adjustments_no_delete before delete on public.financial_adjustments
  for each row execute function private.forbid_delete();

-- -----------------------------------------------------------------------------
-- Confirmações de compra: assinatura na tela ou confirmação/contestação no portal
-- -----------------------------------------------------------------------------
create table public.sale_confirmations (
  id                    uuid primary key, -- gerado no celular / portal
  business_id           uuid not null,
  sale_id               uuid not null,
  customer_id           uuid not null,
  confirmation_type     text not null check (confirmation_type in ('DRAWN_SIGNATURE', 'ONLINE_CONFIRMATION')),
  confirmation_status   text not null check (confirmation_status in ('SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED', 'CANCELLED')),
  -- SHA-256 do resumo canônico (private.sale_document_text) que o cliente viu.
  signed_document_hash  text not null check (signed_document_hash ~ '^[0-9a-f]{64}$'),
  consent_text_version  text not null references public.consent_texts (version),
  signature_storage_path text unique check (signature_storage_path is null or char_length(signature_storage_path) <= 200),
  signature_file_sha256 text check (signature_file_sha256 is null or signature_file_sha256 ~ '^[0-9a-f]{64}$'),
  signature_size_bytes  integer check (signature_size_bytes is null or signature_size_bytes between 1 and 204800),
  confirmed_by_user_id  uuid,
  dispute_reason        text check (dispute_reason is null or char_length(btrim(dispute_reason)) between 3 and 300),
  captured_at           timestamptz, -- relógio do celular na captura
  received_at           timestamptz not null default now(), -- relógio do servidor
  invalidated_at        timestamptz,
  invalidated_by        uuid,
  invalidation_reason   text check (invalidation_reason is null or char_length(btrim(invalidation_reason)) between 3 and 200),
  resolved_at           timestamptz, -- contestação analisada pela Rose (a dívida segue)
  resolved_by           uuid,
  resolution_note       text check (resolution_note is null or char_length(resolution_note) <= 300),
  created_at            timestamptz not null default now(),
  foreign key (sale_id, business_id, customer_id) references public.sales (id, business_id, customer_id),
  check (
    confirmation_type <> 'DRAWN_SIGNATURE' or (
      confirmation_status in ('SIGNED', 'CANCELLED')
      and signature_storage_path is not null and signature_file_sha256 is not null
      and signature_size_bytes is not null and captured_at is not null
      and confirmed_by_user_id is null and dispute_reason is null
    )
  ),
  check (
    confirmation_type <> 'ONLINE_CONFIRMATION' or (
      confirmation_status in ('CONFIRMED_ONLINE', 'DISPUTED', 'CANCELLED')
      and confirmed_by_user_id is not null
      and signature_storage_path is null and signature_file_sha256 is null and signature_size_bytes is null
    )
  ),
  check (confirmation_status <> 'DISPUTED' or dispute_reason is not null),
  check ((confirmation_status = 'CANCELLED') = (invalidated_at is not null and invalidated_by is not null and invalidation_reason is not null)),
  check (resolved_at is null or (confirmation_status = 'DISPUTED' and resolved_by is not null))
);

-- Uma assinatura válida por venda; uma manifestação online em aberto por venda.
create unique index sale_confirmations_one_signature on public.sale_confirmations (sale_id)
  where confirmation_type = 'DRAWN_SIGNATURE' and confirmation_status = 'SIGNED';
create unique index sale_confirmations_one_online on public.sale_confirmations (sale_id)
  where confirmation_type = 'ONLINE_CONFIRMATION' and confirmation_status in ('CONFIRMED_ONLINE', 'DISPUTED') and resolved_at is null;
create index sale_confirmations_sale_idx on public.sale_confirmations (sale_id);

-- Depois de gravada, a confirmação só pode ser invalidada ou ter a contestação resolvida.
create or replace function private.sale_confirmations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable text[] := array['confirmation_status', 'invalidated_at', 'invalidated_by', 'invalidation_reason',
                            'resolved_at', 'resolved_by', 'resolution_note'];
begin
  if (to_jsonb(old) - v_mutable) is distinct from (to_jsonb(new) - v_mutable) then
    raise exception using errcode = '42501', message = 'LDR_CONFIRMATION_IMMUTABLE';
  end if;
  if old.confirmation_status = 'CANCELLED' and new.confirmation_status <> 'CANCELLED' then
    raise exception using errcode = '42501', message = 'LDR_CONFIRMATION_ALREADY_CANCELLED';
  end if;
  if new.confirmation_status <> 'CANCELLED' and new.confirmation_status <> old.confirmation_status then
    raise exception using errcode = '42501', message = 'LDR_CONFIRMATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger sale_confirmations_guard before update on public.sale_confirmations
  for each row execute function private.sale_confirmations_guard();
create trigger sale_confirmations_no_delete before delete on public.sale_confirmations
  for each row execute function private.forbid_delete();

-- sales.confirmation_status, em ordem de prioridade:
--   CANCELLED (venda cancelada) > DISPUTED (contestação em aberto)
--   > manifestação válida mais recente (SIGNED / CONFIRMED_ONLINE) > PENDING
create or replace function private.refresh_sale_confirmation_status(p_sale uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_status text;
  v_status      text;
begin
  select s.status into v_sale_status from public.sales s where s.id = p_sale;
  if not found then
    return;
  end if;

  if v_sale_status = 'CANCELLED' then
    v_status := 'CANCELLED';
  elsif exists (
    select 1 from public.sale_confirmations c
    where c.sale_id = p_sale and c.confirmation_status = 'DISPUTED' and c.resolved_at is null
  ) then
    v_status := 'DISPUTED';
  else
    select c.confirmation_status into v_status
    from public.sale_confirmations c
    where c.sale_id = p_sale and c.confirmation_status in ('SIGNED', 'CONFIRMED_ONLINE')
    order by c.received_at desc, c.id desc
    limit 1;
    v_status := coalesce(v_status, 'PENDING');
  end if;

  update public.sales s set confirmation_status = v_status
  where s.id = p_sale and s.confirmation_status is distinct from v_status;
end;
$$;

create or replace function private.on_confirmation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_sale_confirmation_status(new.sale_id);
  return null;
end;
$$;

create trigger sale_confirmations_refresh after insert or update on public.sale_confirmations
  for each row execute function private.on_confirmation_change();

-- Venda cancelada invalida todas as confirmações dela.
create or replace function private.on_sale_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sale_confirmations c set
    confirmation_status = 'CANCELLED',
    invalidated_at = now(),
    invalidated_by = new.cancelled_by,
    invalidation_reason = 'Venda cancelada: ' || left(new.cancel_reason, 180)
  where c.sale_id = new.id and c.confirmation_status <> 'CANCELLED';
  perform private.refresh_sale_confirmation_status(new.id);
  return null;
end;
$$;

create trigger sales_cancelled after update of status on public.sales
  for each row when (old.status = 'ACTIVE' and new.status = 'CANCELLED')
  execute function private.on_sale_cancelled();

-- -----------------------------------------------------------------------------
-- Resumo canônico da compra (versão 1) e seu hash
-- -----------------------------------------------------------------------------
-- Formato IDÊNTICO a src/domain/canonical.ts. Linhas separadas por \n, UTF-8, NFC:
--   LDR-SALE-CONFIRMATION|1
--   sale:<uuid>  customer:<uuid>  establishment:<uuid>
--   occurred_at_ms:<epoch ms>  mode:<ITEMS|AMOUNT>
--   item:<product_id>|<qtd>|<unit>|<subtotal>|<nome>   (ITEMS, pela posição)
--   description:<texto>                                (AMOUNT)
--   total:<centavos>  terms:<versão do texto de confirmação>
create or replace function private.sale_document_text(p_sale uuid, p_terms text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sale  public.sales%rowtype;
  v_lines text[];
begin
  select * into v_sale from public.sales s where s.id = p_sale;
  if not found then
    return null;
  end if;

  v_lines := array[
    'LDR-SALE-CONFIRMATION|1',
    'sale:' || v_sale.id::text,
    'customer:' || v_sale.customer_id::text,
    'establishment:' || v_sale.establishment_id::text,
    'occurred_at_ms:' || floor(extract(epoch from v_sale.occurred_at) * 1000)::bigint::text,
    'mode:' || v_sale.mode
  ];

  if v_sale.mode = 'ITEMS' then
    v_lines := v_lines || array(
      select 'item:' || i.product_id::text || '|' || i.quantity::text || '|' || i.unit_price_cents::text
             || '|' || i.subtotal_cents::text || '|' || normalize(i.product_name, nfc)
      from public.sale_items i
      where i.sale_id = p_sale
      order by i.position
    );
  else
    v_lines := v_lines || ('description:' || normalize(v_sale.description, nfc));
  end if;

  v_lines := v_lines || ('total:' || v_sale.total_cents::text) || ('terms:' || p_terms);
  return array_to_string(v_lines, E'\n');
end;
$$;

create or replace function private.sale_document_hash(p_sale uuid, p_terms text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(private.sale_document_text(p_sale, p_terms), 'UTF8')), 'hex')
$$;

-- Para a Rose (ou o próprio cliente) conferir o hash de uma venda.
create or replace function public.sale_document_hash(p_sale uuid, p_terms text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_customer uuid;
  v_allowed  boolean;
begin
  select s.business_id, s.customer_id into v_business, v_customer from public.sales s where s.id = p_sale;
  -- coalesce: para quem não é cliente, current_customer_id() é NULL, e uma
  -- comparação com NULL não pode virar "permitido" por acidente.
  v_allowed := found and (
    private.is_staff(v_business)
    or coalesce(v_customer = private.current_customer_id(), false)
  );
  if not v_allowed then
    raise exception using errcode = '42501', message = 'LDR_NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.consent_texts t where t.version = p_terms) then
    raise exception using errcode = 'P0001', message = 'LDR_UNKNOWN_TERMS';
  end if;
  return private.sale_document_hash(p_sale, p_terms);
end;
$$;

-- -----------------------------------------------------------------------------
-- Livro-razão do cliente e saldo derivado
-- -----------------------------------------------------------------------------
-- settled_at_sale marca a venda paga na hora e o pagamento dela: os dois se
-- anulam e ficam fora da alocação FIFO das dívidas em aberto.
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
       (o.reference_date::timestamp at time zone 'America/Sao_Paulo'),
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

-- Saldo = débitos (vendas ativas + saldo anterior + ajustes de débito)
--       − créditos (pagamentos confirmados + ajustes de crédito).
-- Negativo = cliente tem crédito.
create or replace view public.customer_balances
with (security_invoker = true) as
select c.business_id,
       c.id as customer_id,
       coalesce(sum(l.debit_cents), 0)::bigint as debit_cents,
       coalesce(sum(l.credit_cents), 0)::bigint as credit_cents,
       (coalesce(sum(l.debit_cents), 0) - coalesce(sum(l.credit_cents), 0))::bigint as balance_cents,
       max(l.occurred_at) filter (where l.kind = 'SALE') as last_sale_at,
       max(l.occurred_at) filter (where l.kind = 'PAYMENT') as last_payment_at
from public.customers c
left join public.customer_ledger l on l.customer_id = c.id
group by c.business_id, c.id;

-- Alocação FIFO derivada: os créditos quitam as dívidas mais antigas primeiro.
-- Não é gravada (payment_allocations), então nunca diverge ao cancelar uma venda
-- ou estornar um pagamento. Base para "estado de pagamento" e "dívida originada
-- no estabelecimento". Sem checagem de permissão: só outras funções chamam.
create or replace function private.customer_open_debits(p_customer uuid)
returns table (
  kind             text,
  entry_id         uuid,
  occurred_at      timestamptz,
  establishment_id uuid,
  debit_cents      bigint,
  open_cents       bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with debits as (
    select l.kind, l.entry_id, l.occurred_at, l.establishment_id, l.debit_cents,
           sum(l.debit_cents) over (order by l.occurred_at, l.entry_id rows unbounded preceding) as cumulative
    from public.customer_ledger l
    where l.customer_id = p_customer and l.debit_cents > 0 and not l.settled_at_sale
  ),
  credits as (
    select coalesce(sum(l.credit_cents), 0) as total
    from public.customer_ledger l
    where l.customer_id = p_customer and not l.settled_at_sale
  )
  select d.kind, d.entry_id, d.occurred_at, d.establishment_id, d.debit_cents,
         greatest(0, least(d.debit_cents, d.cumulative - c.total))::bigint as open_cents
  from debits d
  cross join credits c
  order by d.occurred_at, d.entry_id
$$;

revoke all on function
  private.sales_guard(),
  private.sale_items_immutable(),
  private.check_sale_items(),
  private.payments_guard(),
  private.cancellable_guard(),
  private.sale_confirmations_guard(),
  private.refresh_sale_confirmation_status(uuid),
  private.on_confirmation_change(),
  private.on_sale_cancelled(),
  private.sale_document_text(uuid, text),
  private.sale_document_hash(uuid, text),
  private.customer_open_debits(uuid)
from public, anon, authenticated;
