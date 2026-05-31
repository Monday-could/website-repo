/**
 * Supabase Auth + `public.profiles` for roles.
 * Browser uses anon key + JWT only (no service_role).
 */

import { getSupabase } from "../lib/supabaseClient.js";

/** Demo domain appended when the login field has no `@` (see docs/SUPABASE.md). */
export const AUTH_EMAIL_DOMAIN = "diner-desk.local";

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

async function sessionToAppSession(session) {
  if (!session?.user?.id) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data: profile, error } = await sb
    .from("profiles")
    .select("username, display_name, role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) return null;
  if (!profile) return null;

  const role = profile.role;
  if (role !== "customer" && role !== "staff" && role !== "owner") return null;

  return {
    id: session.user.id,
    username: profile.display_name || profile.username,
    role,
  };
}

export async function bootstrapAuthSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { session },
  } = await sb.auth.getSession();
  return sessionToAppSession(session);
}

/**
 * @param {(session: { id: string, username: string, role: string } | null) => void} onSession
 */
export function subscribeAuth(onSession) {
  const sb = getSupabase();
  if (!sb) {
    return { data: { subscription: { unsubscribe() {} } } };
  }
  return sb.auth.onAuthStateChange(async (_event, session) => {
    onSession(await sessionToAppSession(session));
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

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message?.toLowerCase().includes("invalid login")) {
      throw authError("AUTH_BAD_CREDENTIALS");
    }
    throw authError("LOGIN_FAILED");
  }

  const session = await sessionToAppSession(data.session);
  if (!session) throw authError("LOGIN_FAILED");
  return session;
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

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { username: display, display_name: display },
    },
  });

  if (error) {
    if (error.message?.toLowerCase().includes("already registered")) {
      throw authError("REG_USERNAME_TAKEN");
    }
    throw authError("REGISTER_FAILED");
  }

  if (!data.session) {
    throw authError("REG_CONFIRM_EMAIL");
  }

  const session = await sessionToAppSession(data.session);
  if (!session) throw authError("REGISTER_FAILED");
  return session;
}

export async function logout() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

/** @deprecated use `modeFromSession` with loaded session */
export function initialModeFromSession() {
  return "customer";
}
