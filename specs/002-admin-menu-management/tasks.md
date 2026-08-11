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

> **Task IDs are append-only.** T051+ were added after the 2026-08-11 analysis pass and are placed
> in the phase where they must run, not at the end. Execution order is the phase order, not the
> numeric order. Existing references to T001–T050 stay valid.

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

- [x] T001 Create `src/features/admin/` with a placeholder `AdminApp.jsx` that renders nothing yet
- [x] T002 Wire `/admin/*` into `src/App.jsx` via `React.lazy` + `Suspense`, importing **only** from
      `features/admin/` so the split boundary is established before anything is built behind it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: put the lock on before the door exists, and repair the two defects the plan found.

**⚠️ No user story may start until this phase is applied to the target project.**

### The admin predicate (security-critical)

- [x] T003 Write `supabase/migrations/20260811a__admin_identity.sql`: `admins` table (PK `user_id`
      FK → `auth.users` ON DELETE CASCADE, `email`, `created_at`), RLS enabled with **no client
      policy**, per [data-model.md](./data-model.md#new-publicadmins)
- [x] T004 In the same migration add `public.is_admin()` — `stable security definer`,
      `search_path = public, pg_temp` — then `revoke execute from public` and grant to `anon,
      authenticated`, per [contracts/admin-auth.md](./contracts/admin-auth.md#1-publicis_admin)
- [x] T005 In the same migration repoint **all nine** policies from `auth.role() = 'authenticated'`
      to `public.is_admin()`: 3 on the catalogue tables, 2 on `orders`, 1 on `order_items`, 3 on
      `storage.objects`
- [x] T006 Apply migration `20260811a` and verify: nine policies now reference `is_admin()`, zero
      still reference `auth.role()`, and `admins` is unreadable by `anon`
- [ ] T007 In the Supabase dashboard: **disable self-signup**, set magic-link/OTP validity to
      **15 minutes**, and confirm the refresh-token lifetime outlasts **30 days** (FR-004, FR-005).
      None of these are expressible as a migration and all three are load-bearing
- [ ] T008 Create the vendor's auth user, then `insert into public.admins` selecting its id — the
      only row this feature adds

### Soft removal

- [x] T009 Write and apply `supabase/migrations/20260811b__soft_removal.sql`: add
      `menu_items.removed_at timestamptz`, a partial index on `(category_id, sort_order) where
      removed_at is null`, and narrow the public read policy to
      `is_available = true and removed_at is null` (FR-016)

### Catalogue integrity (added after analysis)

- [x] T051 Write and apply `supabase/migrations/20260811d__catalogue_constraints.sql`. Two jobs, both
      repairing gaps the analysis found between `data-model.md` and the live schema:
      **(a)** add the `check` constraints the data model claimed but which **do not exist** — name
      non-blank, price > 0 when not sized, a sized item carries no base price, size label non-blank,
      size price > 0 (FR-010, FR-023, FR-026);
      **(b)** replace the category FK's silent-orphan behaviour. `menu_items_category_id_fkey` is
      currently `ON DELETE SET NULL`, so deleting a populated category **succeeds** and leaves its
      items with no category — still available, invisible to customers, and reported as live by every
      admin view. Add a `before delete` trigger on `categories` that raises when any item with
      `removed_at is null` still references it. A trigger rather than `on delete restrict`, because
      FR-030 must still allow removing a category that holds only removed items
      ([research D12](./research.md#d12-enforcing-the-catalogue-rules-in-the-database))
- [x] T052 Write and apply `supabase/migrations/20260811e__photo_sizes.sql`: add
      `menu_items.image_card_url text` alongside the existing `image_url`, so each photo can be
      stored at two sizes (FR-035)
- [x] T060 Write and apply `supabase/migrations/20260811f__save_menu_item.sql`: the
      `save_menu_item` RPC per [contracts/catalogue.md](./contracts/catalogue.md#5-save_menu_item--the-one-write-that-cannot-be-two-calls).
      Writes the item and reconciles its sizes in one transaction, because from the browser those are
      two round trips and a failure between them leaves a sized item with **no price**, still
      available to customers. It MUST **re-check `is_admin()` in its own body** — `security definer`
      bypasses RLS, so the policies protecting these tables do not protect this function. This is the
      `place_order` lesson from 001, applied a second time. Verify the sizes reconciliation cannot
      cascade a delete into a past order's `order_items` row

### Repair to feature 001

- [x] T010 Write and apply `supabase/migrations/20260811c__place_order_fk_guard.sql`: `place_order`
      stores `null` for a `menu_item_id` or `variant_id` that no longer resolves, instead of
      raising. Without this, discarding an item that sits in a customer's cart makes their **entire
      order go unrecorded** — see [research D9](./research.md#d9-discard-vs-a-customers-in-flight-order)
- [x] T011 Confirm 001's own tests and `npm run verify:permissions` still pass unchanged after T010

### Proving the boundary

- [ ] T012 Extend `scripts/verify-order-permissions.mjs` with a second identity: a real authenticated
      session **not** in `admins`. Assert it reads 0 orders, 0 order_items, 0 `admins` rows; that
      every catalogue write, storage upload and storage delete is rejected; and that it can still
      read available items like any visitor — per
      [quickstart scenario 1](./quickstart.md#scenario-1--a-signed-in-stranger-gets-nothing-sc-005-fr-007)
- [ ] T067 Add the **positive** half to `scripts/verify-order-permissions.mjs`: with a session that
      **is** in `admins`, assert it can read orders and `order_items`, write a catalogue row, upload
      to `menu-images`, and that `is_admin()` returns true for it. Every existing assertion in T012
      is a denial, and a policy that denied *everyone* — `using (false)`, a typo in the function name,
      a failed grant — would satisfy all of them while leaving the vendor locked out of their own
      product. Both halves are needed before either means anything
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
- [ ] T059 [US1] Resolve `'admin'` vs `'not-admin'` in `useAdminSession.js` by calling
      `supabase.rpc('is_admin')`, per
      [contracts/admin-auth.md](./contracts/admin-auth.md#where-admin-vs-not-admin-comes-from).
      **Do not query `admins`** — it has no client read policy by design, so a `select` returns zero
      rows for the vendor and for a stranger alike, which would lock the vendor out of their own
      product. Fail closed: an error resolves to `'not-admin'`, never `'admin'`. Reusing the same
      function the nine policies use is what stops the UI and the database drifting apart (FR-037)
- [ ] T017 [US1] Create `src/features/admin/SignInPage.jsx` to **wireframe 4c**: one email field,
      flush left, with the "link sent" and error states inline. The response MUST read identically
      for registered and unregistered addresses (FR-003)
- [ ] T018 [US1] Build the auth gate in `src/features/admin/AdminApp.jsx`: `'not-admin'` renders the
      sign-in screen, never a management screen whose contents merely fail to load
- [ ] T019 [US1] Create `src/features/admin/MenuManagerPage.jsx` to **wireframe 5b** — category
      sidebar, item rows, inline price edit and availability toggle; 5a's row treatment at phone width
- [ ] T062 [US1] Add the sign-out control to the admin chrome, reachable from every management screen
      and at phone width, calling `useAdminSession().signOut()`. FR-001 requires signing out and US1's
      acceptance scenario 4 tests it, but no task built it: `signOut` existed in the hook's shape with
      nothing to invoke it. After signing out, no management screen is reachable and returning asks
      for a link
- [ ] T063 [US1] Filter the manager's main item list to `removed_at is null` (FR-015). The policy
      hides removed items from **customers**; the vendor's own session can read them, so without an
      explicit filter every removed item reappears in the list it was removed from — and
      `RemovedItemsPanel` (T028) becomes a duplicate view rather than the only one
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
- [ ] T064 [US2] Add the confirmation step FR-012 requires before a removal takes effect, naming the
      item. Removal is reversible, so a plain confirm is right — **not** type-to-confirm, which the
      clarification session explicitly rejected. Discard (T027) is the irreversible edge and needs a
      distinctly stronger confirmation that says the photo goes too and that this cannot be undone;
      the two MUST NOT look alike, or the vendor learns to dismiss both
- [ ] T028 [US2] Create `src/features/admin/RemovedItemsPanel.jsx` — find and restore a removed item,
      or discard it outright
- [ ] T065 [US2] Handle restoring an item whose category was removed while it was away: ask the
      vendor which category it should return to and restore it there. It MUST NOT fail with an error,
      and MUST NOT come back with no category — T051's trigger blocks removing a category holding
      *live* items, but a removed item does not block it, so this state is reachable by design rather
      than by accident (spec edge case, FR-013)
- [ ] T066 [US2] Tell the vendor plainly when a save does not land — the device is offline, the
      session lapsed mid-edit, or the write is rejected — and keep their unsaved edits on screen
      rather than clearing the form. Two spec edge cases require this and no task covered either.
      Silently discarding a half-typed item is the failure most likely to make the vendor distrust
      the tool, and FR-032's "never a partially saved item" is only half the promise: the other half
      is that the vendor knows it did not save
- [ ] T029 [US2] Update `src/features/menu/useMenu.js` to exclude `removed_at` items as defence in
      depth beside the policy, which remains the guarantee (FR-016)
- [ ] T053 [US2] Extend `imageResize.js` to produce **two** derivatives from one decode — card
      (long edge 800) and detail (1600) — and to reject non-images on **both** MIME type and a failed
      `createImageBitmap`, since a file renamed `.jpg` is only proved by the decode attempt (FR-019,
      FR-035). One stored size cannot be served responsively, which constitution Principle IV
      requires
- [ ] T054 [P] [US2] Extend `storagePaths.js` to `photoPaths()` returning card and detail paths that
      share one random stem, so a replacement releases the pair together (FR-022)
- [ ] T055 [US2] Upload both derivatives, store both URLs (`image_url`, `image_card_url`), and
      release **both** on replace and on discard
- [ ] T056 [US2] Update `src/features/menu/MenuItemCard.jsx` to serve the card derivative via
      `srcset`/`sizes` with the detail size as the large candidate, keep `loading="lazy"`, and add
      `image_card_url` to `useMenu.js`'s select list (FR-035, FR-036, SC-013)
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
- [ ] T034 [US3] Route every item save through the `save_menu_item` RPC from T060, item and sizes
      together, so the two can never disagree
      ([contracts/catalogue.md](./contracts/catalogue.md#5-save_menu_item--the-one-write-that-cannot-be-two-calls)).
      This replaces the item write from T025's drawer — there must be **one** save path, not an
      unsized one and a sized one
- [ ] T061 [US3] Verify the atomicity is real rather than assumed: switch an item to sizes-mode and
      interrupt the save (offline, or a deliberately rejected call), then confirm the item is either
      entirely unchanged or entirely saved — never priced at nothing while still available. Also
      confirm a direct `save_menu_item` call from a signed-in **non-admin** session is refused by the
      function's own `is_admin()` check (SC-007, FR-032)
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
- [ ] T057 [US5] Fix `src/features/menu/useMenu.js:85`, which calls `showSeedMenu()` when a
      **successful** read returns zero rows. Once the vendor clears the seeded catalogue to enter
      their own, customers would get the placeholder menu back — sample items at unconfirmed prices,
      orderable. Seed only when the read **failed** (unconfigured client, network error, query
      error); a successful empty read renders the empty state (FR-034, SC-014,
      [research D11](./research.md#d11-what-customers-see-when-the-catalogue-is-legitimately-empty)).
      **Must precede T044**, which otherwise fails
- [ ] T044 [US5] Verify the customer menu shows a clear empty state, not an error, when every item is
      unavailable or removed (FR-033) — and specifically **not** the sample menu (SC-014)
- [ ] T045 [US5] Verify an anonymous visitor cannot read a removed item by any route — not the menu,
      not a category, not a direct query (FR-016)

---

## Phase 8: Polish & Cross-Cutting

- [ ] T046 [P] Verify quickstart scenario 8: the **customer entry chunk** is still under 150 KB
      gzipped (132.86 KB before this feature), and `grep -rl "features/admin" dist/assets/*.js`
      matches only the lazy chunk — a stray static import silently defeats the split
- [ ] T058 [P] Verify the **other two** clauses of constitution Principle IV, which T046 does not
      cover: run Lighthouse mobile (≥ 90) and record FCP on 4G (< 1.5s), and confirm from the network
      panel that a phone downloads the **card** derivative rather than the detail one (SC-013). This
      feature is the first to put vendor-supplied images on the customer path, so all three numbers
      can move
- [ ] T047 [P] Verify quickstart scenario 10: `npm run lint` clean across the new admin CSS, and the
      three screens match wireframes 4c, 5b and 6a
- [ ] T048 [P] Update `README.md`: the admin area, magic-link sign-in, the `admins` allow-list, and
      that `supabase/seed.sql` is now replaceable by the vendor
- [ ] T050 Run the full gate: `npm run lint`, `npm run test`, `npm run build`,
      `npm run verify:permissions`

> **T049 was removed on 2026-08-11.** It asked this feature to amend
> `.specify/memory/constitution.md` if the admin route changed how Principle IV is measured. It does
> change it — that is finding C1, closed by T052–T056 and T058 — but a feature's task list is the
> wrong instrument. The constitution has its own amendment procedure and a version history, and a
> task that quietly edits it during implementation bypasses both. If measuring the budget across two
> routes still looks wrong once this feature has shipped and the numbers are real, that is an
> amendment proposal with evidence, not a checkbox. The ID is not reused.

---

## Dependencies

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational) ── BLOCKS EVERYTHING; security-critical
          │   T003-T008 predicate + config  ──> must precede any sign-in UI
          │   T009 soft removal             ──> needed by US2
          │   T010-T011 001 repair          ──> needed by US5, and by US2's discard
          │   T012-T013, T067 boundary proof — denials AND the positive case
          │   T051-T052, T060 schema        ──> constraints, photo sizes, atomic save
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
- **T046, T047, T048, T058** touch different files entirely.
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
| 2 Foundational | T003–T013, **T051–T052, T060, T067** | — |
| 3 Correct the live menu | T014–T020, **T059, T062, T063** | US1 (P1) |
| 4 Add an item with a photo | T021–T030, **T053–T056, T064–T066** | US2 (P1) |
| 5 Sizes | T031–T035, **T061** | US3 (P2) |
| 6 Organising | T036–T041 | US4 (P2) |
| 7 Nothing breaks | T042–T045, **T057** | US5 (P2) |
| 8 Polish | T046–T048, T050, **T058** | — |
| **Total** | **66** | (T049 withdrawn; ID not reused) |

### Added after the 2026-08-11 analysis

| Task | Closes | Why it was missing |
|---|---|---|
| T051 | G1 | `data-model.md` claimed five `check` constraints; the live schema has **zero**, and the category FK silently orphans items instead of blocking |
| T052 | C1 | Nowhere to store a second photo URL |
| T053, T054, T055, T056 | C1, G3 | One stored size cannot be served responsively — a Principle IV clause the gate never assessed |
| T057 | I1 | The seed fallback fires on a successful empty read, so clearing the seeded menu would show customers the seeded menu |
| T058 | C4 | Principle IV has three thresholds; only the byte count was being measured |

### Added in the second remediation pass, same day

| Task | Closes | Why it was missing |
|---|---|---|
| T060, T034, T061 | U1 | The contract promised item and sizes "in the same save"; from the browser that is two round trips with no transaction, and a failure between them leaves a sized item priced at nothing while still available |
| T059 | U2 | `useAdminSession` had a `'not-admin'` state with no way to reach it — `admins` is deliberately unreadable, so querying it returns zero rows for the vendor too |
| T062 | G2 | FR-001 and US1 scenario 4 require signing out; `signOut` existed in the hook's shape with no UI to call it |
| T063 | G6 | The policy hides removed items from customers, not from the vendor's own session — the manager list needed its own filter (FR-015) |
| T064 | G5 | FR-012 requires confirmation before removal, and removal and discard needed visibly different weights |
| T065 | G4 | Restoring into a removed category is reachable by design, since removed items don't block a category removal |
| T066 | G7 | Two spec edge cases — offline mid-save, session lapsed with unsaved edits — had no task |
| T067 | G8 | Every permission assertion was a denial; a policy denying *everyone* would have passed all of them |
| — | C2 | T049 withdrawn: a task list is the wrong instrument for a constitutional amendment |
