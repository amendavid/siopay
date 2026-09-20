-- Les privilèges de table sur le distant ne contenaient que REFERENCES/TRIGGER/
-- TRUNCATE pour anon, authenticated et service_role : aucun SELECT/INSERT/
-- UPDATE/DELETE, donc même le service role recevait "permission denied". RLS
-- filtre les lignes, mais seulement pour un rôle qui a déjà le privilège de
-- table — d'où ces GRANT explicites.

grant usage on schema public to anon, authenticated, service_role;

-- Toute écriture passe par le service role (AGENTS.md : RLS = lecture seule).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Lecture pour un vendeur connecté, filtrée par les policies RLS. Exclut les
-- tables sans aucune policy : accès service role uniquement.
grant select on all tables in schema public to authenticated;
revoke select on
  reserved_slugs,
  gateway_credentials,
  integrations,
  visit_dedup
from authenticated;

-- Lecture publique : uniquement les tables de référence qui ont une policy anon.
grant select on
  currencies,
  gateways,
  processors,
  countries,
  payment_methods,
  plans
to anon;

-- Garantit que les tables futures restent accessibles au service role.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
