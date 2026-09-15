create table offers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null,
  -- Livraison propriété de l'offre, jamais optionnelle (PRD §6). jsonb pour
  -- accueillir de nouveaux types de livrables sans refonte ; check minimal
  -- (objet + discriminant type), validation fine par type laissée à l'app.
  delivery_config jsonb not null check (jsonb_typeof(delivery_config) = 'object' and delivery_config ? 'type'),
  base_price_amount numeric(10,2) not null default 0 check (base_price_amount >= 0),
  base_price_currency text not null references currencies(code) on delete restrict,
  payment_mode text not null check (payment_mode in ('unique', 'gratuit', 'prix_libre')),
  compare_at_price_amount numeric(10,2),
  promo_price_amount numeric(10,2),
  promo_active boolean not null default false,
  suggested_price_amount numeric(10,2),
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (payment_mode = 'gratuit' and base_price_amount = 0)
    or (payment_mode = 'unique' and base_price_amount > 0)
    or (payment_mode = 'prix_libre' and base_price_amount >= 0)
  ),
  check (compare_at_price_amount is null or compare_at_price_amount > base_price_amount),
  check (
    promo_price_amount is null
    or (payment_mode = 'unique' and promo_price_amount < base_price_amount)
  ),
  check (not promo_active or promo_price_amount is not null),
  check (
    suggested_price_amount is null
    or (payment_mode = 'prix_libre' and suggested_price_amount >= base_price_amount)
  )
);

create trigger offers_set_updated_at
  before update on offers
  for each row
  execute function set_updated_at();

-- base_price_currency doit toujours refléter accounts.currency_zone (PRD §4 :
-- la devise se décide au niveau du compte, jamais du produit) — fixée par
-- trigger plutôt qu'un simple défaut, pour qu'aucune valeur libre ne puisse
-- être acceptée en entrée. Sûr à dupliquer puisque currency_zone est immuable.
create or replace function set_offer_base_price_currency()
returns trigger
language plpgsql
as $$
begin
  select a.currency_zone into new.base_price_currency
  from spaces s
  join accounts a on a.id = s.account_id
  where s.id = new.space_id;
  return new;
end;
$$;

create trigger offers_set_base_price_currency
  before insert or update of space_id on offers
  for each row
  execute function set_offer_base_price_currency();

alter table offers enable row level security;

create policy offers_select on offers
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
