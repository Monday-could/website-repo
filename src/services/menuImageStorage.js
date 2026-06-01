import { getSupabase } from "../lib/supabaseClient.js";

const BUCKET = "menu-images";

function extFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * If `image` is a data URL, upload to Storage and return a public URL.
 * Otherwise return trimmed string (http(s) or site path like /assets/...).
 * @param {string} image
 * @param {string} dishId stable id used in object path
 * @returns {Promise<string>}
 */
export async function resolveMenuImageForPersist(image, dishId) {
  const raw = typeof image === "string" ? image.trim() : "";
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return raw || "/assets/diner-burger.png";
  }
  if (!raw.startsWith("data:")) {
    return raw;
  }

  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const comma = raw.indexOf(",");
  if (comma === -1) throw new Error("INVALID_DATA_URL");
  const header = raw.slice(5, comma);
  const mimeMatch = /^([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const base64 = raw.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("NOT_AUTHENTICATED");

  const ext = extFromMime(mime);
  const safeId = String(dishId || "dish").replace(/[^a-zA-Z0-9-_]/g, "-");
  const path = `${user.id}/${safeId}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (upErr) throw upErr;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Parse a Supabase Storage public URL into an object path inside the `menu-images` bucket; return null if unrecognized.
 * @param {string | null | undefined} imageUrl
 * @returns {string | null}
 */
export function menuImageStoragePathFromUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith("http")) return null;
  const marker = `/object/public/${BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  let rest = trimmed.slice(idx + marker.length);
  const q = rest.indexOf("?");
  if (q !== -1) rest = rest.slice(0, q);
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/**
 * If `imageUrl` points at this project's `menu-images` bucket, delete that object; skip local `/assets/...` and other URLs.
 * @param {string | null | undefined} imageUrl
 */
export async function removeMenuImageFromStorageIfPresent(imageUrl) {
  const path = menuImageStoragePathFromUrl(imageUrl);
  if (!path) return;

  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
