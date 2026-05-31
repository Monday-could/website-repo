import { getSupabase, getSupabaseRestConfig } from "../lib/supabaseClient.js";
import { resolveMenuImageForPersist } from "./menuImageStorage.js";

function mapBadges(row) {
  const b = row.manual_badges;
  if (Array.isArray(b)) return b;
  try {
    const p = typeof b === "string" ? JSON.parse(b) : [];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} sb */
function mapItemRow(row, reviewsByItemId) {
  const revs = reviewsByItemId.get(row.id) || [];
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    category: row.category,
    description: row.description,
    image: row.image_url,
    popularity: Number(row.popularity ?? 0),
    available: row.available !== false,
    manualBadges: mapBadges(row),
    menuAddedAt: row.menu_added_at,
    reviews: revs,
  };
}

/** @param {import('@supabase/supabase-js').SupabaseClient} sb */
function mapReviewRow(r) {
  return {
    id: r.id,
    author: r.author_display,
    rating: Number(r.rating),
    text: r.body,
  };
}

/**
 * PostgREST headers: always send public anon as apikey; use the signed-in user's JWT
 * when present so RLS sees auth.uid() (e.g. owner/staff can SELECT unavailable dishes).
 */
async function buildRestHeaders() {
  const cfg = getSupabaseRestConfig();
  if (!cfg) return null;
  const sb = getSupabase();
  let bearer = cfg.anonKey;
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data?.session?.access_token) bearer = data.session.access_token;
  }
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${bearer}`,
  };
}

async function fetchJsonFromRest(path, signal) {
  const cfg = getSupabaseRestConfig();
  if (!cfg) return [];
  const headers = await buildRestHeaders();
  if (!headers) return [];
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
    headers,
    signal,
  });
  if (!response.ok) {
    const err = new Error(`Supabase REST ${path} failed with ${response.status}`);
    err.status = response.status;
    try {
      err.details = await response.text();
    } catch {
      /* ignore body read failures */
    }
    throw err;
  }
  return response.json();
}

/** @param {AbortSignal} [signal] */
export async function fetchMenuWithReviews(signal) {
  const items = await fetchJsonFromRest("menu_items?select=*&order=created_at.desc", signal);
  if (!items?.length) return [];

  const ids = items.map((i) => i.id);

  let revs = [];
  if (ids.length > 0) {
    try {
      const reviewFilter = encodeURIComponent(`in.(${ids.join(",")})`);
      revs = await fetchJsonFromRest(
        `reviews?select=*&menu_item_id=${reviewFilter}&order=created_at.desc`,
        signal,
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      console.warn("Reviews could not be loaded; continuing with menu items only.", e);
    }
  }

  const reviewsByItemId = new Map();
  for (const r of revs) {
    const list = reviewsByItemId.get(r.menu_item_id) || [];
    list.push(mapReviewRow(r));
    reviewsByItemId.set(r.menu_item_id, list);
  }

  return items.map((row) => mapItemRow(row, reviewsByItemId));
}

/**
 * @param {object} payload
 * @param {string} payload.id
 * @param {string} payload.name
 * @param {number} payload.price
 * @param {string} payload.category
 * @param {string} payload.description
 * @param {string} payload.image
 * @param {number} [payload.popularity]
 * @param {boolean} [payload.available]
 * @param {string[]} [payload.manualBadges]
 * @param {string} [payload.menuAddedAt]
 */
export async function insertMenuItem(payload) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const id = payload.id;
  const imageUrl = await resolveMenuImageForPersist(payload.image || "", id);

  const row = {
    id,
    name: payload.name,
    price: payload.price,
    category: payload.category || "Specials",
    description: payload.description || "",
    image_url: imageUrl,
    popularity: Number(payload.popularity) || 70,
    available: payload.available !== false,
    manual_badges: payload.manualBadges || [],
    menu_added_at: payload.menuAddedAt || new Date().toISOString(),
  };

  const { error } = await sb.from("menu_items").insert(row);
  if (error) throw error;
}

export async function updateMenuItem(itemId, patch) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const row = {};
  if (patch.name != null) row.name = patch.name;
  if (patch.price != null) row.price = Number(patch.price);
  if (patch.category != null) row.category = patch.category;
  if (patch.description != null) row.description = patch.description;
  if (patch.popularity != null) row.popularity = Number(patch.popularity);
  if (patch.available != null) row.available = patch.available;
  if (patch.manualBadges != null) row.manual_badges = patch.manualBadges;
  if (patch.menuAddedAt != null) row.menu_added_at = patch.menuAddedAt;
  if (patch.image != null) {
    row.image_url = await resolveMenuImageForPersist(patch.image, itemId);
  }

  if (!Object.keys(row).length) return;

  const { error } = await sb.from("menu_items").update(row).eq("id", itemId);
  if (error) throw error;
}

export async function deleteMenuItem(itemId) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await sb.from("menu_items").delete().eq("id", itemId).select("id");
  if (error) throw error;
  if (!data?.length) {
    const err = new Error("Menu item was not deleted.");
    err.code = "MENU_DELETE_NO_ROWS";
    throw err;
  }
}
