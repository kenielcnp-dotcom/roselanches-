# Banco de dados

Migrações versionadas em `supabase/migrations/`. Toda mudança de banco é um arquivo novo; nunca altere o banco pelo painel sem migração. Depois de mudar o schema, rode `npm run db:tipos` e `npm run typecheck`.

## Convenções

- Dinheiro é sempre `bigint` em **centavos**.
- "Negócio" (`businesses`) é o dono dos dados (a Rose). "Estabelecimento" é um lugar onde ela vende.
- Toda tabela de negócio tem `business_id`, e as FKs são **compostas** `(x_id, business_id)`.
- `created_at`/`updated_at` em todas as tabelas; gatilho de auditoria nas relevantes.
- Nenhum DELETE físico em registro financeiro ou de cadastro com histórico (gatilho `forbid_delete`). Corrige-se por cancelamento, estorno ou ajuste, com autor, data e motivo.
- Funções privilegiadas ficam no schema `private` (não exposto pela API) ou são RPCs `SECURITY DEFINER` com `search_path = ''` e checagem explícita de permissão.

## Migrações

| Arquivo | Conteúdo |
|---|---|
| `0100_base` | schema `private`, `businesses`, `profiles` (gatilho no cadastro), `business_members`, `business_settings`, `consent_texts` (v1), helpers `my_business_id`/`is_staff`/`is_owner`, `bootstrap_owner` |
| `0200_cadastros` | `establishments`, `customers`, `customer_establishments`, `products`, `customer_invites`, `current_customer_id`, `whoami` |
| `0300_financeiro` | `sales`, `sale_items`, `payment_notifications`, `payments`, `opening_balances`, `financial_adjustments`, `sale_confirmations`, gatilhos de imutabilidade, soma dos itens, `confirmation_status`, resumo canônico e hash, views `customer_ledger`/`customer_balances`, FIFO `customer_open_debits` |
| `0400_auditoria` | `audit_logs` (imutável), `private.audit`, gatilho genérico `audit_row` |
| `0500_rls` | RLS em todas as tabelas, privilégios por coluna, grants |
| `0600_storage` | bucket privado `sale-signatures` e políticas de leitura |

## Tabelas

| Tabela | Campos principais | Regras |
|---|---|---|
| `businesses` | id, name | o tenant |
| `profiles` | id = `auth.users.id`, display_name | criado por gatilho no cadastro |
| `business_members` | business_id, user_id, role `OWNER`/`OPERATOR`, is_active | uma pessoa em no máximo um negócio ativo |
| `business_settings` | require_signature (false), allow_online_confirmation (true), signature_retention_months (60), default_sale_period, sale_max_cents, item_max_qty, pix_* | 1 linha por negócio, criada por gatilho; só a dona altera |
| `consent_texts` | version, body | imutável; v1 = texto do Adendo §6.4 |
| `establishments` | name, nickname, address, notes, is_active | nome único por negócio (sem diferenciar maiúsculas); desativa, nunca apaga |
| `customers` | full_name, phone_e164, notes, is_active, auth_user_id, linked_at | `auth_user_id` só é preenchido pela RPC de convite |
| `customer_establishments` | customer_id, establishment_id, created_by | UNIQUE (negócio, cliente, estabelecimento); FKs compostas |
| `products` | name, price_cents, category, is_active | nome único por negócio |
| `customer_invites` | customer_id, token_hash, expires_at, used_at/by, cancelled_at | só o SHA-256 do token; um convite aberto por cliente |
| `sales` | id (do celular), customer_id, establishment_id, mode, period, description, total_cents, payment_kind, status, confirmation_status, occurred_at, received_at, request_hash | só muda de estado depois de gravada |
| `sale_items` | sale_id, position, product_id, product_name, quantity, unit_price_cents, subtotal_cents | imutável; preço e nome históricos |
| `payments` | id (do celular), customer_id, amount_cents, method, source, sale_id, notification_id, status | só a Rose cria; uma venda paga na hora gera exatamente um pagamento |
| `opening_balances` | customer_id, amount_cents, reference_date, note, status | "Saldo anterior" no extrato |
| `financial_adjustments` | customer_id, direction, amount_cents, reason, related_sale_id/payment_id, status | correções com justificativa |
| `payment_notifications` | customer_id, amount_cents, note, status, payment_id | criado pelo cliente; não reduz saldo |
| `sale_confirmations` | sale_id, confirmation_type, confirmation_status, signed_document_hash, consent_text_version, signature_storage_path, signature_file_sha256, confirmed_by_user_id, dispute_reason | 1 assinatura válida e 1 manifestação online em aberto por venda |
| `audit_logs` | actor, action, entity, entity_id, before/after, reason | só gatilhos e RPCs escrevem; só a dona lê |

## Gatilhos importantes

- **Soma dos itens** (`check_sale_items`, adiado para o fim da transação): venda `ITEMS` precisa de itens que somem o total; venda `AMOUNT` não pode ter itens.
- **`sales.confirmation_status`**, por prioridade: `CANCELLED` (venda cancelada) > `DISPUTED` (contestação em aberto) > manifestação válida mais recente (`SIGNED`/`CONFIRMED_ONLINE`) > `PENDING`.
- **Cancelar uma venda** invalida todas as confirmações dela.
- **Auditoria**: em UPDATE guarda só as colunas que mudaram; mudanças de estado viram `STATUS:<novo>`. Hash de convite e binários nunca entram.

## Saldo

```
Saldo = vendas ativas + saldos anteriores + ajustes de débito
      − pagamentos confirmados − ajustes de crédito
```

Exposto pela view `customer_balances` (com `security_invoker`, então o RLS de quem consulta vale). A venda paga na hora e o pagamento dela se anulam (`settled_at_sale`) e ficam fora da alocação FIFO.

## Resumo canônico da compra (v1)

Texto linha a linha, UTF-8, NFC, sem caracteres de controle. Hash = SHA-256 em hexadecimal. Idêntico em `src/domain/canonical.ts` e em `private.sale_document_text()`; um vetor de teste compartilhado (`tests/fixtures/canonical.ts`) garante que os dois produzem o mesmo hash.

```
LDR-SALE-CONFIRMATION|1
sale:<uuid>
customer:<uuid>
establishment:<uuid>
occurred_at_ms:<epoch ms>
mode:ITEMS
item:<product_id>|<qtd>|<unit>|<subtotal>|<nome>
description:<texto>
total:<centavos>
terms:v1
```

A linha `item:` aparece só no modo `ITEMS` (uma por item, pela posição) e `description:` só no modo `AMOUNT`.
