create table payment_links (
  id uuid primary key default gen_random_uuid(),
  -- restrict, pas cascade : un lien de paiement est l'entrée réelle du
  -- checkout, relié à des transactions. Supprimer une offre qui a des liens
  -- doit être un geste explicite et bloqué par défaut.
  offer_id uuid not null references offers(id) on delete restrict,
  space_id uuid not null references spaces(id) on delete restrict,
  title text not null,
  description text,
  -- null = hérite de l'offre. Surcharge tout ou rien (prix + mode ensemble,
  -- jamais l'un sans l'autre) — voir contrainte croisée plus bas. Pas de
  -- devise ici : le PRD interdit de faire varier la devise par lien, elle
  -- reste toujours celle de l'offre.
  base_price_amount numeric(10,2),
  payment_mode text check (payment_mode is null or payment_mode in ('unique', 'gratuit', 'prix_libre')),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, slug),
  check (
    (base_price_amount is null and payment_mode is null)
    or (
      base_price_amount is not null and payment_mode is not null
      and (
        (payment_mode = 'gratuit' and base_price_amount = 0)
        or (payment_mode = 'unique' and base_price_amount > 0)
        or (payment_mode = 'prix_libre' and base_price_amount >= 0)
      )
    )
  )
);

create trigger payment_links_set_updated_at
  before update on payment_links
  for each row
  execute function set_updated_at();

create or replace function set_payment_link_space_id()
returns trigger
language plpgsql
as $$
begin
  select o.space_id into new.space_id
  from offers o
  where o.id = new.offer_id;
  return new;
end;
$$;

create trigger payment_links_set_space_id
  before insert or update of offer_id on payment_links
  for each row
  execute function set_payment_link_space_id();

create trigger payment_links_reject_reserved_slug
  before insert or update of slug on payment_links
  for each row
  execute function reject_reserved_slug();

alter table payment_links enable row level security;

create policy payment_links_select on payment_links
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
