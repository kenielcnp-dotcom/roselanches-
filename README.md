# Lanches da Rose

PWA para a Rose registrar vendas fiadas por estabelecimento, **mesmo sem internet**, e para cada cliente consultar a própria conta com segurança.

- **Área da Rose** (`/`): vendas por produtos ou por valor direto, clientes agrupados por estabelecimento, assinatura opcional na tela, recebimentos e relatórios.
- **Portal do cliente** (`/conta`): saldo, extrato, confirmação ou contestação de compras e Pix com confirmação manual.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form, Zod, Lucide, Dexie (IndexedDB) e Supabase (Postgres, Auth, RLS, Storage e Edge Functions). Hospedagem: Vercel.

## Rodar localmente

Requisitos: Node.js 22.22 ou superior, Docker Desktop e, para os testes e2e, o Microsoft Edge (ou o Chrome, com `E2E_BROWSER=chrome`).

```bash
npm install
npm run db:start        # Supabase local no Docker (portas 553xx) + migrações
npm run db:seed-dev     # contas e cadastros de TESTE, só no banco local
```

Crie `.env.local` a partir de `.env.example` com os valores de `npx supabase status` (`API_URL` e `PUBLISHABLE_KEY`):

```
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```bash
npm run dev             # http://localhost:5173
```

Contas criadas pelo `db:seed-dev`:

| Papel | E-mail | Senha |
|---|---|---|
| Rose (dona do negócio de teste) | `rose@teste.local` | `SenhaForte123` |
| Cliente (Maria Silva) | `cliente@teste.local` | `SenhaForte123` |

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run dev:rede` | servidor de desenvolvimento (o segundo expõe na rede local, para testar no celular) |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run typecheck` / `npm run lint` | tipos e lint |
| `npm test` | testes unitários (domínio e componentes) |
| `npm run test:integracao` | testes contra o Supabase local (RLS, RPCs, Storage) |
| `npm run test:e2e` | fluxos no navegador (Playwright + Edge, tela de 390×844) |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local |
| `npm run db:tipos` | regenera `src/lib/supabase/database.types.ts` |
| `npm run db:sql-unico` | junta as migrações em `supabase/tudo-em-um.sql` (para colar no painel) |
| `npm run icones` | regenera os ícones do PWA |

## Documentação

- [Arquitetura](docs/architecture.md)
- [Banco de dados](docs/database.md)
- [Regras de negócio](docs/business-rules.md)
- [Offline e sincronização](docs/offline-sync.md)
- [Segurança](docs/security.md)
- [Publicação](docs/deployment.md)
- [Identidade visual](docs/design.md)
