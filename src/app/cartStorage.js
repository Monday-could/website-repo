import { MAX_ORDER_QUANTITY, clampInteger } from "../lib/securityLimits.js";
import { STORAGE_KEY } from "./appConstants.js";

export function loadPersistedCart() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return sanitizeCartLines(Array.isArray(parsed.cart) ? parsed.cart : []);
  } catch {
    return [];
  }
}

export function normalizeCartQuantity(value) {
  return clampInteger(value, 1, MAX_ORDER_QUANTITY, 1);
}

export function getCartQuantity(cart) {
  return (Array.isArray(cart) ? cart : []).reduce((sum, line) => sum + normalizeCartQuantity(line?.quantity), 0);
}

export function sanitizeCartLines(cart) {
  if (!Array.isArray(cart)) return [];
  let remaining = MAX_ORDER_QUANTITY;
  const next = [];
  for (const line of cart) {
    if (!line || typeof line !== "object" || remaining <= 0) continue;
    const quantity = Math.min(normalizeCartQuantity(line.quantity), remaining);
    next.push({ ...line, quantity });
    remaining -= quantity;
  }
  return next;
}
