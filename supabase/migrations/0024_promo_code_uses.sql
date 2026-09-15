-- Table de suivi séparée, nécessaire pour appliquer les limites d'usage et
-- tracer ce qu'un code a réellement coûté/rapporté.
create table promo_code_uses (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id) on delete restrict,
  -- Rattaché à la session, pas à la transaction : un code promo s'applique à
  -- un parcours d'achat entier, pas à une tentative précise. unique : au plus
  -- un code par session (pas de cumul). La ligne n'est créée qu'à la réussite
  -- de la session, jamais à l'application du code par l'acheteur.
  session_id uuid not null unique references checkout_sessions(id) on delete restrict,
  space_id uuid not null references spaces(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  -- Montant réellement déduit pour cette utilisation précise — pas recalculé
  -- depuis promo_codes à la lecture, pour ne pas dépendre d'une modification
  -- ultérieure du code.
  discount_applied_amount numeric(10,2) not null check (discount_applied_amount >= 0),
  discount_applied_currency text not null references currencies(code) on delete restrict,
  created_at timestamptz not null default now()
);

create index promo_code_uses_promo_code_id_idx on promo_code_uses (promo_code_id);
create index promo_code_uses_space_id_idx on promo_code_uses (space_id);
create index promo_code_uses_customer_id_idx on promo_code_uses (customer_id);

create or replace function set_promo_code_use_space_and_customer()
returns trigger
language plpgsql
as $$
begin
  select cs.space_id, cs.customer_id into new.space_id, new.customer_id
  from checkout_sessions cs
  where cs.id = new.session_id;
  return new;
end;
$$;

create trigger promo_code_uses_set_space_and_customer
  before insert or update of session_id on promo_code_uses
  for each row
  execute function set_promo_code_use_space_and_customer();

-- update ... where uses_count < max_uses plutôt qu'un select count(*)
-- préalable : le verrou de ligne posé par l'update sur promo_codes rend la
-- vérification et l'incrémentation atomiques — deux utilisations concurrentes
-- à la toute dernière place disponible ne peuvent pas toutes les deux réussir.
create or replace function increment_promo_code_use_count()
returns trigger
language plpgsql
as $$
declare
  updated_rows integer;
  code_expires_at timestamptz;
begin
  update promo_codes
  set uses_count = uses_count + 1
  where id = new.promo_code_id
    and (max_uses is null or uses_count < max_uses)
    and (expires_at is null or expires_at > now());

  get diagnostics updated_rows = row_count;

  if updated_rows = 0 then
    select expires_at into code_expires_at from promo_codes where id = new.promo_code_id;
    if code_expires_at is not null and code_expires_at <= now() then
      raise exception 'promo code % has expired', new.promo_code_id;
    else
      raise exception 'promo code % has reached its usage limit', new.promo_code_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger promo_code_uses_increment_count
  before insert on promo_code_uses
  for each row
  execute function increment_promo_code_use_count();

alter table promo_code_uses enable row level security;

create policy promo_code_uses_select on promo_code_uses
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
