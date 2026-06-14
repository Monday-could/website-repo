/** Keys, limits, and timing used across the diner app shell. */

export const STORAGE_KEY = "diner-desk-state-v2";

/** Queued add-dish preview rows (owner); survives tab switches within the same browser tab. */
export const OWNER_STAGED_SESSION_KEY = "diner-desk-owner-staged-preview-v1";

/** Local image uploads are stored as data URLs; keep a modest cap for localStorage. */
export const MAX_OWNER_IMAGE_BYTES = 2 * 1024 * 1024;

export const POPULAR_SALES_TOP_N = 5;

/** How many newest personal orders to show on the profile page before “view all”. */
export const PROFILE_ORDER_HISTORY_PREVIEW = 3;

/** How many newest reviews to show on each menu card before opening the full list modal. */
export const MENU_CARD_REVIEW_PREVIEW_COUNT = 1;

export const TOAST_TTL_MS = 4200;

/** Safety net if menu REST never settles. */
export const MENU_LOAD_TIMEOUT_MS = 8_000;

export const ORDERS_LOAD_TIMEOUT_MS = 8_000;

export const STAFF_ORDER_SYNC_INTERVAL_MS = 4_000;

/** Id for guest checkout or legacy orders missing placedById; logged-in users use session.id */
export const GUEST_PLACED_BY_ID = "guest";
