-- Représente le parcours d'achat entier (arrivée sur le lien -> succès /
-- abandon / expiration), pas une tentative de paiement isolée. Répond au
-- besoin de regrouper plusieurs tentatives d'un même acheteur en un seul
-- parcours (différenciateur produit).
create table checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete restrict,
  -- customer_id not null implique que la ligne n'est créée qu'à partir de la
  -- fin de l'étape 2 du checkout (identité résolue) : aucune session n'existe
  -- pour un visiteur encore anonyme (étape 1).
  customer_id uuid not null references customers(id) on delete restrict,
  payment_link_id uuid not null references payment_links(id) on delete restrict,
  status text not null default 'ouverte' check (status in ('ouverte', 'reussie', 'abandonnee', 'expiree')),
  -- Pas de défaut : l'app doit toujours calculer et fournir une expiration
  -- explicite, pour que la durée reste ajustable (ex. par palier) sans
  -- migration. Levier direct contre les faux "échecs répétés" causés par des
  -- sessions trop courtes.
  expires_at timestamptz not null,
  closed_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'succeeded', 'failed')),
  is_test boolean not null default false,
  -- Contexte du parcours : device, pays, attribution publicitaire (UTM,
  -- fbclid/gclid/ttclid...), capturé sur checkout_started et recopié ici une
  -- fois la session créée.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checkout_sessions_space_id_idx on checkout_sessions (space_id);

-- Au plus une session ouverte simultanément pour un même couple client/lien.
create unique index checkout_sessions_active_unique
  on checkout_sessions (customer_id, payment_link_id)
  where status = 'ouverte';

create trigger checkout_sessions_set_updated_at
  before update on checkout_sessions
  for each row
  execute function set_updated_at();

-- Dérive space_id depuis payment_link_id, et valide au passage que
-- customer_id appartient bien au même espace — sans ça, un bug côté checkout
-- pourrait rattacher silencieusement un client de l'espace A à une session de
-- l'espace B.
create or replace function set_checkout_session_space_id()
returns trigger
language plpgsql
as $$
declare
  resolved_space_id uuid;
  customer_space_id uuid;
begin
  select pl.space_id into resolved_space_id
  from payment_links pl
  where pl.id = new.payment_link_id;

  select c.space_id into customer_space_id
  from customers c
  where c.id = new.customer_id;

  if resolved_space_id is distinct from customer_space_id then
    raise exception 'customer % does not belong to the same space as payment_link %', new.customer_id, new.payment_link_id;
  end if;

  new.space_id := resolved_space_id;
  return new;
end;
$$;

create trigger checkout_sessions_set_space_id
  before insert or update of payment_link_id, customer_id on checkout_sessions
  for each row
  execute function set_checkout_session_space_id();

-- null tant que status = 'ouverte'. Distinct de expires_at : l'un dit quand
-- la session expirerait si rien ne se passe, l'autre dit quand elle s'est
-- réellement terminée, quelle qu'en soit la raison. Se déclenche aussi à
-- l'insert (le mécanisme "gratuit" crée une session directement 'reussie').
create or replace function set_checkout_session_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'ouverte' then
    new.closed_at := null;
  else
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger checkout_sessions_set_closed_at
  before insert or update of status on checkout_sessions
  for each row
  execute function set_checkout_session_closed_at();

alter table checkout_sessions enable row level security;

create policy checkout_sessions_select on checkout_sessions
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
