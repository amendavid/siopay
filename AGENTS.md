<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

> Pour le contexte produit (quoi / pourquoi), voir `PRD.md`.

---

## Démarrage

```bash
npm install          # installation des dépendances
npm run dev          # serveur de développement (next dev)
npm run build        # build de production
npm run start        # serveur de production local
npm run lint         # eslint (next/core-web-vitals + typescript)
```

Pas de framework de test configuré à ce stade.

---

## Stack installée

| Brique | Package / version |
|---|---|
| Framework | Next.js 16.3.4, App Router, React 19 |
| Langage | TypeScript 5, mode `strict` |
| Styles | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| Composants UI | shadcn/ui (style `radix-nova`), Radix UI |
| Icônes | Lucide React |
| Monitoring | Sentry (`@sentry/nextjs` v10) |
| CSS utilities | `cn` (package `cn`), `class-variance-authority` |

**Prévu mais pas encore installé :** Supabase, Inngest, Upstash Redis, Cloudflare R2, Amazon SES.

---

## Structure des dossiers

```
app/                     # Routes Next.js App Router
  layout.tsx             # Layout racine (polices, metadata)
  globals.css            # Tokens de design + reset + shadcn CSS
  page.tsx               # Page d'accueil
  global-error.tsx       # Boundary d'erreur global (Sentry)
  api/                   # Route handlers
  sentry-example-page/   # Exemple Sentry — à supprimer avant le premier vrai écran

components/
  ui/                    # Composants shadcn/ui installés (ne pas modifier manuellement)

lib/
  utils.ts               # Re-export de `cn` — ne pas enrichir ad hoc

public/                  # Assets statiques servis tel quel

instrumentation.ts       # Point d'entrée Next.js — charge sentry.server/edge selon le runtime
instrumentation-client.ts # Init Sentry côté client (nouvelle convention Next.js App Router)
sentry.server.config.ts  # Init Sentry côté serveur (chargé par instrumentation.ts)
sentry.edge.config.ts    # Init Sentry edge (chargé par instrumentation.ts)
next.config.ts           # Config Next.js (wrappée par withSentryConfig)
components.json          # Config shadcn/ui
```

### Où ajouter du code nouveau

| Type | Emplacement |
|---|---|
| Nouveau composant UI shadcn | `npx shadcn add <composant>` → `components/ui/` |
| Composant métier / feature | `components/<feature>/` (convention proposée, pas encore établie) |
| Logique partagée | `lib/<module>.ts` |
| Hooks React | `hooks/` |
| Route page | `app/<segment>/page.tsx` |
| Route API | `app/api/<segment>/route.ts` |
| Server action | `app/<segment>/actions.ts` ou `lib/actions/<module>.ts` |

---

## Conventions de code

### Typage

- TypeScript strict activé — pas de `any`, pas de cast abusif
- Toutes les props de composant typées avec `React.ComponentProps` ou une interface dédiée
- Un montant n'existe jamais seul : toujours un objet `{ amount: number; currency: string }` (règle PRD §4)

### Nommage

- Fichiers composants : `PascalCase.tsx`
- Fichiers utilitaires et hooks : `camelCase.ts`
- Constantes de configuration (pays, devises, opérateurs) : `UPPER_SNAKE_CASE` dans des fichiers de config dédiés, jamais inline dans la logique métier

### Composants

- Server Components par défaut — ajouter `"use client"` uniquement si nécessaire (interactivité, hooks, effets)
- Les composants `components/ui/` viennent de shadcn et utilisent `cn` importé depuis le package `cn` (pas depuis `@/lib/utils`, sauf pour la compat shadcn)
- `asChild` via `Slot.Root` de `radix-ui` (pas `@radix-ui/react-slot`)

### Gestion des erreurs

- Ne jamais avaler silencieusement une erreur dans le noyau de paiement
- Toujours loguer via Sentry (`Sentry.captureException`) avant de relancer ou de répondre avec une erreur
- Aucune donnée sensible dans les messages d'erreur ou les logs (clés API, tokens, numéros de téléphone)

