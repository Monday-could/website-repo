import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  login as authLogin,
  logout,
  modeFromSession,
  registerCustomer,
  subscribeAuth,
} from "./services/authService.js";
import { isSupabaseConfigured } from "./lib/supabaseClient.js";
import { withTimeout } from "./lib/withTimeout.js";
import {
  deleteMenuItem as deleteMenuItemRemote,
  fetchMenuWithReviews,
  insertMenuItem,
  updateMenuItem as updateMenuItemRemote,
} from "./services/menuRepository.js";
import { insertReview } from "./services/reviewsRepository.js";
import {
  fetchOrdersForSession,
  insertOrders,
  markOrderReady as markOrderReadyRemote,
  updateOrderStatus as updateOrderStatusRemote,
} from "./services/ordersRepository.js";
import { useI18n } from "./i18n/I18nContext.jsx";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.jsx";

const STORAGE_KEY = "diner-desk-state-v2";
const MAX_ORDER_QUANTITY = 50;

/** Internal path only (e.g. `/menu`); used after login/register to avoid open redirects. */
function sanitizeReturnToParam(raw) {
  if (raw == null || typeof raw !== "string") return null;
  let path = raw.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  return path;
}

/** Queued add-dish preview rows (owner); survives tab switches and refresh within the same browser tab. */
const OWNER_STAGED_SESSION_KEY = "diner-desk-owner-staged-preview-v1";

function migrateStagedDishFromSession(dish) {
  if (!dish || typeof dish !== "object") return dish;
  if (Array.isArray(dish.manualBadges)) {
    return { ...dish, manualBadges: sanitizeManualBadges(dish.manualBadges) };
  }
  if (typeof dish.badge === "string" && dish.badge.trim()) {
    return { ...dish, manualBadges: migrateLegacyBadgeString(dish.badge) };
  }
  return { ...dish, manualBadges: [] };
}

