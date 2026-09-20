# plan.md — SioPay · Plan d'exécution v1

> Ce fichier répond au **comment** de chaque semaine. Le quoi et le pourquoi sont dans `PRD.md`.
> La structure en checkpoints et semaines est fixée — seul le découpage technique à l'intérieur est ajouté ici.
>
> **Règle :** tous les critères d'une semaine doivent être cochés avant de démarrer la semaine suivante. Idem pour les jalons.

---

## CHECKPOINT 1 — Noyau monétaire

### S1 — Fondations · repère 7 sept

**État : terminé.**

**Découpage technique accompli :**
- Scaffold Next.js 16 + TypeScript strict, App Router
- Tailwind v4 avec tokens SioPay dans `app/globals.css`
- shadcn/ui style `radix-nova`, premier composant `Button`
- Sentry configuré : `instrumentation.ts` (serveur/edge), `instrumentation-client.ts` (browser)
- DSN externalisé dans `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` dans `.env.sentry-build-plugin`
- Polices : Plus Jakarta Sans (`--font-jakarta`) + Instrument Serif (`--font-instrument`)

**Critères de validation :**
- [x] Repo GitHub, Next.js + TypeScript, premier commit
- [x] Projet Supabase, connexion testée
- [x] Vercel connecté au repo, déploiement automatique
- [x] Sentry branché, erreur test remontée
- [x] Tailwind configuré avec les tokens SioPay
- [x] shadcn/ui installé
- [x] PRD.md écrit
- [x] AGENTS.md écrit, référencé depuis CLAUDE.md
- [x] plan.md généré et relu

---

### S2 — Modèle de données · repère 14 sept

**Objectif de la semaine :** schema complet en base, RLS étanche, types TypeScript générés.

**Ordre de réalisation :**

1. **Outillage Supabase** — installer `@supabase/supabase-js` et `supabase` CLI ; config locale liée au projet distant (`supabase link`) ; ajouter `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` et sur Vercel — préfixe `NEXT_PUBLIC_` nécessaire sur les deux premières, sinon `createBrowserClient()` ne peut pas les lire côté navigateur (corrigé, `AGENTS.md`).

2. **Client Supabase** — `lib/db/client.ts` : deux exports — `createServerClient()` (service role, serveur uniquement) et `createBrowserClient()` (anon key). Ne jamais exposer la service role key côté client.

