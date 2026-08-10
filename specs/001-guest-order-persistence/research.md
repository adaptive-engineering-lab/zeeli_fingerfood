# Phase 0 Research: Guest Order Persistence

All findings below were established against the live project (`rhkioufbffisvpfwavly`) rather than
inferred. Probes that would have written data were wrapped in a block that always raises, so nothing
was committed.

## Finding 0: the reported cause was wrong

**Claim under test**: "the public insert policy on `orders` and `order_items` still needs to be
applied."

**What is actually there**:

| Table | Policy | Type | Command | Roles | `WITH CHECK` |
|---|---|---|---|---|---|
| `orders` | public can insert orders | PERMISSIVE | INSERT | public | `true` |
| `orders` | admin can read orders | PERMISSIVE | SELECT | public | — |
| `orders` | admin can update orders | PERMISSIVE | UPDATE | public | `auth.role() = 'authenticated'` |
| `order_items` | public can insert order_items | PERMISSIVE | INSERT | public | `true` |
| `order_items` | admin can read order_items | PERMISSIVE | SELECT | public | — |

The insert permission exists and is unconditional. All policies are PERMISSIVE, so nothing is
`AND`-ing them down.

**The actual cause**, isolated by running the same insert twice as `anon`:

| Probe | Result |
|---|---|
| `INSERT INTO orders (...) VALUES (...) RETURNING id` | `42501 new row violates row-level security policy for table "orders"` |
| `INSERT INTO orders (...) VALUES (...)` — no `RETURNING` | **succeeds** |

Postgres applies `SELECT` policies to rows produced by a `RETURNING` clause. The customer has insert
permission and deliberately no read permission, so the `RETURNING` is refused and the statement is
rolled back in full. `submitOrder.js` calls `.insert(...).select('id').single()` to learn the new
order's id so it can attach the line items.

**Consequence for scope**: the permission model is correct and must not be relaxed. The read-back is
the defect. Any design that ends with the customer reading a row out of `orders` is wrong.

---

## Decision 1: how do lines attach to an order the customer cannot read?

This is the one real design question, and FR-008 (no read-back) and FR-012 (all-or-nothing) together
eliminate most of the answers.

### Alternatives considered

**A — Client generates the order id.** `crypto.randomUUID()` in the browser, insert the order with an
explicit `id`, then insert the lines with that same `order_id`. No `RETURNING`, so FR-008 is
satisfied in about six lines of change.

- Fails **FR-012**. Two inserts are two HTTP requests and therefore two transactions. If the second
  fails — flaky mobile connection, a rejected line, the tab closing — the vendor is left with an
  order carrying no items. That is worse than no record: the vendor would phone a customer with no
  idea what they ordered. Atomicity across two round trips is not achievable from a browser.
- Also leaves the client writing `status` and `subtotal` directly, so a crafted request can record a
  ₦0 order already marked `fulfilled`.

**B — Nested insert in one request.** PostgREST does not support writing a parent and its children in
one call; `supabase-js` has no nested-insert API. Not available.

**C — Deferred FK plus a single multi-statement request.** Would need both inserts in one
transaction, which PostgREST does not expose to clients. Not available.

**D — `SECURITY DEFINER` function as the sole write path.** One database function takes the order
fields and the lines as JSON, inserts both inside its own (single) transaction, and returns only the
order's short reference. Direct insert permission on both tables is then revoked from the customer.

- Satisfies FR-012 by construction: a function body is one transaction, so either both inserts
  commit or neither does.
- Satisfies FR-008: the customer needs no `SELECT` permission on `orders`, and never gains any.
- Satisfies SC-006 with room to spare — one round trip instead of two.
- Strengthens Principle V rather than trading against it. Today a customer can write any row that
  passes `WITH CHECK true`, including `status = 'fulfilled'` or `subtotal = 0`. After this change
  the customer cannot write the tables at all; they can only ask a function that forces
  `status = 'new'` and derives the subtotal from the lines.

### Decision

**D.** `public.place_order(...)`, `SECURITY DEFINER`, `search_path` pinned, `EXECUTE` granted to
`anon` and `authenticated` only, with the two `public can insert …` policies dropped.

**Rationale**: it is the only option that satisfies FR-012 at all, and it happens to tighten the
privilege boundary instead of loosening it. The cost is a new artifact type — a database function —
which is recorded in the plan's Complexity Tracking.

**Cost accepted**: PL/pgSQL cannot be unit-tested by Vitest. Mitigated by keeping all *decidable*
logic (uuid detection, line mapping, money rounding) in a pure JS module that is unit-tested
test-first, and leaving the function with only what must be transactional. The function's behaviour
is covered by the verification script in [quickstart.md](./quickstart.md).

