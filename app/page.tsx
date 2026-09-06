export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* Logo */}
      <p className="text-xl font-semibold tracking-tight">
        <span className="text-brand-500">Sio</span>
        <span className="text-success-500">Pay</span>
      </p>

      {/* Titre serif */}
      <h1 className="mt-10 font-serif text-5xl leading-tight">
        Vends, encaisse et livre automatiquement
      </h1>

      <p className="mt-4 max-w-lg text-ink-700">
        Sans commission sur tes ventes. Ton argent va directement sur ton compte
        passerelle.
      </p>

      {/* Boutons */}
      <div className="mt-10 flex flex-wrap gap-3">
        <button className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
          Créer une offre
        </button>
        <button className="rounded-md border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100">
          Voir la démo
        </button>
      </div>

      {/* Carte de montants — vérification tabular-nums */}
      <div className="mt-14 rounded-lg border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-500">Récapitulatif</p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-700">Sous-total</dt>
            <dd className="tabular">25 000 FCFA</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-success-600">Code BIENVENUE10</dt>
            <dd className="tabular text-success-600">−2 500 FCFA</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-700">Frais SioPay</dt>
            <dd className="tabular">0 FCFA</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-ink-200 pt-4">
          <span className="font-medium">Total</span>
          <span className="tabular font-serif text-3xl text-brand-500">
            22 500 FCFA
          </span>
        </div>
      </div>

      {/* Badges d'état */}
      <div className="mt-8 flex flex-wrap gap-2 text-xs font-medium">
        <span className="rounded-full bg-success-50 px-3 py-1 text-success-600">
          Payé
        </span>
        <span className="rounded-full bg-warning-500/10 px-3 py-1 text-warning-600">
          En attente
        </span>
        <span className="rounded-full bg-danger-500/10 px-3 py-1 text-danger-600">
          Échoué
        </span>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-ink-500">
          Abandonné
        </span>
      </div>
    </main>
  );
}
