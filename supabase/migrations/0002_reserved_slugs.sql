create table reserved_slugs (
  id uuid primary key default gen_random_uuid(),
  value text not null unique check (value ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reserved_slugs_set_updated_at
  before update on reserved_slugs
  for each row
  execute function set_updated_at();

-- Réutilisée par spaces, payment_links et sales_pages (toutes ont une colonne slug).
create or replace function reject_reserved_slug()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from reserved_slugs where value = new.slug) then
    raise exception 'slug "%" is reserved', new.slug;
  end if;
  return new;
end;
$$;

alter table reserved_slugs enable row level security;
-- Aucune policy anon/authenticated : validation et seed exclusivement service role.
