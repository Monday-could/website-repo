import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  getPersistedSession,
  initialModeFromSession,
  login as authLogin,
  logout,
  registerCustomer,
} from "./services/authService.js";

const STORAGE_KEY = "diner-desk-state-v2";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MENU_NEW_MAX_AGE_MS = 14 * MS_PER_DAY;
const POPULAR_SALES_TOP_N = 5;
/** How many newest reviews to show on each menu card before opening the full list modal. */
const MENU_CARD_REVIEW_PREVIEW_COUNT = 3;
const TOAST_TTL_MS = 4200;

const AUTO_BADGE_SEASONAL_NEW = "Seasonal/New";

function isReservedBadgeKeyword(text) {
  const t = String(text).trim().toLowerCase();
  return (
    t === "popular" ||
    t === "new" ||
    t === "seasonal" ||
    t === "seasonal/new" ||
    t === "new/seasonal"
  );
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

function isWithinMenuNewSeasonalWindow(item) {
  const t = new Date(item.menuAddedAt || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return Date.now() - t < MENU_NEW_MAX_AGE_MS;
}

function getAutoBadgesForItem(item, ctx) {
  const { orders, menu } = ctx;
  const list = Array.isArray(menu) ? menu : [];
  const out = [];
  const topIds = topPopularItemIdsBySales(list, orders || []);
  if (topIds.has(item.id)) out.push("Popular");
  if (isWithinMenuNewSeasonalWindow(item)) {
    out.push(AUTO_BADGE_SEASONAL_NEW);
  }
  return out;
}

/** Match badge filter including legacy option names "New" / "Seasonal" vs combined auto badge. */
function itemBadgeMatchesFilter(itemBadges, selectedBadge) {
  if (selectedBadge === "all") return true;
  const lower = new Set(itemBadges.map((b) => String(b).trim().toLowerCase()));
  const sel = String(selectedBadge).trim().toLowerCase();
  if (lower.has(sel)) return true;
  const combo = AUTO_BADGE_SEASONAL_NEW.toLowerCase();
  if (lower.has(combo) && (sel === "new" || sel === "seasonal")) return true;
  return false;
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

const initialState = {
  menu: starterMenu.map((row) => normalizeMenuItemFromPersisted({ ...row })),
  orders: [],
  cart: [],
};

const modes = [
  { id: "customer", label: "\u5ba2\u6237\u6a21\u5f0f", path: "/menu" },
  { id: "staff", label: "\u5458\u5de5\u6a21\u5f0f", path: "/orders" },
  { id: "owner", label: "\u8001\u677f\u6a21\u5f0f", path: "/owner" },
];

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialState;
    const parsed = JSON.parse(saved);
    return {
      menu: (Array.isArray(parsed.menu) ? parsed.menu : initialState.menu).map(normalizeMenuItemFromPersisted),
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
    };
  } catch {
    return initialState;
  }
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
          Category
          <select id={catSelectId} value={category} onChange={(event) => onCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={badgeSelectId}>
          Badge
          <select id={badgeSelectId} value={badge} onChange={(event) => onBadge(event.target.value)}>
            <option value="all">All badges</option>
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
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function StarRating({ value }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {"\u2605".repeat(value)}
      <span>{"\u2606".repeat(5 - value)}</span>
    </span>
  );
}

function DishReviewsModal({ open, onClose, item }) {
  const titleId = item ? `dish-reviews-modal-title-${item.id}` : "dish-reviews-modal-title";

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !item || !item.reviews?.length) return null;

  return (
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal dish-reviews-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id={titleId}>All reviews</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="order-modal-dish">{item.name}</p>
        <p className="dish-reviews-modal-count">{item.reviews.length} total</p>
        <ul className="dish-reviews-modal-list">
          {item.reviews.map((review, index) => {
            const rid = review.id ?? `${item.id}-review-${index}`;
            const stars = Math.min(5, Math.max(0, Math.round(Number(review.rating) || 0)));
            return (
              <li key={rid} className="menu-card-review-item">
                <div className="menu-card-review-meta">
                  <strong>{review.author || "Guest"}</strong>
                  {stars > 0 ? <StarRating value={stars} /> : null}
                </div>
                <p>{review.text}</p>
              </li>
            );
          })}
        </ul>
        <div className="order-modal-actions">
          <button type="button" className="primary-cta" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant || "success"}`} role="status">
          <p className="toast-message">{t.message}</p>
          <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => onDismiss(t.id)}>
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

function LoginPage({ onLoginSuccess, pushToast }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleHint = searchParams.get("role") || "customer";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hintText =
    roleHint === "staff"
      ? "员工模式：请使用预留账号 worker / imworker 登录。"
      : roleHint === "owner"
        ? "老板模式：请使用预留账号 boss / imboss 登录。"
        : "顾客可使用注册账号登录；不登录也可直接浏览菜单与购物车（游客）。";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await authLogin({ username, password });
      onLoginSuccess(session);
      pushToast(`欢迎，${session.username}。`);
      if (session.role === "staff") navigate("/orders", { replace: true });
      else if (session.role === "owner") navigate("/owner", { replace: true });
      else navigate("/menu", { replace: true });
    } catch (err) {
      setError(err?.message || "登录失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="login-title">
      <div className="section-heading">
        <p className="eyebrow">Account</p>
        <h2 id="login-title">登录</h2>
        <p className="auth-hint">{hintText}</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="auth-label">
          用户名
          <input
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="auth-label">
          密码
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? "请稍候…" : "登录"}
        </button>
      </form>
      <p className="auth-secondary-actions">
        <Link to="/register">还没有账号？去注册</Link>
        {" · "}
        <Link to="/menu">以游客继续浏览</Link>
      </p>
    </section>
  );
}

function RegisterPage({ onLoginSuccess, pushToast }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("两次输入的密码不一致。");
      return;
    }
    setLoading(true);
    try {
      const session = await registerCustomer({ username, password });
      onLoginSuccess(session);
      pushToast("注册成功，已自动登录。");
      navigate("/menu", { replace: true });
    } catch (err) {
      setError(err?.message || "注册失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="register-title">
      <div className="section-heading">
        <p className="eyebrow">Account</p>
        <h2 id="register-title">顾客注册</h2>
        <p className="auth-hint">仅创建顾客账号。接入数据库前，账号信息保存在本机浏览器中。</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="auth-label">
          用户名
          <input
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="auth-label">
          密码
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="auth-label">
          确认密码
          <input
            className="auth-input"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? "请稍候…" : "注册并登录"}
        </button>
      </form>
      <p className="auth-secondary-actions">
        <Link to="/login">已有账号？去登录</Link>
        {" · "}
        <Link to="/menu">以游客继续浏览</Link>
      </p>
    </section>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(initialModeFromSession);
  const [authSession, setAuthSession] = useState(() => getPersistedSession());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, setState] = useState(loadState);
  const [pendingOrderItem, setPendingOrderItem] = useState(null);
  const [orderNotesDraft, setOrderNotesDraft] = useState("");
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, variant = "success") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleLoginSuccess = useCallback((session) => {
    setAuthSession(session);
    if (session.role === "staff") setMode("staff");
    else if (session.role === "owner") setMode("owner");
    else setMode("customer");
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setAuthSession(null);
    setMode("customer");
    pushToast("已退出登录。");
    navigate("/menu");
  }, [navigate, pushToast]);

  const exitStaffOrOwnerForGuestBrowse = useCallback(() => {
    if (authSession?.role === "staff" || authSession?.role === "owner") {
      logout();
      setAuthSession(null);
      pushToast("已退出职级账号，以访客身份浏览顾客模式。");
    }
  }, [authSession, pushToast]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (location.pathname.startsWith("/owner")) {
      setMode("owner");
    }
  }, [location.pathname]);

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
    const dishName = pendingOrderItem.name;
    setState((current) => ({
      ...current,
      cart: [
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
      ],
    }));
    closeOrderNoteModal();
    pushToast(`Added “${dishName}” to your cart.`);
  }

  function updateCartLineQuantity(lineId, newQuantity) {
    const q = Math.floor(Number(newQuantity));
    if (q < 1) {
      removeCartLine(lineId);
      return;
    }
    setState((current) => ({
      ...current,
      cart: current.cart.map((line) => (line.id === lineId ? { ...line, quantity: q } : line)),
    }));
  }

  function removeCartLine(lineId) {
    setState((current) => ({
      ...current,
      cart: current.cart.filter((line) => line.id !== lineId),
    }));
  }

  function checkoutCart() {
    setState((current) => {
      if (!current.cart.length) return current;
      const ts = Date.now();
      const newOrders = current.cart.map((line, i) => ({
        id: `order-${ts}-${i}`,
        itemId: line.itemId,
        itemName: line.itemName,
        price: line.price,
        quantity: line.quantity,
        customerName: "Walk-in Guest",
        notes: line.notes,
        status: "new",
        ready: false,
        createdAt: new Date().toISOString(),
      }));
      return {
        ...current,
        orders: [...newOrders, ...current.orders],
        cart: [],
      };
    });
  }

  function updateOrderStatus(orderId, status) {
    setState((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.id === orderId ? { ...order, status, ready: false } : order,
      ),
    }));
  }

  function markOrderReady(orderId) {
    setState((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.id === orderId ? { ...order, ready: true } : order,
      ),
    }));
  }

  function addReview(itemId, review) {
    setState((current) => ({
      ...current,
      menu: current.menu.map((item) =>
        item.id === itemId
          ? { ...item, reviews: [{ id: `review-${Date.now()}`, ...review }, ...item.reviews] }
          : item,
      ),
    }));
    pushToast("Thanks — your review was posted.");
  }

  function addMenuItem(item) {
    const manualBadges = sanitizeManualBadges(item.manualBadges);
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      menu: [
        {
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description,
          image: item.image || "/assets/diner-burger.png",
          id: `dish-${Date.now()}`,
          popularity: Number(item.popularity) || 70,
          available: item.available !== false,
          reviews: Array.isArray(item.reviews) ? item.reviews : [],
          manualBadges,
          menuAddedAt: typeof item.menuAddedAt === "string" && item.menuAddedAt ? item.menuAddedAt : now,
        },
        ...current.menu,
      ],
    }));
  }

  function addMenuItemsBatch(items) {
    if (!items.length) return;
    const ts = Date.now();
    const now = new Date().toISOString();
    setState((current) => {
      const newRows = items.map((item, i) => ({
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        image: item.image || "/assets/diner-burger.png",
        id: `dish-${ts}-${i}`,
        popularity: Number(item.popularity) || 70,
        available: true,
        reviews: [],
        manualBadges: sanitizeManualBadges(item.manualBadges),
        menuAddedAt: typeof item.menuAddedAt === "string" && item.menuAddedAt ? item.menuAddedAt : now,
      }));
      return { ...current, menu: [...newRows.reverse(), ...current.menu] };
    });
  }

  function updateMenuItem(itemId, patch) {
    setState((current) => ({
      ...current,
      menu: current.menu.map((menuItem) => {
        if (menuItem.id !== itemId) return menuItem;
        const next = { ...menuItem, ...patch, id: menuItem.id };
        delete next.badge;
        if (patch.manualBadges !== undefined) {
          next.manualBadges = sanitizeManualBadges(patch.manualBadges);
        }
        return next;
      }),
    }));
  }

  function deleteMenuItem(itemId) {
    setState((current) => ({
      ...current,
      menu: current.menu.filter((menuItem) => menuItem.id !== itemId),
    }));
  }

  function toggleMenuItemAvailable(itemId) {
    setState((current) => ({
      ...current,
      menu: current.menu.map((menuItem) =>
        menuItem.id === itemId ? { ...menuItem, available: menuItem.available === false } : menuItem,
      ),
    }));
  }

  function selectMode(item) {
    if (item.id === "customer") {
      exitStaffOrOwnerForGuestBrowse();
      setMode("customer");
      navigate(item.path);
      return;
    }
    if (item.id === "staff") {
      if (authSession?.role === "staff") {
        setMode("staff");
        navigate("/orders");
        return;
      }
      navigate("/login?role=staff");
      return;
    }
    if (item.id === "owner") {
      if (authSession?.role === "owner") {
        setMode("owner");
        navigate("/owner");
        return;
      }
      navigate("/login?role=owner");
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Tom's Mysterious Restaurant home">
          <span className="brand-mark">T</span>
          <span>Tom&apos;s Mysterious Restaurant</span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/location">Location</NavLink>
          {!authSession ? (
            <>
              <NavLink to="/login">登录</NavLink>
              <NavLink to="/register">注册</NavLink>
            </>
          ) : (
            <span className="header-user-inline">
              <span className="header-user-name">{authSession.username}</span>
              <button type="button" className="header-logout-button" onClick={handleLogout}>
                退出
              </button>
            </span>
          )}
          {mode === "owner" ? (
            <>
              <NavLink to="/owner/add" end>
                Add dish
              </NavLink>
              <NavLink to="/owner/edit">Edit menu</NavLink>
            </>
          ) : null}
        </nav>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Profile"
            onClick={() => navigate("/profile")}
          >
            <Icon name="user" />
          </button>
          <button
            className="cart-button"
            type="button"
            aria-label={`Shopping cart, ${cartCount} items`}
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
            Order Now
          </button>
          <details className="mode-menu-wrap">
            <summary className="mode-menu-button">Mode</summary>
            <div className="mode-menu" role="menu" aria-label="Mode selection">
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
          <button
            className="mobile-menu"
            type="button"
            aria-label="Open menu"
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
            aria-label="Mobile navigation"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button drawer-close"
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="x" />
            </button>
            <MobileLink to="/menu" onDone={() => setDrawerOpen(false)}>
              Menu
            </MobileLink>
            <MobileLink to="/location" onDone={() => setDrawerOpen(false)}>
              Location
            </MobileLink>
            {!authSession ? (
              <>
                <MobileLink to="/login" onDone={() => setDrawerOpen(false)}>
                  登录
                </MobileLink>
                <MobileLink to="/register" onDone={() => setDrawerOpen(false)}>
                  注册
                </MobileLink>
              </>
            ) : (
              <>
                <p className="drawer-user-line">
                  已登录：<strong>{authSession.username}</strong>
                </p>
                <button
                  className="drawer-link"
                  type="button"
                  onClick={() => {
                    handleLogout();
                    setDrawerOpen(false);
                  }}
                >
                  退出登录
                </button>
              </>
            )}
            {mode === "owner" ? (
              <>
                <MobileLink to="/owner/add" onDone={() => setDrawerOpen(false)}>
                  Add dish
                </MobileLink>
                <MobileLink to="/owner/edit" onDone={() => setDrawerOpen(false)}>
                  Edit menu
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
          </aside>
        </div>
      )}

      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<HomePage menu={state.menu} orders={state.orders} onOrder={openOrderNoteModal} />} />
          <Route
            path="/menu"
            element={
              <MenuPage menu={state.menu} orders={state.orders} onOrder={openOrderNoteModal} onReview={addReview} />
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
                  pushToast(
                    status === "accepted" ? "Ticket accepted — kitchen can start prep." : "Ticket declined.",
                    status === "accepted" ? "success" : "info",
                  );
                }}
                onReady={(orderId) => {
                  markOrderReady(orderId);
                  pushToast("Marked ready for guest pickup.");
                }}
              />
            }
          />
          <Route path="/location" element={<LocationPage />} />
          <Route
            path="/cart"
            element={
              <CartPage
                cart={state.cart}
                onUpdateQuantity={updateCartLineQuantity}
                onRemoveLine={removeCartLine}
                onCheckout={checkoutCart}
                onCheckoutSuccess={({ qty, lines }) => {
                  pushToast(`Order sent — ${qty} item(s) on ${lines} ticket line(s).`);
                }}
              />
            }
          />
          <Route
            path="/profile"
            element={<ProfilePage orders={state.orders} session={authSession} onLogout={handleLogout} />}
          />
          <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} pushToast={pushToast} />} />
          <Route path="/register" element={<RegisterPage onLoginSuccess={handleLoginSuccess} pushToast={pushToast} />} />
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
          <p>Warm diner service, clear ordering, fast staff action.</p>
        </div>
        <div className="footer-links">
          <Link to="/menu">Menu</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/location">
            <Icon name="pin" />
            Chicago Demo Store
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
              <h2 id="order-notes-title">Add to cart</h2>
              <button className="icon-button" type="button" aria-label="Close" onClick={closeOrderNoteModal}>
                <Icon name="x" />
              </button>
            </div>
            <p className="order-modal-dish">{pendingOrderItem.name}</p>
            <p className="order-modal-hint">Add a note for the kitchen (optional).</p>
            <label className="order-modal-label">
              Notes
              <textarea
                className="order-modal-textarea"
                value={orderNotesDraft}
                onChange={(event) => setOrderNotesDraft(event.target.value)}
                placeholder="Allergies, spice level, sides…"
                rows={4}
                autoFocus
              />
            </label>
            <div className="order-modal-actions">
              <button className="secondary-cta" type="button" onClick={closeOrderNoteModal}>
                Cancel
              </button>
              <button className="primary-cta" type="button" onClick={submitAddToCart}>
                Add to cart
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

function CartPage({ cart, onUpdateQuantity, onRemoveLine, onCheckout, onCheckoutSuccess }) {
  const navigate = useNavigate();
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity || 1), 0),
    [cart],
  );

  function handleCheckout() {
    if (!cart.length) return;
    const qty = cart.reduce((sum, line) => sum + Number(line.quantity || 1), 0);
    const lines = cart.length;
    onCheckout();
    onCheckoutSuccess?.({ qty, lines });
    navigate("/orders");
  }

  return (
    <section className="cart-page content-section page-section" aria-labelledby="cart-title">
      <div className="section-heading cart-page-intro">
        <p className="eyebrow">Your tray</p>
        <h1 id="cart-title">Shopping cart</h1>
        <p>Items you add from the menu stay here until you check out. Staff only see tickets after checkout.</p>
      </div>

      {!cart.length ? (
        <div className="cart-empty-panel">
          <p className="cart-empty-title">Nothing in your cart yet</p>
          <p className="cart-empty-copy">Pick dishes from the menu, add notes if you like, then come back here.</p>
          <Link className="primary-cta" to="/menu">
            Browse menu
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-lines-panel">
            <h2 className="cart-panel-heading">Items</h2>
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
                      <p className="cart-line-unit">{formatPrice(line.price)} each</p>
                      {line.notes && line.notes !== "No special request" ? (
                        <p className="cart-line-notes">
                          <span className="cart-notes-label">Note</span> {line.notes}
                        </p>
                      ) : null}
                      <div className="cart-line-controls">
                        <div className="cart-qty" aria-label="Quantity">
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="cart-qty-value">{line.quantity}</span>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => onRemoveLine(line.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="cart-summary-panel" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">Order summary</h2>
            <dl className="cart-summary-rows">
              <div className="cart-summary-row">
                <dt>Items</dt>
                <dd>{cart.reduce((n, line) => n + Number(line.quantity || 1), 0)}</dd>
              </div>
              <div className="cart-summary-row cart-summary-total">
                <dt>Total</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
            </dl>
            <p className="cart-demo-note">Payment is skipped in this demo.</p>
            <button type="button" className="primary-cta cart-checkout-btn" onClick={handleCheckout}>
              Checkout
            </button>
            <p className="cart-checkout-hint">Checkout sends each line to the kitchen as a ticket for staff.</p>
          </aside>
        </div>
      )}
    </section>
  );
}

function HomePopularCarousel({ items, onOrder, orders, menuForBadges }) {
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
        <p className="empty-state-title">No dishes to show yet</p>
        <p className="empty-state-hint">Open the full menu or add dishes in owner mode.</p>
        <Link className="secondary-cta" to="/menu">
          View full menu
        </Link>
      </div>
    );
  }

  return (
    <div className="home-carousel" aria-roledescription="carousel" aria-label="Popular dishes">
      <div className="home-carousel-controls">
        <button type="button" className="home-carousel-arrow" aria-label="Previous dish" onClick={goPrev}>
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
        <button type="button" className="home-carousel-arrow" aria-label="Next dish" onClick={goNext}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="home-carousel-dots" role="tablist" aria-label="Slide indicators">
        {items.map((_, i) => (
          <button
            key={items[i].id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show dish ${i + 1} of ${count}`}
            className={`home-carousel-dot${i === index ? " active" : ""}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}

function HomePage({ menu, orders, onOrder }) {
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const popularItems = useMemo(
    () => sortVisibleMenuBySalesThenPopularity(visibleMenu, orders).slice(0, 4),
    [visibleMenu, orders],
  );

  return (
    <div className="home-reveal">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Open table ordering</p>
          <h1 id="hero-title">Big Flavor, Easy Ordering</h1>
          <p>
            Browse popular diner favorites, start an order fast, and keep the kitchen connected.
          </p>
          <div className="hero-actions">
            <Link className="primary-cta" to="/menu">
              Start Your Order
            </Link>
            <Link className="secondary-cta" to="/location">
              Find Location
            </Link>
          </div>
        </div>
        <div className="hero-food" aria-label="Featured diner dishes">
          <img src="/assets/pancake-breakfast.png" alt="Pancake breakfast platter" />
          <img src="/assets/diner-burger.png" alt="Cheeseburger and fries meal" />
        </div>
      </section>

      <section className="content-section home-reveal-content" aria-labelledby="popular-title">
        <div className="section-heading">
          <p className="eyebrow">Most popular</p>
          <h2 id="popular-title">Guest favorites</h2>
          <p>Swipe through top picks by sales, then open the full menu to filter by category and badge.</p>
        </div>
        <HomePopularCarousel items={popularItems} onOrder={onOrder} orders={orders} menuForBadges={visibleMenu} />
        <OrderHistory orders={orders} />
      </section>
    </div>
  );
}

function MenuPage({ menu, orders, onOrder, onReview }) {
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBadge, setFilterBadge] = useState("all");
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const badgeCtx = useMemo(() => ({ orders, menu: visibleMenu }), [orders, visibleMenu]);
  const badgeFilterOptions = useMemo(() => collectBadgeFilterOptions(visibleMenu, orders), [visibleMenu, orders]);
  const filteredMenu = useMemo(
    () => filterMenuByCategoryAndBadge(visibleMenu, filterCategory, filterBadge, badgeCtx),
    [visibleMenu, filterCategory, filterBadge, badgeCtx],
  );

  return (
    <section className="content-section page-section" aria-labelledby="menu-title">
      <div className="section-heading">
        <p className="eyebrow">Full menu</p>
        <h2 id="menu-title">Order your favorites</h2>
        <p>Choose a dish, place an order, and leave a review for the kitchen.</p>
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
            <MenuCard key={item.id} item={item} onOrder={onOrder} onReview={onReview} orders={orders} menuForBadges={visibleMenu} />
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--soft menu-filter-empty" role="status">
          <p className="empty-state-title">No dishes match these filters</p>
          <p className="empty-state-hint">Try another category or badge, or tap Clear filters in the bar above.</p>
        </div>
      )}

      <OrderHistory orders={orders} />
    </section>
  );
}

function MenuCard({ item, onOrder, onReview, orders = [], menuForBadges = [] }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

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

  function submitReview(event) {
    event.preventDefault();
    if (!text.trim() || !onReview) return;
    onReview(item.id, {
      author: author.trim() || "Guest",
      rating: Number(rating),
      text: text.trim(),
    });
    setAuthor("");
    setText("");
    setRating(5);
    setReviewOpen(false);
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
          {averageRating ? <StarRating value={averageRating} /> : <span>No reviews yet</span>}
          <span>
            {item.reviews.length} review{item.reviews.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="card-actions">
          <button className="primary-cta small" type="button" onClick={() => onOrder(item)}>
            <Icon name="plus" />
            Add to cart
          </button>
          {onReview && (
            <button className="secondary-cta small" type="button" onClick={() => setReviewOpen(!reviewOpen)}>
              Review
            </button>
          )}
        </div>
        {reviewOpen && (
          <form className="review-form" onSubmit={submitReview}>
            <label>
              Name
              <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Guest" />
            </label>
            <label>
              Rating
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} stars
                  </option>
                ))}
              </select>
            </label>
            <label className="full-row">
              Review
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="What did you like?"
                rows="3"
              />
            </label>
            <button className="primary-cta small" type="submit">
              Send Review
            </button>
          </form>
        )}
        <section className="menu-card-reviews" aria-labelledby={`reviews-heading-${item.id}`}>
          <h4 className="menu-card-reviews-heading" id={`reviews-heading-${item.id}`}>
            Recent reviews
          </h4>
          {item.reviews.length === 0 ? (
            <p className="menu-card-reviews-empty">Be the first to review this dish.</p>
          ) : (
            <>
              {item.reviews.length > MENU_CARD_REVIEW_PREVIEW_COUNT ? (
                <p className="menu-card-reviews-note">
                  Showing the latest {MENU_CARD_REVIEW_PREVIEW_COUNT} of {item.reviews.length}.
                </p>
              ) : null}
              <ul className="menu-card-reviews-list">
                {previewReviews.map((review, index) => {
                  const rid = review.id ?? `${item.id}-review-${index}`;
                  const stars = Math.min(5, Math.max(0, Math.round(Number(review.rating) || 0)));
                  return (
                    <li key={rid} className="menu-card-review-item">
                      <div className="menu-card-review-meta">
                        <strong>{review.author || "Guest"}</strong>
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
                  ? `View all ${item.reviews.length} reviews`
                  : "View all reviews"}
              </button>
            </>
          )}
        </section>
      </div>
      <DishReviewsModal open={reviewsModalOpen} onClose={() => setReviewsModalOpen(false)} item={item} />
    </article>
  );
}

function OrderHistory({ orders }) {
  const recentOrders = orders.slice(0, 4);

  return (
    <div className="order-history">
      <div className="section-heading compact">
        <p className="eyebrow">Live ticket board</p>
        <h2>Recent orders</h2>
      </div>
      {recentOrders.length ? (
        <div className="ticket-list">
          {recentOrders.map((order) => (
            <OrderTicket key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--soft order-history-empty">
          <p className="empty-state-title">No kitchen tickets yet</p>
          <p className="empty-state-hint">Check out from the cart — each line becomes a ticket for staff.</p>
          <Link className="secondary-cta" to="/menu">
            Browse menu
          </Link>
        </div>
      )}
    </div>
  );
}

function OrdersPage({ mode, session, orders, onStatusChange, onReady }) {
  if (session?.role === "staff") {
    return <StaffMode orders={orders} onStatusChange={onStatusChange} onReady={onReady} />;
  }
  if (mode === "staff") {
    return <Navigate to="/login?role=staff" replace />;
  }

  return (
    <section className="content-section page-section" aria-labelledby="orders-title">
      <div className="section-heading">
        <p className="eyebrow">Orders</p>
        <h2 id="orders-title">Your order board</h2>
        <p>Customer orders appear here first, then staff can switch modes and accept tickets.</p>
      </div>
      <OrderHistory orders={orders} />
    </section>
  );
}

function StaffMode({ orders, onStatusChange, onReady }) {
  const pending = orders.filter((order) => order.status === "new");
  const handled = orders.filter((order) => order.status !== "new");

  return (
    <section className="content-section page-section" aria-labelledby="staff-title">
      <div className="section-heading">
        <p className="eyebrow">Staff mode</p>
        <h2 id="staff-title">New customer orders</h2>
        <p>Accept the tickets you can prepare now or decline them before the kitchen starts.</p>
      </div>

      <div className="staff-layout">
        <div>
          <h3 className="panel-title">Waiting for action</h3>
          <div className="ticket-list">
            {pending.length ? (
              pending.map((order) => (
                <OrderTicket key={order.id} order={order} hideReadyState>
                  <button className="accept-button" type="button" onClick={() => onStatusChange(order.id, "accepted")}>
                    <Icon name="check" />
                    Accept
                  </button>
                  <button className="decline-button" type="button" onClick={() => onStatusChange(order.id, "declined")}>
                    <Icon name="x" />
                    Decline
                  </button>
                </OrderTicket>
              ))
            ) : (
              <div className="empty-state empty-state--soft staff-empty">
                <p className="empty-state-title">No new orders waiting</p>
                <p className="empty-state-hint">Customer checkouts will appear here for Accept or Decline.</p>
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="panel-title">Handled tickets</h3>
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
                <p className="empty-state-title">No handled tickets yet</p>
                <p className="empty-state-hint">Accepted and declined orders show up here with ready status.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderTicket({ order, children, onReady, hideReadyState = false }) {
  const isReady = Boolean(order.ready);
  const showReadyPill = !hideReadyState && order.status === "accepted";

  return (
    <article className={`ticket status-${order.status}`}>
      <div>
        <p className="ticket-meta">{new Date(order.createdAt).toLocaleString()}</p>
        <h3>{order.itemName}</h3>
        <p>
          {order.quantity} × {formatPrice(order.price)} = {formatPrice(Number(order.price) * Number(order.quantity || 1))}{" "}
          · {order.customerName}
        </p>
        <p>{order.notes}</p>
      </div>
      <div className="ticket-footer">
        <span className={`status-pill status-label-${order.status}`}>{order.status.toUpperCase()}</span>
        <div className="ticket-actions">
          {children}
          {onReady && (
            <button className="ready-button" type="button" onClick={() => onReady(order.id)}>
              Ready
            </button>
          )}
          {showReadyPill && (
            <span className={isReady ? "ready-pill ready" : "ready-pill not-ready"}>
              {isReady ? "READY" : "NOT READY"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function OwnerImageUploadModal({ open, onClose, onApply }) {
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
      setError("Please choose a single image file.");
      setDraft(null);
      return;
    }
    if (file.size > MAX_OWNER_IMAGE_BYTES) {
      setError(`Image must be ${Math.round(MAX_OWNER_IMAGE_BYTES / 1024 / 1024)} MB or smaller.`);
      setDraft(null);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft(reader.result);
    };
    reader.onerror = () => {
      setError("Could not read this file.");
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
          <h2 id="owner-upload-title">Upload dish image</h2>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="owner-upload-intro">One image only. Drag a file here or use the file picker.</p>

        <input
          ref={fileInputRef}
          type="file"
          className="owner-file-input-hidden"
          accept="image/*"
          aria-label="Choose image file"
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
          <span className="owner-upload-dropzone-title">Drop image here</span>
          <span className="owner-upload-dropzone-sub">or click to choose from your computer</span>
        </button>

        {error ? (
          <p className="owner-upload-error" role="alert">
            {error}
          </p>
        ) : null}

        {draft ? (
          <div className="owner-upload-preview-wrap">
            <p className="owner-upload-preview-label">Preview</p>
            <img src={draft} alt="" className="owner-upload-preview" />
          </div>
        ) : null}

        <div className="order-modal-actions">
          <button className="secondary-cta" type="button" onClick={onClose}>
            Cancel
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
            Use this image
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnerShell({ menu, orders, onAddMenuItem, onAddMenuItemsBatch, onUpdateMenuItem, onDeleteMenuItem, onToggleMenuItemAvailable }) {
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
        <p className="eyebrow">Owner mode</p>
        <h2 id="owner-title">Menu management</h2>
        <p>
          Use the header links <strong>Add dish</strong> and <strong>Edit menu</strong> (visible in owner mode). Hidden dishes stay off the guest menu. The add-dish preview queue is kept when you switch between those pages or refresh this tab, until you submit to the menu or remove all items.
        </p>
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
    return m.length ? m.join(" · ") : "No custom badges";
  }

  return (
    <div className="owner-add-workspace">
      <div className="owner-add-form-column">
        <form className="owner-form owner-add-form" onSubmit={addToPreview}>
          <label>
            Dish name
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Midnight Melt"
              required
            />
          </label>
          <label>
            Price
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
            Category
            <input
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
              placeholder="Specials"
            />
          </label>
          <label className="full-row">
            Custom badges
            <input
              value={form.customBadges}
              onChange={(event) => updateField("customBadges", event.target.value)}
              placeholder="e.g. Chef's pick, Spicy (comma-separated)"
            />
            <span className="owner-field-hint">
              Popular and Seasonal/New (new items on the menu under 14 days) are automatic from sales and menu age — do not type them here.
            </span>
          </label>

          <fieldset className="owner-image-fieldset full-row">
            <legend>Dish image</legend>
            <div className="owner-image-source-options" role="radiogroup" aria-label="Image source">
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "url"}
                  onChange={() => setImageSourceMode("url")}
                />
                <span>Image URL</span>
              </label>
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "upload"}
                  onChange={() => setImageSourceMode("upload")}
                />
                <span>Upload image</span>
              </label>
            </div>

            {imageSource === "url" ? (
              <label className="owner-image-url-label">
                Link
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
                        Change image
                      </button>
                      <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="owner-image-upload-empty">No image selected yet.</p>
                    <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                      Upload image…
                    </button>
                  </>
                )}
                <p className="owner-image-upload-hint">Opens a window where you can drag one photo or pick it from your files.</p>
              </div>
            )}
          </fieldset>

          <label className="full-row">
            Description
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
            Add to preview
          </button>
        </form>
      </div>

      <aside className="owner-add-preview-column" aria-labelledby="owner-preview-title">
        <div className="owner-add-preview-head">
          <h3 id="owner-preview-title">New dishes preview</h3>
          <p className="owner-add-preview-sub">
            Queued items appear here. Submit when you are ready to publish them to the live menu.
          </p>
        </div>

        {stagedDishes.length === 0 ? (
          <p className="owner-add-preview-empty">Nothing queued yet. Fill the form and choose &quot;Add to preview&quot;.</p>
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
                <button type="button" className="owner-add-preview-remove" onClick={() => removeStaged(dish.id)} aria-label={`Remove ${dish.name} from preview`}>
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
            Submit to menu
          </button>
          <p className="owner-add-preview-footnote">{stagedDishes.length} queued</p>
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
  const { menu, orders, onDeleteMenuItem, onToggleMenuItemAvailable } = useOutletContext();
  const navigate = useNavigate();

  function confirmDelete(item) {
    if (!window.confirm(`Delete “${item.name}” from the menu? This cannot be undone.`)) return;
    onDeleteMenuItem(item.id);
  }

  return (
    <div className="owner-edit-hub">
      <div className="section-heading compact">
        <p className="eyebrow">Edit menu</p>
        <h3>All dishes</h3>
        <p>Open a dish to change its details, or use the row actions to hide it from guests or remove it.</p>
      </div>

      <ul className="owner-edit-list">
        {menu.length === 0 ? (
          <li className="empty-state">No dishes yet. Add one on the Add dish tab.</li>
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
                {item.available === false ? <span className="owner-hidden-pill">Hidden from menu</span> : null}
              </div>
            </div>
            <div className="owner-edit-row-actions">
              <button type="button" className="secondary-cta small" onClick={() => navigate(`/owner/edit/${item.id}`)}>
                Edit details
              </button>
              <button type="button" className="secondary-cta small" onClick={() => onToggleMenuItemAvailable(item.id)}>
                {item.available === false ? "Show on menu" : "Hide from menu"}
              </button>
              <button type="button" className="decline-button small" onClick={() => confirmDelete(item)}>
                <Icon name="x" />
                Delete
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
        <p className="empty-state">Loading dish…</p>
      </div>
    );
  }

  return (
    <div className="owner-edit-dish">
      <div className="owner-edit-dish-header">
        <button type="button" className="secondary-cta small" onClick={() => navigate("/owner/edit")}>
          ← Back to list
        </button>
        <h3>Edit dish</h3>
      </div>

      <form className="owner-form owner-edit-dish-form" onSubmit={submitUpdate}>
        <label>
          Dish name
          <input
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Midnight Melt"
            required
          />
        </label>
        <label>
          Price
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
          Category
          <input
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
            placeholder="Specials"
          />
        </label>
        <label className="full-row">
          Custom badges
          <input
            value={form.customBadges}
            onChange={(event) => updateField("customBadges", event.target.value)}
            placeholder="e.g. Chef's pick, Spicy (comma-separated)"
          />
          <span className="owner-field-hint">
            Popular and Seasonal/New are automatic — do not type them here. They appear below as guests will see them.
          </span>
        </label>
        <p className="owner-live-badges-preview" aria-live="polite">
          <strong>Live badges (guest view):</strong> {liveBadgePreview.length ? liveBadgePreview.join(" · ") : "—"}
        </p>

        <fieldset className="owner-image-fieldset full-row">
          <legend>Dish image</legend>
          <div className="owner-image-source-options" role="radiogroup" aria-label="Image source">
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
                checked={imageSource === "url"}
                onChange={() => setImageSourceMode("url")}
              />
              <span>Image URL</span>
            </label>
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
                checked={imageSource === "upload"}
                onChange={() => setImageSourceMode("upload")}
              />
              <span>Upload image</span>
            </label>
          </div>

          {imageSource === "url" ? (
            <label className="owner-image-url-label">
              Link
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
                      Change image
                    </button>
                    <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="owner-image-upload-empty">No image selected yet.</p>
                  <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                    Upload image…
                  </button>
                </>
              )}
              <p className="owner-image-upload-hint">Opens a window where you can drag one photo or pick it from your files.</p>
            </div>
          )}
        </fieldset>

        <label className="full-row">
          Description
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
            Save changes
          </button>
          <button type="button" className="secondary-cta" onClick={() => navigate("/owner/edit")}>
            Cancel
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
  return (
    <section className="content-section page-section" aria-labelledby="location-title">
      <div className="section-heading">
        <p className="eyebrow">Visit us</p>
        <h2 id="location-title">Chicago Demo Store</h2>
        <p>Hours, contact, and service notes — swap in live data from your CMS or Supabase when you deploy.</p>
      </div>
      <div className="location-layout">
        <div className="location-panel">
          <Icon name="pin" />
          <h3>Address</h3>
          <p className="location-address">1200 W Demo Street, Chicago, IL 60607</p>
          <p className="location-meta">Street parking and Blue Line within two blocks.</p>
          <dl className="location-hours" aria-label="Opening hours">
            <div className="location-hours-row">
              <dt>Mon–Thu</dt>
              <dd>7:00 AM – 10:00 PM</dd>
            </div>
            <div className="location-hours-row">
              <dt>Fri–Sat</dt>
              <dd>7:00 AM – 11:00 PM</dd>
            </div>
            <div className="location-hours-row">
              <dt>Sunday</dt>
              <dd>8:00 AM – 9:00 PM</dd>
            </div>
          </dl>
          <div className="location-contact">
            <a href="tel:+13125550199">(312) 555-0199</a>
            <span aria-hidden="true"> · </span>
            <a href="mailto:hello@dinerdesk.demo">hello@dinerdesk.demo</a>
          </div>
          <p className="location-disclaimer">Demo contact details — replace before going live.</p>
        </div>
        <div className="location-panel red-panel">
          <h3>Pickup, dine-in &amp; diet</h3>
          <p>Orders from this app appear as tickets for staff to accept before the kitchen starts.</p>
          <p>Add allergy, spice, or portion notes in the cart — they print on the ticket.</p>
          <p className="location-a11y-note">Ask your server about gluten-friendly or dairy-free swaps; not all modifiers are in the demo menu.</p>
        </div>
      </div>
    </section>
  );
}

function ProfilePage({ orders, session, onLogout }) {
  const roleLabel =
    session?.role === "staff" ? "员工" : session?.role === "owner" ? "老板" : session?.role === "customer" ? "顾客" : null;

  return (
    <section className="content-section page-section" aria-labelledby="profile-title">
      <div className="section-heading">
        <p className="eyebrow">Profile</p>
        <h2 id="profile-title">{session ? `已登录：${session.username}` : "游客浏览"}</h2>
        <p>
          {session
            ? `当前身份为${roleLabel}。顾客可不登录使用菜单与购物车；员工与老板入口需登录对应账号。`
            : "未登录时仍可浏览菜单、加购与结账（演示数据保存在本机）。登录后可从顶栏「Mode」进入员工或老板模式（需相应账号）。"}
        </p>
      </div>
      {session ? (
        <div className="profile-auth-actions">
          <button type="button" className="secondary-cta" onClick={onLogout}>
            退出登录
          </button>
        </div>
      ) : (
        <div className="profile-auth-actions">
          <Link className="primary-cta" to="/login">
            登录
          </Link>
          <Link className="secondary-cta" to="/register">
            注册顾客账号
          </Link>
        </div>
      )}
      <div className="profile-summary">
        <strong>{orders.length}</strong>
        <span>Total demo orders saved in this browser</span>
      </div>
      {orders.length === 0 ? (
        <div className="empty-state empty-state--soft profile-empty-panel">
          <p className="empty-state-title">No orders in this browser yet</p>
          <p className="empty-state-hint">Place an order from the menu and check out — your demo history will show here.</p>
          <Link className="primary-cta" to="/menu">
            Go to menu
          </Link>
        </div>
      ) : (
        <p className="profile-footnote">Demo data stays in localStorage on this device until you clear site data.</p>
      )}
    </section>
  );
}

export default App;
