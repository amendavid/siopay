-- Catalogue cross-gateway, cross-pays des méthodes précises proposées à
-- l'acheteur ("MTN Mobile Money Bénin", "Wave Sénégal"...).
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  processor_code text references processors(code) on delete restrict,
  country_code text references countries(code) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payment_methods_set_updated_at
  before update on payment_methods
  for each row
  execute function set_updated_at();

alter table payment_methods enable row level security;

create policy payment_methods_select on payment_methods
  for select
  to anon, authenticated
  using (true);
