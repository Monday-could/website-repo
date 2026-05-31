# Supabase (this repository)

The app connects to Supabase via **Vite environment variables**. The browser uses only the **`anon` public key** and the user JWT. **Never** put `service_role` in the repo, in `.env` used by the Vite client, or in any value shipped to the browser bundle.

**Session persistence:** Supabase Auth uses the default **browser `localStorage`** (same origin). A new tab in the same browser profile typically **stays signed in**, consistent with most sites. Use **Log out** on shared computers.

**Linked project:** *Tom's Mysterious Restaurant Web* — `project_ref` `fxnngojptcdlukqvfiov`. A root `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for this project may already exist after provisioning; keep it out of git.

## Environment variables

Copy `.env.example` at the repo root to `.env` and set (if not already present):

- `VITE_SUPABASE_URL` — Project **Settings → API → Project URL**
- `VITE_SUPABASE_ANON_KEY` — **anon public** key

Local dev: `npm run dev`.

## Synthetic email domain (not your website URL)

For Supabase **email + password** auth, every account needs an email-shaped id. When users type a short name without `@`, the app appends **`@` + `AUTH_EMAIL_DOMAIN`** (defined in `src/services/authService.js`, currently **`monday.com`**). That string is **not** the public site URL; it is only used so addresses stay unique and valid.

**If you change `AUTH_EMAIL_DOMAIN`:** create matching users in **Authentication → Users** (e.g. `boss@monday.com`), update `profiles.role`, or users can still sign in with any **full email** they already have in Auth (including older synthetic domains if those accounts still exist).

## Database migrations (RLS + schema)

SQL lives in `supabase/migrations/`. Recommended: use the **Supabase CLI** on your machine against a **linked project** (you control production; Cursor/MCP only edits files):

```bash
# After installing the CLI, from the repo root
supabase link --project-ref <your-project-ref>
supabase db push
```

Alternatively, paste the migration file contents into the Dashboard **SQL Editor** (respect order; run once).

Migrations create: `profiles`, `menu_items`, `reviews`, `orders`, and the Storage bucket **`menu-images`** (public read; writes restricted to the `owner` role). A follow-up migration grants **`anon` / `authenticated`** table privileges required by PostgREST (RLS is not enough on its own). Later migrations adjust orders visibility and **`ON DELETE CASCADE`** from `orders.item_id` to `menu_items` so owners can delete dishes that already have order lines (see `20250603120000_orders_menu_item_cascade_delete.sql`).

## Permissions (GRANT)

PostgREST connects as `anon` (no user JWT) or `authenticated`. You must **`GRANT`** appropriate `SELECT` / `INSERT` / … on each table to those roles. **RLS policies filter rows; they do not replace missing table privileges.** Without grants, the browser sees **401** or `permission denied for table …`.

This is applied in migration `20250531130000_api_grants.sql`.

## Seed users (staff / owner)

Supabase Auth uses **email + password**. Create users in the Dashboard under **Authentication → Users** (or a one-off Admin script on your machine—**do not** ship `service_role` to the frontend):

| Role  | Suggested email              | Suggested password | After creation                         |
|-------|------------------------------|--------------------|----------------------------------------|
| Staff | `worker@monday.com`    | `imworker`         | Set `public.profiles.role` to `staff` |
| Owner | `boss@monday.com`      | `imboss`           | Set `role` to `owner`                 |

In the SQL Editor (replace `<uuid>` with the user’s id from the Dashboard):

```sql
update public.profiles set role = 'staff' where id = '<uuid>';
-- or
update public.profiles set role = 'owner' where id = '<uuid>';
```

On the login screen you can enter **`worker` / `boss`** (the app appends `@` + `AUTH_EMAIL_DOMAIN` from `src/services/authService.js`, default `monday.com`) or the full email.

## RLS summary (for manual testing)

| Role              | `menu_items`              | `reviews`                         | `orders`                                                                 |
|-------------------|---------------------------|-----------------------------------|---------------------------------------------------------------------------|
| Anonymous         | Read where `available = true` | Read all                    | Insert only with `placed_by_id = 'guest'`; **cannot** read orders       |
| Customer (signed in) | Same as above        | Read all; insert own reviews     | Insert/read own rows (`placed_by_id = auth.uid()`)                       |
| Staff / owner     | Read all                  | Read all; owner may edit/delete others | Read all; update status / ready flags                          |

If you previously applied `20250601140000_orders_select_live_board.sql` and want the database to match the SPA again, apply `20250601150000_revoke_orders_anon_select.sql` (drops that policy and revokes `anon` SELECT on `orders`).

## MCP / Cursor

Good fit: having the assistant **edit migration SQL and frontend code**. **Applying migrations**, **creating Auth users**, and **changing roles** should stay with you (Dashboard or local CLI) so high-privilege keys are not handed to the toolchain.

## Customer signup and email

Registration without `@` maps to `username@` + the configured synthetic domain (same as login). If **email confirmation** is enabled for the project, the user may need to confirm before a session exists; the UI surfaces `REG_CONFIRM_EMAIL`.

## Authentication → Users list (dashboard)

- New customers are stored as **Auth users** with email `yourname@` + `AUTH_EMAIL_DOMAIN` (see `authService.js`, default **`monday.com`**). Example: username `monday` → **`monday@monday.com`**. Search the Users table by that **full email**, not only the short name.
- The dashboard often shows **“Total: N users”** with only a **single page** of rows. Use **pagination**, **sort**, or the **search** field to find a specific account; it is easy to assume a user “was not created” when they are simply off the first page.
- **`public.profiles`** is filled by the trigger `on_auth_user_created` → `handle_new_user()` in `supabase/migrations/20250530120000_init_schema.sql`. Each Auth user must have **one** profile row whose **`id` equals `auth.users.id`**. If you **manually inserted** a `profiles` row with username `monday` that belongs to a **different** UUID than the Auth user for `monday@monday.com`, signup for that email can fail (e.g. unique username) or login can succeed in Auth but **fail in the app** when loading the profile for the signed-in id.
- If login or register spins for a long time, open the browser **Network** tab: stalled `token` or `profiles` requests usually indicate network, paused project, or wrong `VITE_SUPABASE_URL` / keys. Long auth calls **time out** and the login/register form shows **`AUTH_TIMEOUT`** (no toast).
