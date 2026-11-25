# Segurança

## Chaves

- Só a chave **publicável** (`sb_publishable_…`, ou a `anon` antiga `eyJ…`) vai para o navegador.
- `src/app/config.ts` recusa iniciar com `sb_secret_…`, um JWT `service_role` ou um token `sbp_…`.
- A chave de serviço local aparece apenas em Node, nos testes de integração e no `scripts/dev-seed.mjs`, que se recusa a rodar contra algo que não seja `127.0.0.1`/`localhost`.
- Nenhuma credencial no repositório: `.env*` está no `.gitignore`.

## Papéis

| Quem | Como é reconhecido | O que pode |
|---|---|---|
| Deslogado (`anon`) | sem JWT | nada: nenhum privilégio em tabela, view ou função |
| Dona (`OWNER`) | `business_members` ativo | lê tudo do próprio negócio; escreve cadastros direto (por coluna); escrita financeira só por RPC; lê auditoria; altera configurações |
| Operador (`OPERATOR`) | `business_members` ativo | preparado para o futuro; não lê auditoria nem altera configurações |
| Cliente | `customers.auth_user_id = auth.uid()` | nenhuma tabela; só RPCs `portal_*`, sempre filtradas por `private.current_customer_id()` |

Cada RPC descobre o negócio a partir de `auth.uid()` e nunca confia em `business_id` vindo do app. Uma pessoa pertence a no máximo um negócio ativo.

## RLS

- Ligado em todas as tabelas.
- Começa do zero: `revoke all` de `anon` e `authenticated`, inclusive nos privilégios padrão de objetos futuros.
- Escrita direta permitida só em cadastros não financeiros, **coluna por coluna**: o app não consegue gravar `business_id`, `created_by` nem `auth_user_id`.
- `customer_invites.token_hash` não é legível pelo app.
- `audit_logs`: sem INSERT/UPDATE/DELETE pelo app; a dona só lê. Gatilhos impedem alterar ou apagar até por funções privilegiadas.
- Helpers `private.is_staff`, `private.is_owner`, `private.current_customer_id` são `SECURITY DEFINER` com `search_path = ''`.
- Comparações com `NULL` em checagens de permissão usam `coalesce(..., false)` (um teste garante que outro negócio, uma conta sem vínculo e um cliente de outro negócio são recusados).

## Funções privilegiadas

- `SECURITY DEFINER` sempre com `set search_path = ''` e nomes totalmente qualificados.
- `revoke execute ... from public` e grant explícito só para quem precisa.
- Funções novas nascem sem EXECUTE para PUBLIC/anon (`alter default privileges revoke execute on functions from public`, na forma GLOBAL: a forma `in schema` não remove o padrão do Postgres; corrigido na migração 1000). `tests/integration/privilegios.test.ts` trava a matriz: toda função pública precisa estar listada como "logado" ou "só servidor".
- `private.bootstrap_owner` só é executável pelo papel `postgres` (SQL Editor do painel).

## Storage (`sale-signatures`)

- Privado, até 200 KB, só `image/png`.
- Nenhuma política de escrita para usuários: só a Edge Function `signature-upload`, depois de validar arquivo, venda e hash.
- A função confere o JWT no servidor de Auth (`getUser`), aceita só PNG de verdade (bytes iniciais + bloco IHDR, até 4000 px e 200 KB) e chama `signature_prepare`/`signature_finalize`, que só o `service_role` executa. O caminho do arquivo é calculado no banco: ninguém escolhe onde gravar.
- Um mesmo código de confirmação não serve para outra venda, e uma venda tem no máximo uma assinatura válida.
- Leitura: membro do negócio dono da pasta; cliente só no arquivo das próprias confirmações. Acesso por URL assinada de 120 s.

## Portal do cliente

- Vínculo entre cadastro e conta só por convite de uso único: token de 192 bits, só o SHA-256 no banco, 72 h de validade, um convite aberto por cliente. O telefone nunca é usado como prova de identidade.
- Nenhum link público com ID de cliente.

## Dados no aparelho

- Nada de senhas ou tokens privilegiados. A sessão do Supabase Auth fica no `localStorage` (padrão do supabase-js).
- Só dados mínimos para vender offline (observação do cliente encurtada). Tudo é apagado ao sair da conta, e sair é bloqueado enquanto houver registros não enviados. O celular não é backup.
- Sem internet, a sessão vencida guardada no aparelho só serve para abrir a área da Rose e gravar no celular; nada chega ao servidor sem renovar o login.

## LGPD

- Assinaturas são dados pessoais: retenção configurável (padrão 60 meses), sem extração biométrica, nunca em logs, nunca públicas.
- O portal mostra aviso de privacidade.
