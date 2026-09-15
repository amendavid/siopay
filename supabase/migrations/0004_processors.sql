-- L'opérateur sous-jacent (MTN, Moov, Wave, Orange...), indépendant du pays
-- et du gateway — permet d'analyser la performance d'un opérateur à travers
-- plusieurs pays et plusieurs gateways.
create table processors (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger processors_set_updated_at
  before update on processors
  for each row
  execute function set_updated_at();

alter table processors enable row level security;

create policy processors_select on processors
  for select
  to anon, authenticated
  using (true);
