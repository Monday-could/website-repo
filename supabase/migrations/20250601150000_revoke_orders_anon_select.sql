-- App no longer loads a public live order board; revert anon read on orders when the
-- earlier `orders_select_live_board` migration was applied.

DROP POLICY IF EXISTS orders_select_live_board ON public.orders;

REVOKE SELECT ON TABLE public.orders FROM anon;
