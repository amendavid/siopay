-- Un seul cycle de livraison par parcours d'achat : les relances (retry
-- Inngest) mettent à jour la même ligne (attempts, last_error) plutôt que
-- d'en créer une nouvelle.
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete restrict,
  session_id uuid not null unique references checkout_sessions(id) on delete restrict,
  -- Identifie le mécanisme de livraison (file, systeme-io, skool...),
  -- toujours renseigné. Pas de check, même registre que gateway.
  provider text not null,
  -- Quel compte précis a traité la livraison. Nullable : la livraison de
  -- fichier direct passe par Cloudflare R2 (infrastructure SioPay elle-même),
  -- aucun compte tiers du vendeur n'est impliqué.
  integration_id uuid references integrations(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  -- Résultat concret de la livraison (URL signée pour un fichier,
  -- confirmation d'inscription Systeme.io/Skool...), forme dépendante du
  -- provider.
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'succeeded') = (delivered_at is not null))
);

create index deliveries_space_id_idx on deliveries (space_id);
create index deliveries_integration_id_idx on deliveries (integration_id);

create trigger deliveries_set_updated_at
  before update on deliveries
  for each row
  execute function set_updated_at();

create or replace function set_delivery_space_id()
returns trigger
language plpgsql
as $$
begin
  select cs.space_id into new.space_id
  from checkout_sessions cs
  where cs.id = new.session_id;
  return new;
end;
$$;

create trigger deliveries_set_space_id
  before insert or update of session_id on deliveries
  for each row
  execute function set_delivery_space_id();

alter table deliveries enable row level security;

create policy deliveries_select on deliveries
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
