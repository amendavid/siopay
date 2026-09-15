-- Métadonnées d'affichage pour les agrégateurs (FedaPay, PayDunya...) ; la
-- logique d'intégration technique reste dans lib/payments/gateways/index.ts.
-- Ajouter un gateway reste sans migration : un insert dans cette table, pas
-- un alter table.
create table gateways (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gateways_set_updated_at
  before update on gateways
  for each row
  execute function set_updated_at();

alter table gateways enable row level security;

create policy gateways_select on gateways
  for select
  to anon, authenticated
  using (true);