---

## Decision 2: which short reference ends up in the WhatsApp message?

`orders.short_ref` carries a `UNIQUE` constraint (`orders_short_ref_key`) — discovered while reading
the schema, and it contradicts an assumption in the spec (see *Spec corrections* below).

The client generates a reference (`ZF-XXXXX`, 5 characters from a 32-symbol alphabet) before
building the message. Two orders can therefore collide, and the `UNIQUE` constraint means the second
one **fails to record** — precisely the silent loss FR-001 exists to prevent.

**Decision**: the function accepts the client's proposed reference, and on a unique violation
regenerates and retries (bounded, 5 attempts) before giving up. It returns the reference actually
stored. The client then builds the WhatsApp message from the **returned** reference, falling back to
its locally generated one only when recording failed (in which case no stored record exists for it
to disagree with).

This reorders the checkout flow: record first, then build the message. Previously the message was
built first. The reorder costs nothing — `submitOrder` was already awaited before `window.open`.

**On FR-008**: returning `short_ref` from a `SECURITY DEFINER` function is not a read-back in the
sense FR-008 forbids. The customer gains no `SELECT` permission, cannot enumerate orders, and cannot
read any order but the one the function just created on their behalf — a value they themselves
proposed. The requirement's intent is that recording must not *depend on* read permission, and it
does not.

**Alternative rejected**: let the database default generate the reference and have the client render
whatever comes back. Cleaner, but it makes the WhatsApp message undeliverable when recording fails —
there would be no reference at all to show the customer, which breaks Principle II.

---

## Decision 3: what the function validates, and what it refuses

**Decision**: the function rejects a call outright when it would produce a record the vendor cannot
act on — empty line list, blank customer name or phone, a delivery order with no address, a
non-positive quantity, or a negative price. It forces `status = 'new'` and computes `subtotal` as the
sum of `round(unit_price × quantity, 2)`.

**Rationale**: these are the conditions under which a recorded order is actively misleading rather
than merely incomplete. `order_items` already carries `CHECK (quantity > 0)`, so quantity is belt
and braces. Deriving the subtotal server-side removes an entire class of client/record disagreement
and costs nothing, because it is computed from the same numbers the message is built from.

**Explicitly not validated**: line prices are **not** checked against the catalogue. FR-013 requires
orders placed from the sample menu — whose items are not in the catalogue at all — to be recorded,
so there is nothing to check them against. A customer could therefore record a forged price. The
impact is bounded: payment is arranged manually in WhatsApp against the message the vendor can read,
so a forged record misleads nobody into shipping goods. Revisit if in-app payment ever lands.

---

## Decision 4: how the permission boundary gets verified

FR-016 requires verification with the same public credential a visitor's browser holds. No in-process
Vitest run can prove this: the boundary lives in Postgres, and a mocked client proves only that the
mock behaves.

**Decision**: a small Node script, `scripts/verify-order-permissions.mjs`, run on demand against the
live project with the publishable key, asserting all eight of SC-004's attempts plus a successful
`place_order` call.

**Rationale**: it is the only artifact that can fail for the right reason. If someone later re-adds a
permissive read policy on `orders`, this script goes red and nothing else in the project does.

**Cost accepted**: it writes real probe rows, and the customer role cannot delete them. Probe rows
are tagged with an obvious `ZF-PROBE` reference prefix and the quickstart carries the admin cleanup
statement. Running it against a Supabase branch instead is the better long-term answer and is noted
as a follow-up rather than built now.

---

## Spec corrections required

Found while reading the live schema; both are recorded here and applied to `spec.md` so the artifacts
do not disagree.

1. **FR-014 rested on a false premise.** It said orders "MUST be distinguishable … even if two orders
   share a customer-facing reference". `orders.short_ref` is `UNIQUE`, so two orders *cannot* share
   one — the second is rejected. The requirement is restated as: references are unique, and a
   collision at recording time MUST be resolved rather than costing the customer their record.
2. **The edge case "two orders generate the same reference"** is reworded to match — the system
   resolves the collision instead of relying on the vendor to tell them apart.

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Why does a correctly-policied insert fail? | `RETURNING` triggers `SELECT` policy evaluation — Finding 0 |
| How can lines attach without a read-back? | `SECURITY DEFINER` function, one transaction — Decision 1 |
| Can the sample menu's non-uuid ids be recorded? | Yes — `menu_item_id` and `variant_id` are both nullable with `ON DELETE SET NULL`; the client nulls any non-uuid id — Decision 3 |
| Which reference reaches the customer? | The one the function returns — Decision 2 |
| How is the boundary proven? | Anon-key script, run on demand — Decision 4 |