3. **Migrations (ordre imposé par les dépendances FK — renuméroté intégralement lors de la relecture d'ensemble, `docs/schema-design-notes.md` Section E ; remplace toute numérotation antérieure de ce document, y compris le fichier déjà écrit `supabase/migrations/0002_customers.sql` qui doit être réécrit sous le nouveau numéro) :**
   - `0001_currencies.sql` — table `currencies` (code text primary key, name, created_at, updated_at). Définit aussi la fonction générique `set_updated_at()`, réutilisée telle quelle par toutes les migrations suivantes.
   - `0002_reserved_slugs.sql` — table `reserved_slugs` (id, value unique, created_at, updated_at) + fonction `reject_reserved_slug()`.
   - `0003_gateways.sql` — table `gateways` (code text primary key, name, logo_url, is_active, created_at, updated_at)
   - `0004_processors.sql` — table `processors` (code text primary key, name, created_at, updated_at)
   - `0005_countries.sql` — table `countries` (code text primary key, name, currency_code → `currencies`, created_at, updated_at)
   - `0006_accounts.sql` — table `accounts` (id, user_id → auth.users, currency_zone → `currencies`, display_currency → `currencies`, created_at, updated_at) + fonction `private.user_owns_account(account_id)`.
   - `0007_payment_methods.sql` — table `payment_methods` (id, name unique, processor_code → `processors`, country_code → `countries`, is_active, created_at, updated_at)
   - `0008_plans.sql` — table `plans` (id, name unique, credit_allowance, price_monthly, price_monthly_currency → `currencies`, created_at, updated_at — valeurs injectées en S15/S18)
   - `0009_account_plans.sql` — table `account_plans` (id, account_id → `accounts`, plan_id → `plans`, started_at, ended_at nullable, created_at, updated_at)
   - `0010_spaces.sql` — table `spaces` (id, account_id → `accounts`, name, slug unique, created_at, updated_at) + fonction `private.user_owns_space(space_id)`. Devient le sous-domaine public (`{slug}.siopay.io`).
   - `0011_gateway_credentials.sql` — table `gateway_credentials` (id, space_id → `spaces`, gateway → `gateways`, credentials_encrypted bytea, currency → `currencies`, is_default, status, status_updated_at, created_at, updated_at)
   - `0012_integrations.sql` — table `integrations` (id, space_id → `spaces`, provider, label, credentials_encrypted bytea, status, status_updated_at, created_at, updated_at) — comptes tiers connectés, générique (livraison + futures automatisations)
   - `0013_customers.sql` — table `customers` (id, space_id → `spaces`, email — normalisé lowercase+trim, clé de résolution d'identité, unique par `space_id` —, phone collecté mais non identifiant, created_at, updated_at)
   - `0014_offers.sql` — table `offers` (id, space_id → `spaces`, title, delivery_config jsonb, base_price_amount, base_price_currency → `currencies`, payment_mode, compare_at_price_amount, promo_price_amount, promo_active, suggested_price_amount, thumbnail_url, created_at, updated_at)
   - `0015_payment_links.sql` — table `payment_links` (id, offer_id → `offers`, space_id → `spaces` [dérivé par trigger], title, description, base_price_amount nullable, payment_mode nullable, slug unique par espace, created_at, updated_at)
   - `0016_sales_pages.sql` — table `sales_pages` (id, payment_link_id → `payment_links` unique, space_id → `spaces` [dérivé], title, slug unique par espace, template_id, content jsonb, brand_color, active_sections jsonb, created_at, updated_at) — `payment_link_id` not null : une page de vente est toujours rattachée à un lien de paiement (PRD §5), c'est la relation inverse (un lien sans page) qui est optionnelle
   - `0017_checkout_sessions.sql` — table `checkout_sessions` (id, space_id → `spaces` [dérivé], customer_id → `customers`, payment_link_id → `payment_links`, status, expires_at, closed_at, delivery_status, is_test, metadata jsonb, created_at, updated_at) — représente le parcours d'achat entier, pas une tentative isolée
   - `0018_transactions.sql` — table `transactions` (id, session_id → `checkout_sessions`, space_id → `spaces` [dérivé], external_id, gateway_credential_id nullable → `gateway_credentials`, payment_method_id nullable → `payment_methods`, processor_code nullable → `processors`, amount, currency → `currencies`, payment_status, failure_reason, created_at, updated_at) — une tentative individuelle à l'intérieur d'une session
   - `0019_deliveries.sql` — table `deliveries` (id, space_id → `spaces` [dérivé], session_id → `checkout_sessions` unique, provider, integration_id nullable → `integrations`, status, attempts, last_error, payload jsonb, delivered_at, created_at, updated_at)
   - `0020_daily_visit_counts.sql` — table `daily_visit_counts` (id, space_id → `spaces` [dérivé], payment_link_id/offer_id/sales_page_id — un seul renseigné —, visit_date, dimension_type, dimension_value, impressions, unique_visits, created_at, updated_at) — compteurs, pas un événement par visite
   - `0021_visit_dedup.sql` — table `visit_dedup` (id, space_id → `spaces` [dérivé], visitor_id, payment_link_id/offer_id/sales_page_id — un seul renseigné —, visit_date, created_at)
   - `0022_events.sql` — table `events` (id, space_id → `spaces` [fourni par le serveur, pas dérivé], customer_id nullable → `customers`, session_id nullable → `checkout_sessions`, transaction_id nullable → `transactions`, type, payload jsonb, created_at) — **pas de `page_view`**, réservée aux moments à valeur individuelle de la timeline d'achat
   - `0023_promo_codes.sql` — table `promo_codes` (id, space_id → `spaces`, code unique par espace, payment_link_id/offer_id — au plus un —, customer_id nullable, max_uses, uses_count, discount_type, discount_amount, discount_currency, discount_percentage, source, is_active, expires_at, created_at, updated_at)
   - `0024_promo_code_uses.sql` — table `promo_code_uses` (id, promo_code_id → `promo_codes`, session_id → `checkout_sessions` unique, space_id → `spaces` [dérivé], customer_id → `customers` [dérivé], discount_applied_amount, discount_applied_currency, created_at)

   - `0025_table_grants.sql` — `GRANT` explicites sur les tables : `service_role` en lecture/écriture, `authenticated` en lecture (sauf `reserved_slugs`, `gateway_credentials`, `integrations`, `visit_dedup`), `anon` en lecture sur les 6 tables de référence publiques. Ajoutée après coup : les privilèges de table manquaient sur le distant (« permission denied » même pour le service role), découvert au test RLS.

   Détail complet de chaque table (colonnes, contraintes, triggers, RLS) dans `docs/schema-design-notes.md` — cette liste ne donne que l'ordre et les colonnes principales.

4. **Chiffrement des credentials** — chiffrement au niveau applicatif avec `libsodium-wrappers` : la clé de chiffrement est une variable d'environnement serveur (`ENCRYPTION_KEY`). Les credentials ne sont jamais stockés en clair. Helpers dans `lib/crypto/encrypt.ts`. S'applique à `gateway_credentials` **et** `integrations` (même mécanisme, principe généralisé dans `AGENTS.md`).

5. **RLS** — `for select to authenticated using (...)` sur chaque table métier (jamais `for all`) : `private.user_owns_space(space_id)` pour les tables rattachées à un espace, `private.user_owns_account(account_id)` pour `spaces`/`account_plans`, comparaison directe sur `accounts`. Aucune écriture via RLS — toutes les écritures passent par le service role (Server Actions), ownership vérifié côté app avant l'appel (`AGENTS.md`, `docs/schema-design-notes.md` Section B). Tester avec deux comptes distincts.

6. **Types TypeScript** — générer avec `supabase gen types typescript --linked > lib/db/types.ts` (projet distant, pas de Supabase local via Docker dans ce projet — corrigé). À regénérer après chaque migration.

7. **Validation finale (feu vert S3)** — insérer manuellement une offre, un lien et une transaction liés via Supabase Studio avec le compte A, puis vérifier depuis le compte B (via le client anon avec session B) que la requête retourne 0 lignes.

**Modules concernés :**
```
supabase/migrations/           ← toutes les migrations SQL
lib/db/client.ts               ← clients Supabase
lib/db/types.ts                ← types générés
lib/crypto/encrypt.ts          ← chiffrement/déchiffrement credentials
.env.local                     ← nouvelles variables
```

**Critères de validation :**
- [x] Les 24 tables créées, dans l'ordre : `currencies`, `reserved_slugs`, `gateways`, `processors`, `countries`, `accounts`, `payment_methods`, `plans`, `account_plans`, `spaces`, `gateway_credentials`, `integrations`, `customers`, `offers`, `payment_links`, `sales_pages`, `checkout_sessions`, `transactions`, `deliveries`, `daily_visit_counts`, `visit_dedup`, `events`, `promo_codes`, `promo_code_uses`
- [x] Identité client résolue par email normalisé (jamais par téléphone), **par espace** : un même acheteur sur plusieurs tentatives dans le même espace = un seul `customer_id` ; deux espaces distincts d'un même compte le traitent comme deux clients séparés (choix assumé, PRD §8)
- [x] `payment_status` (sur `transactions`, par tentative) et `delivery_status` (sur `checkout_sessions`, par parcours d'achat) restent distincts — **plus sur la même table** depuis la restructuration session/tentative (`docs/schema-design-notes.md`)
- [x] `events` prêt à recevoir : `checkout_started`, `checkout_step_completed`, `payment_attempted`, `payment_succeeded`, `payment_failed` — **pas `page_view`** : le trafic de page (impressions) vit dans `daily_visit_counts`/`visit_dedup`, pas dans `events`, pour ne jamais faire exploser son volume d'écriture avec une campagne sponsorisée (`docs/schema-design-notes.md`)
- [x] Relation Offre → Lien de paiement → Page de vente (page optionnelle)
- [x] Devise de zone au niveau du compte, devise déclarée par passerelle
- [x] Aucun montant stocké sans sa devise
- [x] RLS activée sur les 24 tables, sans exception — `for select` uniquement, aucune policy d'écriture (l'ownership en écriture se vérifie côté app avant l'appel au service role, `docs/schema-design-notes.md` Section B)
- [x] RLS testée : compte A ne peut jamais lire les données du compte B (un compte avec plusieurs espaces voit ses propres espaces, c'est attendu — l'isolation est par compte/utilisateur, pas par espace)
- [~] Credentials passerelles **et intégrations** chiffrés en base — **déplacé vers S4** (voir critères S4) : incohérence trouvée le 20 sept entre cette note (qui reportait à S9/S11) et le point 2 de l'"Ordre de réalisation" S4, qui exige déjà une lecture chiffrée de `gateway_credentials` pour le premier paiement FedaPay. S4 est la première semaine où ce module est réellement nécessaire ; S9 ne fait que le réutiliser pour `integrations`.
- [x] Types TypeScript générés depuis le schéma distant (`supabase gen types typescript --linked`)
- [x] Migrations versionnées dans le repo

---

### S3 — Machine à états & idempotence · repère 21 sept

**Objectif de la semaine :** noyau de paiement spécifié, testé, CI en place.

**Ordre de réalisation :**

1. **Framework de test** — installer Vitest + `@vitest/coverage-v8`. Config dans `vitest.config.ts`. Ajouter `"test": "vitest"` dans `package.json`. CI GitHub Actions : `.github/workflows/ci.yml` qui lance `npm test` sur chaque push.

2. **Types & contrats** — `lib/payments/types.ts` : enum `TransactionStatus` (pending, processing, succeeded, failed, abandoned, refunded), enum `FailureReason`, type `PaymentWebhookPayload`. Ces types sont le contrat de l'interface gateway — écrire les tests dessus avant le code.

3. **Deux machines à états** — `lib/payments/session-state-machine.ts` et `lib/payments/transaction-state-machine.ts` :
   - `checkout_sessions.status` : `ouverte` → `reussie` / `abandonnee` / `expiree`, avec réouverture `expiree`/`abandonnee` → `reussie` uniquement si une transaction `succeeded` arrive en retard
   - `transactions.payment_status` : `pending` → `processing` → `succeeded` / `failed` / `expired`, avec `expired` → `succeeded`/`failed` uniquement via un webhook tardif (jamais via un nouveau polling sur une transaction déjà expirée)
   - Chaque fonction retourne une erreur typée sur transition invalide, jamais d'exception silencieuse

4. **Idempotence & concurrence** — `lib/payments/idempotence.ts` :
   - Contrainte `UNIQUE` sur `transactions (gateway_credential_id, external_id)`, complétée par un index partiel pour le cas `gateway_credential_id null`
   - Fonction `upsertTransaction(payload)` : cherche d'abord par `(gateway_credential_id, external_id)`, retourne l'existant si trouvé
   - **Écriture conditionnelle (compare-and-swap)** sur `payment_status` : chaque transition s'écrit avec une clause `WHERE payment_status = $statut_attendu`. Si 0 ligne affectée, relire l'état réel et rejouer `transition()` dessus plutôt que d'écraser — protège contre un webhook et un polling qui écrivent au même moment

5. **Vérification d'authenticité par appel sortant** — `lib/payments/verify-transaction.ts` :
   - Fonction `verifyAndFetchStatus(externalId)` : n'extrait du webhook reçu que l'identifiant de référence, jamais un champ de statut. Appelle ensuite `gateway.getTransactionStatus(externalId)` — la même fonction utilisée par le polling — pour obtenir le statut réel, authentifié par les clés API du vendeur
   - Avant tout appel sortant : rejeter silencieusement (200 OK, aucune action) toute référence inconnue en base ou déjà dans un statut terminal (`succeeded`/`failed`)
   - Anti-rafale : au plus une vérification réelle par transaction par intervalle minimal configurable, même en cas de rafale de webhooks (légitimes ou forgés) sur la même référence

6. **Validation des montants** — `lib/payments/validation.ts` :
   - Vérifier que `amount` est un entier positif
   - Vérifier que `currency` est une devise connue (depuis la config, jamais une constante inline)
   - Champ inattendu ou mal typé → loguer et rejeter, jamais absorber silencieusement

7. **Route webhook** — `app/api/webhooks/[gateway]/route.ts` (placeholder) : orchestre vérification de signature → idempotence → machine à états → insertion en base → **émission des events `payment_succeeded`/`payment_failed`** (via `logEvent`, point 8) avec `transaction_id` systématiquement renseigné. Le code du gateway est délégué à S4.

8. **Registre de types d'événements** — `lib/analytics/events.ts` : union TypeScript `EventType` (`checkout_started`, `checkout_step_completed`, `payment_attempted`, `payment_succeeded`, `payment_failed` pour l'instant — **pas `page_view`**, retiré de `events` lors de la relecture d'ensemble, le trafic de page vit dans `daily_visit_counts`/`visit_dedup` — liste appelée à grossir au fil du plan, jamais un `check` en base, voir `docs/schema-design-notes.md`). Fonction `logEvent(type: EventType, ...)` comme point d'entrée unique pour écrire dans `events` — premier type écrit en dur dans le code (`payment_succeeded`/`payment_failed`, point 7), donc le registre se construit ici plutôt que d'être différé : tout code ultérieur qui logue un événement (S7 checkout, S8 page de vente, S9 livraison, S13 webhooks sortants, S15 automatisations) passe par cette union, jamais une chaîne libre.

**Modules concernés :**
```
lib/payments/types.ts
lib/payments/state-machine.ts
lib/payments/idempotence.ts
lib/payments/webhook-verification.ts
lib/payments/validation.ts
lib/analytics/events.ts
app/api/webhooks/[gateway]/route.ts
vitest.config.ts
.github/workflows/ci.yml
```

**Critères de validation :**
- [ ] Vitest installé, CI GitHub Actions en place, `npm test` passe sur chaque push
- [ ] Machine à états : transitions valides `pending → processing → succeeded / failed / abandoned / refunded`
- [ ] Transitions invalides rejetées avec erreur typée
- [ ] Idempotence par `external_id` : même payload webhook envoyé 3× = une seule transaction
- [ ] Désordre géré : webhook `succeeded` reçu avant `processing` traité correctement
- [ ] **Test de concurrence** : un webhook et un polling arrivant au même moment sur la même transaction ne produisent jamais de lost update
- [ ] Transitions invalides rejetées sur les deux machines, y compris aucune transition vers un statut de remboursement (hors périmètre V1)
- [ ] Webhook entrant : seule la référence est extraite, jamais un champ de statut du payload
- [ ] Référence inconnue ou déjà terminale → rejetée sans appel sortant
- [ ] Anti-rafale par transaction actif, testé avec une rafale simulée
- [ ] Rate limiting sur l'endpoint webhook
- [ ] Montant mal typé → détecté et logué, jamais silencieusement corrompu
- [ ] `logEvent` typé (`EventType`) en place, réutilisable par les semaines suivantes
- [ ] **Test automatisé dédié** : tout event `payment_succeeded` ou `payment_failed` créé par la route webhook porte un `transaction_id` non nul — cette table alimente directement la timeline client (PRD §13, différenciateur principal), un événement de paiement sans tentative associée casserait la reconstruction de la timeline silencieusement
- [ ] Tests automatisés couvrant tous ces cas, passant en CI
- [x] Test d'intégration `upsertTransaction` concurrent (3× `Promise.all`) — volontairement hors CI : requiert un accès réseau à la base distante et un cleanup transactionnel ; même statut que les tests en argent réel de S4. À lancer manuellement via `npm run test:integration` avant chaque merge touchant `idempotence.ts`.

> **Note :** la décision de garder ce test hors CI sera reconsidérée si un projet Supabase de staging séparé est mis en place — pas prévu dans le plan actuel, juste une piste à retenir.

---

### S4 — Première passerelle bout en bout · repère 28 sept

**Objectif de la semaine :** un vrai paiement arrive en base via une passerelle réelle.

**Passerelle : FedaPay.** Le compte marchand est ouvert.

**Ordre de réalisation :**

1. **Interface PaymentGateway** — `lib/payments/gateway.ts` :
   ```ts
   interface PaymentGateway {
     name: string
     initiatePayment(params: InitiateParams): Promise<PaymentInitResult>
     verifyWebhookSignature(payload: string, sig: string, secret: string): boolean
     parseWebhookPayload(raw: unknown): NormalizedWebhookPayload
     normalizeFailureReason(rawCode: string): FailureReason
   }
   ```
   Le code métier n'importe jamais une implémentation directement — il reçoit l'interface.

2. **Chiffrement des credentials** — `lib/crypto/encrypt.ts` : chiffrement au niveau applicatif avec `libsodium-wrappers`, clé de chiffrement en variable d'environnement serveur (`ENCRYPTION_KEY`), jamais en base ni versionnée. Un secret dont la forme varie selon le fournisseur (clé API simple, couple public/privé...) se stocke comme un JSON structuré multi-clés, chiffré comme un bloc unique (`bytea`) — jamais des colonnes en clair par type de clé. Documenter l'algorithme réel utilisé par `libsodium-wrappers` (AES-256-GCM si configuré explicitement ainsi, sinon XSalsa20-Poly1305 par défaut) — ne pas supposer, vérifier et écrire ce qui est réellement implémenté. Ce module est réutilisé tel quel en S9 pour la table `integrations`, sans modification.

3. **Implémentation FedaPay** — `lib/payments/gateways/fedapay/index.ts` :
   - Implémenter l'interface complète
   - Adapter les codes de statut et d'erreur vers le vocabulaire interne
   - Les credentials sont lus depuis les `gateway_credentials` chiffrées, jamais depuis les variables d'environnement directement

4. **Polling minimal** — `lib/payments/polling.ts` : sans Inngest (qui n'arrive qu'en S9-S10), un mécanisme simple qui réinterroge le statut à intervalles espacés, un nombre de tentatives borné, et laisse `payment_status = expired` si aucune réponse définitive à la fin. Sera remplacé par une fonction Inngest en S9-S10 — pas une nouvelle conception à ce moment-là, juste un changement d'exécution.

5. **Registre des gateways** — `lib/payments/gateways/index.ts` : map `{ [name]: GatewayImpl }` pour que le webhook handler résolve la bonne implémentation depuis le paramètre d'URL `[gateway]`.

6. **Widget inline** — intégration dans un placeholder de checkout (le checkout complet vient en S7). Pour l'instant, une page de test suffisante pour déclencher un vrai paiement.

7. **Flag `is_test`** — booléen sur `transactions`. Les transactions avec `is_test = true` sont exclues de toutes les stats et agrégations.

8. **Test en argent réel** — déclencher un paiement de faible montant, vérifier l'enregistrement en base, provoquer un échec et vérifier la `failure_reason`.

9. **Vérification Sentry** — contrôler dans le dashboard Sentry qu'aucune donnée sensible n'est loggée.

10. **Rate limiting basique** — `lib/rate-limit.ts` : compteur en mémoire par IP, appliqué dans `middleware.ts` sur les routes `/api/webhooks/*` et `/c/[slug]`. Pas de dépendance externe — un `Map` avec TTL côté serveur suffit pour cette protection initiale. En S17, ce module sera remplacé par `@upstash/ratelimit` pour une protection généralisée et persistante.

**Modules concernés :**
```
lib/payments/gateway.ts                    ← interface
lib/crypto/encrypt.ts                      ← chiffrement/déchiffrement credentials (nouveau, déplacé depuis S2)
lib/payments/gateways/fedapay/index.ts     ← implémentation FedaPay
lib/payments/gateways/index.ts             ← registre
app/api/webhooks/[gateway]/route.ts        ← complété avec FedaPay
app/test-checkout/page.tsx                 ← page de test temporaire (supprimée en S7)
lib/rate-limit.ts                          ← rate limiting basique (remplacé en S17)
middleware.ts                              ← enrichi avec rate limiting
```

**Critères de validation :**
- [ ] Interface `PaymentGateway` abstraite, conçue pour N fournisseurs
- [ ] FedaPay implémentant cette interface
- [ ] Widget inline intégré + webhook en filet de sécurité
- [ ] `lib/crypto/encrypt.ts` écrit et testé, algorithme réel documenté ; `gateway_credentials.credentials_encrypted` lue exclusivement via ce module, jamais depuis une variable d'environnement en dur
- [ ] Un vrai paiement de petit montant effectué et enregistré correctement en base
- [ ] Flag `is_test` fonctionnel, transactions de test exclues des stats
- [ ] Un échec réel provoqué et correctement enregistré avec sa `failure_reason`
- [ ] Polling minimal fonctionnel : une transaction sans webhook reçu finit par passer à `expired` après le nombre de tentatives prévu
- [ ] Aucune donnée sensible en clair dans les logs Sentry
- [ ] Rate limiting basique actif sur `/api/webhooks/*` et `/c/[slug]`

---

### S5 — Seconde passerelle & normalisation · repère 5 oct

**Objectif de la semaine :** le noyau est agnostique passerelle, deux implémentations prouvées.

**Passerelle : PayDunya.** Le compte marchand est ouvert.

**Ordre de réalisation :**

1. **Implémentation PayDunya** — `lib/payments/gateways/paydunya/index.ts` : même interface, zéro modification du noyau. Si une modification du noyau est tentée pour accueillir PayDunya, c'est un signal d'alarme.

2. **Normalisation unifiée des `failure_reason`** — `lib/payments/failure-reasons.ts` : chaque gateway expose une table de mapping `{ [rawCode]: FailureReason }`. La normalisation est testée indépendamment.

3. **Mapping des statuts** — vérifier que les statuts renvoyés par les deux gateways se mapent tous vers `pending | processing | succeeded | failed`. Documenter les codes bruts dans un commentaire dans chaque implémentation.

4. **Fixtures de test** — capturer des payloads réels (succès + chaque type d'échec) pour FedaPay et PayDunya et les stocker dans `tests/fixtures/fedapay/` et `tests/fixtures/paydunya/`. Ces fixtures alimentent les tests sans rejouer de vrais paiements.

5. **Tests CI** — tests des deux adapters avec fixtures, tests du mapping `failure_reason` sur les deux gateways, passant en CI.

**Modules concernés :**
```
lib/payments/gateways/paydunya/index.ts
lib/payments/failure-reasons.ts
tests/fixtures/fedapay/
tests/fixtures/paydunya/
```

**Critères de validation :**
- [ ] PayDunya implémentant `PaymentGateway` sans modifier le noyau
- [ ] Un paiement réel testé sur PayDunya
- [ ] Mapping des statuts unifié entre les deux gateways
- [ ] `failure_reason` normalisé sur les deux : `insufficient_balance`, `operator_timeout`, `user_cancelled`, `invalid_number`, `unknown`
- [ ] Le code métier ne sait pas quelle passerelle est utilisée
- [ ] Tests des deux intégrations passant en CI avec fixtures réelles

---

## ✅ JALON 1 · repère 5 octobre

> **Condition de passage :** tous les critères de S1 à S5 cochés.

- [ ] Un paiement réel arrive en base
- [ ] Sans double-comptage même en cas de rejeu
- [ ] Avec sa cause d'échec normalisée
- [ ] Sur deux passerelles interchangeables

---

## CHECKPOINT 2 — Vendable

### S6 — Offres & livrables fichier · repère 12 oct

**Objectif de la semaine :** un vendeur peut créer une offre et livrer automatiquement un fichier.

**Ordre de réalisation :**

1. **Authentification vendeur** — Supabase Auth : page de connexion (`app/(auth)/login/page.tsx`), middleware Next.js (`middleware.ts`) pour protéger `/(dashboard)/*`, callback OAuth si nécessaire.

2. **Layout dashboard** — `app/(dashboard)/layout.tsx` : navigation latérale, vérification de session, redirection si non authentifié.

3. **CRUD offres** — `app/(dashboard)/offers/` : liste, création, édition, suppression. Server Actions dans `lib/actions/offers.ts`. Validation des inputs avec Zod.

4. **Cloudflare R2** — client R2 dans `lib/storage/r2.ts` via `@aws-sdk/client-s3` (API S3-compatible). Variables : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Client serveur uniquement.

5. **Upload de fichier** — le client demande une presigned PUT URL (Server Action) → upload direct depuis le navigateur vers R2 → confirmation en base. Jamais de fichier transitant par le serveur Next.js.

6. **Lien de téléchargement signé** — à la livraison, générer une presigned GET URL avec expiration (72h) liée à l'email de l'acheteur. La vérification email → objet se fait côté serveur avant de servir le lien.

7. **Déclenchement de la livraison** — au `payment_succeeded`, appeler `lib/deliveries/file.ts` qui génère le lien signé et le stocke en base. Le lien est affiché sur la page de confirmation (étape 4 du checkout). Pas d'envoi email en S6 — l'email de livraison est ajouté en S14 avec SES.

8. **Mise à jour `delivery_status`** — `succeeded` à la livraison, `failed` si erreur.

**Modules concernés :**
```
app/(auth)/login/page.tsx
middleware.ts
app/(dashboard)/layout.tsx
app/(dashboard)/offers/
lib/actions/offers.ts
lib/storage/r2.ts
lib/deliveries/file.ts
```

**Critères de validation :**
- [ ] Authentification vendeur fonctionnelle, routes dashboard protégées
- [ ] CRUD offres complet (liste, création, édition, suppression)
- [ ] Bucket Cloudflare R2 configuré
- [ ] Upload de fichier fonctionnel (presigned PUT, pas de transit serveur)
- [ ] Lien de téléchargement signé et expirant (72h), lié à l'email de l'acheteur
- [ ] Un lien partagé ne fonctionne pas pour un autre email
- [ ] `delivery_status` mis à jour à la livraison

---

### S7 — Checkout & liens de paiement · repère 19 oct

**Objectif de la semaine :** un acheteur peut payer depuis un lien partagé.

**Ordre de réalisation :**

1. **CRUD liens de paiement** — `app/(dashboard)/payment-links/` + `lib/actions/payment-links.ts`. Un lien hérite des données de son offre parente mais peut les surcharger.

2. **Route checkout publique** — `app/c/[slug]/page.tsx`. Pas de middleware d'auth sur cette route. Comptabilise la visite dans `daily_visit_counts`/`visit_dedup` (`payment_link_id`) au chargement — même mécanisme que la page de vente (S8), pas un event.

3. **Étapes du checkout (4 étapes) :**
   - Étape 1 — Résumé : titre, description, montant avec devise, mention paiement direct au vendeur
   - Étape 2 — Identité acheteur : téléphone (obligatoire), email (conditionnel selon livraison), résolution `customer_id`
   - Étape 3 — Paiement : widget gateway inline ou redirection
   - Étape 4 — Confirmation : statut du paiement, prochaine étape

4. **Tracking événements** — `checkout_started` à l'étape 1 ; `checkout_step_completed` avec numéro d'étape à chaque progression.

5. **Détection d'abandon** — transaction `pending` depuis plus de N minutes sans transition = `abandoned`. Logique dans la state machine + requête Supabase périodique (job Inngest en S10).

6. **Design** — `tabular-nums` sur tous les montants (`data-amount` ou classe `.tabular`), `font-sans` pour l'interface, `font-serif` pour le titre du produit et le montant total.

7. **Test mobile** — tester sur un vrai appareil bas de gamme avec connexion 3G simulée avant de valider.

**Modules concernés :**
```
app/(dashboard)/payment-links/
lib/actions/payment-links.ts
app/c/[slug]/page.tsx
app/c/[slug]/steps/
lib/checkout/session.ts
components/checkout/
```

**Critères de validation :**
- [ ] CRUD liens de paiement (titre, description, prix propres au lien)
- [ ] Checkout 4 étapes fonctionnel sur mobile
- [ ] Design conforme au design system, `tabular-nums` sur tous les montants
- [ ] `checkout_started` et `checkout_step_completed` loggés correctement
- [ ] Abandon détecté et enregistré avec l'étape d'abandon
- [ ] Testé sur mobile bas de gamme, connexion lente

---

### S8 — Page de vente · repère 26 oct

**Objectif de la semaine :** un vendeur peut créer une page de vente sans toucher au CSS.

**Ordre de réalisation :**

1. **Schéma de contenu** — `lib/sales-pages/schema.ts` : type `SalesPageContent` (hero_title, hero_subtitle, description, images[], sections : FAQ[], testimonials[], guarantee). Stocké en JSONB dans `sales_pages.content`.

2. **Registre de templates** — `lib/sales-pages/templates/index.ts` : map `{ [template_id]: TemplateComponent }`. Chaque template est un Server Component qui reçoit `SalesPageContent` + `brand_color` + `active_sections`.

3. **Template #1** — `lib/sales-pages/templates/default.tsx` : structure complète (hero, description, CTA, sections toggleables). Seul template obligatoire en S8.

4. **Route publique de la page de vente** — `app/sales/[slug]/page.tsx`, résolue sous le sous-domaine de l'espace (`{space_slug}.siopay.io/sales/{slug}`) : récupère la page liée au slug **dans l'espace résolu depuis le sous-domaine**, rend le template, **incrémente `daily_visit_counts` + `visit_dedup`** (pas un `page_view` dans `events` — retiré, voir `docs/schema-design-notes.md`) : lit le `visitor_id` du cookie (le poser s'il est absent), upsert `visit_dedup(visitor_id, sales_page_id, aujourd'hui)`, incrémente `impressions` toujours et `unique_visits` seulement si la ligne `visit_dedup` vient d'être créée. Anciennement `app/p/[slug]/page.tsx` avec un slug unique globalement — corrigé pour refléter la décision prise sur `sales_pages.slug` (unique par espace, docs/schema-design-notes.md).

5. **Éditeur dans le dashboard** — `app/(dashboard)/payment-links/[id]/page/page.tsx` : formulaire de saisie du contenu, color picker pour `brand_color`, toggles pour les sections. Server Action de sauvegarde.

6. **Validation architecturale** — après S8, ajouter un template #2 factice et mesurer l'effort. Si la création du template #2 ne nécessite que de créer `templates/[nom].tsx` et de l'enregistrer dans la map, le critère est validé.

**Modules concernés :**
```
lib/sales-pages/schema.ts
lib/sales-pages/templates/index.ts
lib/sales-pages/templates/default.tsx
app/sales/[slug]/page.tsx
app/(dashboard)/payment-links/[id]/page/page.tsx
lib/actions/sales-pages.ts
```

**Critères de validation :**
- [ ] Schéma de contenu défini (titre, sous-titre, description, prix, images, sections)
- [ ] 1 design complet implémenté et rendu en production
- [ ] Champs texte éditables dans le dashboard
- [ ] Couleur de marque configurable par vendeur
- [ ] Sections activables en toggle : FAQ, témoignages, garantie
- [ ] Ordre des sections fixe — pas de réorganisation
- [ ] Visite comptabilisée dans `daily_visit_counts` (impressions + unique) à chaque chargement de la page de vente, jamais dans `events`
- [ ] Validation architecturale : ajouter un 2e design coûte moins d'un jour

---

### S9 — Livraison plateformes tierces · repère 2 nov

**Objectif de la semaine :** livraison automatique sur Systeme.io et Skool, retry durable via Inngest.

**Ordre de réalisation :**

1. **Installation Inngest** — `npm install inngest`. Client dans `inngest/client.ts` : `new Inngest({ id: 'siopay' })`. Route handler dans `app/api/inngest/route.ts`. Variables : `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

2. **Interface DeliveryProvider** — `lib/deliveries/provider.ts` :
   ```ts
   interface DeliveryProvider {
     name: string
     deliver(params: DeliveryParams): Promise<DeliveryResult>
   }
   ```

3. **Chiffrement credentials tiers** — table `integrations` (générique — comptes tiers connectés, pas propre à la livraison : réutilisée plus tard par le moteur d'automatisation pour ses propres actions, ex. ajouter un tag Systeme.io après des relances infructueuses) avec `credentials_encrypted`. Anciennement nommée `platform_credentials` dans cette version du plan — corrigé pour refléter sa portée élargie (`docs/schema-design-notes.md`). Helpers réutilisés depuis `lib/crypto/encrypt.ts`.

4. **Deux intégrations** — `lib/deliveries/providers/systeme-io/index.ts` et `lib/deliveries/providers/skool/index.ts` : appel à l'API de chaque plateforme pour inscrire l'acheteur ou lui donner accès.

5. **Retry livraison via Inngest** — `inngest/functions/delivery-retry.ts` : `step.run` pour chaque tentative, backoff 1min / 5min / 15min, abandon après 3 échecs. Pas de module intermédiaire jetable — Inngest est la solution définitive dès S9.

6. **Alerte vendeur** — après 3 échecs, créer un event `delivery_failed_persistent`. L'alerte email viendra en S14.

7. **`delivery_status` visible** — dans la fiche de vente du dashboard, afficher `payment_status` et `delivery_status` côte à côte.

8. **Tests** — mocker les API des plateformes, tester : succès, échec ponctuel récupéré, échec persistant.

**Modules concernés :**
```
inngest/client.ts                              ← client Inngest (installé ici)
inngest/functions/delivery-retry.ts           ← retry livraison via Inngest
app/api/inngest/route.ts                       ← route handler Inngest
lib/deliveries/provider.ts
lib/deliveries/providers/systeme-io/index.ts
lib/deliveries/providers/skool/index.ts
lib/crypto/encrypt.ts                          ← réutilisé
```

**Critères de validation :**
- [ ] Inngest installé, client et route handler en place
- [ ] Interface `DeliveryProvider` abstraite
- [ ] Intégration Systeme.io fonctionnelle
- [ ] Intégration Skool fonctionnelle
- [ ] Credentials clients chiffrés en base, jamais en clair
- [ ] Retry 3× avec backoff via Inngest (`step.run`)
- [ ] Event `delivery_failed_persistent` créé après 3 échecs
- [ ] `delivery_status` visible dans la fiche de vente
- [ ] Le paiement n'est jamais bloqué par un échec de livraison
- [ ] Tests des 3 scénarios passant en CI

---

## ✅ JALON 2 · repère 2 novembre

> **Condition de passage :** tous les critères de S6 à S9 cochés.

- [ ] Un vendeur crée une offre
- [ ] La vend via une page de vente
- [ ] L'acheteur reçoit automatiquement son accès ou son fichier

---

## CHECKPOINT 3 — Pilotage

### S10 — Jobs & infrastructure Inngest · repère 9 nov

**Objectif de la semaine :** Inngest (installé en S9) prend en charge les webhooks entrants ; infrastructure de jobs complète et vérifiable.

**Ordre de réalisation :**

1. **Retry webhooks entrants** — `inngest/functions/webhook-retry.ts` : transformer le retry inline de la route webhook en fonction Inngest avec `step.run` et délai configurable. Même pattern que `delivery-retry.ts` déjà en place.

2. **Job de test** — `inngest/functions/health-check.ts` : job déclenché manuellement depuis le dashboard Inngest, exécuté avec un délai d'1 minute, résultat vérifiable.

3. **Vérification dashboard** — s'assurer que tous les jobs (livraison + webhooks) sont lisibles dans le dashboard Inngest : file d'attente, historique, échecs.

4. **Nettoyage périodique `visit_dedup`** — `inngest/functions/visit-dedup-cleanup.ts` : fonction cron quotidienne qui supprime les lignes de plus de quelques jours. Cette table n'a d'utilité que pour répondre à "ce visiteur est-il déjà passé aujourd'hui" (`docs/schema-design-notes.md`) — contrairement à `events`/`transactions`, rien à conserver indéfiniment. Accumule depuis S8 sans purge (Inngest pas encore installé à ce moment) ; ce job résorbe le retard à son premier passage.

**Modules concernés :**
```
inngest/functions/webhook-retry.ts        ← nouveau
inngest/functions/health-check.ts         ← nouveau
inngest/functions/visit-dedup-cleanup.ts  ← nouveau
app/api/inngest/route.ts                  ← enrichi (nouvelles fonctions enregistrées)
```

**Critères de validation :**
- [ ] Retry des webhooks entrants géré par Inngest (`webhook-retry.ts`)
- [ ] Job différé testé avec délai d'1 minute (`health-check.ts`)
- [ ] Dashboard Inngest lisible : jobs livraison + webhooks, file d'attente, échecs visibles
- [ ] Purge quotidienne de `visit_dedup` active (`visit-dedup-cleanup.ts`), lignes de plus de quelques jours supprimées

---

### S11 — Fiche client timeline · repère 16 nov

**Objectif de la semaine :** le différenciateur principal — vue complète du parcours d'un client.

**Ordre de réalisation :**

1. **Liste des clients** — `app/(dashboard)/customers/page.tsx` : table paginée, filtrée par `space_id` via RLS (corrigé — `customers` se rattache à l'espace, pas au compte, `docs/schema-design-notes.md`), triée par dernière activité.

2. **Résolution multi-tentatives** — vérifier que les événements multiples d'un même acheteur (même email normalisé) sont bien regroupés sous un seul `customer_id`. Le téléphone n'est jamais un signal de matching ou de fusion, automatique ou manuel : une correspondance de téléphone entre deux `customer_id` d'emails différents ne doit jamais être proposée comme fusion possible.

3. **Fiche client** — `app/(dashboard)/customers/[id]/page.tsx` :
   - En-tête : téléphone, email, stats agrégées
   - Timeline chronologique : requête sur `events` + `transactions` + `deliveries` triés par `created_at`
   - Chaque événement rendu avec son type (icône différente), horodatage, et données clés

4. **Stats agrégées** — `lib/analytics/customer.ts` : total dépensé, nombre d'achats, panier moyen, premier achat, dernier achat. Requête SQL unique.

5. **Composants timeline** — `components/timeline/` : composants réutilisables par type d'événement. À soigner particulièrement (différenciateur principal, PRD §13).

**Modules concernés :**
```
app/(dashboard)/customers/page.tsx
app/(dashboard)/customers/[id]/page.tsx
lib/analytics/customer.ts
components/timeline/
```

**Critères de validation :**
- [ ] Liste clients paginée, cliquable, triée par dernière activité
- [ ] Fiche client accessible depuis la liste
- [ ] Timeline chronologique complète : visites, tentatives de paiement, échecs avec cause, achats, livraisons
- [ ] Stats par client : total dépensé, nombre d'achats, panier moyen, premier/dernier achat
- [ ] Tentatives multiples du même acheteur (même email normalisé) regroupées sous un seul `customer_id` — jamais par correspondance de téléphone
- [ ] Rendu visuel soigné — c'est le différenciateur principal du produit

---

### S12 — Page Revenue · repère 23 nov

**Objectif de la semaine :** le vendeur comprend où il perd des conversions.

**Ordre de réalisation :**

1. **Requêtes d'agrégation** — `lib/analytics/revenue.ts` : revenu total/en attente/réglé, funnel par type d'event, taux d'abandon par étape, répartition `failure_reason`, performance par offre et par lien.

2. **Page Revenue** — `app/(dashboard)/revenue/page.tsx` : métriques en haut, funnel, breakdowns. Filtre temporel (7j / 30j / 90j).

3. **Montants avec devise** — tous les montants en devise de zone du compte, avec `tabular-nums`.

**Modules concernés :**
```
lib/analytics/revenue.ts
app/(dashboard)/revenue/page.tsx
components/analytics/
```

**Critères de validation :**
- [ ] Revenu total, en attente, réglé affiché avec devise
- [ ] Funnel : vues → checkouts démarrés → paiements tentés → réussis
- [ ] Taux d'abandon par étape de checkout
- [ ] Répartition des causes d'échec (`failure_reason`)
- [ ] Performance par offre et par lien de paiement
- [ ] Filtre temporel fonctionnel (7j / 30j / 90j)

---

### S13 — Webhook sortant · repère 30 nov

**Objectif de la semaine :** le vendeur peut brancher ses outils (Make, n8n).

**Ordre de réalisation :**

1. **Configuration dans le dashboard** — `app/(dashboard)/settings/webhooks/page.tsx` : URL de destination, génération d'un secret HMAC. Secret affiché une seule fois, stocké hashé.

2. **Constructeur de payload** — `lib/webhooks/outgoing.ts` : payload normalisé pour `payment_succeeded`, `payment_failed`, `refund_issued`. Signature HMAC-SHA256 dans le header `X-SioPay-Signature`. Aucune donnée sensible dans le payload.

3. **Fonction Inngest de livraison** — `inngest/functions/webhook-delivery.ts` : `step.run` pour l'envoi HTTP, retry avec backoff sur 5xx/timeout, abandon après N tentatives.

4. **Log de livraison** — table `webhook_deliveries` (id, account_id, event_type, url, status_code, delivered_at, attempts). Visible dans Paramètres → Webhooks.

5. **Test Make/n8n** — créer un scénario de test qui reçoit le webhook et log les données.

**Modules concernés :**
```
lib/webhooks/outgoing.ts
inngest/functions/webhook-delivery.ts
app/(dashboard)/settings/webhooks/
```

**Critères de validation :**
- [ ] URL de webhook configurable par compte
- [ ] Événements sortants : `payment_succeeded`, `payment_failed` (pas de `refund_issued` — SioPay ne gère pas le remboursement, décision du 20 sept)
- [ ] Payload signé HMAC-SHA256, aucune donnée sensible
- [ ] Retry avec backoff via Inngest
- [ ] Log de livraison visible côté vendeur
- [ ] Testé avec un vrai scénario Make ou n8n

---

## ✅ JALON 3 · repère 30 novembre

> **Condition de passage :** tous les critères de S10 à S13 cochés.

- [ ] Le vendeur voit le parcours complet de chaque client
- [ ] Les stats de conversion sont lisibles
- [ ] Le vendeur peut brancher ses outils via webhook sortant

---

## CHECKPOINT 4 — Automatisations

### S14 — Moteur & premier playbook · repère 7 déc

**Objectif de la semaine :** les relances tournent sur le canal email.

**Ordre de réalisation :**

1. **SES en production** — demander sortie du sandbox AWS SES ; vérifier le domaine d'envoi (DKIM, SPF, DMARC). Variables : `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

2. **Interface MessagingProvider** — `lib/messaging/provider.ts` :
   ```ts
   interface MessagingProvider {
     channel: 'email' | 'whatsapp' | 'sms'
     send(params: MessageParams): Promise<MessageResult>
   }
   ```

3. **Implémentation SES** — `lib/messaging/providers/ses.ts` via `@aws-sdk/client-ses`. Identité d'envoi par vendeur.

4. **Moteur de playbooks** — `lib/automations/engine.ts` : structure `{ trigger, delay, conditions[], action }` stockée en JSON dans une table `playbooks`. Évaluation par une fonction Inngest périodique.

5. **Playbook "abandon de checkout"** — `lib/automations/playbooks/checkout-abandon.ts` : déclenché 30min après l'abandon, message prédéfini avec lien de reprise, activable en 1 clic.

6. **Isolation de réputation** — table `vendor_email_identities`. Bounces/plaintes SNS traités par `app/api/ses/sns/route.ts`, qui blackliste les adresses dans `suppressed_emails`.

**Modules concernés :**
```
lib/messaging/provider.ts
lib/messaging/providers/ses.ts
lib/automations/engine.ts
lib/automations/playbooks/checkout-abandon.ts
inngest/functions/automation-runner.ts
app/api/ses/sns/route.ts
```

**Critères de validation :**
- [ ] SES sorti du sandbox, domaine vérifié (DKIM, SPF, DMARC)
- [ ] Interface `MessagingProvider` abstraite et canal-agnostic
- [ ] Moteur de playbooks : déclencheur → délai → condition → action
- [ ] Playbook "abandon de checkout" activable en 1 clic et opérationnel
- [ ] Identité SES distincte par vendeur (isolation de réputation)
- [ ] Bounces et plaintes traités via SNS, adresses supprimées automatiquement

---

### S15 — Playbooks & crédits · repère 14 déc

**Objectif de la semaine :** trois playbooks actifs, modèle économique en base.

**Ordre de réalisation :**

1. **Playbook "échec par cause"** — `lib/automations/playbooks/payment-failure.ts` : déclencheur `payment_failed`, condition sur `failure_reason`, message adapté à chaque cause.

2. **Playbook "client dormant 30j"** — `lib/automations/playbooks/dormant-customer.ts` : déclencheur `no_purchase_since`, délai 30 jours, message de réengagement.

3. **Modèle de crédits** — `lib/billing/credits.ts` :
   - Table `credit_ledger` (id, account_id, delta, reason, created_at) — journal immuable
   - Coût par type d'action : `email` = 1 crédit, configurable par canal
   - Fonction `debitCredits(account_id, amount, reason)` appelée avant chaque action

4. **Affichage du coût** — avant activation d'un playbook : coût estimé par déclenchement et fréquence attendue.

5. **Dégradation douce** — si `credits_remaining < 0` : tolérer jusqu'à -20%, loguer l'alerte, notifier le vendeur, jamais couper une séquence en cours.

6. **Table `plans`** — alimenter avec les paliers (noms et limites de crédits). Prix réels fixés en S18.

**Modules concernés :**
```
lib/automations/playbooks/payment-failure.ts
lib/automations/playbooks/dormant-customer.ts
lib/billing/credits.ts
```

**Critères de validation :**
- [ ] Playbook "échec de paiement par cause" — message adapté selon `failure_reason`
- [ ] Playbook "client dormant 30j" fonctionnel
- [ ] Compteur de crédits d'automatisation avec journal immuable
- [ ] Coût affiché avant activation d'un playbook
- [ ] Dégradation douce : dépassement toléré, notification vendeur, jamais de coupure en pleine séquence
- [ ] Table `plans` avec paliers (montants injectables en S18)

---

### S16 — Attribution · repère 21 déc

**Objectif de la semaine :** chaque relance est tracée jusqu'à la conversion qu'elle produit.

**Ordre de réalisation :**

1. **Attribution ID** — à l'envoi de chaque message automatisé, générer un `attribution_id` (UUID) stocké dans l'event. L'URL de reprise inclut `?ref=[attribution_id]`.

2. **Capture de la conversion** — si un paiement succeed avec un `ref` valide en session, créer un event `conversion_attributed` liant `attribution_id` → `transaction_id`.

3. **Calcul ROI** — `lib/automations/attribution.ts` : revenu attribué, coût en crédits × prix unitaire, ratio affiché par playbook.

4. **Affichage dashboard** — `app/(dashboard)/automations/[id]/page.tsx` : "Ce playbook t'a rapporté X pour Y crédits consommés".

5. **Rentabilité par client** — dans la fiche client : total des coûts de relance vs total des revenus générés.

**Modules concernés :**
```
lib/automations/attribution.ts
app/(dashboard)/automations/[id]/page.tsx
app/(dashboard)/customers/[id]/page.tsx    ← enrichi
```

**Critères de validation :**
- [ ] Chaque relance porte un `attribution_id` unique
- [ ] Conversion après relance tracée jusqu'au `transaction_id`
- [ ] "Ce playbook t'a rapporté X" affiché sur chaque playbook actif
- [ ] Coût en crédits vs revenu généré visible par playbook
- [ ] Rentabilité par client calculable depuis la fiche client

---

## ✅ JALON 4 · repère 21 décembre

> **Condition de passage :** tous les critères de S14 à S16 cochés.

- [ ] Les relances tournent automatiquement
- [ ] Le vendeur voit ce que chaque relance lui rapporte

---

## CHECKPOINT 5 — Durcissement

### S17 — Tests & sécurité · repère 28 déc

**Objectif de la semaine :** le produit est fiable, les surfaces d'attaque sont fermées.

**Ordre de réalisation :**

1. **Tests E2E** — installer Playwright. Scénario principal : visite page de vente → checkout complet → vérification en base. Scénario secondaire : webhook rejoué → idempotence vérifiée.

2. **Revue du noyau monétaire** — second agent (session séparée) relit `lib/payments/` et `supabase/migrations/` avec focus : idempotence, RLS, chiffrement, gestion des erreurs.

3. **Audit sécurité** — checklist : aucune donnée sensible dans les logs (grep systématique), RLS étanche (test cross-account), secrets en variables d'environnement uniquement, headers HTTP (HSTS, CSP, X-Frame-Options dans `next.config.ts`).

4. **Rate limiting Upstash** — remplacer `lib/rate-limit.ts` (compteur en mémoire de S4) par `@upstash/ratelimit`. Variables : `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Étendre la protection à tous les endpoints publics : webhooks entrants, checkout, téléchargement signé. Le compteur en mémoire de S4 est supprimé.

5. **Tests de charge** — k6 ou artillery sur les endpoints publics. Objectif : pas de dégradation visible sous 50 req/s.

6. **Sentry** — traiter les erreurs critiques remontées depuis S4. Ajuster `tracesSampleRate` à 0.1.

**Modules concernés :**
```
tests/e2e/
lib/rate-limit.ts
middleware.ts                   ← enrichi avec rate limiting
next.config.ts                  ← headers de sécurité
```

**Critères de validation :**
- [ ] Parcours complet testé de bout en bout avec Playwright
- [ ] Idempotence testée E2E : webhook rejoué → une seule transaction
- [ ] Revue croisée du noyau monétaire par un second agent, résultats traités
- [ ] Audit : aucune donnée sensible en clair dans les logs
- [ ] RLS étanche confirmée cross-account
- [ ] Secrets uniquement en variables d'environnement
- [ ] Headers de sécurité HTTP configurés (HSTS, CSP, X-Frame-Options)
- [ ] Rate limiting Upstash actif sur tous les endpoints publics (remplace le compteur en mémoire de S4)
- [ ] Tests de charge validés (pas de dégradation sous 50 req/s)
- [ ] Erreurs Sentry critiques traitées, `tracesSampleRate` à 0.1

---

### S18 — Polish & démo · repère 4 jan

**Objectif de la semaine :** un inconnu peut acheter sans aide.

**Ordre de réalisation :**

1. **Onboarding** — `app/(dashboard)/onboarding/page.tsx` : wizard 3 étapes (créer offre → connecter passerelle → partager le lien). Objectif : lien partageable en moins de 5 minutes.

2. **États vides** — passer en revue toutes les vues dashboard et ajouter un état vide (illustration + action principale) : offres, clients, liens, automatisations.

3. **Messages d'erreur** — audit de tous les `try/catch` et retours d'erreur côté UI : remplacer les codes techniques par des messages actionnables.

4. **Nettoyage** — supprimer `app/sentry-example-page/` et `app/api/sentry-example-api/`.

5. **Prix des formules** — injecter les valeurs dans la table `plans`. Afficher la page de tarifs.

6. **Test externe** — session avec un testeur qui n'a jamais vu le produit. Observer sans intervenir. Lister les points de friction. Corriger.

**Critères de validation :**
- [ ] Onboarding minimal : créer sa première offre et obtenir un lien en moins de 5 minutes
- [ ] États vides soignés sur toutes les vues dashboard
- [ ] Messages d'erreur clairs et actionnables (aucun code technique exposé)
- [ ] `app/sentry-example-page/` et `app/api/sentry-example-api/` supprimés
- [ ] Prix des formules fixés et affichés
- [ ] Un testeur externe fait un achat complet sans aide

---

## ✅ JALON FINAL · repère 4 janvier

> **Condition de passage :** tous les critères de S17 et S18 cochés.

- [ ] Un inconnu peut acheter sans aide
- [ ] Le produit est sécurisé et fiable
- [ ] Le vendeur est autonome dès l'onboarding

---

## Grille de décision en cas de retard

Leviers d'allègement, dans cet ordre :
1. Passer de 3 playbooks à 1 (garder "abandon de checkout")
2. Reporter la seconde intégration de livraison
3. Reporter la seconde passerelle après le lancement
4. Simplifier la page Revenue (garder la timeline client, c'est le différenciateur)

**Ne jamais alléger le Checkpoint 1.**

