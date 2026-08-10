# Implementation Plan: Guest Order Persistence

**Branch**: `main` (no feature branch) | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-guest-order-persistence/spec.md`

## Summary

A guest checkout must record its order and all of its lines, atomically, without the customer ever
gaining read access to the orders store — and without ever costing the customer their WhatsApp
handoff if recording fails.

The existing insert permissions are already correct. The break is that the client asks for the new
order's identifier back so it can attach the line items, and Postgres applies `SELECT` policies to
`RETURNING` rows; the customer has no read permission by design, so the whole statement is rejected
and nothing is recorded.

**Approach**: replace the client's two-step "insert order → read its id → insert lines" with a single
`SECURITY DEFINER` database function, `public.place_order(...)`, that performs both inserts in one
transaction and returns only the order's short reference. The customer's direct insert permission on
both tables is then **revoked** — the function becomes the only write path, which is strictly less
privilege than today, not more. The client's WhatsApp fallback is untouched; the recording call
simply moves ahead of message construction so the stored reference and the sent reference are always
the same string.

## Technical Context

**Language/Version**: JavaScript (ES2022, ESM), React 19, PL/pgSQL for the database function

**Primary Dependencies**: `@supabase/supabase-js` ^2.112 (already present); no new client dependencies

**Storage**: Supabase Postgres, project `rhkioufbffisvpfwavly` (eu-west-1) — tables `orders`,
`order_items`, enums `fulfillment_type`, `order_status`

**Testing**: Vitest for the pure payload builder (test-first, per Principle I); a Node verification
script run against the live project with the public key for the permission boundary, which no
in-process test can prove

**Target Platform**: mobile web browsers (primary), desktop browsers (secondary)

**Project Type**: single-page web application over managed Postgres — app lives at
`project assets/zeeli-fingerfoods/`

**Performance Goals**: recording adds ≤1s at p95 to the tap→WhatsApp interval (SC-006); the change
reduces the customer-path round trips from 2 to 1

**Constraints**: customer bundle stays under 150 KB gzipped (Principle IV — currently 132.76 KB, and
this feature adds no client dependency); the customer must hold **no** read, update or delete
permission on order data (Principle V, FR-007); an order is visible whole or not at all (FR-012)

**Scale/Scope**: single vendor, single admin, low order volume (tens per day); 2 tables, 1 new
database function, 1 new pure client module, 2 modified client modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates derived from [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.0.

| # | Principle | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|---|
| I | Test-First for Decidable Logic | Payload mapping (uuid detection, line mapping, money rounding) is pure, lives outside React and Supabase, and gets failing Vitest tests before implementation | ✅ PASS | ✅ PASS — `src/features/checkout/orderPayload.js` is pure; contract in [contracts/place-order.md](./contracts/place-order.md) fixes its expected output before code exists |
| II | The Order Always Reaches the Vendor | Recording failure must not block the WhatsApp handoff, and the degraded path must be exercised | ✅ PASS | ✅ PASS — `submitOrder` still swallows every error and returns `{persisted:false}`; the reference used in the message falls back to the locally generated one. Verified by quickstart scenario 5 |
| III | Design System Fidelity | No token violations; no hand-edits to `modernist.css` | ✅ PASS — no visual change in scope | ✅ PASS — the only UI-adjacent change is which string fills an existing confirmation line |
| IV | Mobile-First Performance Budget | Customer bundle stays under 150 KB gzipped | ✅ PASS | ✅ PASS — no new dependency; one fewer network round trip on the checkout path |
| V | Least-Privilege Data | RLS policied on every table; customer insert-only; no read, update or delete | ✅ PASS | ✅ **STRENGTHENED** — direct insert permission is revoked and replaced by a single audited function that forces `status='new'` and derives the subtotal server-side. The customer can no longer craft arbitrary order rows |

**Result**: no violations. One addition is recorded in Complexity Tracking because it introduces an
artifact type the project did not previously have.

## Project Structure

### Documentation (this feature)

```text
specs/001-guest-order-persistence/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — the atomicity/read-back decision
├── data-model.md        # Phase 1 output — entities, constraints, permission matrix
├── quickstart.md        # Phase 1 output — how to verify this actually works
├── contracts/
│   └── place-order.md   # Phase 1 output — the RPC contract and the client payload contract
└── checklists/
    └── requirements.md  # Spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
project assets/zeeli-fingerfoods/
├── supabase/
│   └── migrations/
│       └── 20260810__place_order_rpc.sql   # NEW — function, grants, policy revocation
├── scripts/
│   └── verify-order-permissions.mjs        # NEW — anon-key boundary verification (FR-016, SC-004)
└── src/
    ├── features/
    │   ├── cart/
    │   │   └── cartMath.js                 # unchanged — reused for line totals
    │   └── checkout/
    │       ├── orderPayload.js             # NEW — pure cart-lines → RPC payload mapping
    │       ├── orderPayload.test.js        # NEW — written first (Principle I)
    │       ├── submitOrder.js              # MODIFIED — single rpc() call, returns shortRef
    │       ├── CheckoutPage.jsx            # MODIFIED — record before building the message
    │       ├── whatsapp.js                 # unchanged
    │       └── OrderSentPage.jsx           # unchanged
    └── lib/
        └── supabaseClient.js               # unchanged
```

**Structure Decision**: the app is a single Vite SPA at `project assets/zeeli-fingerfoods/`, already
organised by feature folder (`src/features/{menu,cart,checkout}`) with pure logic separated from
components. This feature adds one pure module beside the existing `whatsapp.js` and `cartMath.js`,
following the same pattern. Two new top-level directories appear in the app: `supabase/migrations/`
(the project has no migration history in-repo today — schema was applied out of band, so this
migration is also the start of that record) and `scripts/` for the verification runner.

## Complexity Tracking

> Filled because the design adds an artifact type the project did not previously have. The
> Constitution Check itself records no violations.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A `SECURITY DEFINER` database function as the sole order write path | FR-012 requires an order to be visible whole or not at all. Two client inserts are two HTTP requests and therefore two transactions; a failure between them leaves an order with no lines, which is worse for the vendor than no order at all | **Client-generated order id, two inserts** (the obvious minimal fix) removes the read-back and would satisfy FR-008 in about six lines — but it cannot satisfy FR-012 at any price, because atomicity across two round trips is not achievable from a browser. It also leaves the client free to write `status`, `subtotal` and arbitrary line prices directly. Full comparison in [research.md](./research.md) |
| A migrations directory in a project whose schema was applied out of band | The permission change is destructive (it revokes existing policies) and must be reviewable and repeatable | Applying the change straight through the dashboard or MCP leaves no reviewable record of a security-relevant change, and no way to reproduce the project from scratch |
