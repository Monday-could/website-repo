# Tom's Mysterious Restaurant — Web App

A **Vite + React** single-page app for a fictional diner: guests browse the menu and place orders, staff handle kitchen tickets, and owners manage the menu. Data and authentication are **demo-only** (stored in the browser via `localStorage`); there is no backend in this repository.

## Features

### Guest & customer experience

- **Home** — Hero section, popular dishes carousel (sales-based ranking), and a short personal order history.
- **Full menu** — Category and badge filters, dish cards with pricing, badges (e.g. popular / seasonal), and **star reviews** (read for everyone; **write** requires a signed-in account).
- **Cart & checkout** — Line items with notes and quantities; checkout creates kitchen-style tickets.
- **Order board** (`/orders`) — Customers see **their own** recent tickets; history is scoped by account (including guest vs logged-in).
- **Profile** — Account summary and a compact order history with a link to the full order list.
- **Location** — Static informational page.

### Staff mode

- Preset demo account: **`worker` / `imworker`**.
- **Staff order desk** (`/orders`) — Accept or decline new tickets, mark orders ready, with separate queues for pending and handled items.
- Header shortcuts and **mode** switching (customer / staff / owner) with role-aware navigation.

### Owner mode

- Preset demo account: **`boss` / `imboss`**.
- **Owner shell** (`/owner`) — Add dishes (including image URL or local upload preview), queue preview rows, submit batches to the menu, and edit or hide dishes.
- Owner-only routes are protected by role.

### Cross-cutting

- **Internationalization** — English, Chinese (Simplified), and Spanish (`src/i18n/`).
- **Responsive layout** — Header reflows on medium widths; mobile drawer for navigation.
- **Accessibility** — Landmarks, ARIA on key widgets, keyboard support for modals (e.g. Escape to close).

## Tech stack

| Layer        | Choice                          |
| ------------ | ------------------------------- |
| Build        | Vite 7                          |
| UI           | React 19, React Router 6        |
| Styling      | Plain CSS (`src/styles.css`)    |
| State / demo | React state + `localStorage`    |

## Getting started

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (default dev server: `http://127.0.0.1:5173`).

### Scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | Start dev server           |
| `npm run build`   | Production build → `dist/` |
| `npm run preview` | Serve the production build |

## Demo accounts

| Role     | Username | Password   |
| -------- | -------- | ---------- |
| Staff    | `worker` | `imworker` |
| Owner    | `boss`   | `imboss`   |
| Customer | Register a new account from the UI (stored locally). |

Reserved usernames cannot be used for self-registration (`worker`, `boss`, etc.).

## Deployment notes

- Output is a **static site** after `npm run build`; host `dist/` on any static host (Netlify, Vercel, S3, etc.).
- Configure the host for **SPA fallback** so deep links (e.g. `/menu`, `/owner/add`) resolve to `index.html`.

## Roadmap ideas

- Replace `localStorage` with a real API and database (e.g. Supabase).
- Move secrets and auth to the server; keep only public keys in the client.

## License

This project is released under the [MIT License](LICENSE). The `private` field in `package.json` only affects publishing to npm, not your right to use or share the code under MIT.
