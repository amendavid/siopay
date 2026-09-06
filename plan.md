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

1. **Outillage Supabase** — installer `@supabase/supabase-js` et `supabase` CLI ; initialiser la config locale (`supabase init`) ; ajouter `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` et sur Vercel.

2. **Client Supabase** — `lib/db/client.ts` : deux exports — `createServerClient()` (service role, serveur uniquement) et `createBrowserClient()` (anon key). Ne jamais exposer la service role key côté client.

3. **Migrations (ordre imposé par les dépendances FK) :**
   - `0001_accounts.sql` — table `accounts` (id, user_id → auth.users, currency_zone, display_currency, created_at, updated_at)
   - `0002_customers.sql` — table `customers` (id, account_id, phone, email, fingerprint pour résolution d'identité, created_at)
   - `0003_plans.sql` — table `plans` (id, name, credit_allowance, price_monthly — valeurs injectées en S15)
   - `0004_offers.sql` — table `offers` (id, account_id, title, delivery_config jsonb, created_at)
   - `0005_payment_links.sql` — table `payment_links` (id, offer_id, title, description, amount, currency, slug unique, created_at)
   - `0006_sales_pages.sql` — table `sales_pages` (id, payment_link_id, template_id, content jsonb, brand_color, active_sections jsonb, created_at) — `payment_link_id` nullable pour permettre une page sans lien direct
   - `0007_transactions.sql` — table `transactions` (id, account_id, customer_id, payment_link_id, external_id unique, amount, currency, payment_status, delivery_status, failure_reason, is_test, gateway, created_at, updated_at)
   - `0008_events.sql` — table `events` (id, account_id, customer_id, transaction_id nullable, type, payload jsonb, created_at)
   - `0009_deliveries.sql` — table `deliveries` (id, transaction_id, provider, status, attempts, last_error, delivered_at, created_at)
   - `0010_gateway_credentials.sql` — table `gateway_credentials` (id, account_id, gateway, credentials_encrypted bytea, currency, is_default, created_at)

4. **Chiffrement des credentials** — chiffrement au niveau applicatif avec `libsodium-wrappers` : la clé de chiffrement est une variable d'environnement serveur (`ENCRYPTION_KEY`). Les credentials ne sont jamais stockés en clair. Helpers dans `lib/crypto/encrypt.ts`.

5. **RLS** — pour chaque table métier : `USING (account_id = auth.uid())` (ou via join accounts). Tester avec deux comptes distincts.

6. **Types TypeScript** — générer avec `supabase gen types typescript --local > lib/db/types.ts`. À regénérer après chaque migration.

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
- [ ] Tables créées : accounts, offers, payment_links, sales_pages, transactions, customers, events, deliveries, plans, gateway_credentials
- [ ] Identité client résolue : un même acheteur sur plusieurs tentatives = un seul `customer_id`
- [ ] `transactions` porte `payment_status` ET `delivery_status` distincts
- [ ] `events` prêt à recevoir : `page_view`, `checkout_started`, `checkout_step_completed`, `payment_attempted`, `payment_succeeded`, `payment_failed`
- [ ] Relation Offre → Lien de paiement → Page de vente (page optionnelle)
- [ ] Devise de zone au niveau du compte, devise déclarée par passerelle
- [ ] Aucun montant stocké sans sa devise
- [ ] RLS activée sur toutes les tables métier
- [ ] RLS testée : compte A ne peut jamais lire les données du compte B
- [ ] Credentials passerelles chiffrés en base, jamais en clair
- [ ] Types TypeScript générés depuis le schéma local
- [ ] Migrations versionnées dans le repo

---

### S3 — Machine à états & idempotence · repère 21 sept

**Objectif de la semaine :** noyau de paiement spécifié, testé, CI en place.

**Ordre de réalisation :**

1. **Framework de test** — installer Vitest + `@vitest/coverage-v8`. Config dans `vitest.config.ts`. Ajouter `"test": "vitest"` dans `package.json`. CI GitHub Actions : `.github/workflows/ci.yml` qui lance `npm test` sur chaque push.

2. **Types & contrats** — `lib/payments/types.ts` : enum `TransactionStatus` (pending, processing, succeeded, failed, abandoned, refunded), enum `FailureReason`, type `PaymentWebhookPayload`. Ces types sont le contrat de l'interface gateway — écrire les tests dessus avant le code.

3. **Machine à états** — `lib/payments/state-machine.ts` :
   - Fonction pure `transition(current: TransactionStatus, event: TransactionEvent): TransactionStatus | Error`
   - Table des transitions valides (matrice d'adjacence)
   - Retourne une erreur typée si la transition est invalide — jamais d'exception silencieuse

4. **Idempotence** — `lib/payments/idempotence.ts` :
   - Contrainte `UNIQUE` sur `transactions.external_id`
   - Fonction `upsertTransaction(payload)` : cherche d'abord par `external_id`, retourne l'existant si trouvé, crée sinon
   - Le noyau de livraison et de stats n'est déclenché qu'à la première insertion, pas sur les doublons

5. **Vérification de signature** — `lib/payments/webhook-verification.ts` :
   - Fonction `verifySignature(payload: string, signature: string, secret: string): boolean` (HMAC-SHA256)
   - Signature invalide → rejeter immédiatement, loguer via Sentry (sans le payload brut)

6. **Validation des montants** — `lib/payments/validation.ts` :
   - Vérifier que `amount` est un entier positif
   - Vérifier que `currency` est une devise connue (depuis la config, jamais une constante inline)
   - Champ inattendu ou mal typé → loguer et rejeter, jamais absorber silencieusement

7. **Route webhook** — `app/api/webhooks/[gateway]/route.ts` (placeholder) : orchestre vérification de signature → idempotence → machine à états → insertion en base. Le code du gateway est délégué à S4.

**Modules concernés :**
```
lib/payments/types.ts
lib/payments/state-machine.ts
lib/payments/idempotence.ts
lib/payments/webhook-verification.ts
lib/payments/validation.ts
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
- [ ] Vérification de signature HMAC sur tous les webhooks entrants
- [ ] Signature invalide → rejetée et loggée sans exposer le payload brut
- [ ] Montant mal typé → détecté et logué, jamais silencieusement corrompu
- [ ] Tests automatisés couvrant tous ces cas, passant en CI

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

2. **Implémentation FedaPay** — `lib/payments/gateways/fedapay/index.ts` :
   - Implémenter l'interface complète
   - Adapter les codes de statut et d'erreur vers le vocabulaire interne
   - Les credentials sont lus depuis les `gateway_credentials` chiffrées, jamais depuis les variables d'environnement directement

3. **Registre des gateways** — `lib/payments/gateways/index.ts` : map `{ [name]: GatewayImpl }` pour que le webhook handler résolve la bonne implémentation depuis le paramètre d'URL `[gateway]`.

4. **Widget inline** — intégration dans un placeholder de checkout (le checkout complet vient en S7). Pour l'instant, une page de test suffisante pour déclencher un vrai paiement.

5. **Flag `is_test`** — booléen sur `transactions`. Les transactions avec `is_test = true` sont exclues de toutes les stats et agrégations.

6. **Test en argent réel** — déclencher un paiement de faible montant, vérifier l'enregistrement en base, provoquer un échec et vérifier la `failure_reason`.

7. **Vérification Sentry** — contrôler dans le dashboard Sentry qu'aucune donnée sensible n'est loggée.

8. **Rate limiting basique** — `lib/rate-limit.ts` : compteur en mémoire par IP, appliqué dans `middleware.ts` sur les routes `/api/webhooks/*` et `/c/[slug]`. Pas de dépendance externe — un `Map` avec TTL côté serveur suffit pour cette protection initiale. En S17, ce module sera remplacé par `@upstash/ratelimit` pour une protection généralisée et persistante.

**Modules concernés :**
```
lib/payments/gateway.ts                    ← interface
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
- [ ] Un vrai paiement de petit montant effectué et enregistré correctement en base
- [ ] Flag `is_test` fonctionnel, transactions de test exclues des stats
- [ ] Un échec réel provoqué et correctement enregistré avec sa `failure_reason`
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

2. **Route checkout publique** — `app/c/[slug]/page.tsx`. Pas de middleware d'auth sur cette route.

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

4. **Route publique de la page de vente** — `app/p/[slug]/page.tsx` : récupère la page liée au slug, rend le template, log `page_view`.

5. **Éditeur dans le dashboard** — `app/(dashboard)/payment-links/[id]/page/page.tsx` : formulaire de saisie du contenu, color picker pour `brand_color`, toggles pour les sections. Server Action de sauvegarde.

6. **Validation architecturale** — après S8, ajouter un template #2 factice et mesurer l'effort. Si la création du template #2 ne nécessite que de créer `templates/[nom].tsx` et de l'enregistrer dans la map, le critère est validé.

**Modules concernés :**
```
lib/sales-pages/schema.ts
lib/sales-pages/templates/index.ts
lib/sales-pages/templates/default.tsx
app/p/[slug]/page.tsx
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
- [ ] `page_view` loggé à chaque visite
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

3. **Chiffrement credentials tiers** — table `platform_credentials` avec `credentials_encrypted`. Helpers réutilisés depuis `lib/crypto/encrypt.ts`.

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

**Modules concernés :**
```
inngest/functions/webhook-retry.ts    ← nouveau
inngest/functions/health-check.ts     ← nouveau
app/api/inngest/route.ts              ← enrichi (nouvelles fonctions enregistrées)
```

**Critères de validation :**
- [ ] Retry des webhooks entrants géré par Inngest (`webhook-retry.ts`)
- [ ] Job différé testé avec délai d'1 minute (`health-check.ts`)
- [ ] Dashboard Inngest lisible : jobs livraison + webhooks, file d'attente, échecs visibles

---

### S11 — Fiche client timeline · repère 16 nov

**Objectif de la semaine :** le différenciateur principal — vue complète du parcours d'un client.

**Ordre de réalisation :**

1. **Liste des clients** — `app/(dashboard)/customers/page.tsx` : table paginée, filtrée par `account_id` via RLS, triée par dernière activité.

2. **Résolution multi-tentatives** — vérifier que les événements multiples d'un même acheteur sont bien regroupés. Si des `customer_id` dupliqués existent, ajouter une logique de merge dans `lib/analytics/customer.ts`.

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
- [ ] Tentatives multiples du même acheteur regroupées sous un seul `customer_id`
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
- [ ] Événements sortants : `payment_succeeded`, `payment_failed`, `refund_issued`
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

