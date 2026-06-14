import { POPULAR_SALES_TOP_N } from "./appConstants.js";

export function isReservedBadgeKeyword(text) {
  const t = String(text).trim().toLowerCase();
  /** Only "Popular" is assigned automatically from sales stats; block manual use to avoid confusion. */
  return t === "popular";
}

export function sanitizeManualBadges(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((b) => String(b).trim()).filter(Boolean).filter((b) => !isReservedBadgeKeyword(b));
}

export function parseOwnerCustomBadgesInput(raw) {
  return sanitizeManualBadges(
    String(raw ?? "")
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function formatManualBadgesInput(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

export function migrateLegacyBadgeString(str) {
  return String(str)
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((b) => !isReservedBadgeKeyword(b));
}

export function normalizeMenuItemFromPersisted(item) {
  if (!item || typeof item !== "object") return item;
  const menuAddedAt =
    typeof item.menuAddedAt === "string" && item.menuAddedAt.trim()
      ? item.menuAddedAt.trim()
      : "2024-06-01T12:00:00.000Z";

  let manualBadges = [];
  if (Array.isArray(item.manualBadges)) {
    manualBadges = sanitizeManualBadges(item.manualBadges);
  } else if (typeof item.badge === "string" && item.badge.trim()) {
    manualBadges = migrateLegacyBadgeString(item.badge);
  }

  const { badge: _legacy, ...rest } = item;
  return { ...rest, menuAddedAt, manualBadges };
}

export function countLineSalesForItem(orders, itemId) {
  if (!Array.isArray(orders)) return 0;
  return orders.reduce((sum, o) => sum + (o.itemId === itemId ? Number(o.quantity || 1) : 0), 0);
}

export function sortVisibleMenuBySalesThenPopularity(menu, orders) {
  return [...menu].sort((a, b) => {
    const ca = countLineSalesForItem(orders, a.id);
    const cb = countLineSalesForItem(orders, b.id);
    if (cb !== ca) return cb - ca;
    return (b.popularity || 0) - (a.popularity || 0);
  });
}

export function topPopularItemIdsBySales(menu, orders) {
  const rows = menu.map((m) => ({
    id: m.id,
    count: countLineSalesForItem(orders, m.id),
    popularity: Number(m.popularity || 0),
  }));
  rows.sort((a, b) => b.count - a.count || b.popularity - a.popularity);
  return new Set(rows.slice(0, POPULAR_SALES_TOP_N).map((r) => r.id));
}

export function getAutoBadgesForItem(item, ctx) {
  const { orders, menu } = ctx;
  const list = Array.isArray(menu) ? menu : [];
  const out = [];
  const topIds = topPopularItemIdsBySales(list, orders || []);
  if (topIds.has(item.id)) out.push("Popular");
  return out;
}

export function itemBadgeMatchesFilter(itemBadges, selectedBadge) {
  if (selectedBadge === "all") return true;
  const lower = new Set(itemBadges.map((b) => String(b).trim().toLowerCase()));
  const sel = String(selectedBadge).trim().toLowerCase();
  return lower.has(sel);
}

export function getAllBadgesForItem(item, ctx) {
  const auto = getAutoBadgesForItem(item, ctx);
  const manual = sanitizeManualBadges(item.manualBadges);
  const seen = new Set();
  const out = [];
  for (const b of [...auto, ...manual]) {
    const key = b.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

export function collectBadgeFilterOptions(menuItems, orders) {
  const s = new Set();
  const ctx = { orders: orders || [], menu: menuItems };
  for (const item of menuItems) {
    getAllBadgesForItem(item, ctx).forEach((b) => s.add(b));
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function badgeToneClass(label) {
  const t = String(label).trim().toLowerCase();
  if (t === "popular") return "badge-auto-popular";
  if (t === "seasonal/new" || t === "new/seasonal") return "badge-auto-seasonal-new";
  if (t === "new") return "badge-auto-new";
  if (t === "seasonal") return "badge-auto-seasonal";
  return "badge-custom";
}

export function uniqSortedCategoryValues(items) {
  const s = new Set();
  for (const item of items) {
    const raw = item.category;
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function filterMenuByCategoryAndBadge(items, category, badge, badgeCtx) {
  return items.filter((item) => {
    if (category !== "all" && (item.category || "").trim() !== category) return false;
    if (badge !== "all" && !itemBadgeMatchesFilter(getAllBadgesForItem(item, badgeCtx), badge)) return false;
    return true;
  });
}

export const starterMenu = [
  {
    id: "stack-house-breakfast",
    name: "Stack House Breakfast",
    price: 12.99,
    manualBadges: [],
    menuAddedAt: "2024-06-01T12:00:00.000Z",
    image: "/assets/pancake-breakfast.png",
    description:
      "Golden pancakes, soft eggs, crispy bacon, and maple butter for an all-day breakfast plate.",
    category: "Breakfast",
    popularity: 98,
    available: true,
    reviews: [
      {
        id: "review-1",
        author: "Mia",
        rating: 5,
        text: "Pancakes were fluffy and the bacon stayed crisp.",
      },
    ],
  },
  {
    id: "red-basket-burger",
    name: "Red Basket Burger",
    price: 14.49,
    manualBadges: [],
    menuAddedAt: "2024-06-01T12:00:00.000Z",
    image: "/assets/diner-burger.png",
    description:
      "A cheddar burger with lettuce, tomato, pickles, house sauce, and a side of hot fries.",
    category: "Burgers",
    popularity: 94,
    available: true,
    reviews: [
      {
        id: "review-2",
        author: "Jay",
        rating: 4,
        text: "Big flavor and the fries were fresh.",
      },
    ],
  },
  {
    id: "sunrise-skillet",
    name: "Sunrise Skillet",
    price: 13.79,
    manualBadges: ["Hot"],
    menuAddedAt: "2024-06-01T12:00:00.000Z",
    image: "/assets/pancake-breakfast.png",
    description:
      "Eggs, potatoes, bacon, and warm breakfast sauce built for a fast morning order.",
    category: "Breakfast",
    popularity: 89,
    available: true,
    reviews: [
      {
        id: "review-3",
        author: "Noah",
        rating: 5,
        text: "Filling breakfast and easy to share.",
      },
    ],
  },
  {
    id: "late-night-burger",
    name: "Late-Night Burger",
    price: 15.25,
    manualBadges: [],
    menuAddedAt: "2026-05-22T12:00:00.000Z",
    image: "/assets/diner-burger.png",
    description:
      "Double cheddar, crisp pickles, diner sauce, and fries for after-hours cravings.",
    category: "Burgers",
    popularity: 86,
    available: true,
    reviews: [
      {
        id: "review-4",
        author: "Lena",
        rating: 4,
        text: "Great sauce and the portion felt right.",
      },
    ],
  },
];
