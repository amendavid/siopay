# Schéma Supabase — notes de conception

> **Les 24 migrations dans `supabase/migrations/` font foi désormais.** Ce
> document a servi à valider la conception colonne par colonne avant leur
> écriture (relecture d'ensemble en 5 sections : nommage/clés primaires,
> RLS, `on delete`, jsonb/text+check/montant+devise, ordre de dépendance) —
> il reste utile pour retrouver le *raisonnement* derrière une contrainte
> (pourquoi ce `check`, pourquoi `cascade` plutôt que `restrict`...), mais en
> cas de divergence avec une migration, **la migration a raison**, pas cette
> page. Ne pas le mettre à jour au fil des futures évolutions du schéma —
> historique figé au moment de l'écriture des migrations.

---

## 0001_accounts

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `user_id` | `uuid` | not null, unique, references `auth.users(id)` on delete cascade | Racine de l'isolation vendeur — toute la RLS des autres tables remonte jusqu'ici via `account_id → accounts.user_id = auth.uid()`. `unique` = **un compte par utilisateur**, cohérent avec "pas de multi-espaces en V1" (PRD). |
| `currency_zone` | `text` | not null, immuable après création (trigger interdisant toute modification), references `currencies(code)` on delete restrict | Référentiel de valeur du compte (PRD §4) : imposée par le pays d'inscription, jamais modifiable — tous les prix et stats du vendeur s'y calculent. |
| `display_currency` | `text` | not null, references `currencies(code)` on delete restrict | Devise d'affichage dashboard (PRD §4), modifiable librement — n'affecte jamais un montant réel, seulement la présentation. Initialisée à la même valeur que `currency_zone` à la création. Même traitement que `currency_zone` : FK vers `currencies`, pas un simple `check` regex. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS sur `accounts` : `for select to authenticated using (user_id = auth.uid())` directement — c'est la seule table où la policy ne passe pas par une jointure, puisque c'est elle qui définit la relation `user_id ↔ account_id` pour toutes les autres. `for select` uniquement, comme partout ailleurs (Section B) : la mise à jour du compte (ex. `display_currency`) passe par le service role, ownership vérifié côté app.
- Le trigger générique `set_updated_at()` sera défini ici (première migration à en avoir besoin) et réutilisé tel quel par les tables suivantes, sans redéfinition.
- `currency_zone` référence `currencies.code` (table ci-dessous) — pas `countries` directement, puisque plusieurs pays partagent une même devise (voir `currencies`/`countries`).

**Validé** — un compte par utilisateur (`user_id` unique).

---

## currencies

