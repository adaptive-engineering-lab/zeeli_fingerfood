---

description: "Task list for Guest Order Persistence"
---

# Tasks: Guest Order Persistence

**Input**: Design documents from `/specs/001-guest-order-persistence/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/place-order.md](./contracts/place-order.md),
[quickstart.md](./quickstart.md)

**Tests**: Test tasks **are** included. Constitution Principle I makes them non-negotiable for
decidable logic, which the payload mapping is. They are written before the implementation they
cover, not after.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

All source paths are relative to **`project assets/zeeli-fingerfoods/`** (the Vite app). Spec paths
are relative to the repository root.

---

## Phase 1: Setup

**Purpose**: places for the two new artifacts to live

- [x] T001 Create the migrations directory `supabase/migrations/` (the project has no in-repo
      migration history — schema was applied out of band, so this is also the start of that record)
- [x] T002 [P] Add `"verify:permissions": "node scripts/verify-order-permissions.mjs"` to the
      `scripts` block of `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the database function every user story depends on. **No user story can be completed
until this phase is done and applied.**

⚠️ T004 is a destructive, security-relevant change. Read
[data-model.md](./data-model.md#permission-matrix) before writing it.

- [x] T003 Write `public.place_order` in `supabase/migrations/20260810__place_order_rpc.sql`, exactly
      to the signature and behaviour in
      [contracts/place-order.md](./contracts/place-order.md#1-database-function--publicplace_order):
      `SECURITY DEFINER`, `set search_path = public, pg_temp`, one transaction, inserts the order
      then its lines, returns the stored `short_ref`
- [x] T004 In the same migration: `revoke all on function public.place_order(...) from public`,
      `grant execute` to `anon` and `authenticated`, and **drop** the now-redundant
      `public can insert orders` and `public can insert order_items` policies so the function is the
      only write path
- [x] T005 In the same migration, implement the validation rules from
      [data-model.md](./data-model.md#validation-rules) inside the function: reject an empty line
      list, blank name or phone, and delivery without an address; force `status = 'new'`; null the
      address for pickup; derive `line_total` and `subtotal` server-side
- [x] T006 In the same migration, wrap the order insert in a bounded retry (5 attempts) that
      regenerates `short_ref` on `unique_violation` against `orders_short_ref_key` (FR-014)
- [x] T007 Apply the migration to the Supabase project `rhkioufbffisvpfwavly` and confirm the
      function exists and the two insert policies are gone

**Checkpoint**: `place_order` callable; direct customer inserts rejected.

---

## Phase 3: User Story 1 — The vendor receives every order that was sent (P1) 🎯 MVP

**Goal**: a completed checkout lands in the vendor's records, matching the WhatsApp message exactly.

**Independent test**: place an order as an anonymous customer; the order and all its lines are
present and match what the customer was shown — [quickstart.md](./quickstart.md) scenario 3.

### Tests first (Principle I)

- [x] T008 [P] [US1] Write the failing tests in `src/features/checkout/orderPayload.test.js` covering
      all seven cases in
      [contracts/place-order.md](./contracts/place-order.md#test-cases-the-implementation-must-satisfy):
      uuid passthrough, sample-menu id → null, variant fields, zero-quantity line dropped,
      all-zero cart → null payload, pickup nulls the address, blank note → null

### Implementation

- [x] T009 [US1] Create `src/features/checkout/orderPayload.js` exporting `isUuid`, `toOrderLines`
      and `toOrderPayload` per the contract — pure, no React, no Supabase — until T008 passes
- [x] T010 [US1] Rewrite `src/features/checkout/submitOrder.js` to build the payload via
      `toOrderPayload` and call `supabase.rpc('place_order', payload)`, returning
      `{ persisted, shortRef, error? }`; delete the `.insert(...).select('id').single()` path that
      caused the original failure
- [x] T011 [US1] In `src/features/checkout/CheckoutPage.jsx`, await `submitOrder` **before**
      `buildOrderMessage`, and build the message with the `shortRef` it returns (FR-015)
- [x] T012 [US1] Verify [quickstart.md](./quickstart.md) scenario 3 in a browser: a three-line
      delivery order with a variant and a note, then the same as pickup — every stored field matches
      the WhatsApp message, `status = 'new'`, subtotal equals the sum of line totals

**Checkpoint**: orders persist. This alone is a shippable increment.

---

## Phase 4: User Story 2 — A recording failure never costs the customer their order (P1)

**Goal**: preserve today's behaviour exactly. This is a regression guard, not a new capability.

**Independent test**: force recording to fail; WhatsApp still opens with the correct message —
[quickstart.md](./quickstart.md) scenario 5.

- [x] T013 [P] [US2] Add tests to `src/features/checkout/orderPayload.test.js` asserting
      `toOrderPayload` returns `null` for an empty or all-zero-quantity cart, so the caller can skip
      the round trip rather than sending an invalid call
- [x] T014 [US2] Confirm `src/features/checkout/submitOrder.js` catches **every** throw — including
      a null payload and an unconfigured client — and returns `{ persisted: false, shortRef }` using
      the locally generated reference. It must never throw (FR-010)
- [x] T015 [US2] Confirm `src/features/checkout/CheckoutPage.jsx` still opens WhatsApp and still
      shows the popup-blocked fallback panel when `persisted` is false, and that
      `src/features/checkout/OrderSentPage.jsx` shows its "couldn't save a copy" line only then
- [x] T016 [US2] Verify [quickstart.md](./quickstart.md) scenario 5 in a browser with the Supabase
      URL pointed at an unreachable host: correct message, confirmation screen reached, no unhandled
      rejection in the console

**Checkpoint**: Principle II holds — the degraded path is exercised, not assumed.

---

## Phase 5: User Story 3 — An order is recorded whole or not at all (P2)

**Goal**: no order without its lines, no lines without their order.

**Independent test**: force the line insert to fail; no empty order is visible —
[quickstart.md](./quickstart.md) scenario 4.

- [x] T017 [US3] Verify [quickstart.md](./quickstart.md) scenario 4 by sending a line whose
      `menu_item_id` is a uuid absent from `menu_items`: the FK rejects it, and
      `select count(*) from orders where short_ref = '<ref>'` returns 0
- [x] T018 [US3] Confirm the same run still satisfies US2 — the customer reached WhatsApp with the
      complete message despite nothing being recorded

**Checkpoint**: atomicity holds by construction (one function body, one transaction).

---

## Phase 6: User Story 4 — Customer details stay private (P2)

**Goal**: prove the boundary rather than assume it. No in-process test can do this.

**Independent test**: [quickstart.md](./quickstart.md) scenario 2 — 9 assertions, all passing.

- [x] T019 [US4] Create `scripts/verify-order-permissions.mjs`: build a Supabase client from the
      publishable key in `.env` and assert all 9 attempts in
      [quickstart.md](./quickstart.md#scenario-2--the-permission-boundary-with-a-real-public-key-sc-004-fr-016)
      — `place_order` succeeds, reads return 0 rows, direct inserts/updates/deletes are rejected,
      and an empty line list is rejected. Exit non-zero on any failure
- [x] T020 [US4] Tag every row the script writes with a `ZF-PROBE` reference prefix so the vendor can
      clean up, and document the cleanup statement at the top of the script
- [x] T021 [US4] Run `npm run verify:permissions` against the live project and confirm 9/9, then
      clean up the probe rows as the vendor

**Checkpoint**: the privacy boundary is verified with the same credential a visitor's browser holds
(FR-016) — and this script is the only artifact that will go red if someone later adds a read policy
to `orders`.

---

## Phase 7: Polish & Cross-Cutting

- [x] T022 [P] Verify [quickstart.md](./quickstart.md) scenario 6: throttled to Fast 3G, recording
      adds ≤1s at p95 to the tap→WhatsApp interval (SC-006)
- [x] T023 [P] Verify [quickstart.md](./quickstart.md) scenario 7: no duplicate `short_ref` values,
      and calling `place_order` twice with the same proposed reference returns a different one the
      second time
- [x] T024 [P] Update `README.md`: replace the "RLS on `orders`" entry under *Still needed* with what
      actually shipped — the `place_order` function as the sole write path, and
      `npm run verify:permissions`
- [x] T025 Run the constitution's quality gate — `npm run lint`, `npm run test`, `npm run build` —
      all green, gzipped JS still under 150 KB (Principle IV)

---

## Dependencies

```text
Phase 1 (Setup)
   └─> Phase 2 (Foundational: the function) ── BLOCKS EVERYTHING
          ├─> Phase 3 (US1) ─── MVP, delivers the feature's value alone
          │      └─> Phase 4 (US2) — needs US1's rewritten submitOrder to guard
          │             └─> Phase 5 (US3) — needs the full path to force a partial failure
          ├─> Phase 6 (US4) — independent of US1-US3; only needs the function to exist
          └─> Phase 7 (Polish) — after the stories it verifies
```

**Story independence**: US4 can be built and run the moment Phase 2 lands, in parallel with US1.
US2 and US3 are regression guards over US1's code path and follow it.

## Parallel opportunities

- **T002** runs alongside all of Phase 2 (different file).
- **T008** (tests) and **T019** (verification script) touch different files and can be written
  concurrently by different people.
- **T022, T023, T024** are independent of each other.
- Within Phase 2, T003–T006 all edit the **same migration file** — deliberately *not* marked `[P]`.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That is the whole business value: orders reach the vendor.
Ship it, then add the guards.

Phases 4 and 5 protect behaviour that already works today; skipping them risks silently trading a
working WhatsApp handoff for a saved record, which is a net loss. Phase 6 is the one that will still
be earning its keep in a year.

## Task count

| Phase | Tasks | Story |
|---|---|---|
| 1 Setup | T001–T002 | — |
| 2 Foundational | T003–T007 | — |
| 3 Order recorded | T008–T012 | US1 (P1) |
| 4 Failure never costs the order | T013–T016 | US2 (P1) |
| 5 Whole or nothing | T017–T018 | US3 (P2) |
| 6 Details stay private | T019–T021 | US4 (P2) |
| 7 Polish | T022–T025 | — |
| **Total** | **25** | |
