-- Modèle BYO Gateway (PRD §4) : le vendeur connecte ses propres clés API
-- chez un agrégateur. SioPay ne détient aucun fonds ni compte marchand, et
-- utilise ces clés uniquement pour initier des paiements au nom du vendeur.
create table gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  gateway text not null references gateways(code) on delete restrict,
  -- Objet JSON structuré multi-clés (api_key, secret_key, merchant_id...),
  -- sérialisé puis chiffré comme un seul bloc. Chiffrement applicatif
  -- (libsodium-wrappers, lib/crypto/encrypt.ts), clé ENCRYPTION_KEY
  -- (variable d'environnement serveur, jamais en base). Jamais en clair.
  credentials_encrypted bytea not null,
  currency text not null references currencies(code) on delete restrict,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'desactivee', 'revoquee', 'archivee')),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une connexion désactivée/révoquée/archivée ne doit jamais rester "par
  -- défaut" — le routage des paiements pointerait silencieusement vers une
  -- connexion morte.
  check (not is_default or status = 'active')
);

-- Au plus une passerelle par défaut par espace.
create unique index gateway_credentials_default_unique
  on gateway_credentials (space_id)
  where is_default;

create trigger gateway_credentials_set_updated_at
  before update on gateway_credentials
  for each row
  execute function set_updated_at();

create or replace function set_gateway_credential_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger gateway_credentials_set_status_updated_at
  before update of status on gateway_credentials
  for each row
  execute function set_gateway_credential_status_updated_at();

alter table gateway_credentials enable row level security;
-- Aucune policy anon/authenticated : accès exclusivement service role, y
-- compris pour l'affichage dashboard des métadonnées non sensibles de cette
-- même table (gateway, currency, is_default, status). Le déchiffrement ne
-- s'exécute que dans le code serveur qui appelle effectivement la passerelle.
