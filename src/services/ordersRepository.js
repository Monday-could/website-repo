import { getSupabase } from "../lib/supabaseClient.js";

function mapOrderRow(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    price: Number(row.price),
    quantity: Number(row.quantity || 1),
    customerName: row.customer_name,
    notes: row.notes,
    status: row.status,
    ready: Boolean(row.ready),
    createdAt: row.created_at,
    placedById: row.placed_by_id,
  };
}

function toRow(o) {
  return {
    id: o.id,
    item_id: o.itemId,
    item_name: o.itemName,
    price: o.price,
    quantity: o.quantity,
    customer_name: o.customerName,
    notes: o.notes,
    status: o.status,
    ready: o.ready,
    created_at: o.createdAt,
    placed_by_id: o.placedById,
  };
}

/**
 * @param {{ id: string, role: string } | null} session
 */
export async function fetchOrdersForSession(session) {
  const sb = getSupabase();
  if (!sb) return [];

  if (!session) {
    return [];
  }

  if (session.role === "staff" || session.role === "owner") {
    const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrderRow);
  }

  const { data, error } = await sb
    .from("orders")
    .select("*")
    .eq("placed_by_id", session.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapOrderRow);
}

/**
 * @param {object[]} appOrders
 */
export async function insertOrders(appOrders) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  if (!appOrders.length) return;

  const rows = appOrders.map(toRow);
  const { error } = await sb.from("orders").insert(rows);
  if (error) throw error;
}

export async function updateOrderStatus(orderId, status) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { error } = await sb.from("orders").update({ status, ready: false }).eq("id", orderId);
  if (error) throw error;
}

export async function markOrderReady(orderId) {
  const sb = getSupabase();
  if (!sb) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { error } = await sb.from("orders").update({ ready: true }).eq("id", orderId);
  if (error) throw error;
}
