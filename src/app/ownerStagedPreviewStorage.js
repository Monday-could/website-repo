import { OWNER_STAGED_SESSION_KEY } from "./appConstants.js";
import { migrateLegacyBadgeString, sanitizeManualBadges } from "./menuModelAndBadges.js";

export function migrateStagedDishFromSession(dish) {
  if (!dish || typeof dish !== "object") return dish;
  if (Array.isArray(dish.manualBadges)) {
    return { ...dish, manualBadges: sanitizeManualBadges(dish.manualBadges) };
  }
  if (typeof dish.badge === "string" && dish.badge.trim()) {
    return { ...dish, manualBadges: migrateLegacyBadgeString(dish.badge) };
  }
  return { ...dish, manualBadges: [] };
}

export function loadOwnerStagedSession() {
  try {
    const raw = window.sessionStorage.getItem(OWNER_STAGED_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(migrateStagedDishFromSession) : [];
  } catch {
    return [];
  }
}
