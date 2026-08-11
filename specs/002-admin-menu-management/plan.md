# Implementation Plan: Admin Authentication & Menu Management

**Branch**: `main` (no feature branch) | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-admin-menu-management/spec.md`

## Summary

Give the vendor a signed-in admin area where they manage the live catalogue themselves: magic-link
sign-in, item and category CRUD, size tiers, availability, drag ordering, phone photos, and a
reversible removal.

Three things found while reading the live project set the shape of this plan, and the first is
urgent:

1. **"Authenticated" currently means "admin" everywhere.** All nine policies across `categories`,
   `menu_items`, `menu_item_variants`, `orders`, `order_items` and the `menu-images` bucket test
   `auth.role() = 'authenticated'`. There are **0 users today**, so this has never been reachable.
   The moment sign-in ships it becomes a privilege-escalation path: anyone who obtains any
   authenticated session gets full catalogue write **and read access to every customer's name,
   phone and address**. This plan replaces that predicate before it builds a door.
2. **Discarding an item can break a customer's checkout.** `place_order` inserts
   `order_items.menu_item_id` against a live FK. If a customer holds an item in their cart and the
   vendor permanently discards it, the insert fails and the whole order goes unrecorded — violating
   FR-031 and Principle II. Feature 001 needs a small defensive change.
3. **Most of user story 5 is already satisfied.** Cart lines carry their own name, price and variant
   label; order lines snapshot them; the catalogue FKs are nullable with `ON DELETE SET NULL`.
   Editing, renaming, repricing and *removing* an item mid-cart already works. Only *discard* breaks
   it (finding 2). This is verification work, not construction.

**Approach**: a lazy-loaded `/admin` route group so none of it reaches the customer bundle, a real
admin predicate in Postgres, `removed_at` for reversible removal, and photo reduction on-device with
no new dependency.

## Technical Context

**Language/Version**: JavaScript (ES2022, ESM), React 19, PL/pgSQL for policy predicates

**Primary Dependencies**: `@supabase/supabase-js` ^2.112 and `react-router-dom` ^7.18 — both already
present. **No new runtime dependency**: image reduction uses `createImageBitmap` + `<canvas>`, and
reordering uses native HTML5 drag events plus explicit move controls

**Storage**: Supabase Postgres (`categories`, `menu_items`, `menu_item_variants`) and Supabase
Storage bucket `menu-images` (already exists, public read)

**Authentication**: Supabase Auth magic link (`signInWithOtp`), self-signup disabled, OTP validity
reduced to 15 minutes, session persisted and auto-refreshed by the client library

**Testing**: Vitest for pure modules (validation, ordering, image sizing, storage paths) written
test-first per Principle I; a Node script against the live project for the permission boundary,
extending the pattern 001 established

**Target Platform**: mobile web first for the customer, mobile-capable for admin (PRD §8 allows a
less optimised admin, but the vendor manages the menu from a phone)

**Project Type**: single-page web application over managed Postgres — `project assets/zeeli-fingerfoods/`

**Performance Goals**: SC-001 add an item in under 60s; SC-006 photos load under 2s on 4G; SC-010 at
most one sign-in link per week of daily use

**Constraints**: the **customer** route stays under 150 KB gzipped (Principle IV — currently
132.86 KB, leaving ~17 KB), so every admin module must be lazy-loaded and no admin dependency may
land in the customer chunk; the anonymous public keeps read access to available, non-removed items
only

**Scale/Scope**: two admins (owner + developer, identical privileges), tens of items, low write volume. 3 new tables/columns, 1 new pure module
group, ~8 new components, 2 migrations, 1 change to feature 001

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates from [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.1.

| # | Principle | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|---|
| I | Test-First for Decidable Logic | Item validation, sort-order computation, image target sizing and storage-path derivation are pure and get failing tests first | ✅ PASS | ✅ PASS — four pure modules specified in [contracts/](./contracts/), each with its cases fixed before code |
| II | The Order Always Reaches the Vendor | No admin action may stop a customer ordering | ⚠️ **AT RISK** — discard breaks the `place_order` FK insert | ✅ PASS — resolved by nulling unknown catalogue ids in `place_order` (research D9); verified by quickstart scenario 7 |
| III | Design System Fidelity | Follow the wireframes and Modernist; `npm run lint` enforces tokens across the new admin CSS | ✅ PASS | ✅ PASS — options 4c / 5b / 6a chosen with reasons in research D1 |
| IV | Mobile-First Performance Budget | **Three** clauses: 150 KB gzipped customer JS; Lighthouse mobile ≥ 90 and FCP < 1.5s on 4G; **photographs served responsively and lazy-loaded** | ⚠️ **AT RISK** — an admin area could easily add 30 KB+, and vendor uploads replace curated seed images on the customer path | ✅ PASS — admin lazy-loaded, zero new runtime dependencies; **two stored derivatives + responsive serving** (research D5, FR-035/FR-036); quickstart scenario 8 measures the customer chunk, Lighthouse and FCP, not just bytes |
| V | Least-Privilege Data | RLS policied; only the admin writes catalogue data | ❌ **FAIL as it stands** — `auth.role() = 'authenticated'` grants any signed-in user full admin, including reading all customer PII | ✅ PASS — replaced by an `admins` allow-list predicate; self-signup disabled; verified by an extended permissions script |

**Result**: two gates were at risk and one failed on entry. All three are resolved by design rather
than waived — see Complexity Tracking for the two additions that cost.

**Correction (2026-08-11, post-analysis)**: the Principle IV row above originally read only the
150 KB clause and was marked PASS without assessing the principle's other two. That was a gate
marked green on a third of its content. Re-evaluated in full: the photograph clause drove the
two-derivative decision in research D5, and the Lighthouse/FCP thresholds are now measured in
quickstart scenario 8 rather than assumed. This feature is the first to put vendor-supplied images
on the customer path, so those numbers can genuinely move.

## Project Structure

### Documentation (this feature)

```text
specs/002-admin-menu-management/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — the ten decisions
├── data-model.md        # Phase 1 — schema deltas, permission matrix, state
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   ├── admin-auth.md    # Sign-in contract and the admin predicate
│   └── catalogue.md     # Pure module contracts + write operations
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
project assets/zeeli-fingerfoods/
├── supabase/migrations/
│   ├── 20260811a__admin_identity.sql      # NEW — admins table, repoint all 9 policies
│   ├── 20260811b__soft_removal.sql        # NEW — removed_at, public read excludes removed
│   └── 20260811c__place_order_fk_guard.sql# NEW — 001 fix: null unknown catalogue ids
├── scripts/
│   └── verify-order-permissions.mjs       # EXTENDED — admin-vs-authenticated assertions
└── src/
    ├── features/
    │   ├── admin/                          # NEW — entire tree lazy-loaded
    │   │   ├── AdminApp.jsx                #   route group + auth gate
    │   │   ├── SignInPage.jsx              #   wireframe 4c
    │   │   ├── MenuManagerPage.jsx         #   wireframe 5b
    │   │   ├── ItemDrawer.jsx              #   wireframe 6a
    │   │   ├── CategoryPanel.jsx
    │   │   ├── RemovedItemsPanel.jsx
    │   │   ├── useAdminSession.js
    │   │   ├── itemValidation.js           #   PURE — tests first
    │   │   ├── sortOrder.js                #   PURE — tests first
    │   │   ├── imageResize.js              #   PURE sizing math + a thin canvas wrapper
    │   │   └── storagePaths.js             #   PURE — tests first
    │   ├── menu/useMenu.js                 # MODIFIED — exclude removed items
    │   └── checkout/                       # unchanged
    └── App.jsx                             # MODIFIED — lazy /admin routes
