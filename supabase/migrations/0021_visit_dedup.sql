-- Sert uniquement à savoir si un visitor_id (cookie anonyme, jamais stocké
-- dans une table de "visiteurs connus") a déjà été compté aujourd'hui pour
-- une cible donnée. Alimente unique_visits sur daily_visit_counts. Lignes de
-- plus de quelques jours purgées par une tâche de fond (inngest, S10), pas
-- gérée ici.
create table visit_dedup (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  visitor_id uuid not null,
  payment_link_id uuid references payment_links(id) on delete cascade,
  offer_id uuid references offers(id) on delete cascade,
  sales_page_id uuid references sales_pages(id) on delete cascade,
  visit_date date not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(payment_link_id, offer_id, sales_page_id) = 1)
);

-- C'est cette contrainte elle-même, pas une vérification applicative
-- préalable, qui sert de garde-fou contre le double comptage sous requêtes
-- concurrentes : insert ... on conflict do nothing.
create unique index visit_dedup_payment_link_unique
  on visit_dedup (visitor_id, payment_link_id, visit_date)
  where payment_link_id is not null;

create unique index visit_dedup_offer_unique
  on visit_dedup (visitor_id, offer_id, visit_date)
  where offer_id is not null;

create unique index visit_dedup_sales_page_unique
  on visit_dedup (visitor_id, sales_page_id, visit_date)
  where sales_page_id is not null;

create or replace function set_visit_dedup_space_id()
returns trigger
language plpgsql
as $$
begin
  if new.payment_link_id is not null then
    select space_id into new.space_id from payment_links where id = new.payment_link_id;
  elsif new.offer_id is not null then
    select space_id into new.space_id from offers where id = new.offer_id;
  elsif new.sales_page_id is not null then
    select space_id into new.space_id from sales_pages where id = new.sales_page_id;
  end if;
  return new;
end;
$$;

create trigger visit_dedup_set_space_id
  before insert or update of payment_link_id, offer_id, sales_page_id on visit_dedup
  for each row
  execute function set_visit_dedup_space_id();

alter table visit_dedup enable row level security;
-- Aucune policy anon/authenticated : usage interne au mécanisme de
-- dédoublonnage, aucun usage produit ne lit cette table directement.
