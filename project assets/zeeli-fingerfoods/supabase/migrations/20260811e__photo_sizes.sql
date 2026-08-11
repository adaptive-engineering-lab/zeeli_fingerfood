-- Two stored photo sizes — specs/002-admin-menu-management (T052)
--
-- Constitution Principle IV requires photographs to be "served responsively and
-- lazy-loaded". One stored size cannot be served responsively: srcset needs
-- candidates to choose between, and with a single URL the browser has no choice
-- to make. The original plan stored one derivative and the Constitution Check
-- passed Principle IV on its bundle-size clause alone (finding C1).
--
-- Cards render 150-300px wide on a phone. Sending a 1600px image there wastes
-- most of the bytes SC-006 is trying to save.
--
-- image_url keeps its meaning (the detail size, 1600px long edge) so nothing on
-- the customer path breaks while T053-T056 are being built.

alter table public.menu_items
  add column if not exists image_card_url text;

comment on column public.menu_items.image_card_url is
  'The card-sized derivative (800px long edge). image_url is the detail size '
  '(1600px). Both are produced from one decode of the vendor''s original and '
  'share a storage stem, so replacing a photo releases the pair together '
  '(FR-022, FR-035).';
