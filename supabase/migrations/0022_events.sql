-- Journal d'événements append-only, réservé aux moments à valeur individuelle
-- dans la timeline d'achat (checkout_started, checkout_step_completed,
-- payment_attempted/succeeded/failed, et ce qui suivra) — pas de page_view,
-- le trafic de page vit dans daily_visit_counts/visit_dedup.
create table events (
  id uuid primary key default gen_random_uuid(),
  -- Fourni directement par le code serveur, pas dérivé par trigger :
  -- checkout_started peut survenir avant toute identité client ou session
  -- (customer_id/session_id/transaction_id tous null), donc rien à dériver
  -- depuis une autre colonne de la ligne.
  space_id uuid not null references spaces(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  session_id uuid references checkout_sessions(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  -- Pas de check de liste : registre côté app (lib/analytics/events.ts, une
  -- union TypeScript), la liste grossit sans jamais toucher au schéma.
  type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index events_space_id_idx on events (space_id);
create index events_customer_id_idx on events (customer_id);
create index events_session_id_idx on events (session_id);
create index events_transaction_id_idx on events (transaction_id);

-- Garde-fou de cohérence, pas une dérivation (space_id est fourni) : vérifie,
-- quand elles sont présentes, que customer_id/session_id/transaction_id
-- appartiennent bien à l'espace déclaré.
create or replace function validate_event_space_id()
returns trigger
language plpgsql
as $$
declare
  ref_space_id uuid;
begin
  if new.customer_id is not null then
    select space_id into ref_space_id from customers where id = new.customer_id;
    if ref_space_id is distinct from new.space_id then
      raise exception 'event space_id does not match customer''s space';
    end if;
  end if;

  if new.session_id is not null then
    select space_id into ref_space_id from checkout_sessions where id = new.session_id;
    if ref_space_id is distinct from new.space_id then
      raise exception 'event space_id does not match session''s space';
    end if;
  end if;

  if new.transaction_id is not null then
    select space_id into ref_space_id from transactions where id = new.transaction_id;
    if ref_space_id is distinct from new.space_id then
      raise exception 'event space_id does not match transaction''s space';
    end if;
  end if;

  return new;
end;
$$;

create trigger events_validate_space_id
  before insert or update of space_id, customer_id, session_id, transaction_id on events
  for each row
  execute function validate_event_space_id();

alter table events enable row level security;

create policy events_select on events
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
