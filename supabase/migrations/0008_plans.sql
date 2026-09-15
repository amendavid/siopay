create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  credit_allowance integer not null check (credit_allowance >= 0),
  price_monthly numeric(10,2) not null default 0 check (price_monthly >= 0),
  price_monthly_currency text not null references currencies(code) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on plans
  for each row
  execute function set_updated_at();

alter table plans enable row level security;

create policy plans_select on plans
  for select
  to anon, authenticated
  using (true);
