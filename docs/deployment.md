# Publicação

> Nada foi publicado ainda. Este é o passo a passo para quando o app estiver pronto para uso real.

## 1. Projeto Supabase na nuvem

1. Crie um projeto em https://supabase.com, de preferência na região São Paulo. O plano gratuito permite 2 projetos ativos.
2. Aplique as migrações por **um** dos caminhos:
   - **CLI, no seu terminal:**
     ```bash
     npx supabase login
     npx supabase link --project-ref <ref-do-projeto>
     npx supabase db push
     ```
     O login usa o seu token pessoal (`sbp_…`). Ele fica só na sua máquina; não compartilhe.
   - **Painel:** rode `npm run db:sql-unico`, abra *SQL Editor › New query*, cole `supabase/tudo-em-um.sql` e execute **uma vez**, num projeto novo.

   O `db push` não envia o `seed.sql`; dados de teste nunca vão para a nuvem.
3. *Authentication › Providers › Email*:
   - **Confirm email: desligado.** A prova de identidade do cliente é o convite de uso único, não o e-mail.
   - Senha mínima: **8** caracteres.
4. *Authentication › URL Configuration*: **Site URL** = endereço publicado (ex.: `https://lanches-da-rose.vercel.app`) e **Redirect URLs** = `https://lanches-da-rose.vercel.app/**`.

## 2. Conta da Rose

1. Abra o app publicado e crie a conta da Rose pela tela "Criar conta".
2. No *SQL Editor* do painel, rode **uma vez**:
   ```sql
   select private.bootstrap_owner('email-da-rose@exemplo.com', 'Lanches da Rose');
   ```
3. A Rose sai e entra de novo; a área dela abre.

## 3. Chave do app

Em *Project Settings › API Keys*, copie a chave **publicável**:

- ✅ `sb_publishable_…` (ou, no formato antigo, a `anon` que começa com `eyJ…`): a única que vai para o navegador.
- ❌ `sb_secret_…` / `service_role`: ignora o RLS. Nunca no frontend. O app se recusa a iniciar com ela.
- ❌ `sbp_…` (token pessoal): controla a conta inteira. Nunca compartilhe.

## 4. Hospedagem (Vercel)

- Importe o repositório. Build: `npm run build`. Saída: `dist/`.
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- O `vercel.json` já faz o SPA fallback e adiciona cabeçalhos de segurança.

## 5. Depois de publicar

- Instale o app no Android da Rose ("Adicionar à tela inicial").
- Faça o teste real offline descrito em [offline-sync.md](offline-sync.md#teste-em-aparelho-real).

## Riscos do plano gratuito

- Limite baixo de e-mails por hora sem SMTP próprio (configure em *Authentication › SMTP* se for usar recuperação de senha).
- Sem backup baixável no plano gratuito: faça exportação periódica (`npx supabase db dump`) ou use o plano Pro.
- Projetos gratuitos pausam após uma semana sem uso.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Configuração incompleta" ao abrir | faltam as variáveis no `.env.local` ou na hospedagem |
| "A chave configurada é ADMINISTRATIVA" | foi usada `sb_secret_`, `service_role` ou `sbp_`. Troque pela publicável e **revogue** a exposta |
| A Rose entra e vê "sem acesso" | o `bootstrap_owner` não foi rodado para o e-mail dela |
| `npm run test:integracao` diz que o Supabase não está rodando | rode `npm run db:start` com o Docker Desktop aberto |