```

**Structure Decision**: everything admin lives under `src/features/admin/` so the lazy boundary is a
single directory and it is obvious at a glance what must never be imported from customer code. Pure
logic sits beside its components in the same feature folder, matching how `checkout/` already
separates `orderPayload.js` from `CheckoutPage.jsx`.

## Complexity Tracking

> Filled for the two additions that introduce something the project did not have. The failed
> Constitution gate is repaired, not waived, so it is not listed here.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| An `admins` table as the identity predicate | Principle V and FR-007 require that only *the vendor* writes. Postgres must be able to answer "is this session the admin?" and `auth.role()` cannot — it answers "is this session signed in?" | **Hard-coding the admin's uuid** into nine policies works and needs no table, but it bakes an identity into policy text, so changing the vendor's account means a migration touching every policy. **A JWT custom claim** avoids the table but needs an auth hook and makes the predicate invisible in the schema, which is exactly where a reviewer looks. |
| A hand-rolled image reduction step | FR-020 requires reduction before upload, and Principle IV's 150 KB customer budget has ~17 KB of headroom | **An image-compression library** is 10–40 KB and would be simpler, but even lazy-loaded it is weight and supply-chain surface for something `createImageBitmap` + `canvas.toBlob` already do natively. The cost is handling browsers where those fail — hence FR-021's explicit "tell the vendor" path. |