*Nouvelle table, pas dans la liste initiale de `plan.md`. Option A retenue : cible FK propre pour toute colonne "devise" du schéma (`countries.currency_code`, `accounts.currency_zone`, et plus tard `plans.price_monthly_currency`, `payment_links.currency`, etc.).*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `code` | `text` | primary key, check format ISO 4217 (`^[A-Z]{3}$`) | **Révisé lors de la relecture d'ensemble (Section A) : plus d'`id uuid` séparé.** Aucune FK du schéma ne référence jamais `currencies(id)` — tout pointe déjà vers `.code` — donc un `id uuid` distinct ne serait qu'une deuxième clé jamais utilisée. Même traitement que `gateways`/`processors`, appliqué ici rétroactivement pour cohérence. |
| `name` | `text` | not null | Libellé affiché (ex. "Franc CFA (BCEAO)", "Dollar américain"). |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS : `for select to anon, authenticated using (true)` (lecture publique nécessaire dès le sélecteur pays/devise à l'inscription, avant toute authentification). Aucune policy d'écriture pour ces rôles — seul le service role (migrations/seed) écrit.
- Seed (liste des devises réellement supportées) à faire dans la migration ou juste après — hors scope de ce document de conception, mais à ne pas oublier.

---

## countries

*Répond à la question laissée ouverte sur `accounts.currency_zone` : d'où vient la devise de zone, dérivée du pays déclaré à l'inscription.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `code` | `text` | primary key, check format ISO 3166-1 alpha-2 (`^[A-Z]{2}$`) | **Révisé lors de la relecture d'ensemble (Section A) : plus d'`id uuid` séparé** — même raisonnement que `currencies` ci-dessus, aucune FK ne référence `countries(id)`. |
| `name` | `text` | not null | Libellé affiché (sélecteur pays). |
| `currency_code` | `text` | not null, references `currencies(code)` on delete restrict | Devise imposée aux comptes enregistrés dans ce pays. Plusieurs pays référencent le même `currencies.code` (ex. XOF pour Bénin, Sénégal, Côte d'Ivoire, Togo, Burkina Faso) — pas de contrainte d'unicité ici, c'est attendu. Renommé `currency` → `currency_code` pour que le nom porte explicitement la FK. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS : même traitement que `currencies` — `for select to anon, authenticated using (true)`, écriture réservée au service role.
- Seed de données (liste des pays + `currency_code`) à faire dans la migration ou juste après.
- **Conséquence sur l'ordre des migrations :** `currencies` → `countries` → `accounts`, dans cet ordre (chaîne de dépendances FK). Ça implique de renuméroter ce qui a déjà un numéro dans `plan.md` (`currencies` et `countries` prennent `0001`/`0002`, `accounts` passe en `0003`, etc.) et de renommer le fichier déjà écrit `supabase/migrations/0002_customers.sql`. Comme convenu, je ne renumérote rien maintenant — je le fais au moment d'écrire les migrations, une fois tout le schéma validé.

---

## plans

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `name` | `text` | not null, unique | Identifiant du palier (`free`, `starter`, `pro`...) — référencé dans la logique de feature-gating. Ce n'est pas une donnée "pays/devise/opérateur" visée par la règle anti-hardcode : c'est un tier produit, pas une donnée métier régionale. |
| `credit_allowance` | `integer` | not null, check `>= 0` | Quota de crédits d'automatisation par cycle de facturation (PRD §10). |
| `price_monthly` | `numeric(10,2)` | not null, default `0`, check `>= 0` | Montant nu — a besoin d'une devise associée (règle absolue "aucun montant sans devise", PRD §4 / AGENTS.md). Défaut `0` **volontaire**, pas `null` : `plan.md` prévoit que les paliers sont créés vides en S2, peuplés (noms + crédits) en S15, et que les prix réels n'arrivent qu'en S18. `0` sert de placeholder explicite pendant cet intervalle plutôt qu'un `null` qui se confondrait avec "gratuit" comme choix produit — question toujours ouverte ci-dessous si tu préfères l'inverse. |
| `price_monthly_currency` | `text` | not null, references `currencies(code)` on delete restrict | Devise de facturation de l'abonnement SioPay lui-même — distincte de la `currency_zone` du vendeur (c'est SioPay qui facture le vendeur, pas l'inverse). Profite de la table `currencies` qu'on vient de créer plutôt qu'un simple `check` regex. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- Colonnes limitées à ce que liste `plan.md` ligne 50 (`id, name, credit_allowance, price_monthly`) + la devise que cette règle absolue impose. Le PRD §10 mentionne d'autres dimensions différenciées par palier (liens par offre, designs multiples, stats avancées, canaux coûteux, domaine personnalisé) — aucune n'est dans ce schéma minimal, je n'en ai pas ajouté pour rester dans le périmètre S2.
- Seed : `price_monthly_currency = 'XOF'` (validé).
- **RLS — oubliée jusqu'ici, ajoutée en relecture d'ensemble (Section B) :** même traitement que `currencies`/`countries`/`gateways`/`processors`/`payment_methods` — activée, lecture publique (`anon` + `authenticated`, nécessaire pour une page de tarifs publique, S18), écriture réservée au service role. `plans` a exactement le même profil que ces tables (catalogue de référence) et avait été omise par erreur.

**Validé** — `price_monthly = 0` par défaut ; devise de seed `XOF`.

---

## account_plans

*Répond au gap repéré sur `plans` : rien ne disait quel palier un compte a souscrit. Table séparée plutôt qu'une colonne `plan_id` sur `accounts`, pour garder un historique des changements de palier (facturation, debug).*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `account_id` | `uuid` | not null, references `accounts(id)` on delete cascade | Compte concerné par cette période d'abonnement. |
| `plan_id` | `uuid` | not null, references `plans(id)` on delete restrict | Palier souscrit pour cette période. `restrict` (pas `cascade`) : un palier référencé par de l'historique ne doit pas pouvoir être supprimé silencieusement — protège l'historique de facturation. |
| `started_at` | `timestamptz` | not null, default `now()` | Début de la période sur ce palier — c'est la donnée métier (date de changement de palier), distincte de `created_at` qui n'est qu'un horodatage d'écriture en base. |
| `ended_at` | `timestamptz` | nullable | `null` = palier actuellement actif. Une valeur = période close (changement de palier ultérieur). Un index unique partiel (`where ended_at is null`) garantit au plus un palier actif par compte à la fois — voir notes. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- Nom retenu : `account_plans` plutôt que `subscriptions` — évite de laisser penser qu'une intégration de facturation (Stripe ou autre) est déjà branchée dessus ; c'est un historique de palier, rien de plus pour l'instant. Dis-moi si tu préfères `subscriptions` malgré tout.
- Invariant clé : `create unique index account_plans_active_unique on account_plans (account_id) where ended_at is null;` — empêche deux lignes actives simultanées pour le même compte. Un changement de palier = clore la ligne active (`ended_at = now()`) puis insérer une nouvelle ligne, jamais un `update` du `plan_id` en place (sinon l'historique se perd).
- RLS : `for select to authenticated using ((select private.user_owns_account(account_id)))` — corrigé en relecture d'ensemble (Section B), voir la fonction définie dans la section `reserved_slugs`. Utilisait auparavant un join en toutes lettres, écrit avant que ce pattern n'existe.
- Ordre de migration : après `accounts` **et** `plans` (dépend des deux). Doit aussi venir après `reserved_slugs` maintenant (dépend de `private.user_owns_account`, définie dans cette section) — même si aucun lien logique direct entre les deux tables.

---

## spaces

*Correction structurelle : le schéma confondait compte et espace de vente. Un `account` (le vendeur, l'utilisateur qui se connecte) peut à terme posséder plusieurs `spaces` (boutiques) ; en V1 il n'en a qu'un, mais rien dans la structure ne doit le figer. Tout ce qui est métier (`customers`, `offers`, `payment_links`, `sales_pages`, `transactions`, `events`, `deliveries`, `gateway_credentials`) se rattache désormais à `space_id`, pas `account_id`. L'abonnement (`plans`, `account_plans`) reste au niveau du compte — décision actée : crédits et palier sont partagés entre tous les espaces d'un même compte.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `account_id` | `uuid` | not null, references `accounts(id)` on delete cascade | Propriétaire de l'espace. Un compte peut avoir plusieurs espaces ; un espace appartient à un seul compte. |
| `name` | `text` | not null | Nom de la boutique/espace, affiché dans le dashboard. |
| `slug` | `text` | not null, unique, check `slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'`, rejeté si présent dans `reserved_slugs` (trigger, voir plus bas) | Devient le sous-domaine public de l'espace (`{slug}.siopay.io`, PRD). Unique **globalement** — contrairement à `payment_links`/`sales_pages`, un sous-domaine est par nature un espace de noms global, pas scoping possible par espace. Format plus strict qu'un slug de chemin d'URL (`^[a-z0-9-]+$` utilisé ailleurs) : une étiquette DNS ne peut ni commencer ni finir par un tiret, et est limitée à 63 caractères — d'où ce regex plus précis. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- **Pas de contrainte unique sur `account_id`** malgré "un seul espace en V1" : cette limite est une règle de palier (susceptible de changer selon le plan souscrit), pas une vérité structurelle comme l'immuabilité de `currency_zone`. La vérification "un compte gratuit ne peut créer qu'un espace" se fait côté application, au moment de la création — pas en base.
- RLS : `for select to authenticated using ((select private.user_owns_account(account_id)))` — corrigé en relecture d'ensemble (Section B), même fonction que `account_plans`.
- Ordre de migration : après `accounts`, avant toute table métier qui référence `space_id` (`customers`, `offers`, et la suite) — et après `reserved_slugs` (le trigger de rejet en dépend, ainsi que désormais `private.user_owns_account`).
- Génération du slug (algorithme applicatif, pas une contrainte de schéma) : dérivé de `name`, normalisé (minuscules, accents retirés, espaces → tirets), suffixe numérique en cas de collision (`ma-boutique`, `ma-boutique-2`...). Filet de sécurité si `name` ne produit aucun caractère valide (vide, uniquement des emojis/symboles) : retomber sur un identifiant générique (ex. préfixe fixe + segment aléatoire court) plutôt que de bloquer la création d'espace.

---

## reserved_slugs

*Nouvelle table, introduite pour empêcher un vendeur de capter une route système (`admin`, `api`, `www`...) ou un nom de marque tiers (`apple`, `google`, `siopay`...) comme slug — que ce soit le sous-domaine d'un espace ou un slug de lien/page à l'intérieur d'un espace.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `value` | `text` | not null, unique, check `value ~ '^[a-z0-9-]+$'` | Liste plate — routes système et noms de marque interdits mélangés sans distinction en base, comme demandé. Même format que les slugs qu'elle contraint, pour une comparaison directe sans normalisation supplémentaire. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Fonction de rejet, réutilisée par `spaces`, `payment_links` et `sales_pages` (toutes ont une colonne `slug`) :**
```sql
create or replace function reject_reserved_slug()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from reserved_slugs where value = new.slug) then
    raise exception 'slug "%" is reserved', new.slug;
  end if;
  return new;
end;
$$;

-- attaché à chaque table concernée, ex. pour spaces :
create trigger spaces_reject_reserved_slug
  before insert or update of slug on spaces
  for each row
  execute function reject_reserved_slug();
```

**Notes (hors tableau) :**
- RLS : activée, aucune policy `anon`/`authenticated` — la génération de slug et sa validation contre cette liste se font côté serveur (service role), jamais depuis le client. Seul le service role (migrations/seed) écrit dans cette table.
- Seed initial à définir (liste des routes système + marques à protéger) — hors scope de ce document de conception.
- Ordre de migration : avant `spaces` (le trigger de `spaces` en dépend).

**Ajout d'infrastructure RLS (pas une décision produit, une recommandation technique) :** à partir de `payment_links`, l'isolation vendeur passe par une chaîne à 3 sauts (`payment_links.offer_id → offers.space_id → spaces.account_id → accounts.user_id`). Répéter ce join en toutes lettres dans chaque policy devient à la fois illisible et plus lent (la doc Supabase RLS recommande d'éviter les jointures répétées non indexées dans les policies). Je propose une fonction utilitaire `SECURITY DEFINER`, définie une fois ici :

```sql
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
```

Utilisée comme `for select to authenticated using ((select private.user_owns_space(space_id)))` pour les tables qui portent `space_id` directement (`customers`, `offers`), et via un `exists` sur la table intermédiaire pour celles qui n'ont que `offer_id` ou `payment_link_id` (`payment_links` et ce qui suivra). Je mets à jour les notes RLS de `customers` et `offers` ci-dessus en conséquence.

**Règle générale — portée des policies, tranchée en Section B (relecture d'ensemble) :** toutes les écritures passent par le serveur (service role, Server Actions) — aucun client navigateur n'écrit en authentifié direct, cohérent avec l'architecture à deux clients déjà décrite (`createServerClient()` service role / `createBrowserClient()` anon, AGENTS.md), qui ne prévoit nulle part un client "navigateur authentifié en écriture". RLS n'est donc **pas** le mécanisme d'accès primaire pour l'écriture : c'est un filet de sécurité en lecture (empêche une fuite si un futur ajout de code lit par erreur directement depuis le navigateur), l'ownership réel en écriture est vérifié côté application avant tout appel au service role. Conséquence concrète, appliquée à **toutes** les tables métier de ce schéma (les onze qui utilisent `user_owns_space`, `spaces`/`account_plans` qui utilisent `user_owns_account`, et `accounts` elle-même) : chaque policy s'écrit
```sql
for select to authenticated using (...)
```
jamais `for all`, jamais de `with check` (il n'y a rien à valider côté RLS pour une opération qui n'existe pas via ce rôle). Les tables "catalogue public" (`currencies`, `countries`, `gateways`, `processors`, `payment_methods`, `plans`) suivent le même principe, avec `anon` en plus de `authenticated` puisque leur lecture doit être possible avant authentification. Les notes RLS de chaque table, plus bas, sont mises à jour pour préciser `for select to authenticated` (ou `to anon, authenticated` pour les catalogues) plutôt qu'un simple `using (...)` sans portée explicite.

**Fonction jumelle, repérée manquante en relecture d'ensemble (Section B) :** `spaces` et `account_plans` sont scopées par `account_id` directement (l'abonnement reste au niveau du compte, décision déjà actée), et utilisaient jusqu'ici un join en toutes lettres — `account_id in (select id from accounts where user_id = auth.uid())` — écrit avant que ce pattern `SECURITY DEFINER` n'existe, jamais mis à jour depuis. Même incohérence de fond que celle qui a motivé `user_owns_space` : `auth.uid()` non mis en cache par un `(select ...)`, pas de fonction réutilisable. Je l'aligne avec une fonction jumelle :

```sql
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
```

Les notes RLS de `spaces` et `account_plans` ci-dessus/ci-dessous passent à `for select to authenticated using ((select private.user_owns_account(account_id)))`.

---

## customers *(révisée — remplace la version déjà écrite dans `supabase/migrations/0002_customers.sql`)*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | Anciennement `account_id`. L'identité client se résout maintenant par espace, pas par compte : deux boutiques du même vendeur traitent un même acheteur comme deux `customer_id` distincts — cohérent avec le fait qu'une boutique est une identité commerciale distincte aux yeux de l'acheteur. |
| `email` | `text` | not null, check `email = lower(trim(email)) and length(email) > 0` | Clé de résolution d'identité, normalisée à l'écriture. Inchangé — voir décisions précédentes (email seul, jamais le téléphone, pas de soft matching). |
| `phone` | `text` | nullable | Collecté (Mobile Money, WhatsApp futur), jamais un signal de matching ou de fusion. Inchangé. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |
|  |  | unique `(space_id, email)` | Anciennement `(account_id, email)` — même logique, translatée à `space_id`. |

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))` — voir la fonction utilitaire définie dans la section `spaces`.
- Le fichier `supabase/migrations/0002_customers.sql` déjà écrit est maintenant doublement obsolète (il référence `accounts` directement, et sa numérotation devra changer une fois `currencies`/`countries`/`spaces` intercalées). Je ne le réécris pas encore — ça se fera avec toutes les autres migrations une fois le schéma entièrement validé.

---

## offers *(révisée)*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | Anciennement `account_id` — une offre appartient à un espace de vente, pas directement au compte. |
| `title` | `text` | not null | |
| `delivery_config` | `jsonb` | not null, check `jsonb_typeof(delivery_config) = 'object' and delivery_config ? 'type'` | Inchangé — la livraison est une propriété de l'offre, jamais optionnelle (PRD §6) ; `jsonb` pour accueillir de nouveaux types de livrables sans refonte ; `check` minimal (objet + discriminant `type`), validation fine par type laissée à l'app. |
| `base_price_amount` | `numeric(10,2)` | not null, default `0`, check `>= 0` | Montant nu — a besoin d'une devise (voir `base_price_currency`). Rôle **dépendant du `payment_mode`**, un seul champ pour trois usages plutôt qu'une colonne dédiée par mode : `'gratuit'` → figé à `0` ; `'unique'` → le prix fixe facturé, doit être `> 0` ; `'prix_libre'` → sert de **plancher minimal** que l'acheteur ne peut pas descendre en dessous (`0` = aucun plancher, l'acheteur choisit n'importe quel montant `> 0`). Pas de colonne séparée (`minimum_price_amount`) : le plancher et le prix fixe jouent le même rôle structurel ("le montant en dessous duquel on n'accepte pas"), ça n'aurait dupliqué qu'une notion déjà exprimée par `base_price_amount` + `payment_mode`. |
| `base_price_currency` | `text` | not null, references `currencies(code)` on delete restrict | Complète `base_price_amount`. **Doit toujours valoir la `currency_zone` du compte propriétaire de l'espace** — le PRD (§4) interdit explicitement de faire varier la devise par produit ou par lien ("la devise se décide au niveau du compte, jamais au niveau du produit ou du lien"). Donc pas une devise librement choisie par offre : une valeur dupliquée depuis `accounts.currency_zone` (via `space_id → spaces.account_id`), pour respecter la règle "montant + devise partout, y compris en base" sans pour autant l'exposer comme un choix. Sûr à dupliquer puisque `currency_zone` est immuable. Mécanisme d'enforcement (trigger qui recopie/valide à l'insert, plutôt qu'un simple défaut) — à confirmer, voir question ouverte. |
| `payment_mode` | `text` | not null, check `payment_mode in ('unique', 'gratuit', 'prix_libre')` | Mode de tarification de l'offre. Pas de "plusieurs fois" (paiement fractionné) pour l'instant — explicitement hors périmètre V1, **à reconfirmer avant d'écrire la migration** (pas juste une note en passant : si la réponse change, ça ajoute une valeur ici). `text` + `check` plutôt qu'un `enum` Postgres natif : ajouter une valeur plus tard ne demande qu'un nouveau `check`, pas un `ALTER TYPE ... ADD VALUE`. |
| `compare_at_price_amount` | `numeric(10,2)` | nullable, check `is null or > base_price_amount` | Prix barré affiché à côté du prix réel pour signaler une réduction. Réutilise `base_price_currency` — pas de colonne devise dédiée, un seul montant par ligne. Nullable : toutes les offres n'en ont pas. J'ai ajouté la contrainte `> base_price_amount` moi-même (pas explicitement demandée) parce qu'un prix barré inférieur ou égal au prix réel n'a pas de sens — dis-moi si tu préfères la retirer et laisser l'app seule décider. |
| `promo_price_amount` | `numeric(10,2)` | nullable, check `is null or (payment_mode = 'unique' and promo_price_amount < base_price_amount)` | Prix réellement facturé quand `promo_active` est vrai. N'a de sens que pour `payment_mode = 'unique'` — **contrainte explicite** plutôt qu'une simple confirmation en note, comme demandé. Doit aussi être `< base_price_amount` : une "promo" plus chère que le prix normal serait une corruption silencieuse (règle noyau de paiement). Réutilise `base_price_currency`. |
| `promo_active` | `boolean` | not null, default `false`, check `not promo_active or promo_price_amount is not null` | Bascule manuelle par le vendeur — pas de date de début/fin automatique pour l'instant (extension future : deux colonnes de date, pas une refonte). Le `check` empêche d'activer une promo sans prix promo défini. |
| `suggested_price_amount` | `numeric(10,2)` | nullable, check `is null or (payment_mode = 'prix_libre' and suggested_price_amount >= base_price_amount)` | Valeur pré-remplie proposée à l'acheteur en mode `prix_libre`, modifiable par lui. Distincte du plancher (`base_price_amount` dans ce mode) : j'ai ajouté `>= base_price_amount` pour qu'une suggestion ne soit jamais sous le plancher qu'elle est censée respecter — dis-moi si ce n'est pas l'intention. Réutilise `base_price_currency`. |
| `thumbnail_url` | `text` | nullable | Image de couverture, saisie par le vendeur (donnée brute, pas calculée). |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Contraintes croisées (toutes sur la même ligne, pas de sous-requête nécessaire) :**
```sql
-- payment_mode / base_price_amount
check (
  (payment_mode = 'gratuit' and base_price_amount = 0)
  or (payment_mode = 'unique' and base_price_amount > 0)
  or (payment_mode = 'prix_libre' and base_price_amount >= 0)
)

-- compare_at_price_amount : plus grand que le prix réel, si présent
check (compare_at_price_amount is null or compare_at_price_amount > base_price_amount)

-- promo_price_amount : uniquement en mode 'unique', et strictement moins cher
check (
  promo_price_amount is null
  or (payment_mode = 'unique' and promo_price_amount < base_price_amount)
)

-- promo_active : ne peut pas être activée sans prix promo
check (not promo_active or promo_price_amount is not null)

-- suggested_price_amount : uniquement en mode 'prix_libre', jamais sous le plancher
check (
  suggested_price_amount is null
  or (payment_mode = 'prix_libre' and suggested_price_amount >= base_price_amount)
)
```

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))` — même fonction utilitaire que `customers`.
- Pas de colonne `delivery_type` séparée — inchangé, voir raisonnement précédent.
- Colonnes directes sur `offers`, pas de table séparée — ce sont des montants simples sans cycle de vie propre (pas d'historique de promo à garder, pas d'entité qui vivrait indépendamment de l'offre).
- Ces champs (`base_price_amount`, `base_price_currency`, `payment_mode`, `compare_at_price_amount`, `promo_price_amount`, `promo_active`, `suggested_price_amount`) seront repris **nullable** sur `payment_links` : `null` = hérite de l'offre, une valeur = surcharge propre au lien (à faire dans la table suivante).

**Deux ajouts de ma part à confirmer** (contraintes non explicitement demandées, mais qui découlent du bon sens métier — dis-moi si je dois les retirer) :
1. `compare_at_price_amount > base_price_amount` obligatoire dès qu'il est renseigné.
2. `suggested_price_amount >= base_price_amount` obligatoire dès qu'il est renseigné.

**Question ouverte avant validation :**
`base_price_currency` doit toujours refléter `accounts.currency_zone` (via l'espace) — je propose un trigger qui la fixe automatiquement à l'insert (pas de valeur libre acceptée en entrée), plutôt qu'un simple `default` que l'app pourrait outrepasser. Ça te va, ou une validation uniquement côté app suffit ?

**Confirmé** — l'identité client (`customers`) se résout par espace, pas par compte : deux boutiques d'un même vendeur produisent deux `customer_id` distincts et sans lien structurel pour un même acheteur. Choix assumé, pas de vue client unifiée cross-espaces en l'état.

---

## payment_links

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `offer_id` | `uuid` | not null, references `offers(id)` on delete restrict | `restrict` et non `cascade`, à la différence des autres FK de ce schéma : un lien de paiement est l'entrée réelle du checkout, relié à des `transactions` (0007). Autoriser la suppression en cascade d'une offre effacerait silencieusement des liens actifs et menacerait par ricochet l'historique de transactions qui s'y attache. Supprimer une offre qui a des liens doit être un geste explicite et bloqué par défaut — cohérent avec la rigueur "noyau de paiement" (aucune corruption silencieuse). |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger (jamais saisi directement) | **Nouveau — revient sur ma position précédente ("pas de `space_id` dupliqué").** Nécessaire pour de vraies raisons structurelles, pas pour du confort de lecture : l'unicité de `slug` est **par espace** (précision de ce tour-ci), et Postgres a besoin que les deux colonnes d'un `unique (space_id, slug)` vivent sur la même ligne — un `check` ne peut pas faire une unicité inter-lignes via une jointure. Recalculé automatiquement depuis `offer_id → offers.space_id` par un trigger `before insert or update of offer_id` (voir plus bas), donc ne peut jamais diverger de la vérité — ce n'est pas comparable à un compteur qu'on choisirait de ne pas stocker. `on delete restrict` (pas `cascade`) : supprimer un espace qui a encore des liens actifs doit être bloqué, pour la même raison que `offer_id` l'est déjà — sinon la suppression d'un espace court-circuiterait la protection posée sur `offer_id` en supprimant les liens par un tout autre chemin. |
| `title` | `text` | not null | |
| `description` | `text` | nullable | |
| `base_price_amount` | `numeric(10,2)` | nullable, voir contrainte croisée ci-dessous | `null` = hérite du prix de l'offre. Une valeur = surcharge propre au lien — cas d'usage explicite du PRD §5 : "un même produit vendu à plusieurs prix... un lien pour les étudiants, un pour les entreprises". Pas de `base_price_currency` sur cette table : le PRD §4 interdit explicitement de faire varier la devise par lien ("la devise se décide au niveau du compte, jamais au niveau du produit ou du lien") — seul le montant se surcharge, la devise reste toujours celle de l'offre. |
| `payment_mode` | `text` | nullable, voir contrainte croisée ci-dessous | `null` = hérite du mode de l'offre. Une valeur = surcharge. |
| `slug` | `text` | not null, unique `(space_id, slug)`, check `slug ~ '^[a-z0-9-]+$'`, rejeté si présent dans `reserved_slugs` (trigger) | **Correction : unique par espace, pas globalement** — le sous-domaine (`spaces.slug`) garantit déjà l'unicité à l'échelle de la plateforme ; route publique `{space_slug}.siopay.io/c/{slug}`. Généré depuis `title`, normalisé, suffixe numérique en cas de collision **dans le même espace** (`mon-produit`, `mon-produit-2`...) — même filet de sécurité générique que `spaces.slug` si `title` ne produit rien de valide. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Contrainte croisée `payment_mode` / `base_price_amount` :**
```sql
check (
  (base_price_amount is null and payment_mode is null)  -- héritage complet de l'offre
  or (
    base_price_amount is not null and payment_mode is not null  -- surcharge complète, jamais partielle
    and (
      (payment_mode = 'gratuit' and base_price_amount = 0)
      or (payment_mode = 'unique' and base_price_amount > 0)
      or (payment_mode = 'prix_libre' and base_price_amount >= 0)
    )
  )
)
```
Surcharge **tout ou rien** — pas de cas "je change juste le prix, le mode reste hérité" : valider un montant contre un mode nécessiterait sinon d'aller lire `offers.payment_mode` dans un trigger (le mode hérité n'est pas connu au moment où Postgres évalue un `check` sur la seule ligne de `payment_links`). Si tu veux vraiment pouvoir surcharger l'un sans l'autre, il faudra un trigger plutôt qu'un `check`.

**Trigger de synchronisation `space_id` (depuis `offer_id`) :**
```sql
create or replace function set_payment_link_space_id()
returns trigger
language plpgsql
as $$
begin
  select o.space_id into new.space_id
  from offers o
  where o.id = new.offer_id;
  return new;
end;
$$;

create trigger payment_links_set_space_id
  before insert or update of offer_id on payment_links
  for each row
  execute function set_payment_link_space_id();
```

**Trigger de rejet des slugs réservés — manquant à l'écrit jusqu'ici (relecture d'ensemble, Section A) :** la fonction partagée `reject_reserved_slug()` était documentée comme réutilisée par `spaces`, `payment_links` et `sales_pages` (section `reserved_slugs`), mais seul l'attachement sur `spaces` était explicitement écrit. Ajouté ici :
```sql
create trigger payment_links_reject_reserved_slug
  before insert or update of slug on payment_links
  for each row
  execute function reject_reserved_slug();
```

**Notes (hors tableau) :**
- RLS : maintenant que `space_id` existe en colonne réelle, retour au pattern simple — `for select to authenticated using ((select private.user_owns_space(space_id)))`, plus besoin du `exists`/join vers `offers`.
- Pas de colonne devise (imposé par le PRD, pas un choix) ; pas d'extension de `compare_at_price_amount` / `promo_price_amount` / `promo_active` / `suggested_price_amount` à cette table pour l'instant — ajoutable plus tard sans refonte si le besoin de surcharge par lien se confirme.
- Ordre de migration : après `offers` (dépend de `offer_id`) et après `spaces`/`reserved_slugs`.

---

## sales_pages

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `payment_link_id` | `uuid` | not null, unique, references `payment_links(id)` on delete cascade | `not null` — PRD §5 : une page de vente est *toujours* rattachée à un lien de paiement, c'est la relation inverse (un lien sans page) qui est optionnelle. `unique` en plus : PRD décrit la page comme "la vitrine publique **d'un** lien de paiement" (singulier) — j'en déduis une relation 1:1, pas un lien avec plusieurs pages candidates. C'est une inférence de ma part, pas une phrase explicite du PRD — dis-moi si un lien doit pouvoir porter plusieurs pages (versions/A-B test) un jour. `on delete cascade` — demandé explicitement : si le lien disparaît, sa page n'a plus de raison d'exister. |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger (jamais saisi directement) | Même raisonnement que sur `payment_links` : requis pour un `unique (space_id, slug)` réel (le slug de la page est aussi scoping par espace). Recalculé depuis `payment_link_id → payment_links.space_id` par trigger — un seul saut maintenant que `payment_links` porte déjà `space_id`. `on delete restrict`, cohérence avec `payment_links`. |
| `title` | `text` | not null | Ajouté ce tour-ci — sert d'ancre pour la génération du `slug` et de nom lisible dans le dashboard vendeur (liste des pages). Volontairement séparé de `content` (jsonb) : trop fragile à interroger pour un slug, sa forme dépend du template. |
| `slug` | `text` | not null, unique `(space_id, slug)`, check `slug ~ '^[a-z0-9-]+$'`, rejeté si présent dans `reserved_slugs` (trigger) | Ajouté ce tour-ci — namespace **indépendant** de `payment_links.slug` : routes publiques distinctes (`{space_slug}.siopay.io/sales/{slug}` vs `.../c/{slug}`), donc un lien et sa page peuvent partager la même valeur sans collision. Généré depuis `title`, même algorithme (normalisation, suffixe numérique, filet de sécurité) que `payment_links.slug`. |
| `template_id` | `text` | not null | Pas de `check` restreignant à une liste de valeurs, et pas de table `templates` séparée — `plan.md` (ligne 353, S8) décrit un registre **côté code** (`lib/sales-pages/templates/index.ts`, une map `{ [template_id]: TemplateComponent }`), avec pour critère de validation explicite qu'ajouter un template ne demande qu'un fichier + un enregistrement dans la map (ligne 361), jamais une migration. Un `check` en base figerait la liste et casserait précisément cet objectif. La validité de `template_id` (le template existe-t-il vraiment ?) se vérifie à l'exécution contre le registre, pas en base. |
| `content` | `jsonb` | not null, default `'{}'::jsonb`, check `jsonb_typeof(content) = 'object'` | **Garde-fou ajouté en Section D**, cohérence avec `delivery_config` (seule colonne `jsonb` du schéma à avoir eu ce garde-fou jusqu'ici). Champs de texte remplis par le vendeur pour le template choisi — forme variable selon `template_id`, donc `jsonb` comme `delivery_config`. `default '{}'` plutôt que `not null` sans défaut (contrairement à `delivery_config` sur `offers`) : une page de vente se construit progressivement après le choix du template, alors qu'une offre sans livraison n'a jamais de sens même transitoirement. |
| `brand_color` | `text` | not null, default `'#1E6DF6'`, check `brand_color ~ '^#[0-9A-Fa-f]{6}$'` | Couleur de marque du **vendeur** pour sa page (à ne pas confondre avec les tokens `brand-*` de SioPay dans `app/globals.css`, qui habillent le dashboard, pas les pages publiques). Défaut = un hex valide plutôt qu'un `null` — la page doit toujours être rendable avec une couleur, même avant que le vendeur ne personnalise. Valeur de défaut arbitraire (reprend `brand-500` de SioPay faute de mieux) — à changer si tu as une couleur neutre plus appropriée pour une page vendeur. |
| `active_sections` | `jsonb` | not null, default `'{}'::jsonb`, check `jsonb_typeof(active_sections) = 'object'` | Sections activées/désactivées du template (PRD §5 : "active ou désactive des sections"). Forme dépendante du template comme `content`. Même garde-fou ajouté en Section D. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Trigger de synchronisation `space_id` (depuis `payment_link_id`) :**
```sql
create or replace function set_sales_page_space_id()
returns trigger
language plpgsql
as $$
begin
  select pl.space_id into new.space_id
  from payment_links pl
  where pl.id = new.payment_link_id;
  return new;
end;
$$;

create trigger sales_pages_set_space_id
  before insert or update of payment_link_id on sales_pages
  for each row
  execute function set_sales_page_space_id();
```

**Trigger de rejet des slugs réservés — manquant à l'écrit jusqu'ici (relecture d'ensemble, Section A), même remarque que sur `payment_links` :**
```sql
create trigger sales_pages_reject_reserved_slug
  before insert or update of slug on sales_pages
  for each row
  execute function reject_reserved_slug();
```

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))` — pattern simple maintenant que `space_id` est une colonne réelle, plus besoin de la chaîne à 4 sauts.
- **Pas de policy `anon`** pour la lecture publique de la page de vente, contrairement à `currencies`/`countries` : `plan.md` (corrigé, ligne 357) prévoit une route publique `app/sales/[slug]/page.tsx`, résolue sous le sous-domaine de l'espace, qui est un Server Component — elle lit via le client service role (bypasse RLS), pas via une clé anon côté client. Si un jour cette page fait des lectures côté client (temps réel, etc.), il faudra revisiter.
- Ordre de migration : après `payment_links` (dépend de `payment_link_id`) et après `spaces`/`reserved_slugs`.

---

## gateways

*Métadonnées d'affichage pour les agrégateurs (FedaPay, PayDunya...) — complète, sans le remplacer, le registre côté code `lib/payments/gateways/index.ts` qui porte la logique d'intégration technique. Objectif explicite : garantir par FK qu'une transaction ne peut jamais référencer un gateway inexistant, sans dupliquer la logique d'intégration en base.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `code` | `text` | primary key, check `code ~ '^[a-z0-9_]+$'` | **Écart volontaire à la convention `id uuid` d'AGENTS.md** : ici la clé naturelle (`fedapay`, `paydunya`) est aussi la clé technique utilisée par le registre côté code — dupliquer un `id uuid` séparé n'apporterait rien, ce serait une deuxième clé à tenir en synchro avec le nom du module de code. Même logique que pour `currencies`/`countries`, poussée un cran plus loin puisqu'il n'y a pas de libellé long à part `name`. |
| `name` | `text` | not null | Libellé affiché (ex. "FedaPay"). |
| `logo_url` | `text` | nullable | |
| `is_active` | `boolean` | not null, default `true` | Permet de désactiver un gateway (temporairement indisponible, ou retiré) sans supprimer la ligne — une suppression casserait la FK de toutes les transactions historiques qui le référencent. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS : même traitement que `currencies`/`countries` — `for select to anon, authenticated using (true)`, écriture réservée au service role.
- **Ajouter un gateway reste sans migration** au sens où `plan.md` l'entend (ligne 235 : "sans modifier le noyau") : ça demande une entrée dans le registre de code **et** une ligne insérée ici (un `insert`, pas un `alter table`) — le principe "pas de `check` figeant la liste" reste intact, cette table n'en est pas un, c'est un catalogue de données comme `currencies`.

---

## processors

*L'opérateur sous-jacent (MTN, Moov, Wave, Orange...), indépendant du pays et du gateway — objectif explicite : analyser la performance d'un opérateur à travers plusieurs pays et plusieurs gateways (ex. distinguer "MTN a un problème réseau général" de "FedaPay a un problème spécifiquement au Bénin").*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `code` | `text` | primary key, check `code ~ '^[a-z0-9_]+$'` | Même raisonnement que `gateways.code` — clé stable et lisible (`mtn`, `moov`, `wave`, `orange`), pas de `id uuid` séparé. |
| `name` | `text` | not null | Libellé affiché (ex. "MTN"). |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS : même traitement que `gateways`.
- Pas de `logo_url`/`is_active` ici — non demandés pour cette table, je n'extrapole pas depuis `gateways`. Dis-moi si tu veux le même traitement (désactivation sans suppression, logo pour un futur dashboard d'analyse par opérateur).

---

## payment_methods

*La méthode précise proposée à l'acheteur ("MTN Mobile Money Bénin", "Wave Sénégal") — catalogue normalisé, cross-gateway et cross-pays, pour agréger sans risquer des variantes de libellé. Colonnes déduites de ta description, pas explicitement spécifiées — à valider.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | Pas de clé naturelle évidente ici (contrairement à `gateways`/`processors`) — le libellé combine opérateur + pays + parfois type de produit, ce n'est pas un identifiant stable en soi. |
| `name` | `text` | not null, unique | Libellé affiché (ex. "MTN Mobile Money Bénin"). |
| `processor_code` | `text` | nullable, references `processors(code)` on delete restrict | Nullable : une méthode comme "Carte bancaire" n'a pas d'opérateur télécom sous-jacent. |
| `country_code` | `text` | nullable, references `countries(code)` on delete restrict | Nullable pour la même raison — une méthode générique (carte) peut être indépendante du pays. |
| `is_active` | `boolean` | not null, default `true` | Même logique que `gateways.is_active`. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Notes (hors tableau) :**
- RLS : même traitement que `gateways`/`processors`.
- **Hypothèse à confirmer :** ce catalogue est cross-gateway (une méthode existe indépendamment de qui l'expose), pas un sous-catalogue par gateway — nécessaire pour que l'analyse par `processor` (l'objectif que tu as donné) reste cohérente à travers plusieurs gateways. Si en pratique chaque gateway a ses propres libellés incompatibles entre eux, il faudra une table de mapping `gateway_code → raw_label → payment_method_id` plutôt qu'un catalogue plat — je ne l'ai pas construite faute de certitude sur ce point.

---

## checkout_sessions

*Nouvelle table — représente le parcours d'achat entier (arrivée sur le lien → succès / abandon / expiration), et non plus une tentative isolée. Répond directement au défaut identifié chez Chariow : sans regroupement explicite, plusieurs tentatives d'un même acheteur en quelques minutes n'ont aucun lien structurel entre elles.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger | Dérivé de `payment_link_id`, avec validation croisée que `customer_id` appartient au même espace — la logique qui vivait auparavant sur `transactions` migre ici, puisque c'est désormais `checkout_sessions` qui associe client et lien (voir trigger plus bas). |
| `customer_id` | `uuid` | not null, references `customers(id)` on delete restrict | L'acheteur ne change pas entre deux tentatives du même parcours — d'où sa présence ici plutôt que sur `transactions`. |
| `payment_link_id` | `uuid` | not null, references `payment_links(id)` on delete restrict | Idem : le produit ne change pas entre deux tentatives du même parcours. |
| `status` | `text` | not null, default `'ouverte'`, check dans `('ouverte', 'reussie', 'abandonnee', 'expiree')` | Cycle de vie du parcours entier — distinct du `payment_status` par tentative sur `transactions`. Le `check` valide l'appartenance à l'ensemble, pas les transitions (même répartition base/app que pour `payment_status`). |
| `expires_at` | `timestamptz` | not null | Pas de défaut — l'app doit toujours calculer et fournir une expiration explicite plutôt que reposer sur une valeur par défaut cachée en base, pour que la durée reste ajustable (ex. par palier) sans migration. C'est le levier direct que tu as demandé contre les faux "échecs répétés" causés par des sessions trop courtes. |
| `closed_at` | `timestamptz` | nullable, maintenu par trigger (jamais saisi directement) | `null` tant que `status = 'ouverte'`. Distinct de `expires_at` : l'un dit quand la session **expirerait** si rien ne se passe, l'autre dit quand elle s'est **réellement terminée**, quelle qu'en soit la raison (succès, abandon, ou expiration effective). Se remet à `null` si une session close est rouverte (voir garde-fou sur `transactions`, cas d'un webhook tardif), puis se re-remplit à la fermeture suivante. |
| `delivery_status` | `text` | not null, default `'pending'`, check dans `('pending', 'succeeded', 'failed')` | Migré depuis l'ancienne `transactions` — résultat du parcours entier, pas d'une tentative précise. |
| `is_test` | `boolean` | not null, default `false` | Migré depuis l'ancienne `transactions` — propriété du parcours, pas de la tentative. |
| `metadata` | `jsonb` | not null, default `'{}'::jsonb`, check `jsonb_typeof(metadata) = 'object'` | Garde-fou ajouté en Section D, cohérence avec `delivery_config`. Contexte du parcours : device, pays, attribution publicitaire (UTM, `fbclid`/`gclid`/`ttclid`...). Même logique `jsonb` flexible que `delivery_config`/`content` — nouvelle plateforme publicitaire = nouvelle clé, pas une colonne. Se distingue de la future colonne équivalente sur `events` (déjà notée pour plus tard) : ici c'est le contexte du parcours entier capté une fois à l'entrée, `events` capturera chaque étape individuellement. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Trigger de synchronisation `space_id` + validation croisée `customer_id`** (repris tel quel depuis l'ancienne version sur `transactions`, juste déplacé ici) :
```sql
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
```

**Trigger `closed_at`** (séparé du précédent — se déclenche sur `status`, pas sur `payment_link_id`/`customer_id`) :
```sql
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
```
Se déclenche aussi à l'`insert` (pas seulement à l'`update`) : le mécanisme proposé pour `payment_mode = 'gratuit'` crée une session directement avec `status = 'reussie'`, qui doit donc avoir `closed_at` renseigné dès la création, pas seulement lors d'une transition ultérieure.

**Ajout de ma part, non demandé explicitement :** un index unique partiel empêchant deux sessions **ouvertes** simultanées pour le même couple client/lien —
```sql
create unique index checkout_sessions_active_unique
  on checkout_sessions (customer_id, payment_link_id)
  where status = 'ouverte';
```
Même pattern que l'invariant déjà posé sur `account_plans` (une seule ligne active à la fois). Sans ça, rien n'empêche deux parcours "ouverts" concurrents pour le même acheteur sur le même lien — exactement le genre de flou que cette restructuration cherche à éliminer. Dis-moi si tu préfères le retirer.

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))`.
- Index sur `space_id` : `create index checkout_sessions_space_id_idx on checkout_sessions (space_id);`
- **Pas de `last_seen_at`** : la dernière visite du client sur cette session n'est pas une valeur à écraser à chaque passage, c'est un historique — mieux représenté par des lignes répétées `page_view` dans la future table `events`, référençant `session_id`, que par une colonne ici qui effacerait le fait que le client est revenu 3 fois avant d'acheter.
- **Précision apportée en concevant `events`** : `customer_id not null` implique que la ligne n'est créée qu'à partir de l'étape 2 du checkout (identité résolue), jamais à l'étape 1 (résumé, encore anonyme). Cette lecture n'était pas rendue explicite jusqu'ici — détail complet dans la section `events`.

---

## transactions *(révisée — tentative individuelle à l'intérieur d'une session)*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `session_id` | `uuid` | not null, references `checkout_sessions(id)` on delete restrict | Remplace `customer_id`/`payment_link_id`, qui migrent sur `checkout_sessions`. `restrict`, cohérent avec le reste de la table. |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger | Simple recopie depuis `session_id → checkout_sessions.space_id` (un seul saut, plus de validation croisée à faire ici — elle a déjà eu lieu à la création de la session). Dénormalisé pour la même raison qu'ailleurs : RLS sans jointure sur une table à fort volume. |
| `external_id` | `text` | not null, unique **`(gateway_credential_id, external_id)`** | **Révisé** — scope maintenant par `gateway_credential_id`, pas par `gateway`. Ça reste au moins aussi sûr que ma proposition précédente : un `gateway_credential_id` donné correspond à une seule connexion chez un seul agrégateur, donc deux external_id issus d'agrégateurs différents ne peuvent jamais entrer en collision ici — inutile de garder une colonne `gateway` séparée juste pour ça (voir ligne suivante). **Limite à noter** : Postgres ne considère jamais deux `null` comme égaux dans une contrainte `unique`, donc cette contrainte ne protège pas les lignes où `gateway_credential_id` est `null` (cas `gratuit`, voir plus bas) — complétée par un index partiel séparé pour ce cas précis. |
| `gateway_credential_id` | `uuid` | **nullable**, references `gateway_credentials(id)` on delete restrict | **Remplace `gateway`**, sur ta demande : une transaction doit pointer vers le jeu de clés précis qui l'a réellement traitée, pas juste vers le nom de l'agrégateur — si le vendeur révoque une connexion et en crée une nouvelle, l'historique ne doit pas se mélanger. Le nom de l'agrégateur (`gateway`) reste déductible en remontant `gateway_credential_id → gateway_credentials.gateway → gateways.code`, donc pas dupliqué ici. `restrict` : cohérent avec le reste de la table, protège l'historique financier. **Nullable plutôt que `not null`** : `gateway_credentials` est scopée par espace, donc il n'existe pas de ligne "passerelle" universelle à pointer pour une offre gratuite — `null` représente honnêtement "aucun jeu d'identifiants réel impliqué", plutôt qu'une ligne `gateway_credentials` factice à créer pour chaque espace juste pour ce cas. |
| `payment_method_id` | `uuid` | nullable, references `payment_methods(id)` on delete restrict | Nullable : une transaction tout juste créée (webhook `pending`/`processing`) peut ne pas encore exposer la méthode précise choisie par l'acheteur. |
| `processor_code` | `text` | nullable, references `processors(code)` on delete restrict | **Renommé de `processor_id` → `processor_code` lors de la relecture d'ensemble (Section A)** : référence `processors(code)`, un `text`, pas un `id uuid` — le suffixe `_id` était trompeur et incohérent avec `payment_methods.processor_code`/`country_code`, qui pointent vers les mêmes tables à clé `code`. Même remarque de fond que `payment_method_id` sinon. Aurait pu se déduire de `payment_method_id → payment_methods.processor_code`, mais je le garde en colonne directe sur `transactions` : contrairement à `space_id` (structurel, jamais interrogé isolément), l'objectif explicite ici est d'agréger **par processor** à travers gateways et pays — une colonne directe et indexable sert cette requête bien mieux qu'un double join à chaque fois. |
| `amount` | `numeric(10,2)` | not null, check `>= 0` | Inchangé. Montant réellement débité (peut différer de `base_price_amount` en mode `prix_libre`). |
| `currency` | `text` | not null, references `currencies(code)` on delete restrict | Inchangé — devise de passerelle réelle, pas automatiquement `currency_zone` (PRD §4). |
| `payment_status` | `text` | not null, default `'pending'`, check dans `('pending','processing','succeeded','failed','abandoned','refunded')` | Inchangé — statut de **cette tentative**, pas du parcours entier (`checkout_sessions.status`). |
| `failure_reason` | `text` | nullable, check dans `('solde_insuffisant', 'timeout_operateur', 'annulation_utilisateur', 'numero_invalide', 'inconnu')` | Inchangé. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Contrainte croisée `payment_status` / `failure_reason` (inchangée) :**
```sql
check ((payment_status = 'failed') = (failure_reason is not null))
```

**Trigger de synchronisation `space_id` (simplifié — plus de validation croisée ici) :**
```sql
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
```

**Ajout de ma part, non demandé explicitement :** un garde-fou empêchant d'ajouter une tentative à une session déjà close (`reussie`, `abandonnee`, `expiree`) —
```sql
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
```
Sans ça, rien n'empêche techniquement une tentative tardive de s'ajouter après coup à une session déjà expirée/abandonnée/réussie — ce qui viderait de son sens la distinction session/tentative qu'on vient de construire. Dis-moi si c'est trop strict (ex. un webhook en retard sur une session tout juste expirée devrait peut-être rouvrir la session plutôt qu'être rejeté — logique métier à trancher, pas une décision de schéma).

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))`.
- Index sur `session_id` (FK), `space_id`, `gateway_credential_id`, et `processor_code` (**ajouté en Section A** — l'objectif explicite d'agréger par processor, énoncé dans le "Pourquoi" de la colonne, n'était pas servi par un index) : `create index transactions_session_id_idx on transactions (session_id); create index transactions_space_id_idx on transactions (space_id); create index transactions_gateway_credential_id_idx on transactions (gateway_credential_id); create index transactions_processor_code_idx on transactions (processor_code);`
- Index partiel comblant la limite notée sur `external_id` quand `gateway_credential_id` est `null` : `create unique index transactions_external_id_null_gateway_unique on transactions (external_id) where gateway_credential_id is null;`

**Mécanisme révisé pour `payment_mode = 'gratuit'` (reprend la question posée précédemment, adapté à `gateway_credential_id`) :**
1. `checkout_sessions` : une ligne créée normalement (`customer_id`, `payment_link_id`), `status` passe directement à `'reussie'`, `delivery_status` suit le cycle habituel de livraison.
2. `transactions` : **une seule ligne**, créée immédiatement avec `payment_status = 'succeeded'` — pas de phase `pending`/`processing`, il n'y a rien à attendre.
   - `gateway_credential_id = null` — aucune connexion réelle impliquée (voir raisonnement sur la colonne). Plus besoin d'une ligne `gateways`/`gateway_credentials` factice comme dans la version précédente de cette proposition.
   - `external_id` : pas d'identifiant réel fourni par un tiers — je propose `'free-' || session_id` (unique par construction, puisque `session_id` l'est ; protégé par l'index partiel ci-dessus).
   - `amount = 0`, `currency` = celle de l'offre/lien effectif (toujours renseignée, jamais nue).
   - `payment_method_id`, `processor_code` : `null` — aucun opérateur ni méthode réels impliqués.

C'est une proposition, pas une certitude absolue — dis-moi si tu vois un cas où une offre gratuite ne devrait produire ni session ni transaction du tout (juste un `event` + livraison directe).

---

## gateway_credentials

*Table absente du schéma jusqu'ici, jamais conçue formellement — le modèle BYO Gateway du PRD (§4) : le vendeur connecte ses propres clés API chez un agrégateur, SioPay ne détient aucun fonds ni compte marchand, et utilise ces clés uniquement pour initier des paiements au nom du vendeur.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | **Cascade, pas `restrict`** — contrairement au reste des tables proches du noyau de paiement (`payment_links`, `checkout_sessions`, `transactions`). Différence délibérée : cette table ne porte pas d'historique financier irremplaçable, elle porte un secret actif. Rien ne justifie de bloquer la suppression d'un espace pour préserver des identifiants de connexion — au contraire, minimiser la durée de vie des secrets stockés est une bonne pratique de sécurité en soi. |
| `gateway` | `text` | not null, references `gateways(code)` on delete restrict | Quelle passerelle. `restrict` classique : un gateway référencé par une connexion active ne doit pas disparaître silencieusement. `transactions` ne référence plus `gateways` directement — elle passe maintenant par `gateway_credentials.id`, et déduit l'agrégateur en remontant jusqu'ici (voir `transactions.gateway_credential_id`). |
| `credentials_encrypted` | `bytea` | not null | **Confirmé** : un objet JSON structuré multi-clés (ex. `{ "api_key": "...", "secret_key": "...", "merchant_id": "..." }` — la forme exacte dépend du gateway, définie côté code) sérialisé puis chiffré **comme un seul bloc**, pas champ par champ. Chiffrement **applicatif** (`libsodium-wrappers`, pas `pgcrypto` côté SQL) — mécanisme déjà tranché dans `plan.md` (S2, point 4), repris tel quel. `bytea` parce que le résultat du chiffrement est binaire. Détail de la clé et de sa gouvernance : voir la note sécurité ci-dessous et l'ajout à `AGENTS.md`. |
| `currency` | `text` | not null, references `currencies(code)` on delete restrict | Devise de passerelle (PRD §4, notion 3) — distincte de `accounts.currency_zone`. Pré-remplie avec `currency_zone` dans le cas standard (logique applicative, pas une contrainte de schéma), mais **reste modifiable** : contrairement à `offers.base_price_currency`, aucun trigger ne force l'égalité ici, la divergence est un cas normal explicitement prévu par le PRD. |
| `is_default` | `boolean` | not null, default `false`, check `not is_default or status = 'active'` | Passerelle utilisée par défaut pour router les paiements. Ajout de ma part : une connexion désactivée/révoquée ne devrait jamais pouvoir rester "par défaut" — sinon le routage des paiements pointerait silencieusement vers une connexion morte. Voir aussi l'index unique partiel ci-dessous. |
| `status` | `text` | not null, default `'active'`, check dans `('active', 'desactivee', 'revoquee', 'archivee')` | **Remplace `is_active`.** `connectee`/`active` fusionnés : je n'ai pas trouvé de vérification de clés au moment de la connexion dans `plan.md` (S4 décrit `PaymentGateway`/webhooks, jamais un test de credentials à la création) — sans un tel mécanisme qui l'alimenterait réellement, `connectee` serait un état mort, jamais quitté automatiquement. Si un test de connexion est construit plus tard, réintroduire la distinction est un ajout de valeur, pas une refonte. `desactivee` (coupée manuellement, réversible) / `revoquee` (le vendeur a explicitement coupé l'accès à cette connexion — pas juste "désactivée", un acte plus définitif) / `archivee` (devenue obsolète parce que le vendeur en a créé une nouvelle pour la remplacer, sans révocation active de sa part — ex. mise à jour de ses clés) sont trois états distincts, comme demandé : `revoquee` porte une intention explicite du vendeur, `archivee` un remplacement passif côté produit. Pas de `check` sur les *transitions*, seulement sur l'appartenance à l'ensemble — même répartition base/app que `payment_status`/`checkout_sessions.status`. |
| `status_updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | Horodatage du dernier changement de `status`. Une seule date, pas un historique complet des transitions — si le besoin se confirme plus tard, le pattern `account_plans`/`checkout_sessions` (table séparée avec `ended_at`) sera réutilisable, comme tu l'as noté. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Trigger `status_updated_at` :**
```sql
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
```
`status_updated_at` a déjà `default now()` pour la valeur initiale à l'`insert` — le trigger ne gère que les changements ultérieurs (`OLD`/`NEW` n'existent qu'en `update`).

**Invariant — une seule passerelle par défaut par espace :**
```sql
create unique index gateway_credentials_default_unique
  on gateway_credentials (space_id)
  where is_default;
```
Même pattern que `account_plans` et `checkout_sessions`.

**Pas de colonne "dernière utilisation" — confirmé.** Se déduit par `max(created_at)` sur `transactions` filtré par `gateway_credential_id`, maintenant que la référence est correcte. Cohérent avec le principe déjà appliqué partout ailleurs dans ce schéma.

**Sécurité — aucun accès client, même au propriétaire :**
- RLS **activée** (obligatoire, sans exception, AGENTS.md), mais **aucune policy `select`/`insert`/`update`/`delete` pour `anon` ni `authenticated`** — contrairement à toutes les autres tables métier de ce schéma qui utilisent `private.user_owns_space(space_id)`. Cette table n'est accessible que via le service role, côté serveur uniquement.
- Concrètement : même l'écran dashboard "mes passerelles connectées" (liste, toggle `is_default`/`status`) passe par une Server Action / route serveur utilisant `createServerClient()` (service role), jamais une requête directe depuis le client avec la clé anon — pas de lecture directe du vendeur sur cette table, RLS ou pas.
- **Délibérément pas de vue** (`view`) exposant les colonnes non sensibles (`gateway`, `currency`, `is_default`, `status`) en lecture pour `authenticated` : Postgres RLS est en lignes, pas en colonnes — une vue qui omettrait `credentials_encrypted` réglerait le problème, mais ajoute une deuxième surface à maintenir en synchro avec le schéma. Je préfère qu'absolument aucun accès direct client n'existe sur ce nom de table, point final, plutôt qu'un accès partiel qu'il faut auditer à chaque migration. Dis-moi si tu préfères quand même la vue.
- Le déchiffrement (`lib/crypto/encrypt.ts`) ne s'exécute que dans le code serveur qui appelle effectivement la passerelle — jamais dans un chemin qui retournerait la valeur déchiffrée dans une réponse API, conforme à AGENTS.md.
- **Clé de chiffrement** : une variable d'environnement serveur (`ENCRYPTION_KEY`), jamais en base, jamais versionnée dans le repo. Ajoutée au tableau des variables d'environnement d'`AGENTS.md`, avec gouvernance documentée : accès en V1 limité au propriétaire du projet via les variables d'environnement Vercel (pas d'équipe, pas d'accès partagé), à revoir dès l'arrivée d'un premier collaborateur technique — et une procédure de régénération proposée.

**Notes (hors tableau) :**
- Pas de contrainte `unique (space_id, gateway)` : un vendeur pourrait légitimement vouloir connecter deux fois le même agrégateur (comptes marchands séparés, devises différentes) — je n'ai pas ajouté cette restriction faute de certitude que ce soit voulu. Dis-moi si un seul compte par gateway et par espace doit être imposé.

---

## daily_visit_counts

*Nouvelle table — remplace l'idée d'un `page_view` par événement. Compteurs, pas un journal : une ligne par (cible, jour, dimension de ventilation), incrémentée en place à chaque visite plutôt qu'une ligne par visite.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade, maintenu par trigger | Dérivé de la cible renseignée (`payment_link_id`, `offer_id`, ou `sales_page_id` — un seul des trois, voir plus bas). |
| `payment_link_id` | `uuid` | nullable, references `payment_links(id)` on delete cascade | |
| `offer_id` | `uuid` | nullable, references `offers(id)` on delete cascade | |
| `sales_page_id` | `uuid` | nullable, references `sales_pages(id)` on delete cascade | |
| `visit_date` | `date` | not null | `date`, pas `timestamptz` — c'est un compteur par jour civil, pas un horodatage précis. **Fuseau horaire pour la frontière du jour : hypothèse UTC pour l'instant**, faute d'une notion de fuseau par espace dans le schéma actuel — à revoir si des vendeurs dans des fuseaux très éloignés (au-delà de l'Afrique de l'Ouest, où UTC/UTC+1 rend la différence négligeable) rejoignent la plateforme. |
| `dimension_type` | `text` | not null, check dans `('total', 'pays', 'appareil', 'os')` | **Corrigé en Section D : anglais → français.** Ventilations **indépendantes**, pas combinées — voir raisonnement structure ci-dessous. `country`/`device` étaient en anglais, contre mon propre pattern respecté partout ailleurs dans ce schéma (`payment_mode`, `checkout_sessions.status`, `failure_reason`, `promo_codes.discount_type`/`source`...) — une incohérence que j'avais introduite moi-même, pas héritée de `plan.md`/PRD. `os` reste tel quel : un acronyme, pas un mot à traduire. |
| `dimension_value` | `text` | nullable, check `(dimension_type = 'total') = (dimension_value is null)` | La valeur pour ce type de ventilation (ex. `'BJ'` pour `pays`, `'mobile'` pour `appareil`) — `null` uniquement pour la ligne `'total'`. |
| `impressions` | `integer` | not null, default `0`, check `>= 0` | Incrémenté à chaque visite, y compris rechargée. |
| `unique_visits` | `integer` | not null, default `0`, check `>= 0 and unique_visits <= impressions` | Incrémenté seulement à la première visite du jour pour cette cible (voir `visit_dedup`). Le `check <= impressions` empêche une incohérence arithmétique évidente. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | Ici `updated_at` a un vrai sens contrairement à `events` — cette table est incrémentée en place, pas append-only. |

**Contrainte — exactement une cible renseignée :**
```sql
check (num_nonnulls(payment_link_id, offer_id, sales_page_id) = 1)
```

**Structure des dimensions — "pas de ventilation combinée", proposée pour éviter la multiplication des lignes :**

Chaque dimension (pays, appareil, OS — **pas de "ville" au final, voir note**) produit ses propres lignes indépendantes plutôt qu'un produit cartésien. Pour une cible et un jour donnés : 1 ligne `total`, + une ligne par pays vu ce jour-là, + une ligne par appareil, + une ligne par OS. Le nombre de lignes est une **somme** (total + pays distincts + appareils distincts + OS distincts ce jour-là), pas un **produit** (pays × appareils × OS) — c'est ce qui évite l'explosion combinatoire que tu demandais d'éviter.

**Compromis à connaître** : cette structure ne permet pas de croiser deux dimensions dans une même requête (ex. "visites mobile spécifiquement depuis le Bénin") sans revenir à `visit_dedup`/logs bruts — chaque dimension se lit indépendamment. Si le croisement devient un besoin réel, la structure changerait (soit une ligne par combinaison réellement observée, avec le risque combinatoire assumé, soit une dimension composite `"BJ|mobile"` en `dimension_value` avec un `dimension_type` dédié). Je ne l'ai pas construit préventivement.

**Note sur "ville"** : tu la mentionnes dans ta dernière consigne ("pays, ville, device, OS") mais pas dans la description initiale de `daily_visit_counts` ("pays, device"). Je ne l'ai pas ajoutée comme quatrième `dimension_type` — le nombre de villes distinctes par jour peut être nettement plus élevé que pays/appareil/OS (des dizaines, pas une poignée), ce qui pèse plus lourd sur le nombre de lignes que les trois autres dimensions combinées. Dis-moi si tu la veux quand même, je l'ajoute comme un `dimension_type` de plus (`'ville'`), le mécanisme reste identique.

**Contraintes d'unicité (une par cible, pour contourner le fait que Postgres ne considère jamais deux `null` comme égaux — sans quoi `payment_link_id`/`offer_id`/`sales_page_id` étant `null` sur 2 des 3 colonnes en permanence, une contrainte unique naïve sur les trois ne bloquerait jamais rien) :**
```sql
create unique index daily_visit_counts_payment_link_unique
  on daily_visit_counts (payment_link_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where payment_link_id is not null;

create unique index daily_visit_counts_offer_unique
  on daily_visit_counts (offer_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where offer_id is not null;

create unique index daily_visit_counts_sales_page_unique
  on daily_visit_counts (sales_page_id, visit_date, dimension_type, coalesce(dimension_value, ''))
  where sales_page_id is not null;
```
Le `coalesce(dimension_value, '')` existe pour la même raison : sans lui, deux lignes `'total'` (où `dimension_value` est `null`) pour la même cible/jour ne se bloqueraient pas non plus. Ces index servent aussi de cible à l'`upsert` applicatif (`on conflict ... do update set impressions = impressions + 1`).

**Trigger de synchronisation `space_id` :**
```sql
create or replace function set_daily_visit_count_space_id()
returns trigger
language plpgsql
as $$
begin
  if new.payment_link_id is not null then
    select space_id into new.space_id from payment_links where id = new.payment_link_id;
  elsif new.offer_id is not null then
    select space_id into new.space_id from offers where id = new.offer_id;
  elsif new.sales_page_id is not null then
    select space_id into new.space_id from sales_pages where id = new.sales_page_id;
  end if;
  return new;
end;
$$;

create trigger daily_visit_counts_set_space_id
  before insert or update of payment_link_id, offer_id, sales_page_id on daily_visit_counts
  for each row
  execute function set_daily_visit_count_space_id();
```

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))` — pattern standard, à la différence de `gateway_credentials`/`integrations` : rien de sensible ici, le vendeur doit pouvoir lire ses propres stats.
- Précis, pas de HyperLogLog ni d'approximation, comme demandé — `unique_visits` est un compteur entier exact, garanti par `visit_dedup` (table suivante).

---

## visit_dedup

*Sert uniquement à savoir si un `visitor_id` (cookie anonyme, jamais stocké dans une table de "visiteurs connus" — le cookie porte l'identité, rien à chercher) a déjà été compté aujourd'hui pour une cible donnée. Alimente `unique_visits` sur `daily_visit_counts`.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade, maintenu par trigger | Même mécanique que `daily_visit_counts`, pour cohérence — cette table n'est en pratique jamais lue par le vendeur (voir RLS), mais l'activer coûte peu et respecte la règle "RLS partout" sans exception. |
| `visitor_id` | `uuid` | not null | Valeur du cookie posé côté serveur à la première visite. Pas de FK vers une table de visiteurs : il n'y en a pas, par design — c'est le cookie qui porte l'identité, cette table ne fait que l'enregistrer par (cible, jour). |
| `payment_link_id` | `uuid` | nullable, references `payment_links(id)` on delete cascade | |
| `offer_id` | `uuid` | nullable, references `offers(id)` on delete cascade | |
| `sales_page_id` | `uuid` | nullable, references `sales_pages(id)` on delete cascade | |
| `visit_date` | `date` | not null | Même hypothèse UTC que `daily_visit_counts`, cohérence obligatoire entre les deux tables (sinon le dédoublonnage se désynchronise du compteur qu'il alimente). |
| `created_at` | `timestamptz` | not null, default `now()` | Première fois vu aujourd'hui pour cette cible. Pas de `updated_at` : une ligne existe ou n'existe pas, jamais modifiée. |

**Contrainte — exactement une cible renseignée (identique à `daily_visit_counts`) :**
```sql
check (num_nonnulls(payment_link_id, offer_id, sales_page_id) = 1)
```

**Contraintes d'unicité (une par cible, même raisonnement `coalesce`/partiel que `daily_visit_counts`, sans la complication `dimension_value` ici) :**
```sql
create unique index visit_dedup_payment_link_unique
  on visit_dedup (visitor_id, payment_link_id, visit_date)
  where payment_link_id is not null;

create unique index visit_dedup_offer_unique
  on visit_dedup (visitor_id, offer_id, visit_date)
  where offer_id is not null;

create unique index visit_dedup_sales_page_unique
  on visit_dedup (visitor_id, sales_page_id, visit_date)
  where sales_page_id is not null;
```
**C'est cette contrainte elle-même, pas une vérification applicative préalable, qui sert de garde-fou contre le double comptage en cas de requêtes concurrentes** (deux requêtes quasi simultanées du même visiteur) — un `insert ... on conflict do nothing` : si l'insertion réussit, c'est une visite unique (incrémenter `unique_visits`) ; si elle échoue sur la contrainte, ce visiteur a déjà été compté aujourd'hui (incrémenter seulement `impressions`).

**Trigger de synchronisation `space_id`** (même fonction que `daily_visit_counts`, adaptée) :
```sql
create or replace function set_visit_dedup_space_id()
returns trigger
language plpgsql
as $$
begin
  if new.payment_link_id is not null then
    select space_id into new.space_id from payment_links where id = new.payment_link_id;
  elsif new.offer_id is not null then
    select space_id into new.space_id from offers where id = new.offer_id;
  elsif new.sales_page_id is not null then
    select space_id into new.space_id from sales_pages where id = new.sales_page_id;
  end if;
  return new;
end;
$$;

create trigger visit_dedup_set_space_id
  before insert or update of payment_link_id, offer_id, sales_page_id on visit_dedup
  for each row
  execute function set_visit_dedup_space_id();
```

**Notes (hors tableau) :**
- RLS : activée, mais **aucune policy `select`/`insert`/`update`/`delete` pour `anon` ni `authenticated`** — cette table ne sert qu'en interne au mécanisme de dédoublonnage (écriture service role depuis les routes publiques), le vendeur n'a jamais besoin de la lire directement (ses stats passent par `daily_visit_counts`). Pas pour une raison de confidentialité comme `gateway_credentials` — juste que rien côté produit n'en a l'usage.
- **Nettoyage périodique, pas dans ce schéma** : les lignes de plus de quelques jours n'ont plus d'utilité (la question posée est toujours "es-tu déjà passé aujourd'hui"), contrairement à `events`/`transactions` conservées indéfiniment. Ajouté comme tâche de fond à `plan.md` (S10, `inngest/functions/visit-dedup-cleanup.ts`) plutôt que documenté ici.
- Cohérence avec `daily_visit_counts` : `space_id` dupliqué indépendamment ici plutôt que déduit de `daily_visit_counts` — les deux tables n'ont pas de lien structurel direct entre elles (pas de FK de l'une vers l'autre), chacune dérive `space_id` depuis la même cible.

---

## events

*Journal d'événements append-only — PRD §13 : "Tous les événements se rattachent [au client] : visites, tentatives de paiement, échecs avec leur cause, achats, livraisons, relances reçues..." **Révisé ce tour-ci : plus aucune notion d'un événement par impression de page.** Une campagne sponsorisée générant des milliers de visites en quelques heures ne doit jamais devenir des milliers de lignes `events` — le trafic de page vit désormais dans `daily_visit_counts`/`visit_dedup` (compteurs, pas un journal). `events` reste réservée aux moments à valeur individuelle réelle dans la timeline d'achat : `checkout_started`, `checkout_step_completed`, `payment_attempted`, `payment_succeeded`, `payment_failed`, et ce qui suivra (`delivery_failed_persistent`, `no_purchase_since`...).*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | **Fourni directement par le code serveur, pas dérivé par trigger** — à la différence de `payment_links`/`transactions`/etc. Raison structurelle : `checkout_started` (étape 1) peut survenir **avant** toute identité client ou session de checkout (`customer_id`/`session_id`/`transaction_id` tous `null` à ce stade), donc il n'y a rien à dériver depuis une autre colonne de la ligne. Le serveur qui logue l'événement connaît déjà l'espace (résolu depuis le sous-domaine), donc la valeur est fiable sans dérivation. `cascade` plutôt que `restrict` : c'est un journal, pas une source de vérité financière — la vérité financière reste dans `transactions`. |
| `customer_id` | `uuid` | nullable, references `customers(id)` on delete cascade | **Nullable, à la différence du `customer_id not null` posé partout ailleurs.** Nécessaire : l'identité n'est résolue que **pendant** l'étape 2 du checkout (PRD/`plan.md` S7) — `checkout_started` (étape 1) et le premier `checkout_step_completed` (fin de l'étape 1) précèdent la résolution d'identité. Devient `not null` en pratique à partir du `checkout_step_completed` marquant la fin de l'étape 2, et pour tous les événements de paiement, mais rien ne l'impose en base (voir note sur `type`). |
| `session_id` | `uuid` | nullable, references `checkout_sessions(id)` on delete cascade | Rattache l'événement à un parcours d'achat, mais seulement **une fois l'identité résolue** : `checkout_step_completed` à partir de la fin de l'étape 2, et tout `payment_*`. `null` pour `checkout_started` et la première occurrence de `checkout_step_completed` (fin de l'étape 1, arrivée à l'étape 2, encore anonyme). Aucune ligne `checkout_sessions` n'existe avant ce moment — tranché explicitement, voir section dédiée plus bas. |
| `transaction_id` | `uuid` | nullable, references `transactions(id)` on delete cascade | Rattache l'événement à une tentative précise (`payment_attempted`, `payment_succeeded`, `payment_failed`). `null` pour tout le reste. |
| `type` | `text` | not null | **Pas de `check` de liste** — même raisonnement que `gateway`/`template_id`. La liste connue aujourd'hui (`checkout_started`, `checkout_step_completed`, `payment_attempted`, `payment_succeeded`, `payment_failed` — `page_view` retiré, `plan.md` ligne 80 corrigée) grossit déjà ailleurs dans le plan (`delivery_failed_persistent` en S9, `no_purchase_since` pour le playbook client dormant en S15-16) — un `check` figé demanderait une migration à chaque nouveau type d'événement ou déclencheur d'automatisation, ce que le reste du schéma évite systématiquement. Validation contre une union TypeScript côté app (`lib/analytics/events.ts`, `plan.md` S3). |
| `payload` | `jsonb` | not null, default `'{}'::jsonb`, check `jsonb_typeof(payload) = 'object'` | Garde-fou ajouté en Section D, cohérence avec `delivery_config`. Données propres à chaque type d'événement — numéro d'étape pour `checkout_step_completed`. **L'attribution publicitaire (UTM, `fbclid`/`gclid`/`ttclid`) se capture maintenant sur `checkout_started`**, pas sur un `page_view` qui n'existe plus : c'est le premier moment à volume raisonnable (une intention d'achat, pas une simple impression) où la capturer a un coût acceptable. Elle est ensuite recopiée dans `checkout_sessions.metadata` une fois la session créée (étape 2) — capture précoce, portée jusqu'au bout du parcours malgré l'anonymat initial (voir note dans `checkout_sessions`). `jsonb` plutôt que des colonnes dédiées, même logique que `delivery_config` — nouveau paramètre de tracking = nouvelle clé, pas une colonne. |
| `created_at` | `timestamptz` | not null, default `now()` | |

**Pas de `updated_at` — déviation volontaire de la convention AGENTS.md.** Un événement est un fait immuable : le modifier après coup viderait de son sens la timeline qu'il sert à reconstruire (cohérent avec "aucune corruption silencieuse"). `plan.md` ligne 55 ne liste d'ailleurs que `created_at` pour cette table, sans `updated_at` — confirmation indépendante que c'est la bonne lecture.

**Garde-fou de cohérence (pas une dérivation — `space_id` est fourni, pas calculé) :**
```sql
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
```
Vérifie, quand elles sont présentes, que `customer_id`/`session_id`/`transaction_id` appartiennent bien à l'espace déclaré — sans pouvoir dériver `space_id` lui-même puisque, pour `checkout_started` (ou la première occurrence de `checkout_step_completed`), les trois peuvent être `null` simultanément.

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))`. Pas de policy `anon` en écriture non plus : `checkout_started`/`checkout_step_completed`, écrits depuis la route publique `app/c/[slug]/page.tsx` (Server Component), passent par le service role côté serveur, jamais depuis le client — même raisonnement que pour la lecture publique des pages de vente.
- Index : `space_id` (RLS), `customer_id`, `session_id`, `transaction_id` (toutes nullable mais interrogées pour reconstruire une timeline) — `create index events_space_id_idx on events (space_id); create index events_customer_id_idx on events (customer_id); create index events_session_id_idx on events (session_id); create index events_transaction_id_idx on events (transaction_id);`
- Pas de contrainte croisée `type` ↔ quelle colonne doit être renseignée (ex. `payment_attempted` implique `transaction_id not null`) : cohérent avec l'absence de `check` sur `type` lui-même — cette cohérence est de la responsabilité de l'app, qui définit déjà la forme de chaque `payload` par type. **Filet de sécurité côté test plutôt que côté schéma** : `plan.md` (S3) exige maintenant un test automatisé garantissant que `payment_succeeded`/`payment_failed` portent toujours un `transaction_id`.

**Rattachement d'identité rétroactif (visiteur anonyme → client identifié) — pas nécessaire, choix assumé :**

`checkout_started` à l'étape 1 du checkout peut survenir avant toute résolution d'identité (`customer_id null`). Question : cet événement se retrouve-t-il rattaché au bon `customer_id` une fois l'identité connue à l'étape 2 ?

Réponse : **non, et ce n'est pas un trou.** `checkout_sessions.customer_id` est `not null` (décidé à la conception de cette table) — ça implique, et je le rends explicite ici puisque ça ne l'était pas jusqu'à présent, que **la ligne `checkout_sessions` n'est créée qu'à partir de l'étape 2** (une fois l'identité résolue), pas dès l'étape 1. Concrètement :
- Étape 1 (résumé) : `checkout_started` se logue sans `customer_id` ni `session_id` — visite anonyme. Sa sortie déclenche un premier `checkout_step_completed` (marquant l'étape 1 terminée, arrivée à l'étape 2) — **encore anonyme lui aussi**, puisque l'email n'est capturé que pendant l'étape 2, pas avant.
- Étape 2 (identité) : `customer_id` résolu **pendant** cette étape. `checkout_sessions` est créée à ce moment-là. Le `checkout_step_completed` marquant **la fin de l'étape 2** (pas celui qui marquait son début) est le premier événement du parcours à porter `session_id` et `customer_id`.
- Étape 3 (paiement) et au-delà : `payment_attempted`/`succeeded`/`failed` portent systématiquement `session_id` et, via lui, remontent à `customer_id`.

Le différenciateur du PRD §13 ("un acheteur qui échoue cinq fois puis réussit est un client avec six événements") porte spécifiquement sur les **tentatives de paiement** — et celles-ci n'existent, par construction du parcours de checkout (identité avant paiement), qu'après résolution de l'identité. Elles sont donc toujours correctement rattachées, sans mécanisme de rattachement rétroactif. Seuls `checkout_started` et le premier `checkout_step_completed` (étape 1, strictement antérieurs à la résolution d'identité) restent non rattachables à un `customer_id` — une limite acceptée, cohérente avec la façon dont pratiquement tout outil d'analytics traite le trafic anonyme avant identification, pas une lacune du différenciateur. Le trafic purement anonyme (visite de page sans intention d'achat) ne se pose même plus la question : il n'est plus dans `events` du tout depuis ce tour-ci, il vit dans `daily_visit_counts`.

Une backfill rétroactive (UPDATE des lignes `events` antérieures une fois l'identité connue) aurait par ailleurs contredit la décision déjà prise sur cette table : `events` est append-only, sans `updated_at`, précisément pour qu'aucune ligne ne soit jamais modifiée après écriture.

---

## integrations

*Remplace le `platform_credentials` envisagé au tour précédent — pas une table pensée pour la livraison, une table générique de comptes tiers connectés, réutilisable partout dans l'app (livraison aujourd'hui, actions du futur moteur d'automatisation demain, ex. ajouter un tag Systeme.io après des relances infructueuses). Nom retenu : `integrations` plutôt que `connected_accounts` — plus court, et déjà proche du vocabulaire PRD/AGENTS.md ("outils tiers connectés").*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | Même raisonnement que `gateway_credentials` : un secret actif, pas un historique financier — minimiser sa durée de vie prime sur la protection contre suppression. |
| `provider` | `text` | not null | Même registre que `gateway`/`deliveries.provider` (avant sa révision ci-dessous) — pas de `check`, validation côté code contre le registre d'intégrations disponibles. |
| `label` | `text` | not null | Nom donné par le vendeur pour distinguer plusieurs comptes du même provider (ex. "Systeme.io - Formation Marketing", "Systeme.io - Coaching") — plusieurs comptes par provider explicitement autorisés, sur le modèle Make.com. |
| `credentials_encrypted` | `bytea` | not null | Même mécanisme que `gateway_credentials.credentials_encrypted` : JSON structuré multi-clés, chiffré comme un bloc unique, `libsodium-wrappers` + `ENCRYPTION_KEY` + `lib/crypto/encrypt.ts`. |
| `status` | `text` | not null, default `'active'`, check dans `('active', 'desactivee', 'revoquee', 'archivee')` | Mêmes valeurs que `gateway_credentials.status`, décidées au tour précédent — réutilisées telles quelles plutôt que d'inventer un nouveau vocabulaire pour un concept identique. |
| `status_updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | Même mécanisme que `gateway_credentials`. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Trigger `status_updated_at`** (identique à `gateway_credentials`, juste rebaptisé) :
```sql
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
```

**Ajout de ma part, non demandé explicitement :** `unique (space_id, provider, label)` — évite deux comptes du même provider avec le même libellé dans le même espace, ce qui rendrait `label` inutile pour son rôle de désambiguïsation. Dis-moi si tu préfères le retirer (ex. si un vendeur doit pouvoir volontairement dupliquer un libellé).

**Pas de `is_default`, à la différence de `gateway_credentials`.** Pas un oubli : `gateway_credentials` en a besoin parce qu'un paiement se route automatiquement vers *une* passerelle par défaut. Une intégration se sélectionne explicitement à chaque usage (quelle automatisation, quelle livraison utilise quel compte) — plus proche du modèle Make.com où chaque étape choisit sa connexion, jamais une connexion implicite par défaut.

**Sécurité — identique à `gateway_credentials`, sans réduction :**
- RLS activée, **aucune policy `select`/`insert`/`update`/`delete` pour `anon` ni `authenticated`** — accès exclusivement service role.
- Pas de vue exposant les colonnes non sensibles, même raisonnement que `gateway_credentials`.
- Déchiffrement uniquement dans le code serveur qui appelle effectivement l'intégration.

**Notes (hors tableau) :**
- Générique et volontairement vide de toute logique propre à la livraison — `label`, `provider`, `credentials_encrypted`, `status` sont utilisables tels quels par le futur moteur d'automatisation, sans modification de cette table.
- Ordre de migration : après `spaces` — aucune dépendance vers les tables métier plus tardives (`checkout_sessions`, `transactions`...).

---

## deliveries

*Dernière table de la liste initiale de `plan.md` (0009). Colonnes d'origine : `id, transaction_id, provider, status, attempts, last_error, delivered_at, created_at` — `transaction_id` devient `session_id` pour la même raison que `checkout_sessions.delivery_status` : la livraison sanctionne l'**achat** (le parcours entier), pas une tentative de paiement précise parmi d'autres.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger | Dérivé de `session_id` (un seul saut). `restrict` : la preuve de ce qu'un acheteur a effectivement reçu me semble mériter la même protection que `transactions`/`checkout_sessions`, pas le traitement `cascade` de `gateway_credentials` (qui protège un secret, pas une preuve). |
| `session_id` | `uuid` | not null, **unique**, references `checkout_sessions(id)` on delete restrict | Un seul cycle de livraison par parcours d'achat — les relances (retry Inngest) mettent à jour la même ligne (`attempts`, `last_error`) plutôt que d'en créer une nouvelle, à la différence de `transactions` où chaque tentative de paiement est une ligne distincte. `unique` empêche qu'une session en ait accidentellement deux. |
| `provider` | `text` | not null | **Gardé en plus de `integration_id` (ci-dessous), écart à ta demande initiale — voir explication.** Identifie le *mécanisme* de livraison (`file`, `systeme-io`, `skool`...), toujours renseigné. Pas de `check`, même registre que `gateway`. |
| `integration_id` | `uuid` | **nullable**, references `integrations(id)` on delete restrict | Remplace le `provider` texte libre pour tracer *quel compte précis* a traité la livraison — même principe que `transactions.gateway_credential_id`. **Nullable, pas une simple substitution de `provider`** : la livraison de fichier direct (S6, `lib/deliveries/file.ts`) passe par Cloudflare R2, l'infrastructure de SioPay elle-même — aucun compte tiers du vendeur n'est impliqué, donc rien à référencer dans `integrations`. `provider = 'file'` avec `integration_id = null` représente ça honnêtement, plutôt que de forcer une ligne `integrations` factice. Pour `systeme-io`/`skool`, les deux colonnes sont renseignées (`provider` redondant avec `integrations.provider` dans ce cas, mais nécessaire pour couvrir le cas `file` sans lui). Dis-moi si tu voulais vraiment un remplacement pur — ça casserait la traçabilité du cas fichier. |
| `status` | `text` | not null, default `'pending'`, check dans `('pending', 'succeeded', 'failed')` | Mêmes valeurs que `checkout_sessions.delivery_status`, cohérent puisque celui-ci en est le résumé. |
| `attempts` | `integer` | not null, default `0`, check `>= 0` | Compteur incrémenté par la fonction Inngest de retry (`delivery-retry.ts`, backoff 1min/5min/15min, abandon après 3 échecs — `plan.md` ligne 405). |
| `last_error` | `text` | nullable | Dernière erreur rencontrée. Pas de contrainte croisée forçant `null` quand `status = 'succeeded'` (à la différence de `failure_reason` sur `transactions`) : une livraison réussie au 3ᵉ essai garde volontiers la trace du dernier échec précédent comme contexte, ce n'est pas une incohérence à interdire ici. |
| `payload` | `jsonb` | not null, default `'{}'::jsonb`, check `jsonb_typeof(payload) = 'object'` | Garde-fou ajouté en Section D, cohérence avec `delivery_config`. **Ajouté — gap repéré, absent de la liste d'origine.** Rien dans le schéma ne disait où stocker le résultat concret de la livraison (l'URL signée générée pour un fichier, la confirmation d'inscription Systeme.io/Skool...) — `plan.md` (S6, ligne 273) mentionne bien un "lien de téléchargement signé... stocké en base" sans dire où. Même logique `jsonb` que `delivery_config`/`events.payload` : la forme dépend du `provider`. |
| `delivered_at` | `timestamptz` | nullable | `null` tant que non livré. |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Contrainte croisée `status` / `delivered_at` :**
```sql
check ((status = 'succeeded') = (delivered_at is not null))
```

**Trigger de synchronisation `space_id` :**
```sql
create or replace function set_delivery_space_id()
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

create trigger deliveries_set_space_id
  before insert or update of session_id on deliveries
  for each row
  execute function set_delivery_space_id();
```

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))`.
- Index : `session_id` (déjà couvert par `unique`), `space_id`, `integration_id` — `create index deliveries_space_id_idx on deliveries (space_id); create index deliveries_integration_id_idx on deliveries (integration_id);`

---

## promo_codes

*Table entièrement nouvelle, aucun équivalent dans `plan.md` initial — PRD §9 mentionne "créer un code promo" comme action d'automatisation possible, sans jamais la structurer. Système flexible : portée (lien/offre/espace), à qui (tous/un client précis) et combien de fois (unique/N fois/illimité) sont des axes indépendants, combinables librement.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete cascade | Un code appartient à un espace — pas de portée cross-espace. |
| `code` | `text` | not null, unique `(space_id, code)`, check `code = upper(trim(code))` | Normalisé en majuscules à l'écriture (ajout de ma part, non demandé, par analogie avec l'email sur `customers` — un code promo se compare généralement sans tenir compte de la casse saisie par l'acheteur). Unique **par espace**, pas globalement : deux vendeurs peuvent chacun avoir un code `SUMMER20`. |
| `payment_link_id` | `uuid` | nullable, references `payment_links(id)` on delete cascade | Portée "un lien précis". |
| `offer_id` | `uuid` | nullable, references `offers(id)` on delete cascade | Portée "toute l'offre" (tous ses liens). |
| `customer_id` | `uuid` | nullable, references `customers(id)` on delete cascade | `null` = utilisable par n'importe quel acheteur. Renseigné = réservé à ce client précis — axe indépendant de la portée lien/offre/espace ci-dessus. |
| `max_uses` | `integer` | nullable, check `max_uses is null or max_uses > 0` | `null` = illimité. Une valeur = plafond total d'utilisations, tous acheteurs confondus (même pour un code réservé à un client précis — les deux axes restent indépendants : un client précis pourrait avoir droit à 3 usages, pas nécessairement 1). |
| `uses_count` | `integer` | not null, default `0`, check `uses_count >= 0` | **Ajout de ma part, non demandé** — compteur dénormalisé, maintenu par trigger depuis `promo_code_uses` (source de vérité pour le détail, ce compteur sert uniquement à l'application rapide et **sans condition de concurrence** de `max_uses`, voir trigger plus bas). Sans lui, vérifier la limite demanderait un `count(*)` sur `promo_code_uses` au moment de l'insertion, avec un risque réel de double-dépassement sous requêtes concurrentes (deux achats à la dernière utilisation disponible, presque simultanés). |
| `discount_type` | `text` | not null, check dans `('montant_fixe', 'pourcentage')` | Même logique que `payment_mode` sur `offers` — `text` + `check`, pas d'`enum` natif. |
| `discount_amount` | `numeric(10,2)` | nullable, voir contrainte croisée | Montant de la réduction si `discount_type = 'montant_fixe'`. |
| `discount_currency` | `text` | nullable, references `currencies(code)` on delete restrict | Complète `discount_amount` — jamais un montant nu (règle absolue). Même traitement que `base_price_currency` sur `offers` : doit refléter `currency_zone` de l'espace, pas un choix libre. |
| `discount_percentage` | `numeric(5,2)` | nullable, voir contrainte croisée | Pourcentage de réduction si `discount_type = 'pourcentage'` (ex. `20.00` = 20%). |
| `source` | `text` | not null, default `'manuel'`, check dans `('manuel', 'automatique')` | Distingue un code créé par le vendeur d'un code généré par une future automatisation (ex. relance après échecs répétés) — sert plus tard à l'attribution de revenu par playbook (PRD). Mécanisme de génération automatique non construit ici, juste la colonne qui permettra de le distinguer une fois qu'il existera. |
| `is_active` | `boolean` | not null, default `true` | Désactivation sans suppression, préserve l'historique dans `promo_code_uses`. Pas le pattern `status`/`status_updated_at` de `gateway_credentials`/`integrations` : un code promo n'a pas d'équivalent "révoqué vs archivé", un simple booléen suffit à la nuance réellement utile ici. |
| `expires_at` | `timestamptz` | nullable | Même pattern que `max_uses` : `null` = pas d'expiration, une valeur = date limite d'application. Nécessaire pour qu'un code de relance automatique (généré après plusieurs échecs, `source = 'automatique'`) crée une urgence réelle — sans expiration possible, ce levier marketing n'existe pas. Contrôlé au même endroit que `max_uses` : le trigger d'incrémentation, pas un `check` isolé (voir plus bas). |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()`, maintenu par trigger | |

**Contraintes croisées :**
```sql
-- portée : au plus un des deux, zéro = espace entier (différent du "exactement un" de daily_visit_counts/visit_dedup)
check (num_nonnulls(payment_link_id, offer_id) <= 1)

-- réduction : montant fixe + devise, ou pourcentage — jamais les deux, jamais aucun
check (
  (discount_type = 'montant_fixe' and discount_amount is not null and discount_amount > 0
    and discount_currency is not null and discount_percentage is null)
  or
  (discount_type = 'pourcentage' and discount_percentage is not null and discount_percentage > 0 and discount_percentage <= 100
    and discount_amount is null and discount_currency is null)
)
```

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))` — pattern standard, rien de sensible ici.
- Pas de contrainte empêchant qu'une réduction dépasse le prix auquel elle s'applique (ex. montant fixe supérieur au prix du lien) — dépend du prix effectif au moment de l'achat (`payment_links`/`offers`, avec surcharge possible), pas connu au niveau de `promo_codes` elle-même. Validation à faire côté app au moment de l'application du code, pas une contrainte de schéma ici.

---

## promo_code_uses

*Table de suivi séparée, nécessaire pour appliquer les limites d'usage et tracer ce qu'un code a réellement coûté/rapporté — sans elle, `promo_codes.max_uses` serait incontrôlable et impossible à auditer.*

| Champ | Type | Contrainte | Pourquoi |
|---|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` | |
| `promo_code_id` | `uuid` | not null, references `promo_codes(id)` on delete restrict | `restrict` : un code utilisé au moins une fois ne doit pas pouvoir disparaître silencieusement et casser l'historique. |
| `session_id` | `uuid` | not null, **unique**, references `checkout_sessions(id)` on delete restrict | **Rattaché à la session, pas à la transaction** — un code promo s'applique à un parcours d'achat entier, pas à une tentative de paiement précise : un acheteur qui échoue puis réussit dans la même session ne "consomme" pas deux fois son code. `unique` : au plus un code promo appliqué par session (pas de cumul de codes pour l'instant — dis-moi si le cumul doit être permis, ça changerait cette contrainte). Une ligne n'est créée **qu'une fois la session `reussie`**, jamais à l'application du code par l'acheteur : un panier abandonné après saisie d'un code ne doit pas consommer une utilisation. |
| `space_id` | `uuid` | not null, references `spaces(id)` on delete restrict, maintenu par trigger | Dérivé de `session_id`, pattern standard. |
| `customer_id` | `uuid` | not null, references `customers(id)` on delete restrict | Dérivé de `session_id → checkout_sessions.customer_id` par le même trigger — dénormalisé pour interroger directement "ce client a-t-il déjà utilisé ce code" sans repasser par `checkout_sessions` à chaque fois. |
| `discount_applied_amount` | `numeric(10,2)` | not null, check `>= 0` | Montant réellement déduit pour **cette** utilisation précise — pas recalculé depuis `promo_codes.discount_amount`/`discount_percentage` à la lecture, pour ne pas dépendre d'une modification ultérieure du code (même raisonnement que `transactions.amount`, qui ne se recalcule pas depuis `offers.base_price_amount`). C'est cette colonne qui répond directement à "combien un code a réellement coûté". |
| `discount_applied_currency` | `text` | not null, references `currencies(code)` on delete restrict | Complète `discount_applied_amount` — jamais un montant nu. |
| `created_at` | `timestamptz` | not null, default `now()` | Moment de la réussite de la session (= moment de l'utilisation confirmée). Pas de `updated_at` : un usage est un fait immuable, même logique que `events`/`transactions`. |

**Trigger de synchronisation `space_id`/`customer_id` (depuis `session_id`) :**
```sql
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
```

**Trigger d'incrémentation atomique de `promo_codes.uses_count`, avec rejet si `max_uses` est atteint ou si `expires_at` est dépassé :**
```sql
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
    -- distinguer la cause pour un message d'erreur exploitable côté app
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
```
`update ... where uses_count < max_uses` plutôt qu'un `select count(*)` préalable : le verrou de ligne posé par l'`update` sur `promo_codes` rend la vérification et l'incrémentation atomiques — deux utilisations concurrentes à la toute dernière place disponible ne peuvent pas toutes les deux réussir. C'est le même problème que l'unicité `daily_visit_counts`/`visit_dedup` (ne jamais faire confiance à un "vérifier puis agir" en deux temps sous concurrence), résolu différemment ici parce qu'il s'agit d'un compteur avec plafond, pas d'une simple présence/absence.

**Notes (hors tableau) :**
- RLS : `for select to authenticated using ((select private.user_owns_space(space_id)))`.
- **Où ça se trace sur `checkout_sessions`/`transactions` — vérifié, réponse : nulle part directement, et c'est volontaire.** `promo_code_uses` (jointure via `session_id`) est déjà la trace complète (quel code, quelle session, quel montant réduit) — dupliquer un `promo_code_id`/`discount_amount` sur `checkout_sessions` serait une donnée dérivable stockée en plus, contraire au principe déjà posé (`daily_visit_counts`/compteurs sur `offers`). `transactions.amount` reflète déjà nativement le montant réellement débité **après** réduction — aucune colonne supplémentaire n'est nécessaire là non plus pour connaître ce qu'un code a coûté : `discount_applied_amount` répond directement à cette question.

---

**Fin de la liste initiale de `plan.md` (0001–0010, toutes conçues avec les extensions actées en cours de route : `currencies`, `countries`, `reserved_slugs`, `spaces`, `gateways`, `processors`, `payment_methods`, `checkout_sessions`, `integrations`, `daily_visit_counts`, `visit_dedup`, `promo_codes`, `promo_code_uses`). Reste un gap connu, non construit : le mécanisme de résolution de sous-domaine (middleware, signalé lors de la correction de `plan.md` sur `sales_pages`).**

---

## Section E — Ordre de dépendance final, numérotation des migrations, contradictions

**Ordre final (24 tables), tel qu'il doit être écrit dans `supabase/migrations/`** — remplace toute numérotation antérieure, y compris celle utilisée dans les sections ci-dessus qui suivait l'ordre de conception, pas l'ordre de dépendance :

```
0001_currencies.sql
0002_reserved_slugs.sql
0003_gateways.sql
0004_processors.sql
0005_countries.sql
0006_accounts.sql
0007_payment_methods.sql
0008_plans.sql
0009_account_plans.sql
0010_spaces.sql
0011_gateway_credentials.sql
0012_integrations.sql
0013_customers.sql
0014_offers.sql
0015_payment_links.sql
0016_sales_pages.sql
0017_checkout_sessions.sql
0018_transactions.sql
0019_deliveries.sql
0020_daily_visit_counts.sql
0021_visit_dedup.sql
0022_events.sql
0023_promo_codes.sql
0024_promo_code_uses.sql
```

Détail des colonnes par migration : reporté dans `plan.md` (S2, section "Migrations"), pour éviter de dupliquer la même liste à deux endroits — ce document-ci reste la source de vérité pour le détail colonne par colonne (contraintes, triggers, RLS), `plan.md` pour l'ordre et la vue d'ensemble.

**Placement physique des fonctions partagées — précision nécessaire avant d'écrire les fichiers, l'ordre de conception dans ce document ne correspond pas à l'ordre de dépendance réel :**
- `set_updated_at()` — introduite dans les notes de `0001_accounts` (ancienne numérotation) mais **doit physiquement vivre dans `0001_currencies.sql`**, première migration à en avoir besoin dans le nouvel ordre.
- `reject_reserved_slug()` — définie dans `0002_reserved_slugs.sql`, cohérent avec sa position déjà documentée ici.
- `private.user_owns_account(account_id)` — le texte de ce document la présente dans la section `reserved_slugs`, mais elle référence `accounts` : **doit physiquement vivre dans `0006_accounts.sql`** (à la fin du fichier, après la création de la table), pas dans `0002_reserved_slugs.sql` qui s'exécute avant qu'`accounts` n'existe.
- `private.user_owns_space(space_id)` — même remarque, référence `spaces` **et** `accounts` : **doit physiquement vivre dans `0010_spaces.sql`**, pas dans `reserved_slugs`.

**Contradictions trouvées et corrigées :**
- **`plan.md` (S2, section "Migrations")** — réécrite intégralement : listait encore les 10 tables d'origine avec `account_id` partout (`customers`, `offers`, `transactions`...) au lieu de `space_id`, une colonne `gateway` texte libre sur `transactions` au lieu de `gateway_credential_id`, `delivery_status` sur `transactions` au lieu de `checkout_sessions`, et aucune des 14 tables ajoutées en cours de route. Remplacée par la liste des 24 migrations ci-dessus.
- **`plan.md` (S2, critères de validation)** — "Tables créées" ne listait que 10 noms → les 24. "`transactions` porte `payment_status` ET `delivery_status`" → corrigé, ces deux colonnes vivent maintenant sur deux tables différentes. "RLS testée : compte A ne peut jamais lire les données du compte B" → précisé qu'un compte avec plusieurs espaces voit tous ses propres espaces (attendu, l'isolement est par compte).
- **`plan.md` (S2, point 5, RLS)** — décrivait encore `USING (account_id = auth.uid())` → remplacé par la description `for select` finale (Section B).
- **`plan.md` (S3)** — contrainte `unique` sur `external_id` seul → `(gateway_credential_id, external_id)` ; `upsertTransaction` cherchait par `external_id` seul → même correction ; le registre `EventType` listait encore `page_view` → retiré (contradiction interne à `plan.md` : la ligne 80 du même fichier l'avait déjà exclu d'`events`, mais la liste TypeScript du registre, plus bas dans le même document, ne l'avait pas suivi).
- **`PRD.md`** — vérifié (identité client par espace, compte vs espace) : déjà cohérent, aucune correction nécessaire.
- **`AGENTS.md`** — déjà mis à jour au fil des sections précédentes (clés primaires text, cascade/restrict, text+check/FK/texte libre, RLS lecture seule, `seller_id` obsolète) ; vérifié une dernière fois, rien de résiduel.

**Observation, pas une correction — à trancher séparément :** S2 ("Modèle de données", une semaine, repère 14 sept) couvrait 10 tables dans le plan d'origine ; elle en couvre 24 maintenant, avec des mécanismes que le plan d'origine ne prévoyait pas du tout (résolution de sous-domaine, triggers de dérivation en cascade, fonctions `SECURITY DEFINER`, incrémentation atomique). Ce n'est plus le même ordre de grandeur de travail qu'une semaine. Je ne restructure pas le découpage en checkpoints/semaines de mon initiative — c'est une décision de planning, pas une correction de cohérence — mais ça vaut le coup d'en discuter avant de commencer l'exécution.
