import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase clients.
 *
 * Env (read at runtime from the dev/prod server process — Next loads
 * `frontend/.env.local`, NOT the repo-root `.env`):
 *   NEXT_PUBLIC_SUPABASE_URL              — project URL (also used by the browser)
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  — anon/publishable key (public read)
 *   SUPABASE_SERVICE_ROLE_KEY             — server-only writer key
 *
 * Missing values throw a clear, named error so a misconfigured server surfaces
 * an actionable message instead of the opaque "supabaseUrl is required".
 */

/** Thrown when required Supabase env is absent. API routes catch this and 503. */
export class SupabaseConfigError extends Error {
  constructor(missing: string) {
    super(
      `Supabase is not configured: ${missing} is missing from the server env. ` +
        `Set it in frontend/.env.local (Next does not read the repo-root .env) and restart the dev server.`,
    );
    this.name = "SupabaseConfigError";
  }
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new SupabaseConfigError(name);
  return v;
}

export function supabaseAnonServer() {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const key = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function supabaseAdmin() {
  const url = need("NEXT_PUBLIC_SUPABASE_URL");
  const key = need("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
