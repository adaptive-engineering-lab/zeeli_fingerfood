# Phase 1 Data Model: Guest Order Persistence

The tables already exist. This document records what is there, what changes, and — most importantly
— who is allowed to do what. Column facts were read from the live project, not assumed.

## Entities

### Order (`public.orders`)

One customer's completed checkout.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | Surrogate key. Never exposed to the customer |
| `short_ref` | text | no | 6 hex chars from a uuid | **UNIQUE** (`orders_short_ref_key`). The reference quoted in chat |
| `customer_name` | text | no | — | Rejected when blank |
| `customer_phone` | text | no | — | Rejected when blank. Stored as typed; no normalisation in v1 |
| `fulfillment_type` | `fulfillment_type` enum | no | — | `delivery` \| `pickup` |
| `address` | text | yes | — | Required for `delivery`, forced null for `pickup` |
| `note` | text | yes | — | Blank is stored as null |
| `subtotal` | numeric | no | — | **Derived server-side** from the lines; the client's value is not trusted |
| `status` | `order_status` enum | no | `'new'` | `new` \| `confirmed` \| `fulfilled` \| `cancelled`. Forced to `new` at creation |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**No schema change.** Every constraint this feature needs is already present.

### Order Line (`public.order_items`)

One item on an order. Meaningless without its order.

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | |
| `order_id` | uuid | no | — | FK → `orders(id)` **ON DELETE CASCADE** |
| `menu_item_id` | uuid | yes | — | FK → `menu_items(id)` **ON DELETE SET NULL**. Null for sample-menu orders (FR-013) |
| `variant_id` | uuid | yes | — | FK → `menu_item_variants(id)` **ON DELETE SET NULL** |
| `item_name_snapshot` | text | no | — | What the customer saw. Survives renames and deletions (FR-002) |
| `variant_label_snapshot` | text | yes | — | e.g. "Tray of 20" |
| `unit_price_snapshot` | numeric | no | — | What the customer was quoted |
| `quantity` | integer | no | — | **CHECK (quantity > 0)** already present |
| `line_total` | numeric | no | — | `round(unit_price × quantity, 2)`, computed server-side |

**No schema change.** The nullable FKs with `ON DELETE SET NULL` are exactly what FR-002 and FR-013
need, and they are already in place — the snapshot columns keep their meaning after the catalogue
moves on.

## Permission matrix

The change this feature actually makes. "Customer" is the unauthenticated `anon` role holding the
publishable key that ships in every visitor's browser; "Vendor" is the `authenticated` admin.

| Operation | Table | Customer — before | Customer — after | Vendor |
|---|---|---|---|---|
| INSERT | `orders` | ✅ allowed (`WITH CHECK true`) | ❌ **revoked** | ✅ (admin ALL where applicable) |
| INSERT | `order_items` | ✅ allowed (`WITH CHECK true`) | ❌ **revoked** | ✅ |
| SELECT | `orders` | ❌ | ❌ unchanged | ✅ |
| SELECT | `order_items` | ❌ | ❌ unchanged | ✅ |
| UPDATE | `orders` | ❌ | ❌ unchanged | ✅ |
| DELETE | either | ❌ (no policy) | ❌ unchanged | ❌ (no policy — deliberate) |
| EXECUTE `place_order` | — | n/a (does not exist) | ✅ **new, sole write path** | ✅ |

The net effect is **less** customer privilege than today, not more. Before, a crafted request could
insert an order with `status = 'fulfilled'`, `subtotal = 0`, or lines belonging to an order id it
guessed. After, the customer holds no table write permission at all and can only ask a function that
decides those fields itself.

RLS stays enabled on all five public tables. Nothing about the catalogue tables changes.

## State transitions

`status` moves `new → confirmed → fulfilled`, with `cancelled` reachable from `new` or `confirmed`.
Only the vendor may move it. **This feature creates orders in `new` and never transitions them** —
transitions belong to the admin dashboard feature and are listed here only to confirm that the
initial state this feature writes is the one that feature expects to receive.

## Validation rules

Enforced inside `place_order`, which is the only writer. Each maps to a requirement.

| Rule | Source |
|---|---|
| At least one line, or the call is rejected | FR-012, edge case "bag is empty" |
| `customer_name` and `customer_phone` non-blank after trimming | FR-003 |
| `address` non-blank when `fulfillment_type = 'delivery'` | FR-004 |
| `address` forced to null when `fulfillment_type = 'pickup'` | FR-004 |
| Every line `quantity > 0` | Edge case "quantity is zero" |
| Every line `unit_price >= 0` | Edge case "price is missing" |
| `line_total := round(unit_price × quantity, 2)` | FR-002, SC-002 |
| `subtotal := sum(line_total)` | FR-003, SC-002 |
| `status := 'new'`, ignoring any client value | FR-005 |
| Non-uuid catalogue ids nulled before the call | FR-013 |
| `short_ref` collision retried, up to 5 attempts | FR-014 |

## Money handling

Naira amounts are whole numbers in practice but modelled as `numeric`. Rounding to 2 decimal places
happens at each step, matching `cartMath.js` on the client, so the stored `line_total` and `subtotal`
agree digit-for-digit with the WhatsApp message the customer sends (SC-002).
