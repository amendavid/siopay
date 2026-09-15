-- Table générique de comptes tiers connectés — livraison (Systeme.io, Skool)
-- aujourd'hui, actions du futur moteur d'automatisation demain. Volontairement
-- vide de toute logique propre à la livraison.
create table integrations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  provider text not null,
  -- Nom donné par le vendeur pour distinguer plusieurs comptes du même
  -- provider (ex. "Systeme.io - Formation Marketing" / "- Coaching") —
  -- plusieurs comptes par provider explicitement autorisés (modèle Make.com).
  label text not null,
  credentials_encrypted bytea not null,
  status text not null default 'active' check (status in ('active', 'desactivee', 'revoquee', 'archivee')),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, provider, label)
);

create trigger integrations_set_updated_at
  before update on integrations
  for each row
  execute function set_updated_at();

create or replace function set_integration_status_updated_at()
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

create trigger integrations_set_status_updated_at
  before update of status on integrations
  for each row
  execute function set_integration_status_updated_at();

alter table integrations enable row level security;
-- Aucune policy anon/authenticated : accès exclusivement service role, même
-- traitement sécurité que gateway_credentials.
