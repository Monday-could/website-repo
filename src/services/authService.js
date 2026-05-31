/**
 * Authentication — demo implementation (localStorage + in-memory constants).
 *
 * ---------------------------------------------------------------------------
 * When wiring a database / backend: keep these exported function signatures,
 * replace implementations with fetch/API calls, and remove or migrate local
 * DEMO_* accounts and localStorage logic.
 * ---------------------------------------------------------------------------
 */

export const AUTH_SESSION_KEY = "toms-auth-session-v1";
export const AUTH_CUSTOMERS_KEY = "toms-auth-customers-v1";

/** Built-in staff account (replace with server-side validation later). */
export const DEMO_STAFF_USERNAME = "worker";
export const DEMO_STAFF_PASSWORD = "imworker";

/** Built-in owner account (replace with server-side validation later). */
export const DEMO_OWNER_USERNAME = "boss";
export const DEMO_OWNER_PASSWORD = "imboss";

export function getPersistedSession() {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.username !== "string" || typeof o.role !== "string") return null;
    if (o.role !== "customer" && o.role !== "staff" && o.role !== "owner") return null;
    return { id: o.id, username: o.username, role: o.role };
  } catch {
    return null;
  }
}

export function persistSession(session) {
  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function loadRegisteredCustomers() {
  try {
    const raw = window.localStorage.getItem(AUTH_CUSTOMERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRegisteredCustomers(list) {
  window.localStorage.setItem(AUTH_CUSTOMERS_KEY, JSON.stringify(list));
}

/** Error with `code` for UI i18n (can map to API error codes when using a backend). */
export function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/**
 * Sign in (replace with e.g. `POST /api/auth/login` later).
 * @returns {Promise<{ id: string, username: string, role: 'customer'|'staff'|'owner' }>}
 */
export async function login({ username, password }) {
  await Promise.resolve();
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!u || !p) throw authError("AUTH_EMPTY");

  if (u === DEMO_STAFF_USERNAME && p === DEMO_STAFF_PASSWORD) {
    const session = { id: "demo-staff", username: u, role: "staff" };
    persistSession(session);
    return session;
  }
  if (u === DEMO_OWNER_USERNAME && p === DEMO_OWNER_PASSWORD) {
    const session = { id: "demo-owner", username: u, role: "owner" };
    persistSession(session);
    return session;
  }

  const reserved = new Set([DEMO_STAFF_USERNAME.toLowerCase(), DEMO_OWNER_USERNAME.toLowerCase()]);
  if (reserved.has(u.toLowerCase())) {
    throw authError("AUTH_RESERVED_LOGIN");
  }

  const customers = loadRegisteredCustomers();
  const found = customers.find((c) => c.username.toLowerCase() === u.toLowerCase());
  if (!found || found.password !== p) {
    throw authError("AUTH_BAD_CREDENTIALS");
  }
  const session = { id: found.id, username: found.username, role: "customer" };
  persistSession(session);
  return session;
}

/**
 * Customer registration (replace with e.g. `POST /api/auth/register` later).
 * Demo only: passwords stored in plain text in localStorage — use server-side hashing in production.
 */
export async function registerCustomer({ username, password }) {
  await Promise.resolve();
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (u.length < 3) throw authError("REG_USERNAME_SHORT");
  if (p.length < 4) throw authError("REG_PASSWORD_SHORT");

  const lower = u.toLowerCase();
  const reserved = new Set([DEMO_STAFF_USERNAME.toLowerCase(), DEMO_OWNER_USERNAME.toLowerCase(), "worker", "boss"]);
  if (reserved.has(lower)) {
    throw authError("REG_RESERVED");
  }

  const customers = loadRegisteredCustomers();
  if (customers.some((c) => c.username.toLowerCase() === lower)) {
    throw authError("REG_USERNAME_TAKEN");
  }

  const row = { id: `cust-${Date.now()}`, username: u, password: p };
  saveRegisteredCustomers([...customers, row]);
  const session = { id: row.id, username: row.username, role: "customer" };
  persistSession(session);
  return session;
}

/** Sign out (later: clear httpOnly cookie or call `POST /api/auth/logout`). */
export function logout() {
  persistSession(null);
}

/** Initial UI mode aligned with persisted session on first load. */
export function initialModeFromSession() {
  const s = getPersistedSession();
  if (s?.role === "staff") return "staff";
  if (s?.role === "owner") return "owner";
  return "customer";
}
