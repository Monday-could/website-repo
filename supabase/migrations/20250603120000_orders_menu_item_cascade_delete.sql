-- Allow deleting a menu item when order lines still reference it (demo / owner cleanup).
-- Without CASCADE, PostgreSQL blocks DELETE on menu_items while orders rows exist.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_item_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.menu_items (id) ON DELETE CASCADE;
