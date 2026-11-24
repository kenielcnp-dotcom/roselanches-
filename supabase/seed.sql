-- Dados de desenvolvimento NÃO ficam aqui.
--
-- As contas de teste precisam ser criadas pela API de administração do Auth, e
-- isso é feito por scripts/dev-seed.mjs (npm run db:seed-dev), que só aceita
-- rodar contra o Supabase local. Este arquivo existe porque o config.toml
-- aponta para ele; o "supabase db push" nunca o envia para a nuvem.
select 1;
