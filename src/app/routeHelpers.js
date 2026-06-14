/** Safe internal paths for login/register returnTo and fetch abort heuristics. */

/** @param {unknown} raw */
export function sanitizeReturnToParam(raw) {
  if (raw == null || typeof raw !== "string") return null;
  let path = raw.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  return path;
}

/** @param {unknown} e */
export function isAbortLikeError(e) {
  if (!e || e.code === "TIMEOUT") return false;
  const name = String(e.name || "");
  const msg = String(e.message || "").toLowerCase();
  return name === "AbortError" || msg.includes("abort") || msg.includes("aborted");
}
