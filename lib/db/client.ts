import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/**
 * Service role — bypasse RLS. Serveur uniquement (Server Actions, route
 * handlers) : c'est le seul chemin d'écriture de l'app, l'ownership se
 * vérifie côté code appelant avant chaque appel (AGENTS.md, RLS = lecture
 * seule). Ne jamais importer ce module depuis un composant client.
 */
export function createServerClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("createServerClient() must never run in the browser");
  }

  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Clé anon — soumise à la RLS, `for select` uniquement sur les tables
 * métier. Utilisable côté navigateur.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
