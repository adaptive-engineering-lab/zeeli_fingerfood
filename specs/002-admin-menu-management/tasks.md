---

description: "Task list for Admin Authentication & Menu Management"
---

# Tasks: Admin Authentication & Menu Management

**Input**: Design documents from `/specs/002-admin-menu-management/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/admin-auth.md](./contracts/admin-auth.md),
[contracts/catalogue.md](./contracts/catalogue.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks **are** included — constitution Principle I makes them non-negotiable for
decidable logic, and this feature has four pure modules. They are written before the implementation
they cover.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Source paths are relative to **`project assets/zeeli-fingerfoods/`**. Spec paths are relative to the
repository root.

---

## ⚠️ Read before starting

**Phase 2 must complete before a single line of sign-in UI is merged or deployed.**

Nine policies currently treat *any* authenticated session as the admin, and no account exists today,
so nothing can reach them. The first sign-in screen makes them reachable — and a stranger who
obtains a session would hold full catalogue write plus read access to every customer's name, phone
and address. Phase 2 replaces that predicate. Building the lock before the door is not a
preference; it is why Phase 2 blocks everything.

See [research Finding 0](./research.md#finding-0-shipping-sign-in-would-open-a-privilege-escalation-path).

---

## Phase 1: Setup

**Purpose**: somewhere for the admin tree to live, behind a lazy boundary from the start

- [ ] T001 Create `src/features/admin/` with a placeholder `AdminApp.jsx` that renders nothing yet
- [ ] T002 Wire `/admin/*` into `src/App.jsx` via `React.lazy` + `Suspense`, importing **only** from
      `features/admin/` so the split boundary is established before anything is built behind it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: put the lock on before the door exists, and repair the two defects the plan found.

**⚠️ No user story may start until this phase is applied to the target project.**

### The admin predicate (security-critical)

- [ ] T003 Write `supabase/migrations/20260811a__admin_identity.sql`: `admins` table (PK `user_id`
      FK → `auth.users` ON DELETE CASCADE, `email`, `created_at`), RLS enabled with **no client
      policy**, per [data-model.md](./data-model.md#new-publicadmins)
- [ ] T004 In the same migration add `public.is_admin()` — `stable security definer`,
      `search_path = public, pg_temp` — then `revoke execute from public` and grant to `anon,
      authenticated`, per [contracts/admin-auth.md](./contracts/admin-auth.md#1-publicis_admin)
- [ ] T005 In the same migration repoint **all nine** policies from `auth.role() = 'authenticated'`
      to `public.is_admin()`: 3 on the catalogue tables, 2 on `orders`, 1 on `order_items`, 3 on
      `storage.objects`
- [ ] T006 Apply migration `20260811a` and verify: nine policies now reference `is_admin()`, zero
      still reference `auth.role()`, and `admins` is unreadable by `anon`
- [ ] T007 In the Supabase dashboard: **disable self-signup**, set magic-link/OTP validity to
      **15 minutes**, and confirm the refresh-token lifetime outlasts **30 days** (FR-004, FR-005).
      None of these are expressible as a migration and all three are load-bearing
- [ ] T008 Create the vendor's auth user, then `insert into public.admins` selecting its id — the
      only row this feature adds

### Soft removal

- [ ] T009 Write and apply `supabase/migrations/20260811b__soft_removal.sql`: add
      `menu_items.removed_at timestamptz`, a partial index on `(category_id, sort_order) where
      removed_at is null`, and narrow the public read policy to
      `is_available = true and removed_at is null` (FR-016)

### Repair to feature 001

- [ ] T010 Write and apply `supabase/migrations/20260811c__place_order_fk_guard.sql`: `place_order`
      stores `null` for a `menu_item_id` or `variant_id` that no longer resolves, instead of
      raising. Without this, discarding an item that sits in a customer's cart makes their **entire
      order go unrecorded** — see [research D9](./research.md#d9-discard-vs-a-customers-in-flight-order)
- [ ] T011 Confirm 001's own tests and `npm run verify:permissions` still pass unchanged after T010

### Proving the boundary

- [ ] T012 Extend `scripts/verify-order-permissions.mjs` with a second identity: a real authenticated
      session **not** in `admins`. Assert it reads 0 orders, 0 order_items, 0 `admins` rows; that
      every catalogue write, storage upload and storage delete is rejected; and that it can still
      read available items like any visitor — per
      [quickstart scenario 1](./quickstart.md#scenario-1--a-signed-in-stranger-gets-nothing-sc-005-fr-007)
- [ ] T013 Run `npm run verify:permissions` and confirm all assertions pass, then **deliberately add
      that user to `admins`, re-run, and confirm the new assertions fail**, then remove it. A
      permissions check that has only ever passed proves nothing

**Checkpoint**: authenticated ≠ admin, enforced in Postgres and demonstrated to fail when it should.
Sign-in UI may now be built.

---

## Phase 3: User Story 1 — The vendor corrects the live menu themselves (P1) 🎯 MVP

**Goal**: sign in, change a price, toggle availability, sign out — no developer.

**Independent test**: [quickstart](./quickstart.md) scenarios 2, 3 and 4.

### Tests first (Principle I)

- [ ] T014 [P] [US1] Write failing tests in `src/features/admin/itemValidation.test.js` for the
      single-price rules — blank name, missing category, price ≤ 0, and that **all** failures return
      at once rather than the first — per
      [contracts/catalogue.md](./contracts/catalogue.md#test-cases-the-implementation-must-satisfy)

### Implementation

- [ ] T015 [US1] Create `src/features/admin/itemValidation.js` until T014 passes — pure, no React,
      no Supabase
- [ ] T016 [US1] Create `src/features/admin/useAdminSession.js` exposing
      `{ status: 'loading' | 'signed-out' | 'not-admin' | 'admin', email, signIn, signOut }`.
      `'loading'` MUST NOT render as signed-out, or every reload flashes the sign-in form
- [ ] T017 [US1] Create `src/features/admin/SignInPage.jsx` to **wireframe 4c**: one email field,
      flush left, with the "link sent" and error states inline. The response MUST read identically
      for registered and unregistered addresses (FR-003)
- [ ] T018 [US1] Build the auth gate in `src/features/admin/AdminApp.jsx`: `'not-admin'` renders the
      sign-in screen, never a management screen whose contents merely fail to load
- [ ] T019 [US1] Create `src/features/admin/MenuManagerPage.jsx` to **wireframe 5b** — category
      sidebar, item rows, inline price edit and availability toggle; 5a's row treatment at phone width
- [ ] T020 [US1] Verify quickstart scenarios 2, 3 and 4 in a browser: sign in by link, reload without
      being asked again, change a price and toggle availability, and see both on the customer menu

**Checkpoint**: the vendor can run their own menu. Shippable alone.

---

## Phase 4: User Story 2 — Add an item, with a photo, in under a minute (P1)

**Goal**: the menu can grow, and removal is reversible.

**Independent test**: [quickstart](./quickstart.md) scenarios 5 and 6.

### Tests first

- [ ] T021 [P] [US2] Write failing tests in `src/features/admin/imageResize.test.js` for
      `targetSize` — landscape, portrait, already-small (**never upscale**), square, extreme ratios
- [ ] T022 [P] [US2] Write failing tests in `src/features/admin/storagePaths.test.js` — path starts
      with the item prefix, two calls differ, extension honoured

### Implementation

- [ ] T023 [US2] Create `src/features/admin/imageResize.js`: pure `targetSize` plus `reduceImage`
      (`createImageBitmap` → canvas → `toBlob`, webp preferred, jpeg fallback, quality 0.82, long
      edge 1600). It MUST reject rather than upload an original when the browser cannot do the work
      (FR-021) — **no dependency**, per [research D5](./research.md#d5-reducing-photos-on-the-device)
- [ ] T024 [P] [US2] Create `src/features/admin/storagePaths.js` until T022 passes
- [ ] T025 [US2] Create `src/features/admin/ItemDrawer.jsx` to **wireframe 6a** — a side drawer on
      desktop, a bottom sheet at phone width reusing the CSS idiom already in
      `src/features/menu/ItemSheet.jsx`
- [ ] T026 [US2] Implement photo attach and replace: upload new → point the row at it → delete the
      old. Never delete first ([research D6](./research.md#d6-photo-lifecycle))
- [ ] T027 [US2] Implement remove (sets `removed_at`), restore (clears it), and discard (deletes the
      row, then clears its storage prefix — row first, since an orphaned object is recoverable and a
      photo-less row is not)
- [ ] T028 [US2] Create `src/features/admin/RemovedItemsPanel.jsx` — find and restore a removed item,
      or discard it outright
- [ ] T029 [US2] Update `src/features/menu/useMenu.js` to exclude `removed_at` items as defence in
      depth beside the policy, which remains the guarantee (FR-016)
- [ ] T030 [US2] Verify quickstart scenarios 5 and 6: time a phone-based add under 60s, confirm the
      stored object is a few hundred KB not multi-megabyte, reject a PDF, pass through an
      already-small image, then remove → restore → discard and reconcile storage against live rows

**Checkpoint**: the catalogue is fully the vendor's, and a mis-tap is recoverable.

---

## Phase 5: User Story 3 — Items that sell in sizes (P2)

**Goal**: tray items carry correct tiers.

**Independent test**: add, reprice and retire a size; the customer picker and "from" price follow.

- [ ] T031 [P] [US3] Extend `src/features/admin/itemValidation.test.js` with the sizes rules —
      sizes-mode needs ≥1 size, blank labels and prices ≤ 0 fail, and a sized item MUST NOT also
      carry a base price
- [ ] T032 [US3] Extend `src/features/admin/itemValidation.js` until T031 passes
- [ ] T033 [US3] Add the variant repeater to `src/features/admin/ItemDrawer.jsx` per wireframe 6a —
      add, rename, reprice, retire, remove
- [ ] T034 [US3] Save sizes in the same operation as the item, so the two can never disagree
      ([contracts/catalogue.md](./contracts/catalogue.md#5-write-operations))
- [ ] T035 [US3] Verify against the customer app: a retired size disappears from the picker while
      the item stays orderable, and the "from" price follows the cheapest **available** size (FR-026)

---

## Phase 6: User Story 4 — Organising the menu (P2)

**Goal**: categories and item order read the way the vendor thinks.

**Independent test**: [quickstart](./quickstart.md) scenario 9, on desktop **and** a phone.

- [ ] T036 [P] [US4] Write failing tests in `src/features/admin/sortOrder.test.js` — contiguous
      renumbering, a no-op move yields no changed rows, new items land last, `changedRows` returns
      only the affected span, empty and single-item lists are safe
- [ ] T037 [US4] Create `src/features/admin/sortOrder.js` until T036 passes
- [ ] T038 [US4] Create `src/features/admin/CategoryPanel.jsx` — create, rename, reorder, and remove
      with the guard: refused while **live** items remain, with a count; already-removed items don't
      block it (FR-030)
- [ ] T039 [US4] Implement item reordering in `MenuManagerPage.jsx`: native HTML5 drag on pointer
      devices **and** always-visible move up/down controls. The controls are the primary path on a
      phone, not a fallback (FR-029) — no drag-and-drop dependency
      ([research D7](./research.md#d7-ordering))
- [ ] T040 [US4] Persist only `changedRows` from a reorder rather than rewriting the category
- [ ] T041 [US4] Verify quickstart scenario 9 on desktop and on a phone; confirm the customer menu
      reflects both category and item order

---

## Phase 7: User Story 5 — Nothing the vendor does breaks the customer (P2)

**Goal**: verify, not build. Most of this is already true — the point is to prove it.

**Independent test**: [quickstart](./quickstart.md) scenario 7.

- [ ] T042 [US5] Verify quickstart scenario 7 — the one this plan exists to prevent: put an item in
      a customer cart, **discard** it as the vendor, then complete checkout. The order MUST still be
      recorded, with its line intact from snapshots and `menu_item_id` null, and WhatsApp MUST still
      open. Without T010 this records nothing at all
- [ ] T043 [US5] Verify the same flow for a **soft** removal and for a rename — both should already
      work via 001's snapshots; confirm rather than assume
- [ ] T044 [US5] Verify the customer menu shows a clear empty state, not an error, when every item is
      unavailable or removed (FR-033)
- [ ] T045 [US5] Verify an anonymous visitor cannot read a removed item by any route — not the menu,
      not a category, not a direct query (FR-016)

---

## Phase 8: Polish & Cross-Cutting

- [ ] T046 [P] Verify quickstart scenario 8: the **customer entry chunk** is still under 150 KB
      gzipped (132.86 KB before this feature), and `grep -rl "features/admin" dist/assets/*.js`
      matches only the lazy chunk — a stray static import silently defeats the split
- [ ] T047 [P] Verify quickstart scenario 10: `npm run lint` clean across the new admin CSS, and the
      three screens match wireframes 4c, 5b and 6a
- [ ] T048 [P] Update `README.md`: the admin area, magic-link sign-in, the `admins` allow-list, and
      that `supabase/seed.sql` is now replaceable by the vendor
- [ ] T049 [P] Update `.specify/memory/constitution.md` if the admin route changes how Principle IV
      is measured — the budget is the customer route, and this feature is the first to add a second
- [ ] T050 Run the full gate: `npm run lint`, `npm run test`, `npm run build`,
      `npm run verify:permissions`

---

## Dependencies

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational) ── BLOCKS EVERYTHING; security-critical
          │   T003-T008 predicate + config  ──> must precede any sign-in UI
          │   T009 soft removal             ──> needed by US2
          │   T010-T011 001 repair          ──> needed by US5, and by US2's discard
          │   T012-T013 boundary proof
          │
          ├─> Phase 3 (US1) ─── MVP: the vendor runs their own menu
          │      ├─> Phase 4 (US2) — drawer + photos + removal
          │      │      ├─> Phase 5 (US3) — sizes live in the same drawer
          │      │      └─> Phase 7 (US5) — needs discard (US2) to exist to test it
          │      └─> Phase 6 (US4) — ordering, needs the manager list from US1
          └─> Phase 8 (Polish)
```

**Story independence**: US3 and US4 are independent of each other and can run in parallel once US2
and US1 respectively are done. US5 is verification and needs US2's discard to exist.

## Parallel opportunities

- **T014, T021, T022, T036** are the four test-first tasks, in four different files — write them
  concurrently.
- **T024** (`storagePaths.js`) is independent of the image work and can proceed alongside T023.
- **T046, T047, T048, T049** touch different files entirely.
- Within Phase 2, **T003–T005 edit the same migration file** and are deliberately not `[P]`.
- **T007** is dashboard configuration and can be done while T003–T005 are being written — but must
  land before T008.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That is the whole business case: the vendor stops needing a
developer to change a price or mark something sold out. Ship it, then grow the catalogue tools.

Phase 2 is disproportionately large for a "foundational" phase, and that is correct — it contains a
security repair, a cross-feature bug fix and three project settings that no migration can express.
None of it is optional and none of it can follow the UI.

Phase 7 builds almost nothing. Resist the urge to skip it: it is the only phase that proves an admin
mistake cannot cost a customer their order, which is the promise Principle II makes.

## Task count

| Phase | Tasks | Story |
|---|---|---|
| 1 Setup | T001–T002 | — |
| 2 Foundational | T003–T013 | — |
| 3 Correct the live menu | T014–T020 | US1 (P1) |
| 4 Add an item with a photo | T021–T030 | US2 (P1) |
| 5 Sizes | T031–T035 | US3 (P2) |
| 6 Organising | T036–T041 | US4 (P2) |
| 7 Nothing breaks | T042–T045 | US5 (P2) |
| 8 Polish | T046–T050 | — |
| **Total** | **50** | |
