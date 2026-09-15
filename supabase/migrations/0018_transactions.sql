-- Tentative individuelle de paiement à l'intérieur d'une checkout_session.
-- Table la plus sensible du schéma (noyau de paiement) : restrict non
-- négociable sur ses FK structurelles.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references checkout_sessions(id) on delete restrict,
  space_id uuid not null references spaces(id) on delete restrict,
  -- Clé d'idempotence (PRD : un même webhook reçu plusieurs fois ne doit
  -- créer qu'une seule transaction).
  external_id text not null,
  -- Pointe vers le jeu de clés précis qui a traité la transaction, pas
  -- seulement vers le nom de l'agrégateur — si le vendeur révoque une
  -- connexion et en crée une nouvelle, l'historique ne se mélange pas.
  -- Nullable : le mécanisme "offre gratuite" (voir plus bas) n'implique
  -- aucune connexion réelle.
  gateway_credential_id uuid references gateway_credentials(id) on delete restrict,
  -- Nullable : une transaction tout juste créée (webhook pending/processing)
  -- peut ne pas encore exposer la méthode/l'opérateur précis choisis par
  -- l'acheteur.
  payment_method_id uuid references payment_methods(id) on delete restrict,
  processor_code text references processors(code) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  -- Devise de passerelle réellement envoyée à l'agrégateur (PRD §4, notion
  -- 3) — pas automatiquement currency_zone, contrairement à offers.
  currency text not null references currencies(code) on delete restrict,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'processing', 'succeeded', 'failed', 'abandoned', 'refunded')),
  -- Vocabulaire normalisé du PRD §4 : solde insuffisant, timeout opérateur,
  -- annulation utilisateur, numéro invalide, fourre-tout pour l'inconnu.
  failure_reason text check (failure_reason in ('solde_insuffisant', 'timeout_operateur', 'annulation_utilisateur', 'numero_invalide', 'inconnu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Jamais renseigné hors de payment_status = 'failed', jamais absent quand
  -- il l'est.
  unique (gateway_credential_id, external_id),
  check ((payment_status = 'failed') = (failure_reason is not null))
);

-- Postgres ne considère jamais deux null comme égaux dans une contrainte
-- unique : la contrainte ci-dessus ne protège donc pas les lignes où
-- gateway_credential_id est null (cas "gratuit") — complétée ici.
create unique index transactions_external_id_null_gateway_unique
  on transactions (external_id)
  where gateway_credential_id is null;

create index transactions_session_id_idx on transactions (session_id);
create index transactions_space_id_idx on transactions (space_id);
create index transactions_gateway_credential_id_idx on transactions (gateway_credential_id);
create index transactions_processor_code_idx on transactions (processor_code);

create trigger transactions_set_updated_at
  before update on transactions
  for each row
  execute function set_updated_at();

-- Simple recopie depuis session_id -> checkout_sessions.space_id (un seul
-- saut, la validation croisée client/espace a déjà eu lieu à la création de
-- la session).
create or replace function set_transaction_space_id()
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

create trigger transactions_set_space_id
  before insert or update of session_id on transactions
  for each row
  execute function set_transaction_space_id();

-- Empêche d'ajouter une tentative à une session déjà close (reussie,
-- abandonnee, expiree) — sinon la distinction session/tentative perdrait son
-- sens. Un webhook tardif légitime doit rouvrir la session (status ->
-- 'ouverte') avant d'insérer sa transaction, pas contourner ce garde-fou.
create or replace function reject_transaction_on_closed_session()
returns trigger
language plpgsql
as $$
declare
  session_status text;
begin
  select status into session_status from checkout_sessions where id = new.session_id;
  if session_status <> 'ouverte' then
    raise exception 'cannot add a transaction to a % checkout session', session_status;
  end if;
  return new;
end;
$$;

create trigger transactions_reject_on_closed_session
  before insert on transactions
  for each row
  execute function reject_transaction_on_closed_session();

alter table transactions enable row level security;

create policy transactions_select on transactions
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
