import { GUEST_PLACED_BY_ID } from "./appConstants.js";

export { GUEST_PLACED_BY_ID };

export function migrateOrderRow(order) {
  if (!order || typeof order !== "object") return order;
  if (order.placedById != null && order.placedById !== "") return order;
  return { ...order, placedById: GUEST_PLACED_BY_ID };
}

/** Lines placed while signed in as this user (excludes guest checkout id). Owner kitchen list may include all rows — filter here for personal history. */
export function getPersonalOrdersForSession(session, orders) {
  if (!session?.id) return [];
  const sid = String(session.id);
  const rows = (Array.isArray(orders) ? orders : []).filter((o) => String(o.placedById || "") === sid);
  return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
