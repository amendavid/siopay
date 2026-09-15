create schema if not exists private;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency_zone text not null references currencies(code) on delete restrict,
  display_currency text not null references currencies(code) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger accounts_set_updated_at
  before update on accounts
  for each row
  execute function set_updated_at();

-- currency_zone est le référentiel de valeur du compte (PRD §4) : imposée
-- par le pays d'inscription, jamais modifiable après création.
create or replace function reject_currency_zone_change()
returns trigger
language plpgsql
as $$
begin
  if new.currency_zone is distinct from old.currency_zone then
    raise exception 'currency_zone is immutable once set';
  end if;
  return new;
end;
$$;

create trigger accounts_reject_currency_zone_change
  before update of currency_zone on accounts
  for each row
  execute function reject_currency_zone_change();

alter table accounts enable row level security;

-- Seule table dont la policy compare directement user_id = auth.uid(), sans
-- intermédiaire : c'est elle qui définit cette relation pour toutes les autres.
create policy accounts_select on accounts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Fonction utilitaire SECURITY DEFINER, réutilisée par spaces et account_plans
-- (tables scopées par account_id directement — l'abonnement reste au niveau
-- du compte, pas de l'espace).
create or replace function private.user_owns_account(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = user_owns_account.account_id
      and a.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.user_owns_account(uuid) from public, anon, authenticated;
grant execute on function private.user_owns_account(uuid) to authenticated;
