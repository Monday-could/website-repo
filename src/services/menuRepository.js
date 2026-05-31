import { getSupabase } from "../lib/supabaseClient.js";
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

export async function fetchMenuWithReviews() {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: items, error: e1 } = await sb.from("menu_items").select("*").order("created_at", { ascending: false });
  if (e1) throw e1;
  if (!items?.length) return [];

  const ids = items.map((i) => i.id);
  const { data: revs, error: e2 } = await sb.from("reviews").select("*").in("menu_item_id", ids).order("created_at", { ascending: false });
  if (e2) throw e2;

  const reviewsByItemId = new Map();
  for (const r of revs || []) {
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
  const { error } = await sb.from("menu_items").delete().eq("id", itemId);
  if (error) throw error;
}