### Patterns à suivre

- Logique métier dans `lib/`, pas dans les composants ni dans les routes
- Une route handler ne fait qu'orchestrer : valider l'entrée, appeler la lib, retourner la réponse
- Les passerelles de paiement implémentent une interface commune — le code appelant ne connaît pas le nom de l'agrégateur (PRD §4)

### Patterns à éviter

- `useEffect` pour charger des données — utiliser les Server Components ou les Server Actions
- Logique conditionnelle basée sur un pays, une devise ou une langue codée en dur
- Montants sans devise associée, n'importe où (BDD, API, UI)

---

## Design system

Tous les tokens sont dans `app/globals.css`, dans le bloc `@theme`. Tailwind v4 : pas de `tailwind.config.js`, la configuration se fait entièrement en CSS.

### Couleurs

| Token | Valeur | Usage |
|---|---|---|
| `brand-500` | `#1E6DF6` | Actions : boutons, liens, focus, montant total |
| `brand-600` | `#1553C4` | Hover, texte sur fond clair |
| `success-500` | `#34C759` | Confirmations, réductions, statuts de succès |
| `success-600` | `#22A34A` | Texte vert sur fond clair |
| `danger-500` | `#DC2626` | Erreurs |
| `warning-500` | `#F59E0B` | Avertissements |
| `ink-900` | `#0A0A0A` | Texte principal |
| `ink-700` | `#404040` | Texte secondaire |
| `ink-500` | `#737373` | Texte tertiaire |
| `ink-300` | `#D4D4D4` | Bordures |
| `ink-50` | `#FAFAFA` | Fond de page |

**Regle absolue :** `success-*` est réservé aux états de succès/confiance — jamais décoratif. `brand-*` porte l'action.

### Typographie

- `font-sans` → Plus Jakarta Sans (`--font-jakarta`) — corps de texte, interface
- `font-serif` → Instrument Serif (`--font-instrument`) — titres éditoriaux, titre produit sur le checkout, montant total uniquement
- Montants : `font-sans` + classe `.tabular` ou attribut `data-amount` (active `tabular-nums`) — obligatoire sur tout affichage de chiffre financier

### Rayons et ombres

Utiliser les tokens `--radius-sm/DEFAULT/md/lg/xl` et `--shadow-xs/sm/md`. Pas de valeurs arbitraires.

### Ajouter un composant shadcn

```bash
npx shadcn add <composant>
```

Les fichiers générés vont dans `components/ui/`. Ne pas les modifier manuellement sauf nécessité absolue — les mises à jour shadcn les écraseraient.

---

## Base de données (Supabase)

**Pas encore configuré.** Cette section documente les conventions à suivre quand Supabase sera ajouté.

