-- Diner Desk: core tables, RLS, Storage bucket (public read, owner write)
-- Apply with: supabase db push / supabase migration up (linked project)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_username_lower_unique ON public.profiles (lower(username));

CREATE INDEX profiles_role_idx ON public.profiles (role);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''), split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''), split_part(NEW.email, '@', 1)),
    'customer'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER: reads profiles as table owner, bypasses RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.role = 'owner' FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role IN ('staff', 'owner') FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
CREATE TABLE public.menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  category text NOT NULL DEFAULT 'Specials',
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  popularity integer NOT NULL DEFAULT 70,
  available boolean NOT NULL DEFAULT true,
  manual_badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  menu_added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX menu_items_category_idx ON public.menu_items (category);
CREATE INDEX menu_items_available_idx ON public.menu_items (available);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id text NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  author_display text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reviews_menu_item_idx ON public.reviews (menu_item_id);

-- ---------------------------------------------------------------------------
-- Orders (line-level rows, same shape as SPA checkout)
-- ---------------------------------------------------------------------------
CREATE TABLE public.orders (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES public.menu_items (id),
  item_name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  customer_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  placed_by_id text NOT NULL
);

CREATE INDEX orders_placed_by_idx ON public.orders (placed_by_id);
CREATE INDEX orders_status_idx ON public.orders (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Profiles: read own row; update own non-role fields
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Menu: public read of available dishes; staff/owner read all; owner write
CREATE POLICY menu_select_public ON public.menu_items
  FOR SELECT
  USING (available = true OR public.is_staff_or_owner());

CREATE POLICY menu_insert_owner ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner());

CREATE POLICY menu_update_owner ON public.menu_items
  FOR UPDATE TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY menu_delete_owner ON public.menu_items
  FOR DELETE TO authenticated
  USING (public.is_owner());

-- Reviews: public read; insert own when authenticated; update/delete own or owner
CREATE POLICY reviews_select_all ON public.reviews
  FOR SELECT
  USING (true);

CREATE POLICY reviews_insert_auth ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY reviews_update_own_or_owner ON public.reviews
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_owner())
  WITH CHECK (author_id = auth.uid() OR public.is_owner());

CREATE POLICY reviews_delete_own_or_owner ON public.reviews
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_owner());

-- Orders: guest insert (anon); authenticated insert own id; staff update; select rules
CREATE POLICY orders_insert_anon_guest ON public.orders
  FOR INSERT TO anon
  WITH CHECK (placed_by_id = 'guest');

CREATE POLICY orders_insert_authenticated ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    placed_by_id = auth.uid()::text
    OR placed_by_id = 'guest'
  );

CREATE POLICY orders_select_staff_owner ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_staff_or_owner());

CREATE POLICY orders_select_own_customer ON public.orders
  FOR SELECT TO authenticated
  USING (
    NOT public.is_staff_or_owner()
    AND placed_by_id = auth.uid()::text
  );

CREATE POLICY orders_update_staff_owner ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_staff_or_owner())
  WITH CHECK (public.is_staff_or_owner());

-- ---------------------------------------------------------------------------
-- Storage: menu-images bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_menu_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'menu-images');

CREATE POLICY storage_menu_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-images'
    AND public.is_owner()
  );

CREATE POLICY storage_menu_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-images' AND public.is_owner())
  WITH CHECK (bucket_id = 'menu-images' AND public.is_owner());

CREATE POLICY storage_menu_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-images' AND public.is_owner());

-- ---------------------------------------------------------------------------
-- Seed menu + reviews (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_items (id, name, price, category, description, image_url, popularity, available, manual_badges, menu_added_at)
VALUES
  (
    'stack-house-breakfast',
    'Stack House Breakfast',
    12.99,
    'Breakfast',
    'Golden pancakes, soft eggs, crispy bacon, and maple butter for an all-day breakfast plate.',
    '/assets/pancake-breakfast.png',
    98,
    true,
    '[]'::jsonb,
    '2024-06-01T12:00:00.000Z'
  ),
  (
    'red-basket-burger',
    'Red Basket Burger',
    14.49,
    'Burgers',
    'A cheddar burger with lettuce, tomato, pickles, house sauce, and a side of hot fries.',
    '/assets/diner-burger.png',
    94,
    true,
    '[]'::jsonb,
    '2024-06-01T12:00:00.000Z'
  ),
  (
    'sunrise-skillet',
    'Sunrise Skillet',
    13.79,
    'Breakfast',
    'Eggs, potatoes, bacon, and warm breakfast sauce built for a fast morning order.',
    '/assets/pancake-breakfast.png',
    89,
    true,
    '["Hot"]'::jsonb,
    '2024-06-01T12:00:00.000Z'
  ),
  (
    'late-night-burger',
    'Late-Night Burger',
    15.25,
    'Burgers',
    'Double cheddar, crisp pickles, diner sauce, and fries for after-hours cravings.',
    '/assets/diner-burger.png',
    86,
    true,
    '[]'::jsonb,
    '2026-05-22T12:00:00.000Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reviews (id, menu_item_id, author_id, author_display, rating, body, created_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'stack-house-breakfast', NULL, 'Mia', 5, 'Pancakes were fluffy and the bacon stayed crisp.', now()),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'red-basket-burger', NULL, 'Jay', 4, 'Big flavor and the fries were fresh.', now()),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'sunrise-skillet', NULL, 'Noah', 5, 'Filling breakfast and easy to share.', now()),
  ('a1000000-0000-4000-8000-000000000004'::uuid, 'late-night-burger', NULL, 'Lena', 4, 'Great sauce and the portion felt right.', now())
ON CONFLICT (id) DO NOTHING;
