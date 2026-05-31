-- PostgREST uses roles `anon` and `authenticated`. RLS alone is not enough — grant table privileges.
-- Without these, the REST API returns 401 / permission denied for public reads.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;

GRANT SELECT ON TABLE public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.reviews TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT INSERT ON TABLE public.orders TO anon;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