Quand Supabase sera installé :
- Region : `eu-central-1` (Frankfurt)
- Toutes les tables en `snake_case`
- Chaque table a `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- RLS activé sur toutes les tables dès la création — jamais désactivé
- Isolation vendeur via RLS : toutes les requêtes filtrées sur `seller_id = auth.uid()`
- Migrations via Supabase CLI (`supabase migration new <nom>`) — jamais de modification de schéma hors migration
- Les secrets Supabase (service role key) ne sont accessibles que côté serveur, jamais exposés au client

---

## Variables d'environnement

| Variable | Usage | Secret |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | Upload des source maps au build | Oui — dans `.env.sentry-build-plugin` uniquement |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN Sentry (client, serveur, edge) | Non (public) — dans `.env.local` |

**`.env.sentry-build-plugin` ne doit pas être commité.** Il contient le token d'auth Sentry. S'assurer qu'il est dans `.gitignore`.

Quand les autres services seront ajoutés, toutes les clés secrètes (Supabase service role, Inngest signing key, clés API passerelles) sont serveur uniquement (`process.env.*` sans préfixe `NEXT_PUBLIC_`). Les clés des passerelles de paiement des vendeurs sont chiffrées au repos en base.

---

## Sécurité

Règles applicables à chaque contribution :

1. **Aucune donnée sensible dans les logs** — pas de clé API, token, numéro de téléphone, ni contenu de webhook en clair
2. **Vérification de signature sur tous les webhooks entrants** — rejeter sans traitement si la signature est invalide
3. **Idempotence sur le noyau de paiement** — un même webhook reçu plusieurs fois ne crée qu'une seule transaction
4. **Isolation des données vendeurs** — RLS en BDD, vérification d'ownership dans chaque server action qui touche une ressource
5. **Validation à l'entrée** — parser et valider tout ce qui vient de l'extérieur (formulaires, webhooks, params URL) ; faire confiance au code interne
6. **Pas de commission** — aucun code ne doit initier un débit depuis les clés API d'un vendeur ; les clés servent uniquement à encaisser
7. **SioPay ne détient jamais de fonds** — toute feature qui ferait transiter de l'argent par SioPay est interdite (PRD §4)

---

## Workflow git

- **Branche principale :** `main`
- **Branche par feature/fix :** `feat/<sujet>` ou `fix/<sujet>`
- Deux agents ne travaillent jamais simultanément sur la même branche
- **Avant un merge :** lint passant (`npm run lint`), build passant (`npm run build`), relecture du diff
- Pas de push direct sur `main` — passer par une branche + merge
- Messages de commit en anglais, au présent impératif : `Add payment webhook handler`

### Règles absolues sur les branches et les commits

1. **Toute tâche de développement commence par une nouvelle branche**, même si l'on se trouve sur `main` au départ. Aucun code ne s'écrit directement sur `main`. `main` est la base stable — elle n'accueille que des merges validés.
2. **Commit et push sont interdits sans autorisation explicite.** Après avoir terminé un développement, s'arrêter et attendre l'instruction. Ne jamais committer ni pousser de sa propre initiative, même pour "sauvegarder" ou "nettoyer".

---

## Process de travail

1. **Lire le PRD** pour toute nouvelle fonctionnalité — vérifier la phrase-test (PRD §14)
2. **Noyau de paiement** : définir le contrat (types, interface de passerelle, états) avant le code ; tester exhaustivement avant de merger
3. **Reste du produit** : itération libre, valider visuellement sur mobile avant de commiter
4. **Taille des tâches** : une branche = une feature cohérente ; pas de PR géantes
5. **Validation** : tester sur petit écran et simuler connexion lente pour tout écran public (checkout en particulier)
6. **S'arrêter** quand le comportement demandé est couvert — ne pas ajouter de configurabilité ou d'abstraction supplémentaire

---

## Ne jamais faire

- Coder en dur un pays, une devise, un opérateur Mobile Money ou un indicatif téléphonique dans la logique métier
- Afficher un montant sans sa devise
- Introduire une détention de fonds, même transitoire
- Modifier les fichiers `components/ui/` autrement qu'avec `npx shadcn add`
- Utiliser `runtime = 'edge'` — rester sur Node.js (Fluid Compute Vercel)
- Consommer les clés API de passerelle d'un vendeur pour autre chose qu'initier un paiement
- Désactiver RLS sur une table Supabase
- Commiter `.env.sentry-build-plugin` ou tout fichier contenant un secret

---

## Questions ouvertes

- **Framework de test** : aucun runner configuré. Avant de travailler sur le noyau de paiement, choisir et installer (Vitest recommandé pour la compatibilité avec l'écosystème Next.js / Vite).
- **`.env.example`** : aucun fichier `.env.example` n'existe. À créer quand les premières vraies variables seront définies.
- **`tracesSampleRate: 1`** dans les configs Sentry : 100 % en production est coûteux — à ajuster avant le lancement.
- **`sentry-example-page/`** : à supprimer avant le premier écran réel du produit.
- **Import `withSentryConfig` déprécié** : `next.config.ts` importe depuis `@sentry/nextjs` — à migrer vers `@sentry/nextjs/config` avant la v11.
