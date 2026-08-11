-- Soft removal — specs/002-admin-menu-management (T009)
--
-- Removing an item hides it; it never destroys it (FR-012, FR-013). The vendor
-- can restore it whole for at least 30 days.
--
-- The exclusion is enforced in the POLICY, not in the client. FR-016 says removed
-- means invisible, not merely unlisted — a client-side filter is a display
-- convention that any direct query walks straight past. useMenu.js filters too
-- (T029), but as defence in depth behind this.

alter table public.menu_items
  add column if not exists removed_at timestamptz;

comment on column public.menu_items.removed_at is
  'Null = live. Set = removed: hidden from customers and from the vendor''s main '
  'list, but intact and restorable. Also the retention clock for FR-017. Distinct '
  'from is_available, which is "not today" rather than "not any more".';

-- Every customer read and the vendor's main list share this predicate.
create index if not exists menu_items_live_idx
  on public.menu_items (category_id, sort_order)
  where removed_at is null;

-- Narrow the public read. Was `is_available = true`.
drop policy if exists "public can read available menu items" on public.menu_items;
create policy "public can read available menu items" on public.menu_items
  for select using (is_available = true and removed_at is null);
