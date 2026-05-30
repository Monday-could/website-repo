import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "diner-desk-state-v1";

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
    badge: "New",
    image: "/assets/diner-burger.png",
    description:
      "A cheddar burger with lettuce, tomato, pickles, house sauce, and a side of hot fries.",
    category: "Burgers",
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
];

const initialState = {
  menu: starterMenu,
  orders: [],
};

const modes = [
  { id: "customer", label: "客户模式" },
  { id: "staff", label: "员工模式" },
  { id: "owner", label: "老板模式" },
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
      {"★".repeat(value)}
      <span>{"☆".repeat(5 - value)}</span>
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
  const [mode, setMode] = useState("customer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [state, setState] = useState(loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const cartCount = state.orders.filter((order) => order.status === "new").length;

  function addOrder(menuItem) {
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
          notes: "No special request",
          status: "new",
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
        order.id === orderId ? { ...order, status } : order,
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
          available: true,
          reviews: [],
        },
        ...current.menu,
      ],
    }));
  }

  const activeView = {
    customer: (
      <CustomerMode menu={state.menu} orders={state.orders} onOrder={addOrder} onReview={addReview} />
    ),
    staff: <StaffMode orders={state.orders} onStatusChange={updateOrderStatus} />,
    owner: <OwnerMode menu={state.menu} onAddMenuItem={addMenuItem} />,
  }[mode];

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Diner Desk home">
          <span className="brand-mark">D</span>
          <span>Diner Desk</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#menu">Menu</a>
          <a href="#orders">Orders</a>
          <a href="#rewards">Rewards</a>
          <a href="#location">Location</a>
        </nav>

        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Profile">
            <Icon name="user" />
          </button>
          <button className="cart-button" type="button" aria-label={`${cartCount} new orders`}>
            <Icon name="cart" />
            <span>{cartCount}</span>
          </button>
          <button className="order-button" type="button" onClick={() => setMode("customer")}>
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
                    setMode(item.id);
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
            {modes.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? "drawer-link active" : "drawer-link"}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  setDrawerOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </aside>
        </div>
      )}

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Open table ordering</p>
            <h1 id="hero-title">Big Flavor, Easy Ordering</h1>
            <p>
              Browse two diner favorites, send orders to staff, and manage dishes from one
              Netlify-ready React app.
            </p>
            <div className="hero-actions">
              <button className="primary-cta" type="button" onClick={() => setMode("customer")}>
                Start Your Order
              </button>
              <button className="secondary-cta" type="button" onClick={() => setMode("staff")}>
                View Orders
              </button>
            </div>
          </div>
          <div className="hero-food" aria-label="Featured diner dishes">
            <img src="/assets/pancake-breakfast.png" alt="Pancake breakfast platter" />
            <img src="/assets/diner-burger.png" alt="Cheeseburger and fries meal" />
          </div>
        </section>

        {activeView}

        <section className="rewards-band" id="rewards">
          <div>
            <p className="eyebrow">Future Supabase upgrade</p>
            <h2>Ready for real restaurant data</h2>
          </div>
          <p>
            The current app uses browser storage. Replace the storage helpers with Supabase tables
            for menu items, orders, and reviews when your API is ready.
          </p>
          <button className="secondary-cta dark" type="button" onClick={() => setMode("owner")}>
            Add Dish
          </button>
        </section>
      </main>

      <footer className="site-footer" id="location">
        <div>
          <strong>Diner Desk</strong>
          <p>Warm diner service, clear ordering, fast staff action.</p>
        </div>
        <div className="footer-links">
          <a href="#menu">Menu</a>
          <a href="#orders">Orders</a>
          <a href="#rewards">Rewards</a>
          <a href="#location">
            <Icon name="pin" />
            Chicago Demo Store
          </a>
        </div>
      </footer>
    </div>
  );
}

function CustomerMode({ menu, orders, onOrder, onReview }) {
  return (
    <section className="content-section" id="menu" aria-labelledby="customer-title">
      <div className="section-heading">
        <p className="eyebrow">Customer mode</p>
        <h2 id="customer-title">Order your favorites</h2>
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
    if (!text.trim()) return;
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
          <span>{item.reviews.length} review{item.reviews.length === 1 ? "" : "s"}</span>
        </div>
        <div className="card-actions">
          <button className="primary-cta small" type="button" onClick={() => onOrder(item)}>
            <Icon name="plus" />
            Add Order
          </button>
          <button className="secondary-cta small" type="button" onClick={() => setReviewOpen(!reviewOpen)}>
            Review
          </button>
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
    <div className="order-history" id="orders">
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

function StaffMode({ orders, onStatusChange }) {
  const pending = orders.filter((order) => order.status === "new");
  const handled = orders.filter((order) => order.status !== "new");

  return (
    <section className="content-section" id="orders" aria-labelledby="staff-title">
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
                <OrderTicket key={order.id} order={order}>
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
              handled.map((order) => <OrderTicket key={order.id} order={order} />)
            ) : (
              <p className="empty-state">Accepted and declined tickets will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderTicket({ order, children }) {
  return (
    <article className={`ticket status-${order.status}`}>
      <div>
        <p className="ticket-meta">{new Date(order.createdAt).toLocaleString()}</p>
        <h3>{order.itemName}</h3>
        <p>
          {order.quantity} item · {formatPrice(order.price)} · {order.customerName}
        </p>
        <p>{order.notes}</p>
      </div>
      <div className="ticket-footer">
        <span className="status-pill">{order.status}</span>
        {children && <div className="ticket-actions">{children}</div>}
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
    <section className="content-section" aria-labelledby="owner-title">
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
                <p>{item.category} · {formatPrice(item.price)}</p>
              </div>
              <span className="badge subtle">{item.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default App;
