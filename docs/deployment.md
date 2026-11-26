# Publicação

Estado em 25/11/2026: **no ar em https://lanchesrose.com.br** (projeto `roselanches` na Vercel, publicação automática a cada push na `main`; `www` redireciona para o endereço principal). Supabase da nuvem (`jvucakuibzrehyuxipel`) com as migrações 0100–1400 e a Edge Function `signature-upload`. Autenticação configurada no painel (passo 2) e conta da Rose criada como dona em 26/11/2026 (passo 5, fuso `America/Cuiaba`). Falta o teste num Android real (passo 6).

Verificar o site no ar (só leitura, não cria dados): `npm run verificar:producao`.

## 1. Supabase (já feito; guia para um projeto novo)

1. Projeto em https://supabase.com, de preferência na região São Paulo.
2. Migrações, no seu terminal (o login usa o seu token pessoal `sbp_…`, que fica só na sua máquina):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push --remote --dry-run   # confere o que vai entrar
   npx supabase db push --remote --yes
   npx supabase functions deploy signature-upload --project-ref <ref-do-projeto>
   ```
   Sem `--remote` o CLI v3 aplica no banco LOCAL. O `db push` não envia o `seed.sql`; dados de teste nunca vão para a nuvem.
   Alternativa pelo painel: `npm run db:sql-unico`, depois *SQL Editor › New query*, colar `supabase/tudo-em-um.sql` e executar **uma vez**, num projeto novo.

## 2. Autenticação no painel do Supabase

*Authentication › Sign In / Providers › Email*:
- **Confirm email: desligado** (já está). A prova de identidade do cliente e do vendedor é o convite de uso único.
- **Senha mínima: 8** caracteres (o app já exige 8; isto garante no servidor).

*Authentication › URL Configuration* (depois que o domínio estiver no ar):
- **Site URL** = `https://<seu-dominio>`
- **Redirect URLs** = `https://<seu-dominio>/**` (e, se quiser testar pela Vercel, `https://<projeto>.vercel.app/**`)

## 3. Hospedagem (Vercel)

1. Login no SEU terminal (abre o navegador; nada de token no chat):
   ```bash
   npx vercel login
   ```
2. Criar e ligar o projeto (na pasta do app): `npx vercel link`. Framework: Vite. Build: `npm run build`. Saída: `dist`.
3. Variáveis de ambiente (Production e Preview), só estas duas:
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = a chave **publicável** (`sb_publishable_…`)
4. Publicar: `npx vercel --prod`.
5. Opcional: ligar o repositório do GitHub ao projeto, para cada push na `main` publicar sozinho.

O `vercel.json` já faz:
- fallback do app (qualquer endereço abre o `index.html`);
- cabeçalhos de segurança: CSP estrita (só scripts do próprio site; conexões só com `*.supabase.co`), HSTS, sem iframe, sem câmera/microfone/localização;
- cache: arquivos de `/assets` para sempre (o nome muda a cada versão); `sw.js`, `index.html` e o manifesto sempre conferidos, para a atualização chegar.

O teste `tests/e2e/seguranca-csp.spec.ts` aplica a mesma CSP no app compilado e falha se o navegador bloquear algo.

### Chaves

- ✅ `sb_publishable_…`: a única que vai para o navegador.
- ❌ `sb_secret_…` / `service_role`: ignora o RLS. Nunca no frontend; o app se recusa a iniciar com ela.
- ❌ `sbp_…` (token pessoal do Supabase) e tokens da Vercel: controlam a conta inteira. Nunca compartilhe.

## 4. Domínio próprio

1. Na Vercel: *Project › Settings › Domains › Add* e digite o domínio (ex.: `lanchesdarose.com.br`). Adicione também o `www.` e deixe um redirecionar para o outro.
2. A Vercel mostra os registros a criar no lugar onde o domínio foi comprado (Registro.br, Hostinger, GoDaddy…):
   - domínio raiz: registro **A** para o IP que a Vercel indicar;
   - `www`: registro **CNAME** para o endereço que a Vercel indicar.
   Use exatamente os valores mostrados no painel da Vercel.
3. A propagação leva de minutos a algumas horas. O HTTPS é emitido sozinho.
4. Volte ao Supabase (passo 2) e ponha o domínio em Site URL e Redirect URLs.

## 5. Conta da Rose

1. Abra o app publicado e crie a conta da Rose em "Criar conta" (de preferência no celular dela).
2. No *SQL Editor* do Supabase, rode **uma vez**:
   ```sql
   select private.bootstrap_owner('email-da-rose@exemplo.com', 'Lanches da Rose', 'America/Cuiaba');
   ```
   O terceiro valor é o fuso de onde a Rose vende (`America/Sao_Paulo` para Brasília, `America/Cuiaba` para Mato Grosso…). Dá para trocar depois em Configurações.
3. A Rose sai e entra de novo; a área dela abre.
4. Primeiros cadastros: estabelecimentos e produtos (atalhos no início), Pix (Configurações) e os clientes. Vendedores: atalho **Equipe**.

## 6. Depois de publicar

- Instalar no Android da Rose: abrir o endereço no Chrome › menu › **Instalar app** (ou "Adicionar à tela inicial").
- Fazer o teste real offline: [offline-sync.md](offline-sync.md#teste-em-aparelho-real).
- Atualizações: cada publicação nova chega sozinha. O app aberto continua na versão antiga até ser reaberto, e nenhuma venda em andamento se perde.

## Riscos do plano gratuito

- Limite baixo de e-mails por hora sem SMTP próprio (configure em *Authentication › SMTP* se for usar recuperação de senha).
- Sem backup baixável no plano gratuito do Supabase: exportar de tempos em tempos (`npx supabase db dump --linked > backup.sql`, guardado fora do repositório) ou usar o plano Pro.
- Projetos gratuitos do Supabase **pausam após uma semana sem uso**. Com a Rose usando todo dia isso não acontece; se ela parar (férias), entre no painel para reativar.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Configuração incompleta" ao abrir | faltam as variáveis na Vercel (ou no `.env.local`) |
| "A chave configurada é ADMINISTRATIVA" | foi usada `sb_secret_`, `service_role` ou `sbp_`. Troque pela publicável e **revogue** a exposta |
| A Rose entra e vê "Conta criada… não está ligada" | o `bootstrap_owner` não foi rodado para o e-mail dela |
| Vendedor vê "não está ligada" | o convite não foi usado, ou a Rose desativou o acesso |
| Domínio não abre | DNS ainda propagando, ou registro diferente do que a Vercel pediu |
| `npm run test:integracao` diz que o Supabase não está rodando | rode `npm run db:start` com o Docker Desktop aberto |
