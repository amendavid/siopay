create table account_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Au plus un palier actif par compte à la fois. Changement de palier = clore
-- la ligne active (ended_at = now()) puis en insérer une nouvelle, jamais un
-- update du plan_id en place (sinon l'historique se perd).
create unique index account_plans_active_unique
  on account_plans (account_id)
  where ended_at is null;

create trigger account_plans_set_updated_at
  before update on account_plans
  for each row
  execute function set_updated_at();

alter table account_plans enable row level security;

create policy account_plans_select on account_plans
  for select
  to authenticated
  using ((select private.user_owns_account(account_id)));
