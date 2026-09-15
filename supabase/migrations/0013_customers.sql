-- L'identité client se résout par espace, pas par compte : deux boutiques du
-- même vendeur traitent un même acheteur comme deux customer_id distincts —
-- choix assumé (PRD §8), pas une conséquence mécanique.
create table customers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  -- Clé de résolution d'identité, normalisée à l'écriture. Email seul,
  -- jamais le téléphone (signal de contact, jamais de matching/fusion), pas
  -- de soft matching.
  email text not null check (email = lower(trim(email)) and length(email) > 0),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, email)
);

create trigger customers_set_updated_at
  before update on customers
  for each row
  execute function set_updated_at();

alter table customers enable row level security;

create policy customers_select on customers
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
