-- =============================================================================
-- 1000 · Correção: funções novas nasciam executáveis por PUBLIC (e, portanto,
--        por anon)
-- =============================================================================
-- A 0500 usou "alter default privileges IN SCHEMA public revoke execute ... from
-- public". O Postgres ignora essa forma para o padrão embutido de PUBLIC: só a
-- versão GLOBAL (sem "in schema") remove o EXECUTE automático de funções novas.
-- As RPCs das migrações 0700 e 0800 já checavam a permissão por dentro (anon
-- recebia LDR_NOT_ALLOWED), mas a regra do projeto é anon sem privilégio nenhum.

alter default privileges revoke execute on functions from public;

-- Funções já criadas: tira de PUBLIC e de anon. As concessões explícitas a
-- authenticated e service_role continuam como estavam.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
