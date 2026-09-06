# SioPay — Product Requirements Document

> Document de cadrage du projet. Décrit ce qu'est SioPay, pour qui, avec quelle
> stack et quelles fonctionnalités. Il donne le contexte général du produit — pas
> le périmètre d'une version donnée (voir `plan.md` pour le travail en cours).

---

## 1. Qu'est-ce que SioPay

**SioPay est un outil de vente en ligne pour créateurs et vendeurs digitaux, qui leur permet d'encaisser via leurs propres passerelles de paiement sans jamais qu'une plateforme tierce ne détienne leur argent.**

Le produit couvre toute la chaîne de vente : page de vente → checkout → encaissement → livraison automatique du produit acheté → relance des acheteurs qui n'ont pas converti → analyse du comportement client.

Ce n'est pas un simple outil d'encaissement. C'est un système de vente complet dont le paiement est la fondation, mais dont la valeur se joue dans ce qui se passe autour : convertir plus d'acheteurs, comprendre pourquoi certains ne payent pas, les récupérer.

---

## 2. Le contexte : vendre en ligne en Afrique

SioPay est conçu pour le marché africain, en commençant par l'Afrique de l'Ouest francophone (Bénin, Sénégal, Côte d'Ivoire, Togo, Burkina Faso, Cameroun...).

**Le produit n'est pas limité par la langue, mais par les passerelles qu'il supporte.** Les besoins d'un vendeur digital sont les mêmes au Nigeria, au Ghana ou au Kenya qu'au Bénin : encaisser en Mobile Money, livrer automatiquement, relancer les acheteurs qui n'ont pas converti, comprendre pourquoi les paiements échouent. Ajouter le support d'un agrégateur anglophone ouvre immédiatement ces marchés — les pages de vente, le checkout et les automatisations restent identiques.

⚠️ **Conséquence pour le développement :** aucune logique métier ne doit être codée en dur autour d'un pays, d'une devise ou d'une langue. Les opérateurs Mobile Money, les indicatifs téléphoniques, les devises et les libellés d'interface sont des données de configuration, pas des constantes dans le code.

Le contexte africain détermine en revanche des choix produit structurants qui n'auraient pas de sens sur un marché occidental.

### Le Mobile Money domine

L'écrasante majorité des paiements se fait par Mobile Money (MTN MoMo, Moov Money, Orange Money, Wave, Celtiis...), pas par carte bancaire. Les taux de bancarisation restent faibles, mais la pénétration du mobile est massive.

**Conséquences produit :**
- Le checkout doit être pensé mobile d'abord, pas adapté au mobile après coup
- Le numéro de téléphone est l'identifiant principal de l'acheteur, souvent plus fiable que l'email
- Les échecs de paiement sont fréquents et ont des causes spécifiques (solde insuffisant, timeout opérateur, annulation) qui n'existent pas dans le monde de la carte bancaire

### Les contraintes techniques du terrain

- Appareils mobiles souvent d'entrée de gamme
- Connexions lentes et instables
- Chaque kilo-octet et chaque seconde de chargement coûtent des conversions

### La méfiance envers le paiement en ligne

Les arnaques en ligne ont marqué le marché. Un acheteur hésite avant de saisir son numéro Mobile Money sur une page qu'il ne connaît pas. La confiance se construit visuellement et se perd instantanément.

**Conséquence produit :** chaque élément du checkout doit rassurer. Le fait que l'argent aille directement au vendeur, sans transiter par SioPay, est un argument de confiance à afficher explicitement.

### WhatsApp est le canal de communication dominant

Sur l'ensemble du continent, les gens répondent sur WhatsApp bien plus que par email. Un vendeur qui relance un client abandonné par email obtient un taux de réponse marginal ; le même message sur WhatsApp obtient une vraie réponse.

**Conséquence produit :** WhatsApp n'est pas un canal secondaire, c'est le canal principal de retargeting. L'email reste indispensable comme canal de confirmation fiable (reçus, livraisons), mais c'est WhatsApp qui convertit.

---

## 3. Le problème que SioPay résout

Aujourd'hui, un vendeur digital qui veut vendre en ligne en Afrique doit assembler plusieurs outils :

- Une plateforme pour héberger son contenu
- Une passerelle ou un agrégateur pour encaisser
- Un outil de tuyauterie (Make, n8n, Zapier) pour connecter le paiement à la livraison
- Un outil d'emailing pour les relances
- Un outil séparé pour WhatsApp

Chaque brique a son coût, sa configuration, ses pannes. Et surtout : **rien ne relie ces briques en une vue cohérente du client**. Le vendeur ne sait pas qui a essayé de payer et échoué, pourquoi, combien de fois il a relancé quelqu'un, ni si ses relances rapportent quoi que ce soit.

Les alternatives tout-en-un existantes résolvent l'encaissement et la livraison, mais prennent une commission sur chaque vente et font transiter l'argent par leur plateforme.

**SioPay résout les deux problèmes à la fois :** la chaîne complète dans un seul outil, sans commission et sans jamais toucher à l'argent du vendeur.

---

## 4. Comment fonctionne le paiement

### Passerelles et agrégateurs

Un **agrégateur de paiement** est un service qui expose une API unique pour accepter des paiements via plusieurs moyens (Mobile Money de différents opérateurs, cartes, virements). Le vendeur crée un compte marchand chez l'agrégateur, passe une vérification d'identité (KYC), et obtient des clés API.

Le flux typique d'un paiement :
1. L'application crée une transaction chez l'agrégateur avec un montant, une devise et une référence
2. L'agrégateur retourne une URL de paiement ou un widget
3. L'acheteur paie (saisit son numéro Mobile Money, valide sur son téléphone)
4. L'agrégateur notifie l'application du résultat via un **webhook**
5. L'argent est crédité sur le compte marchand du vendeur chez l'agrégateur
6. Le vendeur retire ses fonds vers son compte bancaire ou Mobile Money

### Le modèle SioPay : BYO Gateway

**Le vendeur connecte ses propres comptes de passerelle. SioPay ne fournit aucune clé API et n'a aucun compte marchand.**

Concrètement : le vendeur crée son compte chez l'agrégateur de son choix, fait son KYC lui-même, récupère ses clés API et les saisit dans SioPay. SioPay utilise ces clés pour initier les paiements au nom du vendeur.

**Conséquences directes :**
- L'argent arrive directement sur le compte du vendeur, jamais sur un compte SioPay
- SioPay ne peut techniquement pas prélever de commission — les clés API des agrégateurs sont généralement restreintes à l'encaissement, sans droit de débit
- Le vendeur garde la relation contractuelle avec son agrégateur, ses conditions tarifaires, ses délais de retrait
- **Les retraits ne concernent pas SioPay.** Ils se passent entre le vendeur et son agrégateur, sur l'interface de ce dernier. SioPay n'a ni la visibilité technique (beaucoup d'agrégateurs n'exposent aucun statut au-delà du paiement reçu) ni l'intérêt de les afficher : montrer un statut de retrait laisserait croire que l'argent transite par SioPay, ce qui contredirait frontalement la promesse du produit

### L'invariant : SioPay ne détient jamais l'argent

**Aucune fonctionnalité ne doit jamais introduire de détention de fonds, même transitoire.**

**Raison réglementaire :** dans l'espace UEMOA, une plateforme qui garde des fonds pour le compte d'un tiers, même quelques heures, s'expose à un statut d'émetteur de monnaie électronique régulé par la BCEAO — avec agrément, capital minimum et obligations de reporting.

**Raison produit :** c'est la promesse qui définit SioPay. « Ton argent va directement chez toi » n'est pas une fonctionnalité, c'est le positionnement.

Cette règle s'applique à toute évolution future : cagnotte, split de paiement entre plusieurs bénéficiaires, retraits groupés, paiement en plusieurs fois. Ces fonctionnalités ne sont pas interdites, mais aucune ne doit être implémentée d'une manière qui fasse transiter les fonds par SioPay.

### Abstraction des passerelles

**Le code métier ne doit jamais savoir quelle passerelle est utilisée.**

Les agrégateurs vont et viennent : un vendeur peut changer parce que les frais d'un concurrent sont meilleurs, parce que le sien couvre mal son pays, ou parce qu'il a eu un mauvais support. SioPay doit pouvoir ajouter ou retirer un agrégateur sans toucher au noyau.

Chaque intégration implémente la même interface : créer un paiement, recevoir un webhook, vérifier une signature, normaliser un statut, normaliser une cause d'échec.

### Fiabilité du noyau de paiement

Le paiement est la partie du produit où une erreur coûte de l'argent réel à quelqu'un. Elle exige un niveau de rigueur différent du reste.

**Exigences structurantes :**

- **Idempotence** — un même webhook reçu plusieurs fois ne doit créer qu'une seule transaction. Les agrégateurs renvoient des webhooks en cas de doute, parfois plusieurs fois, parfois dans le désordre.
- **Machine à états explicite** — une transaction a un cycle de vie clair, et les transitions invalides sont rejetées
- **Vérification de signature** sur tous les webhooks entrants
- **Aucune corruption silencieuse** — un montant mal typé, une devise inattendue, un champ manquant doivent être détectés et loggés, jamais absorbés discrètement
- **Observabilité** — quand quelque chose casse, on doit pouvoir dire quoi, quand et pour quelle transaction, sans reconstituer à la main

### Devises

Le modèle de devises est structurant et doit être posé dès le départ, sous peine de fermer les marchés qui n'utilisent pas la même monnaie que le marché de départ.

**Quatre notions distinctes, à ne jamais confondre :**

**1. La devise de zone** — imposée par le pays d'inscription du vendeur, non modifiable.

C'est le **référentiel de valeur** du compte. Le vendeur fixe ses prix dedans, ses revenus et statistiques s'y calculent, toutes les conversions en partent.

L'imposer plutôt que la demander supprime une question que le vendeur n'a aucune raison de se poser : un vendeur ouest-africain pense en FCFA, comme tout le monde autour de lui. Lui offrir un choix, c'est créer un doute et une possibilité de se tromper. C'est aussi ce qui rend la couverture géographique explicite — supporter un nouveau pays est une décision consciente, avec sa devise et une passerelle capable de l'encaisser.

**2. La devise d'affichage vendeur** — modifiable à tout moment.

Le vendeur peut vouloir raisonner en dollars ou en euros dans son dashboard. Quand cette devise diffère de la devise de zone, le montant en devise de zone est **systématiquement affiché à côté** : à la saisie d'un prix, dans les listes de ventes, dans les statistiques.

Elle est modifiable précisément parce qu'elle n'engage rien — contrairement au modèle de plateformes qui détiennent les fonds, elle ne détermine pas ce que le vendeur reçoit.

**3. La devise de passerelle** — déclarée par le vendeur au moment où il connecte chaque passerelle.

C'est la devise réellement envoyée dans la requête de paiement, et donc celle dans laquelle l'acheteur est débité.

SioPay ne peut pas la deviner : elle dépend de la configuration du compte marchand du vendeur chez son agrégateur. C'est une information qu'il possède et qu'il déclare. Dans le cas standard, le champ est pré-rempli avec la devise de zone et le vendeur ne le touche pas.

**4. La devise d'affichage acheteur** — déduite de son pays, purement indicative.

Le prix converti peut lui être montré dans sa monnaie locale, avec le taux appliqué visible.

### Routage et conversion au checkout

**La devise n'est jamais un critère de choix de passerelle.** Le vendeur choisit sa passerelle par défaut sur des critères commerciaux — frais, moyens de paiement couverts, fiabilité. La devise n'est qu'une conséquence de ce choix.

Le flux :

1. L'acheteur choisit son moyen de paiement
2. La passerelle par défaut du vendeur est retenue
3. Le prix, exprimé en devise de zone, est converti vers la devise de cette passerelle
4. **Le montant réellement débité est affiché à l'acheteur avant validation**, avec le taux appliqué

Dans la grande majorité des cas, devise de zone et devise de passerelle sont identiques : aucune conversion n'a lieu et un seul montant est affiché.

⚠️ **Ne jamais faire dépendre le catalogue de la devise.** Une boutique dont les produits seraient affichés dans plusieurs devises différentes est illisible pour l'acheteur et incohérente pour le vendeur. La devise se décide au niveau du compte, jamais au niveau du produit ou du lien.

### Contraintes techniques permanentes

- **Aucun montant n'existe sans sa devise.** Jamais un nombre nu — toujours un couple montant + devise, partout : base de données, API, webhooks, interface.
- **Pays, devises, opérateurs de paiement et taux de change sont des données de configuration**, jamais des constantes dans le code. Ajouter un pays ou une devise ne doit demander aucune modification de la logique métier.

### Causes d'échec normalisées

Quand un paiement Mobile Money échoue, l'agrégateur remonte un code d'erreur brut. Ces codes diffèrent d'un agrégateur à l'autre et sont rarement documentés correctement.

**SioPay normalise ces codes vers un vocabulaire unique et lisible** : solde insuffisant, timeout opérateur, annulation par l'utilisateur, numéro invalide, et un fourre-tout pour l'inconnu.

C'est une des briques les plus différenciantes du produit. Savoir *pourquoi* un paiement a échoué permet une relance ciblée — « recharge ton compte et réessaie » plutôt qu'un générique « ton paiement a échoué ». Cette information doit être disponible partout où elle est utile : interface, webhook sortant, déclencheurs d'automatisation.

---

## 5. Structure du produit

### Offre

L'unité de base : ce que le vendeur vend. Une promesse et un livrable.

L'offre porte la configuration de livraison. Elle peut avoir plusieurs liens de paiement.

### Lien de paiement

Le checkout. Dérivé d'une offre, avec son propre titre, sa description, son prix et son design.

Un même produit peut ainsi être vendu à plusieurs prix ou avec plusieurs angles selon l'audience visée — un lien pour les étudiants, un pour les entreprises, la même formation derrière.

Un lien de paiement peut exister seul, partagé directement sur WhatsApp, dans un email ou dans une bio de réseau social. Il n'a pas besoin de page de vente.

C'est aussi l'unité de tracking : chaque lien a ses propres statistiques de conversion.

### Page de vente

Optionnelle. La vitrine publique d'un lien de paiement.

**Ce sont des modèles paramétrés, pas un éditeur visuel.** Le vendeur choisit un design, remplit des champs de texte, choisit sa couleur de marque, active ou désactive des sections. Il ne réorganise pas la mise en page, n'écrit pas de CSS et n'upload pas de structure.

⚠️ Le risque n'est pas le coût de départ, c'est le glissement progressif — « juste un toggle de plus », « juste réordonner les sections », « juste une police custom ». Chacun paraît anodin ; ensemble ils recréent l'éditeur visuel qu'on veut éviter. La limite est explicite et ne bouge pas.

Une page de vente est toujours rattachée à un lien de paiement. La relation inverse est optionnelle.

### Domaine personnalisé

Un vendeur peut faire pointer son propre domaine ou sous-domaine vers un lien de paiement.

Ça couvre deux usages : afficher sa page de vente SioPay sous sa marque, ou garder son site externe et n'utiliser SioPay que pour le checkout sous son propre domaine — ce qui rassure l'acheteur qui ne quitte pas visuellement l'univers du vendeur.

---

## 6. Livraison

**Après un paiement réussi, l'acheteur reçoit automatiquement ce qu'il a acheté.**

### La livraison est une propriété de l'offre

Ce n'est pas une automatisation configurable par le vendeur, c'est l'exécution du contrat de vente — aussi fondamental que l'encaissement lui-même.

Le vendeur configure son livrable au moment où il crée son offre. Le système s'occupe du reste, sans qu'il ait à construire un workflow.

**Conséquences :**
- La livraison ne se facture jamais, sur aucun plan
- Elle n'apparaît pas dans le moteur d'automatisations et n'y est pas modifiable
- Si le vendeur veut faire *autre chose* à l'achat (email de bienvenue personnalisé, ajout d'un tag, proposition d'un autre produit), il crée un workflow séparé. Les deux mécanismes coexistent sans se mélanger.

### Types de livrables

Le système doit accueillir plusieurs natures de livrables, et pouvoir en accueillir de nouvelles sans refonte :

- **Fichiers** hébergés par SioPay et transmis à l'acheteur
- **Accès à du contenu hébergé ailleurs** — le vendeur héberge sa formation sur une plateforme tierce, SioPay déclenche l'inscription de l'acheteur via l'API de cette plateforme
- **Accès à une communauté** — même principe, ajout du membre à l'achat

⚠️ **Un lien statique ne suffit pas pour du contenu privé.** S'il fuite, n'importe qui accède. La livraison doit activer un accès nominatif lié à l'acheteur, ou fournir un lien signé, limité dans le temps et rattaché à son identité.

### Robustesse

La livraison dépend de systèmes externes qui peuvent être indisponibles.

- Réessais automatiques avec délai croissant en cas d'échec
- Alerte au vendeur si l'échec persiste
- Statut de livraison **distinct du statut de paiement** — une vente peut être payée et non livrée, et ça doit être visible
- **Un échec de livraison ne bloque jamais l'encaissement.** L'argent est encaissé indépendamment ; la livraison est un processus séparé qui se répare.

---

## 7. Automatisations et retargeting

### Le principe

La plupart des acheteurs potentiels ne convertissent pas du premier coup. Ils visitent, hésitent, abandonnent en cours de checkout, ou tentent un paiement qui échoue. **Les récupérer est la principale source de revenu additionnel pour un vendeur.**

SioPay détecte ces moments et permet de déclencher une action automatiquement.

### Architecture modulaire — exigence structurante

**Le moteur d'automatisation doit être construit par briques indépendantes et interchangeables.**

Trois axes doivent pouvoir évoluer séparément :

**Les déclencheurs** — les événements qui lancent une automatisation : abandon de checkout, échec de paiement, inactivité d'un client, visites répétées sans achat, et tout signal comportemental capté par le produit. Ajouter un déclencheur ne doit pas toucher aux actions ni aux canaux.

**Les actions** — ce qui se passe quand le déclencheur se déclenche : envoyer un message, créer un code promo, ajouter un tag, appeler un outil externe, inscrire quelqu'un quelque part. Ajouter une action ne doit pas toucher aux déclencheurs.

**Les canaux d'envoi** — par quel moyen le message part : email, WhatsApp, et potentiellement SMS ou autre demain. **Un playbook déclenche « envoie une relance », pas « envoie un email ».** Le canal est un paramètre.

⚠️ Cette modularité n'est pas de la sur-ingénierie. Le marché évolue vite : un nouvel outil de communication peut émerger, un vendeur peut vouloir brancher son propre CRM, une plateforme de contenu peut devenir incontournable. Si l'agent comprend le fonctionnement général du système, il doit pouvoir intégrer un nouvel outil sans régression sur l'existant.

### Playbooks : deux interfaces, un moteur

Un vendeur débutant ne saura jamais composer une règle du type « a acheté le produit A il y a plus de X jours ET n'a pas acheté le produit B ». La solution n'est pas de lui faire générer la règle par IA — c'est de **ne jamais lui montrer la règle**.

**Playbooks pré-construits** : des scénarios prêts à l'emploi, activables en un clic, qui encapsulent l'expertise marketing. Le vendeur active, il ne configure pas.

**Composition libre** : pour les vendeurs avancés qui veulent construire leurs propres règles.

Les deux s'appuient sur le même moteur. Ce sont deux interfaces sur une seule mécanique.

### Attribution du revenu

**Chaque relance doit être traçable jusqu'à la conversion qu'elle produit.**

Le vendeur doit pouvoir voir, pour chaque automatisation : combien elle lui a coûté, et combien elle lui a rapporté.

⚠️ C'est la mécanique centrale de valeur du produit. Sans attribution, le vendeur ne peut pas savoir si ses relances servent à quelque chose — et SioPay perd son argument le plus fort. Cette traçabilité se conçoit dans le modèle de données dès le départ, pas après coup.

---

## 8. Analytique et modèle de données

### Le modèle est centré client

C'est la décision architecturale la plus structurante du projet.

La plupart des outils du marché organisent leurs données par fonctionnalité : une liste de paiements, une liste de clients, une liste d'automatisations, chacune indépendante. Résultat : impossible de reconstituer le parcours d'un client sans filtrer manuellement dans plusieurs écrans.

**Chez SioPay, le client est l'entité centrale.** Tous les événements se rattachent à lui : visites, tentatives de paiement, échecs avec leur cause, achats, livraisons, relances reçues, coûts engagés, revenus générés.

**Contrainte concrète :** l'identité client doit être résolue le plus tôt possible dans le parcours, et les tentatives multiples d'un même acheteur doivent être regroupées sous une seule identité. Un acheteur qui échoue cinq fois puis réussit est un client avec six événements, pas six lignes indépendantes.

⚠️ Si les événements ne portent pas une identité client résolue, la timeline ne pourra jamais être reconstruite après coup. C'est le type de décision qui coûte plusieurs fois plus cher à rétrofitter qu'à poser d'emblée.

### Instrumentation

**Tous les événements significatifs du parcours doivent être capturés dès le premier jour**, même si leur exploitation vient plus tard : visites de page, démarrage de checkout, progression par étape, tentatives de paiement, succès, échecs avec cause, coûts de relance engagés par client.

⚠️ Instrumenter coûte peu maintenant. Rétrofitter sur des données historiques manquantes est impossible. Toute l'analytique, les déclencheurs comportementaux et l'attribution reposent sur cette base.

### Ce que le vendeur doit pouvoir voir

**Sur un client** : son parcours complet en une vue chronologique — quand il est arrivé, combien de fois il a tenté de payer, pourquoi ça a échoué, quelles relances il a reçues, ce qu'il a coûté, ce qu'il a rapporté.

**Sur son activité** : revenu total, entonnoir de conversion (visites → checkouts démarrés → paiements tentés → réussis), taux d'abandon par étape, **répartition des causes d'échec**, performance par offre et par lien de paiement.

---

## 9. Sécurité et données sensibles

SioPay manipule les clés API de passerelle de ses vendeurs — c'est-à-dire les moyens d'encaisser en leur nom.

**Exigences :**
- Chiffrement au repos de tous les secrets : clés API des passerelles, tokens d'accès aux outils tiers connectés
- Isolation stricte des données entre comptes vendeurs — un vendeur ne doit jamais pouvoir accéder aux données d'un autre, y compris par erreur de requête
- Aucune donnée sensible en clair dans les logs, jamais
- Vérification de signature sur tous les webhooks entrants
- Protection des endpoints publics contre l'abus

---

## 10. Modèle économique

**SioPay se rémunère par abonnement, jamais par commission.**

Le vendeur paie un montant fixe mensuel. Ce qu'il encaisse ne change rien à ce qu'il paie. Cette structure découle directement du modèle BYO Gateway : sans détention de fonds, prélever une commission est techniquement impossible.

### Ce qui est limité et ce qui ne l'est pas

**Jamais limité** : la livraison, les webhooks transactionnels sortants, le nombre d'offres. Ce sont des mécanismes de base — les facturer reviendrait à facturer l'acte de vendre.

**Différencié par palier** : le volume de ventes (sur le plan gratuit uniquement), les crédits d'automatisation, le nombre de liens par offre, l'accès aux designs multiples, aux statistiques avancées, aux canaux coûteux, au domaine personnalisé.

### Crédits d'automatisation

**Une action exécutée consomme des crédits.** Envoyer un message, créer un code promo, ajouter un tag, appeler un outil externe — tout ce qui produit un effet réel.

Ce qui relève de la plomberie ne consomme rien : délais d'attente, vérifications de conditions, déclenchements dont la condition n'est pas remplie.

**Le coût en crédits est pondéré selon le coût réel de l'action.** Un canal dont le coût est fixe par client actif ne peut pas valoir la même chose qu'un canal dont le coût marginal est quasi nul. Le modèle doit permettre cette pondération.

### Règles absolues

- **Aucun compteur ne doit jamais bloquer une vente.** Un plafond atteint ne coupe pas l'encaissement.
- **Dégradation douce** : dépassement toléré dans une marge raisonnable, notification, proposition de montée en gamme. Jamais de coupure brutale au milieu d'une séquence en cours.
- **Les messages d'incitation à l'upgrade s'appuient sur la donnée réelle du compte**, jamais sur un discours générique. « Passe au plan supérieur pour découvrir pourquoi 90% de tes paiements ont échoué cette semaine » vaut mieux que « débloquez plus de fonctionnalités ».

---

## 11. Stack technique

| Brique | Choix |
|---|---|
| Framework | Next.js + TypeScript (App Router) |
| Base de données | Supabase (PostgreSQL), région `eu-central-1` |
| Hébergement | Vercel |
| Stockage de fichiers | Cloudflare R2 |
| Envoi d'emails | Amazon SES, région `eu-central-1` |
| Jobs asynchrones et différés | Inngest |
| Monitoring d'erreurs | Sentry |
| Rate limiting | Upstash Redis |
| Composants UI | shadcn/ui (base Radix) |
| Styles | Tailwind CSS v4 |
| Icônes | Lucide |

### Notes sur certains choix

**Cloudflare R2 pour le stockage** : le choix est dicté par l'absence de frais de sortie de données. La livraison étant illimitée et gratuite pour tous les vendeurs, un stockage qui facture chaque téléchargement ferait grimper les coûts avec le succès des vendeurs — exactement ce qu'il faut éviter. Ne jamais servir de fichiers volumineux depuis l'hébergement applicatif.

**Inngest pour les jobs différés** : l'hébergement serverless exécute et se rendort. Il n'a ni mémoire, ni horloge, ni capacité à réessayer. Sans un système de jobs persistant, quatre choses seraient impossibles : relancer un acheteur une heure après son abandon, réessayer une livraison quand une API tierce ne répond pas, déclencher une action des semaines plus tard, envoyer en masse sans se faire couper.

**Isolation de réputation d'envoi** : chaque vendeur envoie des messages sous sa propre identité technique. Un vendeur qui génère des plaintes ne doit jamais dégrader la délivrabilité des autres. Les rebonds et plaintes sont traités automatiquement avec suppression des adresses problématiques.

---

## 12. Identité visuelle et principes de design

### Couleurs

| Rôle | Hex |
|---|---|
| Bleu primaire | `#1E6DF6` |
| Bleu foncé (hover, texte) | `#1553C4` |
| Vert | `#34C759` |
| Vert foncé (texte) | `#22A34A` |

**Le bleu porte l'action, le vert porte la confiance.**

Le bleu est la couleur des actions : boutons, liens, éléments actifs, focus, montant total. Le vert n'est **jamais décoratif** — il est réservé à ce qui rassure : confirmations, réductions obtenues, statuts de succès, mentions de sécurité. Utilisé comme accent général, il diluerait le bleu et brouillerait le message.

### Typographie

- **Titres éditoriaux** : Instrument Serif
- **Corps de texte et interface** : Plus Jakarta Sans
- **Montants** : Plus Jakarta Sans avec `font-variant-numeric: tabular-nums`

**Le serif est rare et intentionnel.** Titres de page, titre de produit sur le checkout, montant total. Utilisé partout, il fatigue et perd son impact.

**L'alignement des chiffres est non négociable.** Sans `tabular-nums`, une colonne de montants paraît bancale. Personne ne le remarque consciemment, tout le monde le ressent. Sur un produit financier, c'est ce qui distingue le crédible de l'amateur.

Les tokens sont définis dans `app/globals.css`.

### Principes de design pour un produit de paiement

- **Sobriété** — les interfaces financières crédibles sont calmes, pas exubérantes
- **Densité maîtrisée** — de l'espace, jamais d'écrans surchargés
- **États lisibles instantanément** — un paiement en attente, réussi ou échoué doit se comprendre en un dixième de seconde
- **Aucune animation gratuite sur le checkout** — chaque milliseconde de latence perçue coûte des conversions
- **Tester sur petit écran et connexion lente** avant de valider quoi que ce soit

### Le checkout

C'est l'écran le plus important du produit. Il doit rassurer autant qu'il doit fonctionner.

La mention que le paiement va directement au vendeur, sans transiter par SioPay, doit être visible au moment où l'acheteur hésite. Sur ce marché, c'est un argument plus fort que n'importe quel badge de sécurité.

### Ne jamais cacher les capacités du produit

Quand une fonctionnalité nécessite une configuration préalable (connecter un outil, activer un canal), **elle reste visible et affiche comment la configurer** plutôt que de disparaître.

Un utilisateur qui ne voit que ce qu'il a déjà configuré croit que le produit est pauvre. Il doit voir toute la puissance disponible, avec un chemin clair pour y accéder.

---

## 13. Contexte de développement

- Projet solo, développé par sessions (soirs et week-ends)
- Deux agents IA peuvent intervenir sur le projet : jamais simultanément sur la même branche
- Un seul fichier de contexte partagé entre agents (`AGENTS.md`, référencé depuis `CLAUDE.md`)
- Travail par branches git, avec tests, contrôle qualité et build avant fusion
- Le noyau de paiement se spécifie avec rigueur : contrats définis avant le code, tests exhaustifs, vérification en conditions réelles. Le reste s'itère librement.

---

## 14. Phrase-test

Pour toute décision ambiguë :

> **« Est-ce que ça sert un outil de vente pour créateurs qui refusent qu'une plateforme garde leur argent ? »**

Si non, ça attend son tour.