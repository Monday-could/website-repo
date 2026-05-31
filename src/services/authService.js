/**
 * Supabase Auth + `public.profiles` for roles.
 * Browser uses anon key + JWT only (no service_role).
 */

import { getSupabase, getSupabaseRestConfig } from "../lib/supabaseClient.js";
import { withTimeout } from "../lib/withTimeout.js";

/** Prevent the login/register button from spinning forever if the network or Supabase hangs. */
const AUTH_OPERATION_TIMEOUT_MS = 10_000;
const PROFILE_RETRY_DELAYS_MS = [0, 250, 750, 1500];

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {string} label
 */
async function authWithTimeout(promise, label) {
  try {
    return await withTimeout(promise, AUTH_OPERATION_TIMEOUT_MS, label);
  } catch (e) {
    if (e && e.code === "TIMEOUT") throw authError("AUTH_TIMEOUT");
    throw e;
  }
}

/**
 * Synthetic email domain when the login/register field has no `@`.
 * Not your website URL — only used to build valid addresses for Supabase Auth.
 * If you change this, recreate seed Auth users with the new domain or sign in with full email.
 */
export const AUTH_EMAIL_DOMAIN = "monday.com";

/** @deprecated kept for greps/docs; session lives in Supabase Auth storage */
export const AUTH_SESSION_KEY = "toms-auth-session-v1";

export const AUTH_CUSTOMERS_KEY = "toms-auth-customers-v1";

export function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function normalizeLoginEmail(raw) {
  const u = String(raw ?? "").trim().toLowerCase();
  if (!u) return "";
  if (u.includes("@")) return u;
  return `${u}@${AUTH_EMAIL_DOMAIN}`;
}

function registerEmailFromUsername(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.toLowerCase();

  const local = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
  const part = local || "user";
  if (part === "worker" || part === "boss") throw authError("REG_RESERVED");
  return `${part}@${AUTH_EMAIL_DOMAIN}`;
}

function delay(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tid = window.setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(tid);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function fallbackCustomerSession(session) {
  const meta = session?.user?.user_metadata || {};
  const emailName = String(session?.user?.email || "").split("@")[0] || "Guest";
  return {
    id: session.user.id,
    username: meta.display_name || meta.username || emailName,
    role: "customer",
  };
}

async function fetchProfileRest(session, signal) {
  const cfg = getSupabaseRestConfig();
  if (!cfg || !session?.access_token) return null;

  const url = `${cfg.url}/rest/v1/profiles?select=username,display_name,role&id=eq.${encodeURIComponent(
    session.user.id,
  )}&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    signal,
  });
  if (!response.ok) {
    const err = new Error(`profiles lookup failed with ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

/**
 * @param {import('@supabase/supabase-js').Session | null} session
 * @param {AbortSignal} [signal]
 * @param {{ retryProfile?: boolean, allowCustomerFallback?: boolean }} [options]
 */
async function sessionToAppSession(session, signal, options = {}) {
  if (!session?.user?.id) return null;
  const delays = options.retryProfile ? PROFILE_RETRY_DELAYS_MS : [0];
  let lastError = null;

  for (const waitMs of delays) {
    try {
      await delay(waitMs, signal);
      const profile = await fetchProfileRest(session, signal);
      if (!profile) continue;

      const role = profile.role;
      if (role !== "customer" && role !== "staff" && role !== "owner") return null;

      return {
        id: session.user.id,
        username: profile.display_name || profile.username,
        role,
      };
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }

  if (import.meta.env.DEV && lastError) {
    console.warn("[auth] profiles lookup failed; using auth session fallback when allowed:", lastError);
  }

  return options.allowCustomerFallback ? fallbackCustomerSession(session) : null;
}

/** @param {AbortSignal} [signal] reserved for callers that need to cancel the profiles query */
export async function bootstrapAuthSession(signal) {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  return sessionToAppSession(session, signal);
}

/**
 * @param {(session: { id: string, username: string, role: string } | null) => void} onSession
 */
export function subscribeAuth(onSession) {
  const sb = getSupabase();
  if (!sb) {
    return { data: { subscription: { unsubscribe() {} } } };
  }
  let version = 0;
  return sb.auth.onAuthStateChange((_event, session) => {
    version += 1;
    const currentVersion = version;

    if (!session) {
      onSession(null);
      return;
    }

    window.setTimeout(async () => {
      try {
        const appSession = await sessionToAppSession(session, undefined, {
          retryProfile: true,
          allowCustomerFallback: true,
        });
        if (currentVersion === version) {
          onSession(appSession);
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("[auth] async session refresh failed; using auth fallback:", e);
        }
        if (currentVersion === version) {
          onSession(fallbackCustomerSession(session));
        }
      }
    }, 0);
  });
}

/** @param {{ id: string, username: string, role: string } | null} session */
export function modeFromSession(session) {
  if (session?.role === "staff") return "staff";
  if (session?.role === "owner") return "owner";
  return "customer";
}

/** @deprecated use `bootstrapAuthSession` + React state */
export function getPersistedSession() {
  return null;
}

/**
 * @returns {Promise<{ id: string, username: string, role: 'customer'|'staff'|'owner' }>}
 */
export async function login({ username, password }) {
  const sb = getSupabase();
  if (!sb) throw authError("SUPABASE_NOT_CONFIGURED");

  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!u || !p) throw authError("AUTH_EMPTY");

  const email = normalizeLoginEmail(u);
  const local = email.split("@")[0];
  if (!email.includes("@")) throw authError("AUTH_EMPTY");
  if (local === "worker" || local === "boss") {
    if (!email.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) {
      throw authError("AUTH_RESERVED_LOGIN");
    }
  }

  const { data, error } = await authWithTimeout(
    sb.auth.signInWithPassword({ email, password }),
    "signInWithPassword",
  );
  if (error) {
    if (error.message?.toLowerCase().includes("invalid login")) {
      throw authError("AUTH_BAD_CREDENTIALS");
    }
    throw authError("LOGIN_FAILED");
  }

  if (!data.session) throw authError("LOGIN_FAILED");
  return fallbackCustomerSession(data.session);
}

/**
 * @returns {Promise<{ id: string, username: string, role: 'customer'|'staff'|'owner' }>}
 */
export async function registerCustomer({ username, password }) {
  const sb = getSupabase();
  if (!sb) throw authError("SUPABASE_NOT_CONFIGURED");

  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (u.length < 3) throw authError("REG_USERNAME_SHORT");
  if (p.length < 4) throw authError("REG_PASSWORD_SHORT");

  let email;
  try {
    email = registerEmailFromUsername(u);
  } catch (e) {
    if (e.code) throw e;
    throw authError("REGISTER_FAILED");
  }
  if (!email) throw authError("AUTH_EMPTY");

  const display = u.includes("@") ? email.split("@")[0] : u;

  const { data, error } = await authWithTimeout(
    sb.auth.signUp({
      email,
      password,
      options: {
        data: { username: display, display_name: display },
      },
    }),
    "signUp",
  );

  if (error) {
    if (error.message?.toLowerCase().includes("already registered")) {
      throw authError("REG_USERNAME_TAKEN");
    }
    throw authError("REGISTER_FAILED");
  }

  if (!data.session) {
    throw authError("REG_CONFIRM_EMAIL");
  }

  return fallbackCustomerSession(data.session);
}

export async function logout() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

/** @deprecated use `modeFromSession` with loaded session */
export function initialModeFromSession() {
  return "customer";
}