function loadOwnerStagedSession() {
  try {
    const raw = window.sessionStorage.getItem(OWNER_STAGED_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(migrateStagedDishFromSession) : [];
  } catch {
    return [];
  }
}

/** Local image uploads are stored as data URLs; keep a modest cap for localStorage. */
const MAX_OWNER_IMAGE_BYTES = 2 * 1024 * 1024;

const POPULAR_SALES_TOP_N = 5;
/** How many newest personal orders to show on the profile page before “view all”. */
const PROFILE_ORDER_HISTORY_PREVIEW = 3;
/** How many newest reviews to show on each menu card before opening the full list modal. */
const MENU_CARD_REVIEW_PREVIEW_COUNT = 1;
const TOAST_TTL_MS = 4200;
/** Safety net if menu REST never settles. Kept separate from orders so authSession changes cannot abort menu mid-flight. */
const MENU_LOAD_TIMEOUT_MS = 8_000;
const ORDERS_LOAD_TIMEOUT_MS = 8_000;

function isAbortLikeError(e) {
  if (!e || e.code === "TIMEOUT") return false;
  const name = String(e.name || "");
  const msg = String(e.message || "").toLowerCase();
  return name === "AbortError" || msg.includes("abort") || msg.includes("aborted");
}

function isReservedBadgeKeyword(text) {
  const t = String(text).trim().toLowerCase();
  /** Only "Popular" is assigned automatically from sales stats; block manual use to avoid confusion. */
  return t === "popular";
}

function sanitizeManualBadges(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((b) => String(b).trim()).filter(Boolean).filter((b) => !isReservedBadgeKeyword(b));
}

function parseOwnerCustomBadgesInput(raw) {
  return sanitizeManualBadges(
    String(raw ?? "")
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function formatManualBadgesInput(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function migrateLegacyBadgeString(str) {
  return String(str)
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((b) => !isReservedBadgeKeyword(b));
}

function normalizeMenuItemFromPersisted(item) {
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

function countLineSalesForItem(orders, itemId) {
  if (!Array.isArray(orders)) return 0;
  return orders.reduce((sum, o) => sum + (o.itemId === itemId ? Number(o.quantity || 1) : 0), 0);
}

function sortVisibleMenuBySalesThenPopularity(menu, orders) {
  return [...menu].sort((a, b) => {
    const ca = countLineSalesForItem(orders, a.id);
    const cb = countLineSalesForItem(orders, b.id);
    if (cb !== ca) return cb - ca;
    return (b.popularity || 0) - (a.popularity || 0);
  });
}

function topPopularItemIdsBySales(menu, orders) {
  const rows = menu.map((m) => ({
    id: m.id,
    count: countLineSalesForItem(orders, m.id),
    popularity: Number(m.popularity || 0),
  }));
  rows.sort((a, b) => b.count - a.count || b.popularity - a.popularity);
  return new Set(rows.slice(0, POPULAR_SALES_TOP_N).map((r) => r.id));
}

function getAutoBadgesForItem(item, ctx) {
  const { orders, menu } = ctx;
  const list = Array.isArray(menu) ? menu : [];
  const out = [];
  const topIds = topPopularItemIdsBySales(list, orders || []);
  if (topIds.has(item.id)) out.push("Popular");
  return out;
}

function itemBadgeMatchesFilter(itemBadges, selectedBadge) {
  if (selectedBadge === "all") return true;
  const lower = new Set(itemBadges.map((b) => String(b).trim().toLowerCase()));
  const sel = String(selectedBadge).trim().toLowerCase();
  return lower.has(sel);
}

function getAllBadgesForItem(item, ctx) {
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

function collectBadgeFilterOptions(menuItems, orders) {
  const s = new Set();
  const ctx = { orders: orders || [], menu: menuItems };
  for (const item of menuItems) {
    getAllBadgesForItem(item, ctx).forEach((b) => s.add(b));
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function badgeToneClass(label) {
  const t = String(label).trim().toLowerCase();
  if (t === "popular") return "badge-auto-popular";
  if (t === "seasonal/new" || t === "new/seasonal") return "badge-auto-seasonal-new";
  if (t === "new") return "badge-auto-new";
  if (t === "seasonal") return "badge-auto-seasonal";
  return "badge-custom";
}

const starterMenu = [
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

function loadPersistedCart() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return sanitizeCartLines(Array.isArray(parsed.cart) ? parsed.cart : []);
  } catch {
    return [];
  }
}

function normalizeCartQuantity(value) {
  const q = Math.floor(Number(value));
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(MAX_ORDER_QUANTITY, q));
}

function getCartQuantity(cart) {
  return (Array.isArray(cart) ? cart : []).reduce((sum, line) => sum + normalizeCartQuantity(line?.quantity), 0);
}

function sanitizeCartLines(cart) {
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

const initialState = {
  menu: starterMenu.map((row) => normalizeMenuItemFromPersisted({ ...row })),
  orders: [],
  cart: loadPersistedCart(),
};

/** Id for guest checkout or legacy orders missing placedById; logged-in users use session.id */
const GUEST_PLACED_BY_ID = "guest";

function migrateOrderRow(order) {
  if (!order || typeof order !== "object") return order;
  if (order.placedById != null && order.placedById !== "") return order;
  return { ...order, placedById: GUEST_PLACED_BY_ID };
}

/** Lines placed while signed in as this user (excludes guest checkout id). Owner kitchen list may include all rows — filter here for personal history. */
function getPersonalOrdersForSession(session, orders) {
  if (!session?.id) return [];
  const sid = String(session.id);
  const rows = (Array.isArray(orders) ? orders : []).filter((o) => String(o.placedById || "") === sid);
  return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
}

function uniqSortedCategoryValues(items) {
  const s = new Set();
  for (const item of items) {
    const raw = item.category;
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function filterMenuByCategoryAndBadge(items, category, badge, badgeCtx) {
  return items.filter((item) => {
    if (category !== "all" && (item.category || "").trim() !== category) return false;
    if (badge !== "all" && !itemBadgeMatchesFilter(getAllBadgesForItem(item, badgeCtx), badge)) return false;
    return true;
  });
}

function MenuFiltersBar({ menuItems, category, badge, onCategory, onBadge, badgeOptions }) {
  const { t } = useI18n();
  const catSelectId = useId();
  const badgeSelectId = useId();
  const categoryOptions = useMemo(() => uniqSortedCategoryValues(menuItems), [menuItems]);
  const badgeOptionsSafe = Array.isArray(badgeOptions) ? badgeOptions : [];

  useEffect(() => {
    if (category !== "all" && !categoryOptions.includes(category)) onCategory("all");
  }, [category, categoryOptions, onCategory]);

  useEffect(() => {
    if (badge !== "all" && !badgeOptionsSafe.includes(badge)) onBadge("all");
  }, [badge, badgeOptionsSafe, onBadge]);

  const showClear = category !== "all" || badge !== "all";

  return (
    <div className="menu-filters-bar">
      <div className="menu-filters-fields">
        <label htmlFor={catSelectId}>
          {t("menuFilters.category")}
          <select id={catSelectId} value={category} onChange={(event) => onCategory(event.target.value)}>
            <option value="all">{t("menuFilters.allCategories")}</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={badgeSelectId}>
          {t("menuFilters.badge")}
          <select id={badgeSelectId} value={badge} onChange={(event) => onBadge(event.target.value)}>
            <option value="all">{t("menuFilters.allBadges")}</option>
            {badgeOptionsSafe.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>
      {showClear ? (
        <button
          type="button"
          className="secondary-cta small menu-filters-clear"
          onClick={() => {
            onCategory("all");
            onBadge("all");
          }}
        >
          {t("menuFilters.clear")}
        </button>
      ) : null}
    </div>
  );
}

function StarRating({ value }) {
  const { t } = useI18n();
  return (
    <span className="stars" aria-label={t("a11y.stars", { value })}>
      {"\u2605".repeat(value)}
      <span>{"\u2606".repeat(5 - value)}</span>
    </span>
  );
}

function DishReviewsModal({ open, onClose, item }) {
  const { t } = useI18n();
  const titleId = item ? `dish-reviews-modal-title-${item.id}` : "dish-reviews-modal-title";

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !item || !item.reviews?.length) return null;

  return createPortal(
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal dish-reviews-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id={titleId}>{t("dishReviews.title")}</h2>
          <button type="button" className="icon-button" aria-label={t("common.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="order-modal-dish">{item.name}</p>
        <p className="dish-reviews-modal-count">{t("dishReviews.total", { count: item.reviews.length })}</p>
        <ul className="dish-reviews-modal-list">
          {item.reviews.map((review, index) => {
            const rid = review.id ?? `${item.id}-review-${index}`;
            const stars = Math.min(5, Math.max(0, Math.round(Number(review.rating) || 0)));
            return (
              <li key={rid} className="menu-card-review-item">
                <div className="menu-card-review-meta">
                  <strong>{review.author && review.author !== "Guest" ? review.author : t("common.guest")}</strong>
                  {stars > 0 ? <StarRating value={stars} /> : null}
                </div>
                <p>{review.text}</p>
              </li>
            );
          })}
        </ul>
        <div className="order-modal-actions">
          <button type="button" className="primary-cta" onClick={onClose}>
            {t("dishReviews.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ToastStack({ toasts, onDismiss }) {
  const { t } = useI18n();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="region" aria-label={t("common.notifications")} aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.variant || "error"}`} role="alert">
          <p className="toast-message">{toast.message}</p>
          <button type="button" className="toast-dismiss" aria-label={t("common.dismissNotification")} onClick={() => onDismiss(toast.id)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Icon({ name }) {
  const paths = {
    menu: "M4 7h16M4 12h16M4 17h16",
    cart: "M6 6h15l-2 8H8L6 3H3m6 16a1 1 0 1 0 0 .01M18 19a1 1 0 1 0 0 .01",
    user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    plus: "M12 5v14M5 12h14",
    check: "m5 13 4 4L19 7",
    x: "M18 6 6 18M6 6l12 12",
    pin: "M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path d={paths[name]} />
    </svg>
  );
}

function RequireRole({ session, role, children }) {
  if (!session || session.role !== role) {
    return <Navigate to={`/login?role=${role}`} replace />;
  }
  return children;
}

function LoginPage({ onLoginSuccess }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnToParam(searchParams.get("returnTo"));
  const profileNotice = searchParams.get("notice") === "profile";
  const roleParam = searchParams.get("role");
  const isStaffOrOwnerLogin = roleParam === "staff" || roleParam === "owner";
  const registerHref = returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await authLogin({ username, password });
      onLoginSuccess(session);
      if (session.role === "staff") navigate("/orders", { replace: true });
      else if (session.role === "owner") navigate("/owner", { replace: true });
      else if (returnTo) navigate(returnTo, { replace: true });
      else navigate("/menu", { replace: true });
    } catch (err) {
      const code = err?.code;
      setError(code ? t(`auth.error.${code}`) : t("auth.error.LOGIN_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="login-title">
      <div className="section-heading">
        <p className="eyebrow">{t("auth.login.eyebrow")}</p>
        <h2 id="login-title">{t("auth.login.title")}</h2>
        {profileNotice ? (
          <p className="auth-hint" role="status">
            {t("auth.login.noticeProfile")}
          </p>
        ) : null}
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="auth-label">
          {t("auth.login.username")}
          <input
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="auth-label">
          {t("auth.login.password")}
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? t("auth.login.loading") : t("auth.login.submit")}
        </button>
      </form>
      {isStaffOrOwnerLogin ? (
        <p className="auth-hint auth-login-staff-owner-footer">
          {t("auth.login.staffOwnerFooterHint")}{" "}
          <Link to="/menu" className="auth-footer-link">
            {t("auth.login.linkGuest")}
          </Link>
        </p>
      ) : (
        <p className="auth-secondary-actions">
          <Link to={registerHref}>{t("auth.login.linkRegister")}</Link>
          {" · "}
          <Link to="/menu">{t("auth.login.linkGuest")}</Link>
        </p>
      )}
    </section>
  );
}

function RegisterPage({ onLoginSuccess }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnToParam(searchParams.get("returnTo"));
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("auth.error.REG_PASSWORD_MISMATCH"));
      return;
    }
    setLoading(true);
    try {
      const session = await registerCustomer({ username, password });
      onLoginSuccess(session);
      navigate(returnTo || "/menu", { replace: true });
    } catch (err) {
      const code = err?.code;
      setError(code ? t(`auth.error.${code}`) : t("auth.error.REGISTER_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="register-title">
      <div className="section-heading">
        <p className="eyebrow">{t("auth.register.eyebrow")}</p>
        <h2 id="register-title">{t("auth.register.title")}</h2>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="auth-label">
          {t("auth.login.username")}
          <input
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="auth-label">
          {t("auth.login.password")}
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="auth-label">
          {t("auth.register.password2")}
          <input
            className="auth-input"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? t("auth.login.loading") : t("auth.register.submit")}
        </button>
      </form>
      <p className="auth-secondary-actions">
        <Link to={loginHref}>{t("auth.register.linkLogin")}</Link>
        {" · "}
        <Link to="/menu">{t("auth.login.linkGuest")}</Link>
      </p>
    </section>
  );
}

function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const stateRef = useRef(initialState);
  const [mode, setMode] = useState("customer");
  /** Remote data loads in the background; seed data stays visible if Supabase is slow. */
  const [dataReady, setDataReady] = useState(true);
  const [authSession, setAuthSession] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, setState] = useState(initialState);
  const [pendingOrderItem, setPendingOrderItem] = useState(null);
  const [orderNotesDraft, setOrderNotesDraft] = useState("");
  const [toasts, setToasts] = useState([]);

  const enqueueToast = useCallback((message, variant = "error") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.menu.length) return;
    setState((current) => {
      if (current.menu.length) return current;
      return {
        ...current,
        menu: starterMenu.map((row) => normalizeMenuItemFromPersisted({ ...row })),
      };
    });
  }, [state.menu.length]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    // Do NOT call auth.getSession() here: onAuthStateChange already runs initialize + INITIAL_SESSION
    // under the same storage lock. A parallel getSession() competes for the lock and can block tens of
    // seconds while the token refresh runs twice in effect.
    const { data } = subscribeAuth((s) => {
      setAuthSession(s);
      setMode(modeFromSession(s));
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  // Menu + reviews: deps MUST NOT include authSession. When subscribeAuth fires INITIAL_SESSION,
  // setAuthSession would re-run this effect and abort the in-flight menu fetch — requests restart in a
  // loop until withTimeout fires (felt as "Supabase is slow").
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const abortController = new AbortController();
    const { signal } = abortController;
    let cancelled = false;
    (async () => {
      try {
        const menu = await withTimeout(fetchMenuWithReviews(signal), MENU_LOAD_TIMEOUT_MS, "menu");
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            menu: menu.map(normalizeMenuItemFromPersisted),
          }));
        }
      } catch (e) {
        if (isAbortLikeError(e)) {
          /* effect cleanup aborted in-flight fetch */
        } else {
          console.error(e);
          if (e?.code === "TIMEOUT") {
            enqueueToast(t("toast.dataLoadTimeout"));
          } else {
            enqueueToast(t("toast.dataLoadError"));
          }
        }
      } finally {
        setDataReady(true);
      }
    })();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [t, enqueueToast]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const abortController = new AbortController();
    const { signal } = abortController;
    let cancelled = false;
    (async () => {
      try {
        const orders = await withTimeout(
          fetchOrdersForSession(authSession, signal),
          ORDERS_LOAD_TIMEOUT_MS,
          "orders",
        );
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            orders: orders.map(migrateOrderRow),
          }));
        }
      } catch (e) {
        if (isAbortLikeError(e)) return;
        console.error(e);
        if (e?.code === "TIMEOUT") {
          enqueueToast(t("toast.dataLoadTimeout"));
        } else {
          enqueueToast(t("toast.dataLoadError"));
        }
      }
    })();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [authSession?.id, authSession?.role, t, enqueueToast]);

  const modes = useMemo(
    () => [
      { id: "customer", label: t("mode.customer"), path: "/menu" },
      { id: "staff", label: t("mode.staff"), path: "/orders" },
      { id: "owner", label: t("mode.owner"), path: "/owner" },
    ],
    [t],
  );

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleLoginSuccess = useCallback((session) => {
    setAuthSession(session);
    if (session.role === "staff") setMode("staff");
    else if (session.role === "owner") setMode("owner");
    else setMode("customer");
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthSession(null);
    setMode("customer");
    navigate("/menu");
  }, [navigate]);

  const exitStaffOrOwnerForGuestBrowse = useCallback(async () => {
    if (authSession?.role === "staff" || authSession?.role === "owner") {
      await logout();
      setAuthSession(null);
    }
  }, [authSession]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: state.cart }));
    } catch {
      /* ignore */
    }
  }, [state.cart]);

  useEffect(() => {
    const path = location.pathname;
    if (authSession?.role === "owner") {
      if (path.startsWith("/owner")) {
        setMode("owner");
        return;
      }
      // Owner session but mode still "staff" (e.g. after account switch): fix mode highlight
      setMode((m) => (m === "staff" ? "owner" : m));
      return;
    }
    if (authSession?.role === "staff") {
      if (path === "/orders" || path.startsWith("/orders/")) {
        setMode("staff");
        return;
      }
      // Staff session but mode wrongly "owner": fix highlight (symmetric case)
      setMode((m) => (m === "owner" ? "staff" : m));
    }
  }, [location.pathname, authSession]);

  useEffect(() => {
    if (!pendingOrderItem) return;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setPendingOrderItem(null);
        setOrderNotesDraft("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingOrderItem]);

  const cartCount = state.cart.reduce((sum, line) => sum + Number(line.quantity || 1), 0);

  function openOrderNoteModal(menuItem) {
    setPendingOrderItem(menuItem);
    setOrderNotesDraft("");
  }

  function closeOrderNoteModal() {
    setPendingOrderItem(null);
    setOrderNotesDraft("");
  }

  function submitAddToCart() {
    if (!pendingOrderItem) return;
    const trimmed = typeof orderNotesDraft === "string" ? orderNotesDraft.trim() : "";
    const notes = trimmed.length > 0 ? trimmed : "No special request";
    setState((current) => {
      if (getCartQuantity(current.cart) >= MAX_ORDER_QUANTITY) return current;
      return {
        ...current,
        cart: sanitizeCartLines([
          {
            id: `cart-${Date.now()}`,
            itemId: pendingOrderItem.id,
            itemName: pendingOrderItem.name,
            price: pendingOrderItem.price,
            image: pendingOrderItem.image,
            quantity: 1,
            notes,
          },
          ...current.cart,
        ]),
      };
    });
    closeOrderNoteModal();
  }

  function updateCartLineQuantity(lineId, newQuantity) {
    const q = Math.floor(Number(newQuantity));
    if (q < 1) {
      removeCartLine(lineId);
      return;
    }
    setState((current) => ({
      ...current,
      cart: sanitizeCartLines(current.cart.map((line) => (line.id === lineId ? { ...line, quantity: q } : line))),
    }));
  }

  function removeCartLine(lineId) {
    setState((current) => ({
      ...current,
      cart: current.cart.filter((line) => line.id !== lineId),
    }));
  }

  async function checkoutCart() {
    if (!isSupabaseConfigured()) {
      return false;
    }
    const current = stateRef.current;
    const cart = sanitizeCartLines(current.cart);
    if (!cart.length) return false;
    const ts = Date.now();
    const placedById = authSession?.id ? authSession.id : GUEST_PLACED_BY_ID;
    const customerLabel = authSession?.username?.trim() || t("common.walkInGuest");
    const newOrders = cart.map((line, i) => ({
      id: `order-${ts}-${i}`,
      itemId: line.itemId,
      itemName: line.itemName,
      price: line.price,
      quantity: line.quantity,
      customerName: customerLabel.trim() || t("common.walkInGuest"),
      notes: line.notes,
      status: "new",
      ready: false,
      createdAt: new Date().toISOString(),
      placedById,
    }));
    try {
      await insertOrders(newOrders);
      const orders = await fetchOrdersForSession(authSession);
      setState((c) => ({
        ...c,
        orders: orders.map(migrateOrderRow),
        cart: [],
      }));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function updateOrderStatus(orderId, status) {
    if (!isSupabaseConfigured()) return;
    try {
      await updateOrderStatusRemote(orderId, status);
      const orders = await fetchOrdersForSession(authSession);
      setState((c) => ({ ...c, orders: orders.map(migrateOrderRow) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function markOrderReady(orderId) {
    if (!isSupabaseConfigured()) return;
    try {
      await markOrderReadyRemote(orderId);
      const orders = await fetchOrdersForSession(authSession);
      setState((c) => ({ ...c, orders: orders.map(migrateOrderRow) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function addReview(itemId, review) {
    if (!isSupabaseConfigured() || !authSession?.id) return;
    try {
      await insertReview(itemId, review, authSession.id);
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function addMenuItem(item) {
    if (!isSupabaseConfigured()) return;
    const manualBadges = sanitizeManualBadges(item.manualBadges);
    const now = new Date().toISOString();
    const id = `dish-${Date.now()}`;
    try {
      await insertMenuItem({
        id,
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        image: item.image || "/assets/diner-burger.png",
        popularity: Number(item.popularity) || 70,
        available: item.available !== false,
        manualBadges,
        menuAddedAt: typeof item.menuAddedAt === "string" && item.menuAddedAt ? item.menuAddedAt : now,
      });
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function addMenuItemsBatch(items) {
    if (!items.length || !isSupabaseConfigured()) return;
    const ts = Date.now();
    const now = new Date().toISOString();
    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        await insertMenuItem({
          id: `dish-${ts}-${i}`,
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description,
          image: item.image || "/assets/diner-burger.png",
          popularity: Number(item.popularity) || 70,
          available: true,
          manualBadges: sanitizeManualBadges(item.manualBadges),
          menuAddedAt: typeof item.menuAddedAt === "string" && item.menuAddedAt ? item.menuAddedAt : now,
        });
      }
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function updateMenuItem(itemId, patch) {
    if (!isSupabaseConfigured()) return;
    const cleanPatch = { ...patch };
    delete cleanPatch.badge;
    if (cleanPatch.manualBadges !== undefined) {
      cleanPatch.manualBadges = sanitizeManualBadges(cleanPatch.manualBadges);
    }
    try {
      await updateMenuItemRemote(itemId, cleanPatch);
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteMenuItem(itemId) {
    if (!isSupabaseConfigured()) return false;
    try {
      await deleteMenuItemRemote(itemId);
      setState((c) => ({
        ...c,
        menu: c.menu.filter((item) => item.id !== itemId),
        orders: c.orders.filter((order) => order.itemId !== itemId),
      }));
      return true;
    } catch (e) {
      console.error(e);
      enqueueToast(e?.code === "23503" ? t("toast.deleteDishBlocked") : t("toast.deleteDishError"));
      return false;
    }
  }

  async function toggleMenuItemAvailable(itemId) {
    if (!isSupabaseConfigured()) return;
    const row = stateRef.current.menu.find((m) => m.id === itemId);
    const nextAvailable = row?.available === false;
    try {
      await updateMenuItemRemote(itemId, { available: nextAvailable });
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
    } catch (e) {
      console.error(e);
    }
  }

  async function selectMode(item) {
    if (authSession && item.id !== mode) {
      await logout();
      setAuthSession(null);
    }

    if (item.id === "customer") {
      setMode("customer");
      navigate(item.path);
      return;
    }
    if (item.id === "staff") {
      setMode("staff");
      if (authSession?.role === "staff") {
        navigate("/orders");
        return;
      }
      navigate("/login?role=staff");
      return;
    }
    if (item.id === "owner") {
      setMode("owner");
      if (authSession?.role === "owner") {
        navigate("/owner");
        return;
      }
      navigate("/login?role=owner");
    }
  }

  return (
    <div className="app-shell">
      {import.meta.env.DEV && !isSupabaseConfigured() ? (
        <div className="supabase-config-banner" role="status">
          <p>{t("app.supabaseBanner")}</p>
        </div>
      ) : null}
      {isSupabaseConfigured() && !dataReady ? (
        <div className="app-loading-overlay" role="status" aria-live="polite">
          <p className="app-loading-overlay-text">{t("app.dataLoading")}</p>
        </div>
      ) : null}
      <header className="site-header">
        <Link className="brand" to="/" aria-label={t("header.brandAria")}>
          <span className="brand-mark">T</span>
          <span>Tom&apos;s Mysterious Restaurant</span>
        </Link>

        <nav className="desktop-nav" aria-label={t("nav.primaryAria")}>
          <NavLink to="/menu">{t("header.navMenu")}</NavLink>
          <NavLink to="/location">{t("header.navLocation")}</NavLink>
          {!authSession ? (
            <>
              <NavLink to="/login">{t("header.login")}</NavLink>
              <NavLink to="/register">{t("header.register")}</NavLink>
            </>
          ) : authSession.role === "staff" ? (
            <NavLink to="/orders" onClick={() => setMode("staff")}>
              {t("header.navLiveTickets")}
            </NavLink>
          ) : null}
          {authSession?.role === "owner" ? (
            <>
              <NavLink to="/owner/add" end>
                {t("header.addDish")}
              </NavLink>
              <NavLink to="/owner/edit">{t("header.editMenu")}</NavLink>
              <NavLink to="/orders">{t("header.navLiveTickets")}</NavLink>
            </>
          ) : null}
        </nav>

        <div className="header-actions">
          <LanguageSwitcher />
          <button
            className="icon-button"
            type="button"
            aria-label={t("header.profileAria")}
            onClick={() => {
              if (!authSession) {
                navigate("/login?notice=profile");
                return;
              }
              navigate("/profile");
            }}
          >
            <Icon name="user" />
          </button>
          <button
            className="cart-button"
            type="button"
            aria-label={t("header.cartAria", { count: cartCount })}
            onClick={() => navigate("/cart")}
          >
            <Icon name="cart" />
            <span>{cartCount}</span>
          </button>
          <button
            className="order-button"
            type="button"
            onClick={() => {
              exitStaffOrOwnerForGuestBrowse();
              setMode("customer");
              navigate("/menu");
            }}
          >
            {t("header.orderNow")}
          </button>
          <details className="mode-menu-wrap">
            <summary className="mode-menu-button">{t("header.mode")}</summary>
            <div className="mode-menu" role="menu" aria-label={t("header.modeMenuAria")}>
              {modes.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? "mode-menu-item active" : "mode-menu-item"}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    selectMode(item);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
          {authSession ? (
            <button type="button" className="header-logout-button" onClick={handleLogout}>
              {t("header.logout")}
            </button>
          ) : null}
          <button
            className="mobile-menu"
            type="button"
            aria-label={t("header.openMobileMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside
            className="mobile-drawer"
            aria-label={t("drawer.mobileNavAria")}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button drawer-close"
              type="button"
              aria-label={t("header.closeMobileMenu")}
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="x" />
            </button>
            <div className="drawer-lang-row">
              <LanguageSwitcher />
            </div>
            <MobileLink to="/menu" onDone={() => setDrawerOpen(false)}>
              {t("drawer.menu")}
            </MobileLink>
            <MobileLink to="/location" onDone={() => setDrawerOpen(false)}>
              {t("drawer.location")}
            </MobileLink>
            {!authSession ? (
              <>
                <MobileLink to="/login" onDone={() => setDrawerOpen(false)}>
                  {t("header.login")}
                </MobileLink>
                <MobileLink to="/register" onDone={() => setDrawerOpen(false)}>
                  {t("header.register")}
                </MobileLink>
              </>
            ) : (
              <>
                {authSession.role === "staff" ? (
                  <MobileLink
                    to="/orders"
                    onDone={() => {
                      setMode("staff");
                      setDrawerOpen(false);
                    }}
                  >
                    {t("header.navLiveTickets")}
                  </MobileLink>
                ) : null}
                {authSession.role === "owner" ? (
                  <MobileLink
                    to="/owner"
                    onDone={() => {
                      setMode("owner");
                      setDrawerOpen(false);
                    }}
                  >
                    {t("ownerShell.eyebrow")}
                  </MobileLink>
                ) : null}
              </>
            )}
            {authSession?.role === "owner" ? (
              <>
                <MobileLink to="/owner/add" onDone={() => setDrawerOpen(false)}>
                  {t("header.addDish")}
                </MobileLink>
                <MobileLink to="/owner/edit" onDone={() => setDrawerOpen(false)}>
                  {t("header.editMenu")}
                </MobileLink>
                <MobileLink to="/orders" onDone={() => setDrawerOpen(false)}>
                  {t("header.navLiveTickets")}
                </MobileLink>
              </>
            ) : null}
            <div className="drawer-mode-group">
              {modes.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? "drawer-link active" : "drawer-link"}
                  type="button"
                  onClick={() => {
                    selectMode(item);
                    setDrawerOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {authSession ? (
              <button
                className="drawer-link drawer-logout-after-mode"
                type="button"
                onClick={() => {
                  handleLogout();
                  setDrawerOpen(false);
                }}
              >
                {t("drawer.logout")}
              </button>
            ) : null}
          </aside>
        </div>
      )}

      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage menu={state.menu} orders={state.orders} onOrder={openOrderNoteModal} />
            }
          />
          <Route
            path="/menu"
            element={
              <MenuPage
                menu={state.menu}
                orders={state.orders}
                session={authSession}
                onOrder={openOrderNoteModal}
                onReview={addReview}
              />
            }
          />
          <Route
            path="/orders"
            element={
              <OrdersPage
                mode={mode}
                session={authSession}
                orders={state.orders}
                onStatusChange={(orderId, status) => {
                  updateOrderStatus(orderId, status);
                }}
                onReady={(orderId) => {
                  markOrderReady(orderId);
                }}
              />
            }
          />
          <Route path="/location" element={<LocationPage />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />
          <Route
            path="/cart"
            element={
              <CartPage
                cart={state.cart}
                onUpdateQuantity={updateCartLineQuantity}
                onRemoveLine={removeCartLine}
                onCheckout={checkoutCart}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <ProfilePage session={authSession} orders={state.orders} />
            }
          />
          <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/register" element={<RegisterPage onLoginSuccess={handleLoginSuccess} />} />
          <Route
            path="/owner"
            element={
              <RequireRole session={authSession} role="owner">
                <OwnerShell
                  menu={state.menu}
                  orders={state.orders}
                  onAddMenuItem={addMenuItem}
                  onAddMenuItemsBatch={addMenuItemsBatch}
                  onUpdateMenuItem={updateMenuItem}
                  onDeleteMenuItem={deleteMenuItem}
                  onToggleMenuItemAvailable={toggleMenuItemAvailable}
                />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="add" replace />} />
            <Route path="add" element={<OwnerAddPage />} />
            <Route path="edit" element={<OwnerEditMenuPage />} />
            <Route path="edit/:itemId" element={<OwnerEditDishPage />} />
          </Route>
        </Routes>
      </main>

      <footer className="site-footer">
        <div>
          <strong>Tom&apos;s Mysterious Restaurant</strong>
          <p>{t("footer.tagline")}</p>
        </div>
        <div className="footer-links">
          <Link to="/menu">{t("footer.menu")}</Link>
          <Link to="/cart">{t("footer.cart")}</Link>
          <Link to="/location">
            <Icon name="pin" />
            {t("footer.demoStore")}
          </Link>
        </div>
      </footer>

      {pendingOrderItem && (
        <div
          className="order-modal-backdrop"
          role="presentation"
          onClick={closeOrderNoteModal}
        >
          <div
            className="order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="order-modal-header">
              <h2 id="order-notes-title">{t("orderModal.title")}</h2>
              <button className="icon-button" type="button" aria-label={t("common.close")} onClick={closeOrderNoteModal}>
                <Icon name="x" />
              </button>
            </div>
            <p className="order-modal-dish">{pendingOrderItem.name}</p>
            <p className="order-modal-hint">{t("orderModal.hint")}</p>
            <label className="order-modal-label">
              {t("orderModal.notesLabel")}
              <textarea
                className="order-modal-textarea"
                value={orderNotesDraft}
                onChange={(event) => setOrderNotesDraft(event.target.value)}
                placeholder={t("orderModal.notesPlaceholder")}
                rows={4}
                autoFocus
              />
            </label>
            <div className="order-modal-actions">
              <button className="secondary-cta" type="button" onClick={closeOrderNoteModal}>
                {t("orderModal.cancel")}
              </button>
              <button className="primary-cta" type="button" onClick={submitAddToCart}>
                {t("orderModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function MobileLink({ to, onDone, children }) {
  return (
    <NavLink className="drawer-link" to={to} onClick={onDone}>
      {children}
    </NavLink>
  );
}

function OrderSuccessPage() {
  const { t } = useI18n();
  const location = useLocation();
  const summary =
    location.state && typeof location.state === "object" && !Array.isArray(location.state) ? location.state : null;
  const qty = Math.max(0, Math.floor(Number(summary?.qty)));
  const lines = Math.max(0, Math.floor(Number(summary?.lines)));

  return (
    <section className="content-section page-section order-success-page" aria-labelledby="order-success-title">
      <div className="section-heading">
        <p className="eyebrow">{t("orderSuccess.eyebrow")}</p>
        <h1 id="order-success-title" className="order-success-title">
          {t("orderSuccess.title")}
        </h1>
        <p>{t("orderSuccess.body")}</p>
        {qty > 0 && lines > 0 ? (
          <p className="order-success-summary">{t("orderSuccess.summary", { qty, lines })}</p>
        ) : null}
      </div>
      <div className="order-success-actions">
        <Link className="primary-cta" to="/menu">
          {t("orderSuccess.backMenu")}
        </Link>
        <Link className="secondary-cta" to="/">
          {t("orderSuccess.backHome")}
        </Link>
      </div>
    </section>
  );
}

function CartPage({ cart, onUpdateQuantity, onRemoveLine, onCheckout }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity || 1), 0),
    [cart],
  );
  const totalItems = useMemo(() => getCartQuantity(cart), [cart]);

  async function handleCheckout() {
    if (!cart.length) return;
    const qty = cart.reduce((sum, line) => sum + Number(line.quantity || 1), 0);
    const lines = cart.length;
    const ok = await onCheckout();
    if (!ok) return;
    navigate("/order-success", { state: { qty, lines } });
  }

  return (
    <section className="cart-page content-section page-section" aria-labelledby="cart-title">
      <div className="section-heading cart-page-intro">
        <p className="eyebrow">{t("cart.eyebrow")}</p>
        <h1 id="cart-title">{t("cart.title")}</h1>
        <p>{t("cart.intro")}</p>
      </div>

      {!cart.length ? (
        <div className="cart-empty-panel">
          <p className="cart-empty-title">{t("cart.emptyTitle")}</p>
          <p className="cart-empty-copy">{t("cart.emptyCopy")}</p>
          <Link className="primary-cta" to="/menu">
            {t("cart.browseMenu")}
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-lines-panel">
            <h2 className="cart-panel-heading">{t("cart.itemsHead")}</h2>
            <ul className="cart-line-list">
              {cart.map((line) => {
                const lineTotal = Number(line.price) * Number(line.quantity || 1);
                return (
                  <li key={line.id} className="cart-line">
                    <div className="cart-line-thumb">
                      <img src={line.image} alt="" />
                    </div>
                    <div className="cart-line-body">
                      <div className="cart-line-top">
                        <h3>{line.itemName}</h3>
                        <strong className="cart-line-price">{formatPrice(lineTotal)}</strong>
                      </div>
                      <p className="cart-line-unit">{t("cart.each", { price: formatPrice(line.price) })}</p>
                      {line.notes && line.notes !== "No special request" ? (
                        <p className="cart-line-notes">
                          <span className="cart-notes-label">{t("cart.noteLabel")}</span> {line.notes}
                        </p>
                      ) : null}
                      <div className="cart-line-controls">
                        <div className="cart-qty" aria-label={t("cart.qtyAria")}>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                            aria-label={t("cart.decAria")}
                          >
                            −
                          </button>
                          <span className="cart-qty-value">{line.quantity}</span>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                            aria-label={t("cart.incAria")}
                            disabled={totalItems >= MAX_ORDER_QUANTITY}
                          >
                            +
                          </button>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => onRemoveLine(line.id)}>
                          {t("cart.remove")}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="cart-summary-panel" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">{t("cart.summaryTitle")}</h2>
            <dl className="cart-summary-rows">
              <div className="cart-summary-row">
                <dt>{t("cart.items")}</dt>
                <dd>{totalItems}</dd>
              </div>
              <div className="cart-summary-row cart-summary-total">
                <dt>{t("cart.total")}</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
            </dl>
            <p className="cart-demo-note">{t("cart.demoNote")}</p>
            <button type="button" className="primary-cta cart-checkout-btn" onClick={handleCheckout}>
              {t("cart.checkout")}
            </button>
            <p className="cart-checkout-hint">{t("cart.checkoutHint")}</p>
          </aside>
        </div>
      )}
    </section>
  );
}

function HomePopularCarousel({ items, onOrder, orders, menuForBadges }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const count = items.length;

  useEffect(() => {
    setIndex((i) => (count ? Math.min(i, count - 1) : 0));
  }, [count]);

  function goPrev() {
    setIndex((i) => (count ? (i - 1 + count) % count : 0));
  }

  function goNext() {
    setIndex((i) => (count ? (i + 1) % count : 0));
  }

  if (!count) {
    return (
      <div className="empty-state empty-state--soft home-carousel-empty" role="status">
        <p className="empty-state-title">{t("home.carouselEmptyTitle")}</p>
        <p className="empty-state-hint">{t("home.carouselEmptyHint")}</p>
        <Link className="secondary-cta" to="/menu">
          {t("home.viewFullMenu")}
        </Link>
      </div>
    );
  }

  return (
    <div className="home-carousel" aria-roledescription="carousel" aria-label={t("home.carouselAria")}>
      <div className="home-carousel-controls">
        <button type="button" className="home-carousel-arrow" aria-label={t("home.prevDish")} onClick={goPrev}>
          <span aria-hidden="true">‹</span>
        </button>
        <div className="home-carousel-viewport">
          <div className="home-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {items.map((item) => (
              <div key={item.id} className="home-carousel-slide">
                <MenuCard item={item} onOrder={onOrder} orders={orders} menuForBadges={menuForBadges} />
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="home-carousel-arrow" aria-label={t("home.nextDish")} onClick={goNext}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="home-carousel-dots" role="tablist" aria-label={t("home.carouselAria")}>
        {items.map((_, i) => (
          <button
            key={items[i].id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={t("home.slideShow", { i: i + 1, count })}
            className={`home-carousel-dot${i === index ? " active" : ""}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}

function HomePage({ menu, orders, onOrder }) {
  const { t } = useI18n();
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const popularItems = useMemo(
    () => sortVisibleMenuBySalesThenPopularity(visibleMenu, orders).slice(0, POPULAR_SALES_TOP_N),
    [visibleMenu, orders],
  );

  return (
    <div className="home-reveal">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{t("home.heroEyebrow")}</p>
          <h1 id="hero-title">{t("home.heroTitle")}</h1>
          <p>{t("home.heroBody")}</p>
          <div className="hero-actions">
            <Link className="primary-cta" to="/menu">
              {t("home.startOrder")}
            </Link>
            <Link className="secondary-cta" to="/location">
              {t("home.findLocation")}
            </Link>
          </div>
        </div>
        <div className="hero-food" aria-label={t("home.heroFoodAria")}>
          <img src="/assets/pancake-breakfast.png" alt="" />
          <img src="/assets/diner-burger.png" alt="" />
        </div>
      </section>

      <section className="content-section home-reveal-content" aria-labelledby="popular-title">
        <div className="section-heading">
          <p className="eyebrow">{t("home.popularEyebrow")}</p>
          <h2 id="popular-title">{t("home.popularTitle")}</h2>
          <p>{t("home.popularBody")}</p>
        </div>
        <HomePopularCarousel items={popularItems} onOrder={onOrder} orders={orders} menuForBadges={visibleMenu} />
      </section>
    </div>
  );
}

function MenuPage({ menu, orders, session, onOrder, onReview }) {
  const { t } = useI18n();
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBadge, setFilterBadge] = useState("all");
  const [openReviewItemId, setOpenReviewItemId] = useState(null);
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const badgeCtx = useMemo(() => ({ orders, menu: visibleMenu }), [orders, visibleMenu]);
  const badgeFilterOptions = useMemo(() => collectBadgeFilterOptions(visibleMenu, orders), [visibleMenu, orders]);
  const filteredMenu = useMemo(
    () => filterMenuByCategoryAndBadge(visibleMenu, filterCategory, filterBadge, badgeCtx),
    [visibleMenu, filterCategory, filterBadge, badgeCtx],
  );

  useEffect(() => {
    setOpenReviewItemId(null);
  }, [filterCategory, filterBadge]);

  function handleReviewPanelToggle(itemId) {
    setOpenReviewItemId((prev) => {
      if (itemId === null) return null;
      return prev === itemId ? null : itemId;
    });
  }

  return (
    <section className="content-section page-section menu-page" aria-labelledby="menu-title">
      <div className="section-heading">
        <p className="eyebrow">{t("menuPage.eyebrow")}</p>
        <h2 id="menu-title">{t("menuPage.title")}</h2>
        <p>{t("menuPage.body")}</p>
      </div>

      <MenuFiltersBar
        menuItems={visibleMenu}
        category={filterCategory}
        badge={filterBadge}
        onCategory={setFilterCategory}
        onBadge={setFilterBadge}
        badgeOptions={badgeFilterOptions}
      />

      {filteredMenu.length ? (
        <div className="menu-grid">
          {filteredMenu.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              onOrder={onOrder}
              onReview={onReview}
              session={session}
              orders={orders}
              menuForBadges={visibleMenu}
              reviewOpen={openReviewItemId === item.id}
              onReviewPanelToggle={handleReviewPanelToggle}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--soft menu-filter-empty" role="status">
          <p className="empty-state-title">{t("menuPage.emptyFilterTitle")}</p>
          <p className="empty-state-hint">{t("menuPage.emptyFilterHint")}</p>
        </div>
      )}
    </section>
  );
}

function MenuCard({
  item,
  onOrder,
  onReview,
  session = null,
  orders = [],
  menuForBadges = [],
  reviewOpen: reviewOpenProp = false,
  onReviewPanelToggle,
}) {
  const { t } = useI18n();
  const location = useLocation();
  const [fallbackReviewOpen, setFallbackReviewOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const controlledReview = typeof onReviewPanelToggle === "function";
  const reviewOpen = controlledReview ? reviewOpenProp : fallbackReviewOpen;

  function toggleReviewPanel() {
    if (controlledReview) onReviewPanelToggle(item.id);
    else setFallbackReviewOpen((o) => !o);
  }

  function closeReviewPanel() {
    if (controlledReview) onReviewPanelToggle(null);
    else setFallbackReviewOpen(false);
  }

  const badgeCtx = useMemo(
    () => ({ orders, menu: menuForBadges.length ? menuForBadges : [item] }),
    [orders, menuForBadges, item],
  );
  const badges = useMemo(() => getAllBadgesForItem(item, badgeCtx), [item, badgeCtx]);

  const previewReviews = useMemo(() => {
    const list = Array.isArray(item.reviews) ? item.reviews : [];
    return list.slice(0, MENU_CARD_REVIEW_PREVIEW_COUNT);
  }, [item.reviews]);

  const averageRating = useMemo(() => {
    if (!item.reviews.length) return 0;
    const total = item.reviews.reduce((sum, review) => sum + Number(review.rating), 0);
    return Math.round(total / item.reviews.length);
  }, [item.reviews]);

  const returnToParam = useMemo(
    () => encodeURIComponent(`${location.pathname}${location.search || ""}`),
    [location.pathname, location.search],
  );

  function submitReview(event) {
    event.preventDefault();
    if (!session || !text.trim() || !onReview) return;
    const name = session.username?.trim() || "";
    onReview(item.id, {
      author: name,
      rating: Number(rating),
      text: text.trim(),
    });
    setText("");
    setRating(5);
    closeReviewPanel();
  }

  return (
    <article className="food-card">
      <div className="food-image-wrap">
        <img src={item.image} alt={`${item.name} dish`} />
        {badges.length ? (
          <div className="food-card-badges-wrap">
            {badges.map((b) => (
              <span key={b} className={`badge ${badgeToneClass(b)}`}>
                {b}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="food-card-body">
        <div className="food-title-row">
          <div>
            <p className="category">{item.category}</p>
            <h3>{item.name}</h3>
          </div>
          <strong>{formatPrice(item.price)}</strong>
        </div>
        <p>{item.description}</p>
        <div className="rating-line">
          {averageRating ? <StarRating value={averageRating} /> : <span>{t("menuCard.noReviewsYet")}</span>}
          <span>
            {item.reviews.length === 1
              ? t("menuCard.reviewCount", { count: item.reviews.length })
              : t("menuCard.reviewCountPlural", { count: item.reviews.length })}
          </span>
        </div>
        <div className="card-actions">
          <button className="primary-cta small" type="button" onClick={() => onOrder(item)}>
            <Icon name="plus" />
            {t("menuCard.addToCart")}
          </button>
          {onReview && (
            <button className="secondary-cta small" type="button" onClick={toggleReviewPanel}>
              {t("menuCard.review")}
            </button>
          )}
        </div>
        {reviewOpen && !session ? (
          <div className="review-login-gate">
            <p className="review-login-gate-title">{t("menuCard.reviewLoginTitle")}</p>
            <p className="review-login-gate-hint">{t("menuCard.reviewLoginHint")}</p>
            <div className="review-login-gate-actions">
              <Link className="primary-cta small" to={`/login?returnTo=${returnToParam}`}>
                {t("header.login")}
              </Link>
              <Link className="secondary-cta small" to={`/register?returnTo=${returnToParam}`}>
                {t("header.register")}
              </Link>
            </div>
          </div>
        ) : null}
        {reviewOpen && session ? (
          <form className="review-form" onSubmit={submitReview}>
            <p className="review-form-account full-row">{t("menuCard.reviewPostedAs", { name: session.username })}</p>
            <label className="full-row">
              {t("menuCard.rating")}
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {t("menuCard.starsOption", { n: value })}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-row">
              {t("menuCard.reviewText")}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("menuCard.reviewPlaceholder")}
                rows="3"
              />
            </label>
            <button className="primary-cta small full-row" type="submit">
              {t("menuCard.sendReview")}
            </button>
          </form>
        ) : null}
        <section className="menu-card-reviews" aria-labelledby={`reviews-heading-${item.id}`}>
          <h4 className="menu-card-reviews-heading" id={`reviews-heading-${item.id}`}>
            {t("menuCard.recentReviews")}
          </h4>
          {item.reviews.length === 0 ? (
            <p className="menu-card-reviews-empty">{t("menuCard.firstReview")}</p>
          ) : (
            <>
              {item.reviews.length > MENU_CARD_REVIEW_PREVIEW_COUNT ? (
                <p className="menu-card-reviews-note">
                  {t("menuCard.showingLatest", { n: MENU_CARD_REVIEW_PREVIEW_COUNT, total: item.reviews.length })}
                </p>
              ) : null}
              <ul className="menu-card-reviews-list">
                {previewReviews.map((review, index) => {
                  const rid = review.id ?? `${item.id}-review-${index}`;
                  const stars = Math.min(5, Math.max(0, Math.round(Number(review.rating) || 0)));
                  return (
                    <li key={rid} className="menu-card-review-item">
                      <div className="menu-card-review-meta">
                        <strong>{review.author && review.author !== "Guest" ? review.author : t("common.guest")}</strong>
                        {stars > 0 ? <StarRating value={stars} /> : null}
                      </div>
                      <p>{review.text}</p>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="secondary-cta small menu-card-reviews-modal-btn"
                onClick={() => setReviewsModalOpen(true)}
              >
                {item.reviews.length > MENU_CARD_REVIEW_PREVIEW_COUNT
                  ? t("menuCard.viewAllCount", { count: item.reviews.length })
                  : t("menuCard.viewAllReviews")}
              </button>
            </>
          )}
        </section>
      </div>
      <DishReviewsModal open={reviewsModalOpen} onClose={() => setReviewsModalOpen(false)} item={item} />
    </article>
  );
}

function OrdersPage({ mode, session, orders, onStatusChange, onReady }) {
  const { t } = useI18n();
  if (session?.role === "staff" || session?.role === "owner") {
    return <StaffMode orders={orders} onStatusChange={onStatusChange} onReady={onReady} />;
  }
  if (mode === "staff") {
    return <Navigate to="/login?role=staff" replace />;
  }

  if (!session) {
    return (
      <section className="content-section page-section" aria-labelledby="orders-title">
        <div className="section-heading">
          <p className="eyebrow">{t("ordersPage.eyebrow")}</p>
          <h2 id="orders-title">{t("ordersPage.guestTitle")}</h2>
          <p>{t("ordersPage.guestBody")}</p>
        </div>
        <div className="profile-auth-actions profile-auth-actions--centered">
          <Link className="primary-cta" to="/login">
            {t("profile.login")}
          </Link>
          <Link className="secondary-cta" to="/register">
            {t("profile.register")}
          </Link>
        </div>
        <div className="empty-state empty-state--soft profile-empty-panel">
          <p className="empty-state-hint">{t("ordersPage.guestHint")}</p>
          <Link className="primary-cta" to="/menu">
            {t("profile.goMenu")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="content-section page-section" aria-labelledby="orders-title">
      <div className="section-heading">
        <p className="eyebrow">{t("ordersPage.eyebrow")}</p>
        <h2 id="orders-title">{t("ordersPage.historyTitle")}</h2>
        <p>{t("ordersPage.historyBody")}</p>
      </div>
      <CustomerOrderHistory session={session} orders={orders} />
    </section>
  );
}

function StaffMode({ orders, onStatusChange, onReady }) {
  const { t } = useI18n();
  const pending = orders.filter((order) => order.status === "new");
  const handled = orders.filter((order) => order.status !== "new");

  return (
    <section className="content-section page-section" aria-labelledby="staff-title">
      <div className="section-heading">
        <p className="eyebrow">{t("staff.eyebrow")}</p>
        <h2 id="staff-title">{t("staff.title")}</h2>
        <p>{t("staff.body")}</p>
      </div>

      <div className="staff-layout">
        <div>
          <h3 className="panel-title">{t("staff.waitingTitle")}</h3>
          <div className="ticket-list">
            {pending.length ? (
              pending.map((order) => (
                <OrderTicket key={order.id} order={order} hideReadyState>
                  <button className="accept-button" type="button" onClick={() => onStatusChange(order.id, "accepted")}>
                    <Icon name="check" />
                    {t("staff.accept")}
                  </button>
                  <button className="decline-button" type="button" onClick={() => onStatusChange(order.id, "declined")}>
                    <Icon name="x" />
                    {t("staff.decline")}
                  </button>
                </OrderTicket>
              ))
            ) : (
              <div className="empty-state empty-state--soft staff-empty">
                <p className="empty-state-title">{t("staff.emptyPendingTitle")}</p>
                <p className="empty-state-hint">{t("staff.emptyPendingHint")}</p>
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="panel-title">{t("staff.handledTitle")}</h3>
          <div className="ticket-list">
            {handled.length ? (
              handled.map((order) => (
                <OrderTicket
                  key={order.id}
                  order={order}
                  onReady={order.status === "accepted" && !order.ready ? onReady : undefined}
                />
              ))
            ) : (
              <div className="empty-state empty-state--soft staff-empty">
                <p className="empty-state-title">{t("staff.emptyHandledTitle")}</p>
                <p className="empty-state-hint">{t("staff.emptyHandledHint")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderTicket({ order, children, onReady, hideReadyState = false }) {
  const { t } = useI18n();
  const isReady = Boolean(order.ready);
  const showReadyPill = !hideReadyState && order.status === "accepted";
  const statusKey = `orderStatus.${order.status}`;
  const statusLabel = t(statusKey) !== statusKey ? t(statusKey) : order.status.toUpperCase();
  const customerLabel = order.customerName === "Walk-in Guest" ? t("common.walkInGuest") : order.customerName;

  return (
    <article className={`ticket status-${order.status}`}>
      <div>
        <p className="ticket-meta">{new Date(order.createdAt).toLocaleString()}</p>
        <h3>{order.itemName}</h3>
        <p>
          {order.quantity} × {formatPrice(order.price)} = {formatPrice(Number(order.price) * Number(order.quantity || 1))}{" "}
          · {customerLabel}
        </p>
        <p>{order.notes}</p>
      </div>
      <div className="ticket-footer">
        <span className={`status-pill status-label-${order.status}`}>{statusLabel}</span>
        <div className="ticket-actions">
          {children}
          {onReady && (
            <button className="ready-button" type="button" onClick={() => onReady(order.id)}>
              {t("staff.ready")}
            </button>
          )}
          {showReadyPill && (
            <span className={isReady ? "ready-pill ready" : "ready-pill not-ready"}>
              {isReady ? t("staff.readyYes") : t("staff.readyNo")}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function OrderHistorySheet({ orders, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal profile-order-sheet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-order-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id="profile-order-sheet-title">{t("profile.allOrdersTitle")}</h2>
          <button type="button" className="icon-button" aria-label={t("dishReviews.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="profile-order-sheet-scroll" role="list">
          <div className="ticket-list">
            {orders.map((order) => (
              <OrderTicket key={order.id} order={order} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileOrderHistoryBlock({ session, orders }) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const mine = useMemo(() => getPersonalOrdersForSession(session, orders), [session?.id, orders]);
  const preview = useMemo(() => mine.slice(0, PROFILE_ORDER_HISTORY_PREVIEW), [mine]);

  if (!mine.length) {
    return (
      <div className="empty-state empty-state--soft profile-empty-panel">
        <p className="empty-state-title">{t("profile.orderHistoryEmptyTitle")}</p>
        <p className="empty-state-hint">{t("profile.orderHistoryEmptyHint")}</p>
        <Link className="primary-cta" to="/menu">
          {t("profile.goMenu")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="order-history profile-order-history-preview">
        <div className="ticket-list" role="list">
          {preview.map((order) => (
            <OrderTicket key={order.id} order={order} />
          ))}
        </div>
      </div>
      {mine.length > PROFILE_ORDER_HISTORY_PREVIEW ? (
        <div className="profile-order-history-actions">
          <button type="button" className="secondary-cta" onClick={() => setSheetOpen(true)}>
            {t("profile.viewAllOrders")}
          </button>
        </div>
      ) : null}
      {sheetOpen ? <OrderHistorySheet orders={mine} onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}

function CustomerOrderHistory({ session, orders, context = "orders" }) {
  const { t } = useI18n();
  const mine = useMemo(() => getPersonalOrdersForSession(session, orders), [session?.id, orders]);
  const onProfile = context === "profile";

  if (!mine.length) {
    return (
      <div className="empty-state empty-state--soft profile-empty-panel">
        <p className="empty-state-title">
          {onProfile ? t("profile.orderHistoryEmptyTitle") : t("ordersPage.historyEmptyTitle")}
        </p>
        <p className="empty-state-hint">
          {onProfile ? t("profile.orderHistoryEmptyHint") : t("ordersPage.historyEmptyHint")}
        </p>
        <Link className="primary-cta" to="/menu">
          {t("profile.goMenu")}
        </Link>
      </div>
    );
  }

  return (
    <div className="order-history">
      <div className="ticket-list" role="list">
        {mine.map((order) => (
          <OrderTicket key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function OwnerImageUploadModal({ open, onClose, onApply }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    setError(null);
    setDragOver(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function processFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("ownerUpload.notImage"));
      setDraft(null);
      return;
    }
    if (file.size > MAX_OWNER_IMAGE_BYTES) {
      setError(t("ownerUpload.tooLarge", { mb: Math.round(MAX_OWNER_IMAGE_BYTES / 1024 / 1024) }));
      setDraft(null);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft(reader.result);
    };
    reader.onerror = () => {
      setError(t("ownerUpload.readError"));
      setDraft(null);
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return (
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal owner-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id="owner-upload-title">{t("ownerUpload.title")}</h2>
          <button className="icon-button" type="button" aria-label={t("ownerUpload.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="owner-upload-intro">{t("ownerUpload.intro")}</p>

        <input
          ref={fileInputRef}
          type="file"
          className="owner-file-input-hidden"
          accept="image/*"
          aria-label={t("ownerUpload.chooseFile")}
          onChange={(event) => {
            processFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          className={`owner-upload-dropzone${dragOver ? " owner-upload-dropzone-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            processFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="owner-upload-dropzone-title">{t("ownerUpload.dropTitle")}</span>
          <span className="owner-upload-dropzone-sub">{t("ownerUpload.dropSub")}</span>
        </button>

        {error ? (
          <p className="owner-upload-error" role="alert">
            {error}
          </p>
        ) : null}

        {draft ? (
          <div className="owner-upload-preview-wrap">
            <p className="owner-upload-preview-label">{t("ownerUpload.preview")}</p>
            <img src={draft} alt="" className="owner-upload-preview" />
          </div>
        ) : null}

        <div className="order-modal-actions">
          <button className="secondary-cta" type="button" onClick={onClose}>
            {t("ownerUpload.cancel")}
          </button>
          <button
            className="primary-cta"
            type="button"
            disabled={!draft}
            onClick={() => {
              if (draft) onApply(draft);
              onClose();
            }}
          >
            {t("ownerUpload.useImage")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnerShell({ menu, orders, onAddMenuItem, onAddMenuItemsBatch, onUpdateMenuItem, onDeleteMenuItem, onToggleMenuItemAvailable }) {
  const { t } = useI18n();
  const [stagedDishes, setStagedDishes] = useState(loadOwnerStagedSession);

  useEffect(() => {
    try {
      if (!stagedDishes.length) {
        window.sessionStorage.removeItem(OWNER_STAGED_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(OWNER_STAGED_SESSION_KEY, JSON.stringify(stagedDishes));
      }
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [stagedDishes]);

  function addStagedDish(dish) {
    setStagedDishes((current) => [...current, dish]);
  }

  function removeStagedDish(id) {
    setStagedDishes((current) => current.filter((d) => d.id !== id));
  }

  function clearStagedDishes() {
    setStagedDishes([]);
  }

  return (
    <section className="content-section page-section owner-area">
      <div className="section-heading">
        <p className="eyebrow">{t("ownerShell.eyebrow")}</p>
        <h2 id="owner-title">{t("ownerShell.title")}</h2>
        <p>{t("ownerShell.body")}</p>
      </div>
      <Outlet
        context={{
          menu,
          orders,
          onAddMenuItem,
          onAddMenuItemsBatch,
          onUpdateMenuItem,
          onDeleteMenuItem,
          onToggleMenuItemAvailable,
          stagedDishes,
          addStagedDish,
          removeStagedDish,
          clearStagedDishes,
        }}
      />
    </section>
  );
}

function OwnerAddPage() {
  const { t } = useI18n();
  const { onAddMenuItemsBatch, stagedDishes, addStagedDish, removeStagedDish, clearStagedDishes } = useOutletContext();
  const [imageSource, setImageSource] = useState("url");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "Specials",
    customBadges: "",
    description: "",
    image: "",
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setImageSourceMode(mode) {
    setImageSource(mode);
    if (mode === "url") {
      setForm((current) => ({
        ...current,
        image: current.image.startsWith("data:") ? "" : current.image,
      }));
    }
  }

  function addToPreview(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.price) return;
    const manualBadges = parseOwnerCustomBadgesInput(form.customBadges);
    const payload = {
      id: `preview-${Date.now()}`,
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      manualBadges,
      description: form.description.trim(),
      image: form.image.trim(),
    };
    addStagedDish(payload);
    setForm({
      name: "",
      price: "",
      category: "Specials",
      customBadges: "",
      description: "",
      image: "",
    });
    setImageSource("url");
  }

  function removeStaged(id) {
    removeStagedDish(id);
  }

  function submitStagedToMenu() {
    if (!stagedDishes.length) return;
    const payloads = stagedDishes.map((dish) => {
      const { id: _id, badge: _legacyBadge, ...rest } = dish;
      const manualFromArray = Array.isArray(rest.manualBadges)
        ? sanitizeManualBadges(rest.manualBadges)
        : typeof _legacyBadge === "string"
          ? migrateLegacyBadgeString(_legacyBadge)
          : [];
      return {
        name: rest.name,
        price: rest.price,
        category: rest.category,
        description: rest.description,
        image: rest.image,
        manualBadges: manualFromArray,
      };
    });
    onAddMenuItemsBatch(payloads);
    clearStagedDishes();
  }

  function previewCustomBadgesLine(dish) {
    const m = Array.isArray(dish.manualBadges)
      ? sanitizeManualBadges(dish.manualBadges)
      : typeof dish.badge === "string"
        ? migrateLegacyBadgeString(dish.badge)
        : [];
    return m.length ? m.join(" · ") : t("ownerAdd.noCustomBadges");
  }

  return (
    <div className="owner-add-workspace">
      <div className="owner-add-form-column">
        <form className="owner-form owner-add-form" onSubmit={addToPreview}>
          <label>
            {t("ownerAdd.dishName")}
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Midnight Melt"
              required
            />
          </label>
          <label>
            {t("ownerAdd.price")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => updateField("price", event.target.value)}
              placeholder="11.99"
              required
            />
          </label>
          <label>
            {t("ownerAdd.category")}
            <input
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
              placeholder="Specials"
            />
          </label>
          <label className="full-row">
            {t("ownerAdd.customBadges")}
            <input
              value={form.customBadges}
              onChange={(event) => updateField("customBadges", event.target.value)}
              placeholder="e.g. Chef's pick, Spicy (comma-separated)"
            />
            <span className="owner-field-hint">{t("ownerAdd.customBadgesHint")}</span>
          </label>

          <fieldset className="owner-image-fieldset full-row">
            <legend>{t("ownerAdd.dishImage")}</legend>
            <div className="owner-image-source-options" role="radiogroup" aria-label={t("ownerAdd.imageSourceAria")}>
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "url"}
                  onChange={() => setImageSourceMode("url")}
                />
                <span>{t("ownerAdd.imageUrl")}</span>
              </label>
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "upload"}
                  onChange={() => setImageSourceMode("upload")}
                />
                <span>{t("ownerAdd.uploadImage")}</span>
              </label>
            </div>

            {imageSource === "url" ? (
              <label className="owner-image-url-label">
                {t("ownerAdd.link")}
                <input
                  value={form.image.startsWith("data:") ? "" : form.image}
                  onChange={(event) => updateField("image", event.target.value)}
                  placeholder="https://… or /assets/diner-burger.png"
                />
              </label>
            ) : (
              <div className="owner-image-upload-block">
                {form.image ? (
                  <div className="owner-image-upload-preview-row">
                    <img src={form.image} alt="" className="owner-image-thumb" />
                    <div className="owner-image-upload-actions">
                      <button type="button" className="primary-cta small" onClick={() => setUploadModalOpen(true)}>
                        {t("ownerAdd.changeImage")}
                      </button>
                      <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                        {t("ownerAdd.clear")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="owner-image-upload-empty">{t("ownerAdd.noImageYet")}</p>
                    <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                      {t("ownerAdd.uploadOpen")}
                    </button>
                  </>
                )}
                <p className="owner-image-upload-hint">{t("ownerAdd.uploadHintBlock")}</p>
              </div>
            )}
          </fieldset>

          <label className="full-row">
            {t("ownerAdd.description")}
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Short appetite-driven dish description"
              rows="4"
              required
            />
          </label>
          <button className="primary-cta full-row" type="submit">
            <Icon name="plus" />
            {t("ownerAdd.addPreview")}
          </button>
        </form>
      </div>

      <aside className="owner-add-preview-column" aria-labelledby="owner-preview-title">
        <div className="owner-add-preview-head">
          <h3 id="owner-preview-title">{t("ownerAdd.previewTitle")}</h3>
          <p className="owner-add-preview-sub">{t("ownerAdd.previewSub")}</p>
        </div>

        {stagedDishes.length === 0 ? (
          <p className="owner-add-preview-empty">{t("ownerAdd.previewEmpty")}</p>
        ) : (
          <ul className="owner-add-preview-list">
            {stagedDishes.map((dish) => (
              <li key={dish.id} className="owner-add-preview-card">
                <img src={dish.image || "/assets/diner-burger.png"} alt="" className="owner-add-preview-img" />
                <div className="owner-add-preview-body">
                  <strong>{dish.name}</strong>
                  <p className="owner-add-preview-meta">
                    {dish.category} · {formatPrice(dish.price)} · {previewCustomBadgesLine(dish)}
                  </p>
                  <p className="owner-add-preview-desc">{dish.description}</p>
                </div>
                <button type="button" className="owner-add-preview-remove" onClick={() => removeStaged(dish.id)} aria-label={t("ownerAdd.removePreviewAria", { name: dish.name })}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="owner-add-preview-footer">
          <button
            type="button"
            className="primary-cta owner-add-preview-submit"
            disabled={!stagedDishes.length}
            onClick={submitStagedToMenu}
          >
            {t("ownerAdd.submitMenu")}
          </button>
          <p className="owner-add-preview-footnote">{t("ownerAdd.queued", { count: stagedDishes.length })}</p>
        </div>
      </aside>

      <OwnerImageUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onApply={(dataUrl) => {
          setImageSource("upload");
          updateField("image", dataUrl);
        }}
      />
    </div>
  );
}

function OwnerEditMenuPage() {
  const { t } = useI18n();
  const { menu, orders, onDeleteMenuItem, onToggleMenuItemAvailable } = useOutletContext();
  const navigate = useNavigate();

  async function confirmDelete(item) {
    if (!window.confirm(t("ownerEdit.confirmDelete", { name: item.name }))) return;
    await onDeleteMenuItem(item.id);
  }

  return (
    <div className="owner-edit-hub">
      <div className="section-heading compact">
        <p className="eyebrow">{t("ownerEdit.eyebrow")}</p>
        <h3>{t("ownerEdit.allDishes")}</h3>
        <p>{t("ownerEdit.intro")}</p>
      </div>

      <ul className="owner-edit-list">
        {menu.length === 0 ? (
          <li className="empty-state">{t("ownerEdit.emptyList")}</li>
        ) : (
          menu.map((item) => (
          <li key={item.id} className={`owner-edit-row${item.available === false ? " owner-edit-row-hidden" : ""}`}>
            <div className="owner-edit-row-main">
              <img src={item.image} alt="" className="owner-edit-row-img" />
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.category} · {formatPrice(item.price)} · {getAllBadgesForItem(item, { orders, menu }).join(" · ") || "—"}
                </p>
                {item.available === false ? <span className="owner-hidden-pill">{t("ownerEdit.hiddenPill")}</span> : null}
              </div>
            </div>
            <div className="owner-edit-row-actions">
              <button type="button" className="secondary-cta small" onClick={() => navigate(`/owner/edit/${item.id}`)}>
                {t("ownerEdit.editDetails")}
              </button>
              <button type="button" className="secondary-cta small" onClick={() => onToggleMenuItemAvailable(item.id)}>
                {item.available === false ? t("ownerEdit.showMenu") : t("ownerEdit.hideMenu")}
              </button>
              <button type="button" className="decline-button small" onClick={() => confirmDelete(item)}>
                <Icon name="x" />
                {t("ownerEdit.delete")}
              </button>
            </div>
          </li>
          ))
        )}
      </ul>
    </div>
  );
}

function OwnerEditDishPage() {
  const { t } = useI18n();
  const { menu, orders, onUpdateMenuItem } = useOutletContext();
  const { itemId } = useParams();
  const navigate = useNavigate();
  const item = useMemo(() => menu.find((m) => m.id === itemId), [menu, itemId]);

  const [imageSource, setImageSource] = useState("url");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!item) {
      navigate("/owner/edit", { replace: true });
      return;
    }
    const manual = Array.isArray(item.manualBadges)
      ? item.manualBadges
      : typeof item.badge === "string"
        ? migrateLegacyBadgeString(item.badge)
        : [];
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      customBadges: formatManualBadgesInput(manual),
      description: item.description,
      image: item.image,
    });
    setImageSource(item.image?.startsWith("data:") ? "upload" : "url");
  }, [item, itemId, navigate]);

  function updateField(field, value) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function setImageSourceMode(mode) {
    setImageSource(mode);
    if (mode === "url") {
      setForm((current) =>
        current
          ? {
              ...current,
              image: current.image.startsWith("data:") ? "" : current.image,
            }
          : current,
      );
    }
  }

  function submitUpdate(event) {
    event.preventDefault();
    if (!item || !form) return;
    if (!form.name.trim() || !form.description.trim() || !form.price) return;
    onUpdateMenuItem(item.id, {
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      manualBadges: parseOwnerCustomBadgesInput(form.customBadges),
      description: form.description.trim(),
      image: form.image.trim() || "/assets/diner-burger.png",
    });
    navigate("/owner/edit");
  }

  const liveBadgePreview = useMemo(() => {
    if (!item || !form) return [];
    const merged = {
      ...item,
      name: form.name.trim() || item.name,
      price: form.price !== "" && form.price != null ? Number(form.price) : item.price,
      category: form.category.trim() || item.category,
      description: form.description.trim() || item.description,
      image: form.image.trim() || item.image || "/assets/diner-burger.png",
      manualBadges: parseOwnerCustomBadgesInput(form.customBadges),
    };
    return getAllBadgesForItem(merged, { orders, menu });
  }, [item, form, orders, menu]);

  if (!item || !form) {
    return (
      <div className="owner-edit-hub">
        <p className="empty-state">{t("ownerEdit.loading")}</p>
      </div>
    );
  }

  return (
    <div className="owner-edit-dish">
      <div className="owner-edit-dish-header">
        <button type="button" className="secondary-cta small" onClick={() => navigate("/owner/edit")}>
          {t("ownerEdit.backList")}
        </button>
        <h3>{t("ownerEdit.editDishTitle")}</h3>
      </div>

      <form className="owner-form owner-edit-dish-form" onSubmit={submitUpdate}>
        <label>
          {t("ownerAdd.dishName")}
          <input
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Midnight Melt"
            required
          />
        </label>
        <label>
          {t("ownerAdd.price")}
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(event) => updateField("price", event.target.value)}
            placeholder="11.99"
            required
          />
        </label>
        <label>
          {t("ownerAdd.category")}
          <input
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
            placeholder="Specials"
          />
        </label>
        <label className="full-row">
          {t("ownerAdd.customBadges")}
          <input
            value={form.customBadges}
            onChange={(event) => updateField("customBadges", event.target.value)}
            placeholder="e.g. Chef's pick, Spicy (comma-separated)"
          />
          <span className="owner-field-hint">{t("ownerEdit.customBadgesEditHint")}</span>
        </label>
        <p className="owner-live-badges-preview" aria-live="polite">
          <strong>{t("ownerEdit.liveBadges")}</strong> {liveBadgePreview.length ? liveBadgePreview.join(" · ") : "—"}
        </p>

        <fieldset className="owner-image-fieldset full-row">
          <legend>{t("ownerEdit.legendImage")}</legend>
          <div className="owner-image-source-options" role="radiogroup" aria-label={t("ownerEdit.imageRadiogroupAria")}>
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
                checked={imageSource === "url"}
                onChange={() => setImageSourceMode("url")}
              />
              <span>{t("ownerAdd.imageUrl")}</span>
            </label>
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
                checked={imageSource === "upload"}
                onChange={() => setImageSourceMode("upload")}
              />
              <span>{t("ownerAdd.uploadImage")}</span>
            </label>
          </div>

          {imageSource === "url" ? (
            <label className="owner-image-url-label">
              {t("ownerAdd.link")}
              <input
                value={form.image.startsWith("data:") ? "" : form.image}
                onChange={(event) => updateField("image", event.target.value)}
                placeholder="https://… or /assets/diner-burger.png"
              />
            </label>
          ) : (
            <div className="owner-image-upload-block">
              {form.image ? (
                <div className="owner-image-upload-preview-row">
                  <img src={form.image} alt="" className="owner-image-thumb" />
                  <div className="owner-image-upload-actions">
                    <button type="button" className="primary-cta small" onClick={() => setUploadModalOpen(true)}>
                      {t("ownerEdit.changeImageBtn")}
                    </button>
                    <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                      {t("ownerEdit.clearImage")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="owner-image-upload-empty">{t("ownerEdit.noImageSelected")}</p>
                  <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                    {t("ownerEdit.uploadImageBtn")}
                  </button>
                </>
              )}
              <p className="owner-image-upload-hint">{t("ownerEdit.uploadHint")}</p>
            </div>
          )}
        </fieldset>

        <label className="full-row">
          {t("ownerAdd.description")}
          <textarea
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Short appetite-driven dish description"
            rows="4"
            required
          />
        </label>
        <div className="owner-edit-dish-actions full-row">
          <button className="primary-cta" type="submit">
            {t("ownerEdit.save")}
          </button>
          <button type="button" className="secondary-cta" onClick={() => navigate("/owner/edit")}>
            {t("ownerEdit.cancel")}
          </button>
        </div>
      </form>

      <OwnerImageUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onApply={(dataUrl) => {
          setImageSource("upload");
          updateField("image", dataUrl);
        }}
      />
    </div>
  );
}

function LocationPage() {
  const { t } = useI18n();
  return (
    <section className="content-section page-section" aria-labelledby="location-title">
      <div className="section-heading">
        <p className="eyebrow">{t("location.eyebrow")}</p>
        <h2 id="location-title">{t("location.title")}</h2>
        <p>{t("location.body")}</p>
      </div>
      <div className="location-layout">
        <div className="location-panel">
          <Icon name="pin" />
          <h3>{t("location.addressTitle")}</h3>
          <p className="location-address">{t("location.addressLine")}</p>
          <p className="location-meta">{t("location.addressMeta")}</p>
          <dl className="location-hours" aria-label={t("location.hoursAria")}>
            <div className="location-hours-row">
              <dt>{t("location.monThu")}</dt>
              <dd>{t("location.hoursMonThu")}</dd>
            </div>
            <div className="location-hours-row">
              <dt>{t("location.friSat")}</dt>
              <dd>{t("location.hoursFriSat")}</dd>
            </div>
            <div className="location-hours-row">
              <dt>{t("location.sunday")}</dt>
              <dd>{t("location.hoursSun")}</dd>
            </div>
          </dl>
          <div className="location-contact">
            <a href="tel:+13125550199">(312) 555-0199</a>
            <span aria-hidden="true"> · </span>
            <a href="mailto:hello@dinerdesk.demo">hello@dinerdesk.demo</a>
          </div>
          <p className="location-disclaimer">{t("location.disclaimer")}</p>
        </div>
        <div className="location-panel red-panel">
          <h3>{t("location.panel2Title")}</h3>
          <p>{t("location.panel2p1")}</p>
          <p>{t("location.panel2p2")}</p>
          <p className="location-a11y-note">{t("location.panel2a11y")}</p>
        </div>
      </div>
    </section>
  );
}

function ProfilePage({ session, orders = [] }) {
  const { t } = useI18n();
  const roleKey =
    session?.role === "staff"
      ? "profile.roleStaff"
      : session?.role === "owner"
        ? "profile.roleOwner"
        : session?.role === "customer"
          ? "profile.roleCustomer"
          : null;
  const roleLabel = roleKey ? t(roleKey) : "";

  return (
    <section className="content-section page-section" aria-labelledby="profile-title">
      <div className="section-heading">
        <p className="eyebrow">{t("profile.eyebrow")}</p>
        {!session ? (
          <div className="profile-hero-row">
            <h2 id="profile-title" className="profile-hero-title">
              {t("profile.titleGuest")}
            </h2>
            <div className="profile-auth-actions">
              <Link className="primary-cta" to="/login">
                {t("profile.login")}
              </Link>
              <Link className="secondary-cta" to="/register">
                {t("profile.register")}
              </Link>
            </div>
          </div>
        ) : (
          <h2 id="profile-title">{t("profile.titleLogged", { name: session.username })}</h2>
        )}
        <p>
          {!session
            ? t("profile.bodyGuest")
            : session.role === "customer"
              ? t("profile.bodyCustomer")
              : t("profile.bodyStaff", { role: roleLabel })}
        </p>
      </div>
      {session ? (
        <div className="profile-order-history" aria-labelledby="profile-order-history-title">
          <h3 id="profile-order-history-title" className="profile-order-history-heading">
            {t("profile.orderHistoryTitle")}
          </h3>
          <p className="profile-order-history-intro">{t("profile.orderHistoryIntro")}</p>
          <ProfileOrderHistoryBlock session={session} orders={orders} />
        </div>
      ) : null}
    </section>
  );
}

export default App;
