-- Catalogue integrity — specs/002-admin-menu-management (T051)
--
-- Two jobs, both closing gaps the 2026-08-11 analysis found between what
-- data-model.md claimed and what the database actually does.
--
-- (a) data-model.md described five `check` constraints as already enforced.
--     `contype = 'c'` returned ZERO rows for both tables. Nothing was enforced.
--
-- (b) `menu_items_category_id_fkey` is ON DELETE SET NULL. Deleting a populated
--     category does not fail — it SUCCEEDS, leaving every item with
--     category_id = null, still is_available, still removed_at is null. The
--     customer menu renders by category, so those items vanish from it silently
--     while every admin view reports them live. FR-030 says the opposite must
--     happen. Today the database does the reverse of the requirement.
--
-- These are the guarantee; the pure client rules in itemValidation.js are for the
-- vendor's benefit. An admin session holds a real API key and can write directly,
-- bypassing any form — the same reasoning that put place_order in the database.
-- SC-007 promises zero invalid items reach customers, and only this layer can.

-- 1. Item rules -------------------------------------------------------------

alter table public.menu_items
  add constraint menu_items_name_not_blank
  check (btrim(name) <> '');

-- Priced one way or the other, never both and never neither. Collapses two of
-- the target rules into the single invariant they actually express.
alter table public.menu_items
  add constraint menu_items_price_shape
  check (
    (has_variants = false and price is not null and price > 0)
    or
    (has_variants = true  and price is null)
  );

-- A LIVE item must have a category. A removed one may have lost its category
-- while it was away, which is a state the spec deliberately allows: removed
-- items do not block a category's removal (FR-030), so this is reachable by
-- design, and restore asks the vendor where the item should return to (FR-013).
--
-- This is why category_id stays nullable rather than becoming NOT NULL as
-- data-model.md's target column suggested. NOT NULL would make the two
-- requirements contradict each other — the delete would fail for removed items
-- too, which FR-030 explicitly forbids.
alter table public.menu_items
  add constraint menu_items_live_has_category
  check (removed_at is not null or category_id is not null);

-- 2. Size rules -------------------------------------------------------------

alter table public.menu_item_variants
  add constraint menu_item_variants_label_not_blank
  check (btrim(label) <> '');

alter table public.menu_item_variants
  add constraint menu_item_variants_price_positive
  check (price > 0);

-- 3. Category removal -------------------------------------------------------

create or replace function public.block_delete_category_with_live_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  live_count int;
begin
  select count(*) into live_count
  from public.menu_items
  where category_id = old.id
    and removed_at is null;

  if live_count > 0 then
    raise exception
      'Move % item(s) out of "%" before removing it.', live_count, old.name
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

comment on function public.block_delete_category_with_live_items() is
  'Enforces FR-030. SECURITY DEFINER on purpose: the count must see every row, '
  'not the RLS-filtered subset the caller can read. An under-counted check would '
  'wave through exactly the deletion it exists to block.';

-- A trigger rather than ON DELETE RESTRICT, because the rule has a WHERE clause:
-- already-removed items must NOT count toward the total or block the category
-- (FR-030). A plain RESTRICT cannot express that; it would block on any
-- referencing row, including ones the vendor already removed.
drop trigger if exists categories_block_delete_with_live_items on public.categories;
create trigger categories_block_delete_with_live_items
  before delete on public.categories
  for each row
  execute function public.block_delete_category_with_live_items();
