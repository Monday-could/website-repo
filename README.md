# Tom's Mysterious Restaurant — Web App

A **Vite + React** single-page app for a fictional diner: guests browse the menu and place orders, staff handle kitchen tickets, and owners manage the menu. **Menu, reviews, orders, and authentication** are backed by **Supabase** (Postgres + Auth + Storage). Only the **shopping cart** is persisted in the browser (`localStorage`).

## Supabase setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.  
2. Apply SQL migrations under `supabase/migrations/` (CLI `supabase db push` or Dashboard SQL).  
3. Seed Auth users and `profiles.role` for staff/owner — see **[docs/SUPABASE.md](docs/SUPABASE.md)**.

Without `.env`, the app still builds but shows a banner and does not load menu or orders.

## Features

### Guest & customer experience

- **Home** — Hero section, popular dishes carousel (sales-based ranking), and a short personal order history.
- **Full menu** — Category and badge filters, dish cards with pricing, badges (e.g. popular / seasonal), and **star reviews** (read for everyone; **write** requires a signed-in account).
- **Cart & checkout** — Line items with notes and quantities; checkout creates kitchen-style tickets.
- **Order board** (`/orders`) — Customers see **their own** recent tickets; staff/owner see the full board. Guests who check out without signing in cannot see ticket history in **Profile** (orders use `placed_by_id = guest` for kitchen only).
- **Profile** — Account summary and a compact order history with a link to the full order list.
- **Location** — Static informational page.

### Staff mode

- After Supabase seed: sign in as **`worker`** (maps to `worker@monday.com`) / **`imworker`** — see [docs/SUPABASE.md](docs/SUPABASE.md).
- **Staff order desk** (`/orders`) — Accept or decline new tickets, mark orders ready, with separate queues for pending and handled items.
- Header shortcuts and **mode** switching (customer / staff / owner) with role-aware navigation.

### Owner mode

- After Supabase seed: **`boss`** / **`imboss`** with `profiles.role = owner`.
- **Owner shell** (`/owner`) — Add dishes (including image URL or local upload preview), queue preview rows, submit batches to the menu, and edit or hide dishes.
- Owner-only routes are protected by role.

### Cross-cutting

- **Internationalization** — English, Chinese (Simplified), and Spanish (`src/i18n/`).
- **Responsive layout** — Header reflows on medium widths; mobile drawer for navigation.
- **Accessibility** — Landmarks, ARIA on key widgets, keyboard support for modals (e.g. Escape to close).
- **First-load experience** — When Supabase env vars are set, the app shows a full-screen loading state until the initial menu fetch completes, so customers do not see an empty menu flash.
- **Motion** — **GSAP** drives page transitions, home hero/popular sections, cart layout, and menu card intros (separate from optional UI flourishes below). **Optional “React Bits–style” layers** (CSS ambient backdrop, gradient hero title, food-card spotlight, magnet + click spark on the main home CTA) live under `src/react-bits/`. They are **independent of GSAP** and can be turned off at build time (`VITE_REACT_BITS=0` in `.env`) or at runtime via `localStorage` — see comments in `src/react-bits/reactBitsConfig.js`. `prefers-reduced-motion` and coarse pointers disable the heaviest interactions where appropriate.
- **Deleting a dish (owner)** — Removing a dish from the menu deletes its `menu_items` row, removes the image object from the **`menu-images`** Storage bucket when `image_url` points there, and relies on Postgres **`ON DELETE CASCADE`** for related **reviews** and **order line** data tied to that dish.

## Tech stack

| Layer        | Choice                          |
| ------------ | ------------------------------- |
| Build        | Vite 7                          |
| UI           | React 19, React Router 6        |
| Styling      | Plain CSS (`src/styles.css`)    |
| State / data | React state; **cart** in `localStorage`; menu/reviews/orders via **Supabase** |

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
| Customer | Register in the UI (Supabase Auth); short names become `name@monday.com` (see `AUTH_EMAIL_DOMAIN` in `authService.js`). |

Reserved usernames cannot be used for self-registration (`worker`, `boss`, etc.).

## Deployment notes

- Output is a **static site** after `npm run build`; host `dist/` on any static host (Netlify, Vercel, S3, etc.).
- Configure the host for **SPA fallback** so deep links (e.g. `/menu`, `/owner/add`) resolve to `index.html`.
- Set **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** in the build environment so the production bundle can reach your Supabase project.

## 网站功能说明（中文）

虚构餐吧 **Tom's Mysterious Restaurant** 的单页应用：**顾客**浏览首页与完整菜单、筛选分类/徽章、将菜品加入购物车并结账生成厨房小票；**登录用户**可写星级评价、在「订单」页查看本人历史小票。**员工**在订单看板接单/拒单并标记出餐状态。**老板**在 `/owner` 管理菜单：添加/预览批量上架、编辑、对顾客隐藏或永久删除菜品；删除菜品时会尽量删除 Supabase Storage 中的对应图片，数据库级联清理关联评价与订单行。菜单、评价、订单与登录态由 **Supabase** 提供；购物车仅存浏览器。支持 **中 / 英 / 西** 界面语言。可选的轻量动效（React Bits 风格）与 GSAP 页面动效可分别关闭，详见上文与 `reactBitsConfig.js`。

## License

This project is released under the [MIT License](LICENSE). The `private` field in `package.json` only affects publishing to npm, not your right to use or share the code under MIT.
