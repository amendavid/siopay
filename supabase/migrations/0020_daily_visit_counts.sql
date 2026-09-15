-- Compteurs de trafic, pas un journal : remplace toute notion d'un événement
-- par impression de page (une campagne sponsorisée ne doit jamais faire
-- exploser un volume d'écriture ligne par ligne).
create table daily_visit_counts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  payment_link_id uuid references payment_links(id) on delete cascade,
  offer_id uuid references offers(id) on delete cascade,
  sales_page_id uuid references sales_pages(id) on delete cascade,
  visit_date date not null,
  -- Ventilations indépendantes (une ligne par dimension vue ce jour-là), pas
  -- de produit cartésien entre elles — évite l'explosion combinatoire.
  dimension_type text not null check (dimension_type in ('total', 'pays', 'appareil', 'os')),
  dimension_value text check ((dimension_type = 'total') = (dimension_value is null)),
  impressions integer not null default 0 check (impressions >= 0),
  unique_visits integer not null default 0 check (unique_visits >= 0 and unique_visits <= impressions),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(payment_link_id, offer_id, sales_page_id) = 1)
);

-- coalesce(dimension_value, '') : sans lui, deux lignes 'total' (dimension_value
-- null) pour la même cible/jour ne se bloqueraient pas (deux null ne sont
-- jamais égaux dans un index unique). Sert aussi de cible à l'upsert
-- applicatif (on conflict ... do update set impressions = impressions + 1).
create unique index daily_visit_counts_payment_link_unique
  on daily_visit_counts (payment_link_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where payment_link_id is not null;

create unique index daily_visit_counts_offer_unique
  on daily_visit_counts (offer_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where offer_id is not null;

create unique index daily_visit_counts_sales_page_unique
  on daily_visit_counts (sales_page_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where sales_page_id is not null;

create trigger daily_visit_counts_set_updated_at
  before update on daily_visit_counts
  for each row
  execute function set_updated_at();

create or replace function set_daily_visit_count_space_id()
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

create trigger daily_visit_counts_set_space_id
  before insert or update of payment_link_id, offer_id, sales_page_id on daily_visit_counts
  for each row
  execute function set_daily_visit_count_space_id();

alter table daily_visit_counts enable row level security;

create policy daily_visit_counts_select on daily_visit_counts
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
