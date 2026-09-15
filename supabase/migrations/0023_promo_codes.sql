-- Système flexible : portée (lien/offre/espace), à qui (tous/un client
-- précis) et combien de fois (unique/N fois/illimité) sont des axes
-- indépendants, combinables librement.
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  code text not null check (code = upper(trim(code))),
  payment_link_id uuid references payment_links(id) on delete cascade,
  offer_id uuid references offers(id) on delete cascade,
  -- null = utilisable par n'importe quel acheteur. Renseigné = réservé à ce
  -- client précis.
  customer_id uuid references customers(id) on delete cascade,
  -- null = illimité.
  max_uses integer check (max_uses is null or max_uses > 0),
  -- Compteur dénormalisé, maintenu par trigger depuis promo_code_uses — sert
  -- à l'application atomique et sans condition de concurrence de max_uses.
  uses_count integer not null default 0 check (uses_count >= 0),
  discount_type text not null check (discount_type in ('montant_fixe', 'pourcentage')),
  discount_amount numeric(10,2),
  discount_currency text references currencies(code) on delete restrict,
  discount_percentage numeric(5,2),
  -- Distingue un code créé par le vendeur d'un code généré par une future
  -- automatisation (attribution de revenu par playbook, PRD).
  source text not null default 'manuel' check (source in ('manuel', 'automatique')),
  is_active boolean not null default true,
  -- null = pas d'expiration. Contrôlé au même endroit que max_uses (trigger
  -- d'incrémentation sur promo_code_uses), pas un check isolé ici.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, code),
  -- Portée : au plus un des deux, zéro = espace entier.
  check (num_nonnulls(payment_link_id, offer_id) <= 1),
  check (
    (discount_type = 'montant_fixe' and discount_amount is not null and discount_amount > 0
      and discount_currency is not null and discount_percentage is null)
    or
    (discount_type = 'pourcentage' and discount_percentage is not null and discount_percentage > 0 and discount_percentage <= 100
      and discount_amount is null and discount_currency is null)
  )
);

create trigger promo_codes_set_updated_at
  before update on promo_codes
  for each row
  execute function set_updated_at();

alter table promo_codes enable row level security;

create policy promo_codes_select on promo_codes
  for select
  to authenticated
  using ((select private.user_owns_space(space_id)));
