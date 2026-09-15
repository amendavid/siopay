create table countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency_code text not null references currencies(code) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger countries_set_updated_at
  before update on countries
  for each row
  execute function set_updated_at();

alter table countries enable row level security;

create policy countries_select on countries
  for select
  to anon, authenticated
  using (true);
