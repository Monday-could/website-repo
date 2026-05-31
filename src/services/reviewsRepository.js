import { getSupabase } from "../lib/supabaseClient.js";

/**
 * @param {string} menuItemId
 * @param {{ rating: number, text: string, author: string }} review
 * @param {string} userId auth user id
 */
export async function insertReview(menuItemId, review, userId) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");

  const { error } = await sb.from("reviews").insert({
    menu_item_id: menuItemId,
    author_id: userId,
    author_display: review.author || "Guest",
    rating: Math.min(5, Math.max(1, Math.round(Number(review.rating) || 0))),
    body: String(review.text ?? "").trim() || " ",
  });
  if (error) throw error;
}
