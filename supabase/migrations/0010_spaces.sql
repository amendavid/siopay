-- Un compte (le vendeur) peut posséder plusieurs espaces (boutiques). Tout ce
-- qui est métier se rattache à space_id, pas directement à account_id.
create table spaces (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger spaces_set_updated_at
  before update on spaces
  for each row
  execute function set_updated_at();

create trigger spaces_reject_reserved_slug
  before insert or update of slug on spaces
  for each row
  execute function reject_reserved_slug();

alter table spaces enable row level security;

create policy spaces_select on spaces
  for select
  to authenticated
  using ((select private.user_owns_account(account_id)));

-- Fonction utilitaire SECURITY DEFINER, réutilisée par toutes les tables
-- métier scopées par space_id — évite de répéter le join spaces->accounts
-- dans chaque policy.
create or replace function private.user_owns_space(space_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.spaces s
    join public.accounts a on a.id = s.account_id
    where s.id = user_owns_space.space_id
      and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.user_owns_space(uuid) from public, anon, authenticated;
grant execute on function private.user_owns_space(uuid) to authenticated;
