-- Live ticket board: allow reading all order rows without a user session (anon).
-- Checkout already allowed anon INSERT with placed_by_id = 'guest'; previously anon
-- could not SELECT, so the SPA replaced local orders with [] after fetch.

GRANT SELECT ON TABLE public.orders TO anon;

-- Permissive policy: any role that may SELECT orders can see all rows (demo / kitchen board).
-- Authenticated customers already had SELECT grants; this widens visibility for the public board.
CREATE POLICY orders_select_live_board ON public.orders
  FOR SELECT
  USING (true);
