import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import {
  logout,
  modeFromSession,
  subscribeAuth,
} from "./services/authService.js";
import { getSupabase, isSupabaseConfigured } from "./lib/supabaseClient.js";
import { withTimeout } from "./lib/withTimeout.js";
import { MAX_ORDER_QUANTITY } from "./lib/securityLimits.js";
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
import { usePrefersReducedMotion } from "./lib/usePrefersReducedMotion.js";
import { runMainRouteEnter } from "./lib/uiMotion.js";
import { ReactBitsProvider } from "./react-bits/ReactBitsProvider.jsx";

import {
  GUEST_PLACED_BY_ID,
  MENU_LOAD_TIMEOUT_MS,
  ORDERS_LOAD_TIMEOUT_MS,
  STAFF_ORDER_SYNC_INTERVAL_MS,
  STORAGE_KEY,
  TOAST_TTL_MS,
} from "./app/appConstants.js";
import { initialState } from "./app/initialAppState.js";
import { isAbortLikeError } from "./app/routeHelpers.js";
import {
  normalizeMenuItemFromPersisted,
  sanitizeManualBadges,
  starterMenu,
} from "./app/menuModelAndBadges.js";
import { getCartQuantity, sanitizeCartLines } from "./app/cartStorage.js";
import { migrateOrderRow } from "./app/orderRowHelpers.js";
import { RequireRole } from "./app/auth/RequireRole.jsx";
import { MobileLink } from "./app/layout/MobileLink.jsx";
import { ReactBitsAmbientMount } from "./app/layout/ReactBitsAmbientMount.jsx";
import { Icon } from "./app/ui/Icon.jsx";
import { ToastStack } from "./app/ui/ToastStack.jsx";
import { HomePage } from "./app/pages/HomePage.jsx";
import { MenuPage } from "./app/pages/MenuPage.jsx";
import { OrdersPage } from "./app/pages/OrdersPage.jsx";
import { CartPage } from "./app/pages/CartPage.jsx";
import { OrderSuccessPage } from "./app/pages/OrderSuccessPage.jsx";
import { LoginPage } from "./app/pages/LoginPage.jsx";
import { RegisterPage } from "./app/pages/RegisterPage.jsx";
import { LocationPage } from "./app/pages/LocationPage.jsx";
import { ProfilePage } from "./app/pages/ProfilePage.jsx";
import { OwnerShell } from "./app/owner/OwnerShell.jsx";
import { OwnerAddPage } from "./app/owner/OwnerAddPage.jsx";
import { OwnerEditMenuPage } from "./app/owner/OwnerEditMenuPage.jsx";
import { OwnerEditDishPage } from "./app/owner/OwnerEditDishPage.jsx";

function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const skipMainRouteMotionOnce = useRef(true);
  const stateRef = useRef(initialState);
  const [mode, setMode] = useState("customer");
  /** When Supabase is configured: false until the first menu fetch finishes (full-screen loading). When not configured: always true. */
  const [dataReady, setDataReady] = useState(() => !isSupabaseConfigured());
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
    setDataReady(false);
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

  const refreshOrders = useCallback(
    async ({ signal, showErrors = false } = {}) => {
      if (!isSupabaseConfigured()) return false;
      if (!authSession) {
        setState((prev) => ({ ...prev, orders: [] }));
        return true;
      }

      try {
        const orders = await withTimeout(
          fetchOrdersForSession(authSession, signal),
          ORDERS_LOAD_TIMEOUT_MS,
          "orders",
        );
        setState((prev) => ({
          ...prev,
          orders: orders.map(migrateOrderRow),
        }));
        return true;
      } catch (e) {
        if (isAbortLikeError(e)) return false;
        console.error(e);
        if (showErrors) {
          enqueueToast(e?.code === "TIMEOUT" ? t("toast.dataLoadTimeout") : t("toast.dataLoadError"));
        }
        return false;
      }
    },
    [authSession, t, enqueueToast],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const abortController = new AbortController();
    refreshOrders({ signal: abortController.signal, showErrors: true });
    return () => abortController.abort();
  }, [refreshOrders]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (authSession?.role !== "staff" && authSession?.role !== "owner") return;

    const sb = getSupabase();
    const channel = sb
      ?.channel(`orders-sync-${authSession.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        refreshOrders({ showErrors: false });
      })
      .subscribe();

    const intervalId = window.setInterval(() => {
      refreshOrders({ showErrors: false });
    }, STAFF_ORDER_SYNC_INTERVAL_MS);

    function refreshVisibleOrders() {
      if (document.visibilityState === "visible") {
        refreshOrders({ showErrors: false });
      }
    }

    window.addEventListener("focus", refreshVisibleOrders);
    document.addEventListener("visibilitychange", refreshVisibleOrders);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleOrders);
      document.removeEventListener("visibilitychange", refreshVisibleOrders);
      if (channel) sb.removeChannel(channel);
    };
  }, [authSession?.id, authSession?.role, refreshOrders]);

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

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: state.cart }));
    } catch {
      /* ignore */
    }
  }, [state.cart]);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    if (skipMainRouteMotionOnce.current) {
      skipMainRouteMotionOnce.current = false;
      return;
    }
    const el = mainRef.current;
    if (!el) return;
    const ctx = runMainRouteEnter(el, { reducedMotion });
    return () => ctx?.revert();
  }, [location.pathname, reducedMotion]);

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
    if (!isSupabaseConfigured() || !authSession?.id) return false;
    try {
      await insertReview(itemId, review, authSession.id);
      const menu = await fetchMenuWithReviews();
      setState((c) => ({ ...c, menu: menu.map(normalizeMenuItemFromPersisted) }));
      return true;
    } catch (e) {
      console.error(e);
      enqueueToast(e?.code === "REVIEW_TOO_SHORT" ? t("toast.reviewTooShort") : t("toast.reviewFailed"));
      return false;
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
    <ReactBitsProvider reducedMotion={reducedMotion}>
      <div className="app-shell">
        <ReactBitsAmbientMount />
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
              <MobileLink to="/profile" onDone={() => setDrawerOpen(false)}>
                {t("drawer.profile")}
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

        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <Routes>
            <Route path="/" element={<HomePage menu={state.menu} orders={state.orders} onOrder={openOrderNoteModal} />} />
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
            <Route path="/profile" element={<ProfilePage session={authSession} orders={state.orders} />} />
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
          <div className="order-modal-backdrop" role="presentation" onClick={closeOrderNoteModal}>
            <div
              className="order-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-notes-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="order-modal-header">
                <h2 id="order-notes-title">{t("orderModal.title")}</h2>
                <button type="button" className="icon-button" aria-label={t("common.close")} onClick={closeOrderNoteModal}>
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
                <button type="button" className="secondary-cta" onClick={closeOrderNoteModal}>
                  {t("orderModal.cancel")}
                </button>
                <button type="button" className="primary-cta" onClick={submitAddToCart}>
                  {t("orderModal.confirm")}
                </button>
              </div>
            </div>
          </div>
        )}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ReactBitsProvider>
  );
}

export default App;
