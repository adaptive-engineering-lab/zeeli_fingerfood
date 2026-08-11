-- PROVISIONAL catalogue data.
--
-- These are the items drawn in the wireframes and listed in the PRD, not a menu the
-- vendor has confirmed. PRD §11 still flags the real category taxonomy, the item list,
-- the prices and which items sell in size tiers as open questions. Treat every price
-- here as a placeholder until the vendor checks it; the admin panel (PRD phase 2) is
-- how they will replace it.
--
-- Ids are fixed rather than generated so this file is idempotent and so order lines
-- keep pointing at the same items across re-runs. Safe to run repeatedly.

begin;

insert into public.categories (id, name, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Small Chops',     1),
  ('11111111-1111-4111-8111-000000000002', 'Grills',          2),
  ('11111111-1111-4111-8111-000000000003', 'Platters/Trays',  3),
  ('11111111-1111-4111-8111-000000000004', 'Drinks',          4)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.menu_items
  (id, category_id, name, description, price, is_available, has_variants, sort_order) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Puff Puff (6pc)', 'Soft fried dough bites', 800, true, false, 1),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001',
   'Chicken Samosa', 'Spiced chicken filling', 1200, true, false, 2),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001',
   'Spring Rolls', 'Veg & chicken mix', 1000, true, false, 3),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000002',
   'Suya Skewers', 'Beef, yaji spice, onions', 2500, true, false, 1),
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'Peppered Chicken Wings', 'Six wings, house pepper sauce', 3000, true, false, 2),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000003',
   'Small Chops Combo Tray', 'Mixed tray — puff puff, samosa, spring rolls, chicken wings.',
   null, true, true, 1),
  ('22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000003',
   'Grill Platter', 'Suya, wings and gizzard on one board', null, true, true, 2),
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000004',
   'Zobo Drink', 'Chilled hibiscus, lightly spiced', 500, true, false, 1),
  ('22222222-2222-4222-8222-000000000009', '11111111-1111-4111-8111-000000000004',
   'Chapman', 'House mix, served by the bottle', 1500, true, false, 2)
on conflict (id) do update set
  category_id  = excluded.category_id,
  name         = excluded.name,
  description  = excluded.description,
  price        = excluded.price,
  is_available = excluded.is_available,
  has_variants = excluded.has_variants,
  sort_order   = excluded.sort_order;

insert into public.menu_item_variants (id, menu_item_id, label, price, is_available, sort_order) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000006', 'Tray of 20',   3500, true, 1),
  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000006', 'Tray of 50',   7000, true, 2),
  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000006', 'Tray of 100', 12000, true, 3),
  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000007', 'Small',        9000, true, 1),
  ('33333333-3333-4333-8333-000000000005', '22222222-2222-4222-8222-000000000007', 'Large',       16000, true, 2)
on conflict (id) do update set
  menu_item_id = excluded.menu_item_id,
  label        = excluded.label,
  price        = excluded.price,
  is_available = excluded.is_available,
  sort_order   = excluded.sort_order;

commit;
