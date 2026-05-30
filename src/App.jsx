import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";

const STORAGE_KEY = "diner-desk-state-v2";

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
};

const modes = [
  { id: "customer", label: "\u5ba2\u6237\u6a21\u5f0f", path: "/menu" },
  { id: "staff", label: "\u5458\u5de5\u6a21\u5f0f", path: "/orders" },
  { id: "owner", label: "\u8001\u677f\u6a21\u5f0f", path: "/owner" },
];

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialState;
  } catch {
    return initialState;
  }
}

function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
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
  const [mode, setMode] = useState("customer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, setState] = useState(loadState);
  const [pendingOrderItem, setPendingOrderItem] = useState(null);
  const [orderNotesDraft, setOrderNotesDraft] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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

  const cartCount = state.orders.filter((order) => order.status === "new").length;

  function openOrderNoteModal(menuItem) {
    setPendingOrderItem(menuItem);
    setOrderNotesDraft("");
  }

  function closeOrderNoteModal() {
    setPendingOrderItem(null);
    setOrderNotesDraft("");
  }

  function submitOrderWithNotes() {
    if (!pendingOrderItem) return;
    addOrder(pendingOrderItem, orderNotesDraft);
    closeOrderNoteModal();
  }

  function addOrder(menuItem, notesInput) {
    const trimmed = typeof notesInput === "string" ? notesInput.trim() : "";
    const notes = trimmed.length > 0 ? trimmed : "No special request";
    setState((current) => ({
      ...current,
      orders: [
        {
          id: `order-${Date.now()}`,
          itemId: menuItem.id,
          itemName: menuItem.name,
          price: menuItem.price,
          quantity: 1,
          customerName: "Walk-in Guest",
          notes,
          status: "new",
          ready: false,
          createdAt: new Date().toISOString(),
        },
        ...current.orders,
      ],
    }));
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
            aria-label={`${cartCount} new orders`}
            onClick={() => navigate("/orders")}
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
          <Route path="/profile" element={<ProfilePage orders={state.orders} />} />
          <Route path="/owner" element={<OwnerMode menu={state.menu} onAddMenuItem={addMenuItem} />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div>
          <strong>Diner Desk</strong>
          <p>Warm diner service, clear ordering, fast staff action.</p>
        </div>
        <div className="footer-links">
          <Link to="/menu">Menu</Link>
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
              <h2 id="order-notes-title">Add order</h2>
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
              <button className="primary-cta" type="button" onClick={submitOrderWithNotes}>
                Submit
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

function HomePage({ menu, orders, onOrder }) {
  const popularItems = [...menu].sort((a, b) => b.popularity - a.popularity).slice(0, 4);

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
          <p>Four high-demand dishes are ready on the first screen after the hero.</p>
        </div>
        <div className="menu-grid">
          {popularItems.map((item) => (
            <MenuCard key={item.id} item={item} onOrder={onOrder} />
          ))}
        </div>
        <OrderHistory orders={orders} />
      </section>
    </>
  );
}

function MenuPage({ menu, orders, onOrder, onReview }) {
  return (
    <section className="content-section page-section" aria-labelledby="menu-title">
      <div className="section-heading">
        <p className="eyebrow">Full menu</p>
        <h2 id="menu-title">Order your favorites</h2>
        <p>Choose a dish, place an order, and leave a review for the kitchen.</p>
      </div>

      <div className="menu-grid">
        {menu.map((item) => (
          <MenuCard key={item.id} item={item} onOrder={onOrder} onReview={onReview} />
        ))}
      </div>

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
            Add Order
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
          {order.quantity} item - {formatPrice(order.price)} - {order.customerName}
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

function OwnerMode({ menu, onAddMenuItem }) {
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

  function submitMenuItem(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.price) return;
    onAddMenuItem({
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      badge: form.badge.trim() || "New",
      description: form.description.trim(),
      image: form.image.trim(),
    });
    setForm({
      name: "",
      price: "",
      category: "Specials",
      badge: "New",
      description: "",
      image: "",
    });
  }

  return (
    <section className="content-section page-section" aria-labelledby="owner-title">
      <div className="section-heading">
        <p className="eyebrow">Owner mode</p>
        <h2 id="owner-title">Build the menu</h2>
        <p>Add dish names, prices, descriptions, badges, and image URLs before Supabase is connected.</p>
      </div>

      <div className="owner-layout">
        <form className="owner-form" onSubmit={submitMenuItem}>
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
          <label className="full-row">
            Image URL
            <input
              value={form.image}
              onChange={(event) => updateField("image", event.target.value)}
              placeholder="/assets/diner-burger.png"
            />
          </label>
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
          <button className="primary-cta" type="submit">
            <Icon name="plus" />
            Add Dish
          </button>
        </form>

        <div className="menu-table" aria-label="Current menu">
          {menu.map((item) => (
            <div className="menu-row" key={item.id}>
              <img src={item.image} alt="" />
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.category} - {formatPrice(item.price)}
                </p>
              </div>
              <span className="badge subtle">{item.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
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
