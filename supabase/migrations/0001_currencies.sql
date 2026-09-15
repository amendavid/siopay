-- Fonction générique de maintien de updated_at, réutilisée telle quelle par
-- toutes les migrations suivantes qui en ont besoin.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger currencies_set_updated_at
  before update on currencies
  for each row
  execute function set_updated_at();

alter table currencies enable row level security;

create policy currencies_select on currencies
  for select
  to anon, authenticated
  using (true);
