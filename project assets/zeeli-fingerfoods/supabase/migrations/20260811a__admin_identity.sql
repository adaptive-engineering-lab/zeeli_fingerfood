-- Admin identity — specs/002-admin-menu-management (T003, T004, T005)
--
-- Why this exists, and why it lands BEFORE any sign-in UI:
--
-- Nine policies currently read `auth.role() = 'authenticated'`. That predicate is
-- true for *any* session the auth provider issues — it answers "is someone signed
-- in?", never "is this the vendor?". Today no account exists, so nothing can reach
-- it. The first sign-in screen makes it reachable, and at that moment anyone who
-- obtains a session holds full catalogue write plus read access to every recorded
-- order: customer names, phone numbers, delivery addresses.
--
-- There must be no window in which sign-in exists and this predicate does not.
-- That ordering is the whole reason this migration is Phase 2.
--
-- See research Finding 0 and contracts/admin-auth.md.

-- 1. Who the vendor is ------------------------------------------------------

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Allow-list of admin accounts. Deliberately unreadable by any client — only '
  'is_admin() reads it. Deleting the auth user revokes the grant automatically.';

alter table public.admins enable row level security;

-- No policy is created on purpose. RLS with zero policies denies every client,
-- which is the intent: a table naming who holds power should not be readable,
-- and nothing outside is_admin() needs to read it. is_admin() reaches it via
-- SECURITY DEFINER instead.

-- 2. The predicate ----------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

comment on function public.is_admin() is
  'True when the calling session belongs to an admin. Answers only about the '
  'caller, so it leaks nothing about who else holds an account. Used both as the '
  'predicate behind every admin policy and as the client''s way to ask whether '
  'this session is the vendor (FR-037) — one source of truth so the UI and the '
  'policies cannot disagree.';

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- `anon` needs EXECUTE because policies that anonymous sessions are subject to
-- call it. Without the grant those policies error instead of returning false.

-- 3. Repoint all nine policies ----------------------------------------------
--
-- Same names, same commands, one predicate swapped. Dropped and recreated
-- because Postgres cannot alter a policy's expression in place.

-- Catalogue (3)
drop policy if exists "admin full access categories" on public.categories;
create policy "admin full access categories" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin full access menu_items" on public.menu_items;
create policy "admin full access menu_items" on public.menu_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin full access menu_item_variants" on public.menu_item_variants;
create policy "admin full access menu_item_variants" on public.menu_item_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- Customer data (3) — the rows that make this migration urgent rather than tidy
drop policy if exists "admin can read orders" on public.orders;
create policy "admin can read orders" on public.orders
  for select using (public.is_admin());

drop policy if exists "admin can update orders" on public.orders;
create policy "admin can update orders" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin can read order_items" on public.order_items;
create policy "admin can read order_items" on public.order_items
  for select using (public.is_admin());

-- Storage (3)
drop policy if exists "admin can upload menu images" on storage.objects;
create policy "admin can upload menu images" on storage.objects
  for insert with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "admin can update menu images" on storage.objects;
create policy "admin can update menu images" on storage.objects
  for update using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "admin can delete menu images" on storage.objects;
create policy "admin can delete menu images" on storage.objects
  for delete using (bucket_id = 'menu-images' and public.is_admin());

-- The public read policies are untouched: "public can read categories",
-- "public can read available menu items", "public can read available variants"
-- and "public can view menu images". Narrowing the menu_items one for soft
-- removal is migration 20260811b's job, not this one.
