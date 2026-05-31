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
