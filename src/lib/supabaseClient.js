import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
/** Legacy anon JWT or newer `sb_publishable_…` key (both work with createClient). */
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

/**
 * Lazily create the browser Supabase client (anon key + user JWT only).
 * Returns null when env is missing so the app can show a setup message.
 */
export function getSupabase() {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}
