import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
/** Legacy anon JWT or newer `sb_publishable_…` key (both work with createClient). */
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Key used briefly when auth lived in sessionStorage; remove so it does not shadow localStorage. */
const PREVIOUS_SESSION_TAB_AUTH_KEY = "toms-diner-supabase-auth";

function clearOrphanSessionTabAuthKey() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREVIOUS_SESSION_TAB_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

/**
 * Lazily create the browser Supabase client (anon key + user JWT only).
 * Returns null when env is missing so the app can show a setup message.
 *
 * Uses Supabase defaults (**localStorage**): same browser profile keeps the session across tabs,
 * like typical websites. Closing the browser may clear it depending on OS/settings.
 */
export function getSupabase() {
  if (!url || !anonKey) return null;
  if (!client) {
    clearOrphanSessionTabAuthKey();
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

export function getSupabaseRestConfig() {
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
