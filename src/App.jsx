import { useEffect, useId, useMemo, useRef, useState } from "react";
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
} from "react-router-dom";

const STORAGE_KEY = "diner-desk-state-v2";

/** Queued add-dish preview rows (owner); survives tab switches and refresh within the same browser tab. */
const OWNER_STAGED_SESSION_KEY = "diner-desk-owner-staged-preview-v1";

function loadOwnerStagedSession() {
  try {
    const raw = window.sessionStorage.getItem(OWNER_STAGED_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Local image uploads are stored as data URLs; keep a modest cap for localStorage. */
const MAX_OWNER_IMAGE_BYTES = 2 * 1024 * 1024;

const starterMenu = [
  {
    id: "stack-house-breakfast",
    name: "Stack House Breakfast",
    price: 12.99,
    badge: "Popular",
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
    badge: "Popular",
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
    badge: "Hot",
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
    badge: "New",
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
  menu: starterMenu,
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
      menu: Array.isArray(parsed.menu) ? parsed.menu : initialState.menu,
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

function uniqSortedCategoryBadgeValues(items, field) {
  const s = new Set();
  for (const item of items) {
    const raw = item[field];
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function filterMenuByCategoryAndBadge(items, category, badge) {
  return items.filter((item) => {
    if (category !== "all" && (item.category || "").trim() !== category) return false;
    if (badge !== "all" && (item.badge || "").trim() !== badge) return false;
    return true;
  });
}

function MenuFiltersBar({ menuItems, category, badge, onCategory, onBadge }) {
  const catSelectId = useId();
  const badgeSelectId = useId();
  const categoryOptions = useMemo(() => uniqSortedCategoryBadgeValues(menuItems, "category"), [menuItems]);
  const badgeOptions = useMemo(() => uniqSortedCategoryBadgeValues(menuItems, "badge"), [menuItems]);

  useEffect(() => {
    if (category !== "all" && !categoryOptions.includes(category)) onCategory("all");
  }, [category, categoryOptions, onCategory]);

  useEffect(() => {
    if (badge !== "all" && !badgeOptions.includes(badge)) onBadge("all");
  }, [badge, badgeOptions, onBadge]);

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
            {badgeOptions.map((b) => (
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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("customer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, setState] = useState(loadState);
  const [pendingOrderItem, setPendingOrderItem] = useState(null);
  const [orderNotesDraft, setOrderNotesDraft] = useState("");

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
  }

  function addMenuItem(item) {
    setState((current) => ({
      ...current,
      menu: [
        {
          ...item,
          id: `dish-${Date.now()}`,
          image: item.image || "/assets/diner-burger.png",
          popularity: 70,
          available: true,
          reviews: [],
        },
        ...current.menu,
      ],
    }));
  }

  function addMenuItemsBatch(items) {
    if (!items.length) return;
    const ts = Date.now();
    setState((current) => {
      const newRows = items.map((item, i) => ({
        name: item.name,
        price: item.price,
        category: item.category,
        badge: item.badge,
        description: item.description,
        image: item.image || "/assets/diner-burger.png",
        id: `dish-${ts}-${i}`,
        popularity: 70,
        available: true,
        reviews: [],
      }));
      return { ...current, menu: [...newRows.reverse(), ...current.menu] };
    });
  }

  function updateMenuItem(itemId, patch) {
    setState((current) => ({
      ...current,
      menu: current.menu.map((menuItem) =>
        menuItem.id === itemId ? { ...menuItem, ...patch, id: menuItem.id } : menuItem,
      ),
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
    setMode(item.id);
    navigate(item.path);
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Diner Desk home">
          <span className="brand-mark">D</span>
          <span>Diner Desk</span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <NavLink to="/menu">Menu</NavLink>
          <NavLink to="/location">Location</NavLink>
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

      <main>
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
                orders={state.orders}
                onStatusChange={updateOrderStatus}
                onReady={markOrderReady}
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
              />
            }
          />
          <Route path="/profile" element={<ProfilePage orders={state.orders} />} />
          <Route
            path="/owner"
            element={
              <OwnerShell
                menu={state.menu}
                onAddMenuItem={addMenuItem}
                onAddMenuItemsBatch={addMenuItemsBatch}
                onUpdateMenuItem={updateMenuItem}
                onDeleteMenuItem={deleteMenuItem}
                onToggleMenuItemAvailable={toggleMenuItemAvailable}
              />
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
          <strong>Diner Desk</strong>
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

function CartPage({ cart, onUpdateQuantity, onRemoveLine, onCheckout }) {
  const navigate = useNavigate();
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity || 1), 0),
    [cart],
  );

  function handleCheckout() {
    if (!cart.length) return;
    onCheckout();
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

function HomePopularCarousel({ items, onOrder }) {
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
    return <p className="empty-state home-carousel-empty">No dishes to show yet.</p>;
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
                <MenuCard item={item} onOrder={onOrder} />
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
    () => [...visibleMenu].sort((a, b) => b.popularity - a.popularity).slice(0, 4),
    [visibleMenu],
  );

  return (
    <>
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

      <section className="content-section" aria-labelledby="popular-title">
        <div className="section-heading">
          <p className="eyebrow">Most popular</p>
          <h2 id="popular-title">Guest favorites</h2>
          <p>Swipe through top picks, then open the full menu for every category and badge filter.</p>
        </div>
        <HomePopularCarousel items={popularItems} onOrder={onOrder} />
        <OrderHistory orders={orders} />
      </section>
    </>
  );
}

function MenuPage({ menu, orders, onOrder, onReview }) {
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBadge, setFilterBadge] = useState("all");
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const filteredMenu = useMemo(
    () => filterMenuByCategoryAndBadge(visibleMenu, filterCategory, filterBadge),
    [visibleMenu, filterCategory, filterBadge],
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
      />

      {filteredMenu.length ? (
        <div className="menu-grid">
          {filteredMenu.map((item) => (
            <MenuCard key={item.id} item={item} onOrder={onOrder} onReview={onReview} />
          ))}
        </div>
      ) : (
        <p className="empty-state menu-filter-empty">No dishes match these filters. Clear filters or check back later.</p>
      )}

      <OrderHistory orders={orders} />
    </section>
  );
}

function MenuCard({ item, onOrder, onReview }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

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
        <span className="badge">{item.badge}</span>
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
        <div className="latest-review">
          {item.reviews[0] ? (
            <>
              <strong>{item.reviews[0].author}</strong>
              <p>{item.reviews[0].text}</p>
            </>
          ) : (
            <p>Be the first to review this dish.</p>
          )}
        </div>
      </div>
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
        <p className="empty-state">No orders yet. Add a menu item to create the first kitchen ticket.</p>
      )}
    </div>
  );
}

function OrdersPage({ mode, orders, onStatusChange, onReady }) {
  if (mode === "staff") {
    return <StaffMode orders={orders} onStatusChange={onStatusChange} onReady={onReady} />;
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
              <p className="empty-state">No new orders waiting.</p>
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
              <p className="empty-state">Accepted and declined tickets will appear here.</p>
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

function OwnerShell({ menu, onAddMenuItem, onAddMenuItemsBatch, onUpdateMenuItem, onDeleteMenuItem, onToggleMenuItemAvailable }) {
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
    badge: "New",
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
    const payload = {
      id: `preview-${Date.now()}`,
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      badge: form.badge.trim() || "New",
      description: form.description.trim(),
      image: form.image.trim(),
    };
    addStagedDish(payload);
    setForm({
      name: "",
      price: "",
      category: "Specials",
      badge: "New",
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
    const payloads = stagedDishes.map(({ id: _id, ...rest }) => rest);
    onAddMenuItemsBatch(payloads);
    clearStagedDishes();
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
          <label>
            Badge
            <input value={form.badge} onChange={(event) => updateField("badge", event.target.value)} placeholder="New" />
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
                    {dish.category} · {formatPrice(dish.price)} · {dish.badge}
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
  const { menu, onDeleteMenuItem, onToggleMenuItemAvailable } = useOutletContext();
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
                  {item.category} · {formatPrice(item.price)} · {item.badge}
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
  const { menu, onUpdateMenuItem } = useOutletContext();
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
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      badge: item.badge,
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
      badge: form.badge.trim() || "New",
      description: form.description.trim(),
      image: form.image.trim() || "/assets/diner-burger.png",
    });
    navigate("/owner/edit");
  }

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
        <label>
          Badge
          <input value={form.badge} onChange={(event) => updateField("badge", event.target.value)} placeholder="New" />
        </label>

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
        <p className="eyebrow">Location</p>
        <h2 id="location-title">Chicago Demo Store</h2>
        <p>Use this page later for real store hours, delivery zones, and map data from Supabase.</p>
      </div>
      <div className="location-layout">
        <div className="location-panel">
          <Icon name="pin" />
          <h3>Downtown Diner Counter</h3>
          <p>1200 W Demo Street, Chicago, IL</p>
          <p>Open daily - 7:00 AM - 11:00 PM</p>
        </div>
        <div className="location-panel red-panel">
          <h3>Pickup and dine-in</h3>
          <p>Orders from this demo app can be reviewed by staff before the ticket is accepted.</p>
        </div>
      </div>
    </section>
  );
}

function ProfilePage({ orders }) {
  return (
    <section className="content-section page-section" aria-labelledby="profile-title">
      <div className="section-heading">
        <p className="eyebrow">Profile</p>
        <h2 id="profile-title">Guest account</h2>
        <p>This placeholder is ready for login and order history after authentication is added.</p>
      </div>
      <div className="profile-summary">
        <strong>{orders.length}</strong>
        <span>Total demo orders saved in this browser</span>
      </div>
    </section>
  );
}

export default App;
