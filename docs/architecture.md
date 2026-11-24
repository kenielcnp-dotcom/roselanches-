# Arquitetura

## Visão geral

```
Celular da Rose (PWA)                          Celular do cliente (navegador)
 React + TanStack Query                         React (área /conta)
 Dexie/IndexedDB: cache + fila (outbox)         só online, nada financeiro no aparelho
 Service Worker: só o "casco" do app
        │ chave publicável + JWT                       │
        ▼                                              ▼
Supabase ─ Auth (e-mail + senha)
         ─ PostgREST: leituras da Rose (RLS por negócio)
         ─ RPCs SECURITY DEFINER (search_path=''): toda escrita financeira, idempotente e atômica
         ─ RPCs portal_*: toda leitura e escrita do cliente (escopo = auth.uid())
         ─ Storage: bucket privado sale-signatures (sem escrita de usuários)
         ─ Edge Function signature-upload: valida o PNG e grava a assinatura
Hospedagem: Vercel (build estático; vercel.json com SPA fallback e cabeçalhos)
```

## Decisões

| Decisão | Por quê |
|---|---|
| Um único SPA com duas áreas (`/` Rose, `/conta` cliente) | Um build, um domínio e uma configuração de Auth. A área é escolhida pela RPC `whoami()`, mas quem autoriza cada leitura e escrita é sempre o servidor |
| Cliente não lê tabelas, só RPCs `portal_*` | O cadastro do cliente tem observações privadas da Rose, e o RLS não filtra colunas por usuário. As RPCs devolvem exatamente o que o cliente pode ver |
| Escrita financeira só por RPC | Venda, itens e pagamento na mesma transação; idempotência pelo UUID gerado no celular; validação no servidor |
| Saldo sempre derivado (view `customer_balances`) | Nunca diverge do extrato. Não existe coluna de saldo |
| `payment_allocations` derivada em SQL, não gravada | Alocação FIFO calculada na hora (`private.customer_open_debits`); uma alocação gravada divergiria ao cancelar uma venda ou estornar um pagamento |
| Regras puras em `src/domain/` | Centralizadas e testáveis sem React nem Supabase (ajuste à estrutura sugerida, que previa `utils/`) |
| `business_id` em todas as tabelas, com FKs compostas | Nenhuma linha aponta para outro negócio, mesmo com um id forjado |
| Vercel | SPA fallback e cabeçalhos de segurança simples pelo `vercel.json` |
| Supabase local nas portas 553xx | Não colide com outro projeto local que usa as 543xx |

## Estrutura de pastas

```
src/
  app/          App, router, providers, config.ts (recusa chave administrativa)
  components/   Button, Field, States, BottomNav, SyncPill, Logo, Awning…
  domain/       money, phone, period, sale, canonical, consent   ← regras puras
  features/     auth, dashboard, establishments, customers, products, sales,
                signatures, payments, reports, client-portal, settings, sync
  hooks/        useConnection…
  lib/supabase/ client, database.types (gerado), errors
  lib/offline/  net (e, nas próximas fases, db, outbox, sync-engine)
  services/     chamadas ao Supabase por domínio (recebem o client por parâmetro)
                e convertem linhas em modelos do app (camelCase, centavos)
  styles/       index.css (tokens do Tailwind)
  types/        modelos de domínio compartilhados
supabase/       config.toml, migrations/, functions/, seed.sql
tests/          unit/, integration/ (Supabase local), e2e/ (Playwright), fixtures/
scripts/        dev-seed.mjs, juntar-migracoes.mjs, gerar-icones.py
```

## Fluxo de autenticação no app

1. `AuthProvider` lê a sessão do aparelho (`getSession`, funciona sem internet) e chama `whoami()`.
2. Sem internet, a área da Rose abre com a última identidade de equipe guardada no aparelho. O portal do cliente não abre sem internet.
3. Os guardas (`RequireStaff`, `RequireCustomer`) só escolhem a tela; o servidor reaplica a regra em cada tabela e RPC.

## Dados nas telas

- Leituras e gravações dos cadastros passam por `src/features/registry/queries.ts` (TanStack Query). Depois de gravar, as consultas afetadas são invalidadas (clientes, estabelecimentos e painel andam juntos).
- Formulários com React Hook Form + Zod (`src/domain/registry.ts`). O id de um cadastro novo é criado ao abrir a tela: dois toques em "Salvar" não criam dois registros, e um reenvio depois de a resposta se perder é tratado como sucesso.
- Fuso: `whoami` devolve o fuso do negócio; `src/domain/period.ts` passa a usá-lo em todas as datas, horários e períodos.

## Conexão

`useConnection` não confia em `navigator.onLine`: a conexão só conta como boa depois de uma resposta real do servidor (`/auth/v1/health`, timeout de 5 s). Rechecagem a cada 60 s online e 15 s offline, ao voltar o foco e no evento `online`.
