create table sales_pages (
  id uuid primary key default gen_random_uuid(),
  -- Une page de vente est toujours rattachée à un lien de paiement (PRD §5) ;
  -- c'est la relation inverse (un lien sans page) qui est optionnelle. unique :
  -- relation 1:1, "la vitrine publique d'un lien de paiement". on delete
  -- cascade : si le lien disparaît, sa page n'a plus de raison d'exister.
  payment_link_id uuid not null unique references payment_links(id) on delete cascade,
  space_id uuid not null references spaces(id) on delete restrict,
  title text not null,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  -- Pas de check de liste ni de table templates séparée : registre côté code
  -- (lib/sales-pages/templates/index.ts), pensé pour ajouter un template sans
  -- migration.
  template_id text not null,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  brand_color text not null default '#1E6DF6' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  active_sections jsonb not null default '{}'::jsonb check (jsonb_typeof(active_sections) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, slug)
);

create trigger sales_pages_set_updated_at
  before update on sales_pages
  for each row
  execute function set_updated_at();

create or replace function set_sales_page_space_id()
returns trigger
language plpgsql
as $$
begin
  select pl.space_id into new.space_id
  from payment_links pl
  where pl.id = new.payment_link_id;
  return new;
end;
$$;

create trigger sales_pages_set_space_id
  before insert or update of payment_link_id on sales_pages
  for each row
  execute function set_sales_page_space_id();

create trigger sales_pages_reject_reserved_slug
  before insert or update of slug on sales_pages
  for each row
  execute function reject_reserved_slug();

alter table sales_pages enable row level security;

create policy sales_pages_select on sales_pages
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
