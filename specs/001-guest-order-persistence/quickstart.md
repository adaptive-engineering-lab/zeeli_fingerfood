# Quickstart: validating Guest Order Persistence

How to prove this feature works. Every scenario below maps to a success criterion in
[spec.md](./spec.md); the feature is done when all seven pass.

## Prerequisites

```bash
cd "project assets/zeeli-fingerfoods"
npm install
cp .env.example .env    # publishable key + VITE_VENDOR_WHATSAPP_NUMBER
```

The migration must be applied to the target Supabase project first:

```bash
# via the Supabase CLI, or apply supabase/migrations/20260810__place_order_rpc.sql by hand
supabase db push
```

## Scenario 1 — the pure payload builder (SC-002, FR-013)

Fastest signal, no network. These are the tests written before the implementation.

```bash
npm run test
```

**Expect**: `orderPayload.test.js` green, covering all seven cases in
[contracts/place-order.md](./contracts/place-order.md#test-cases-the-implementation-must-satisfy) —
in particular that a sample-menu id becomes `null` rather than being sent as a bad uuid.

## Scenario 2 — the permission boundary, with a real public key (SC-004, FR-016)

The one check no unit test can make. Uses the same publishable key a visitor's browser holds.

```bash
npm run verify:permissions
```

**Expect** — 9 assertions, all passing:

| # | Attempt as the anonymous customer | Expected |
|---|---|---|
| 1 | `rpc('place_order', …)` with a valid payload | succeeds, returns a reference |
| 2 | `from('orders').select()` | 0 rows |
| 3 | `from('order_items').select()` | 0 rows |
| 4 | `from('orders').insert(…)` | rejected |
| 5 | `from('order_items').insert(…)` | rejected |
| 6 | `from('orders').update({status:'fulfilled'})` | rejected or 0 rows affected |
| 7 | `from('orders').delete()` | rejected or 0 rows affected |
| 8 | `from('order_items').delete()` | rejected or 0 rows affected |
| 9 | `rpc('place_order', …)` with an empty line list | rejected |

**Cleanup** — the script writes real probe rows and the customer role cannot delete them. As the
vendor (service role or SQL editor):

```sql
delete from orders where short_ref like 'ZF-PROBE%';
-- order_items cascade
```

## Scenario 3 — an order is recorded end to end (SC-001, SC-002, US1)

```bash
npm run dev
```

1. Add three items to the bag, one of them a size variant.
2. Check out as **delivery**, with a note.
3. Send. WhatsApp opens with the message pre-filled.

**Expect**, querying as the vendor:

```sql
select short_ref, customer_name, fulfillment_type, address, subtotal, status
from orders order by created_at desc limit 1;

select item_name_snapshot, variant_label_snapshot, quantity, unit_price_snapshot, line_total
from order_items where order_id = (select id from orders order by created_at desc limit 1);
```

- One order, three lines.
- Every field matches the WhatsApp message character for character, **including the reference**.
- `status = 'new'`, `subtotal` equals the sum of the line totals.

Repeat as **pickup**: `address` is null and `fulfillment_type = 'pickup'`.

## Scenario 4 — nothing half-written (SC-003, US3)

Force the line insert to fail — easiest by temporarily raising inside the function's line loop, or by
sending a line with a `menu_item_id` uuid that does not exist in `menu_items`.

**Expect**: `select count(*) from orders where short_ref = '<that ref>'` returns **0**. No empty order
is visible. The customer still reaches WhatsApp (that is Scenario 5).

## Scenario 5 — recording fails, the order still goes (SC-005, US2, Principle II)

With the dev server running, break recording — point `VITE_SUPABASE_URL` at an unreachable host, or
go offline in DevTools — then check out.

**Expect**:

- WhatsApp still opens with the complete, correct message, carrying the locally generated reference.
- The confirmation screen appears and says the copy was not saved, without implying the order was
  lost.
- No unhandled rejection in the console.

Then restore the URL and confirm a successful checkout shows **no** failure message.

## Scenario 6 — speed (SC-006)

In DevTools → Network, throttled to Fast 3G, time from tapping **Send Order** to `window.open`.

**Expect**: recording adds ≤1s at p95. One `rpc` call replaces the previous two round trips, so this
should improve on today.

## Scenario 7 — the reference is unique and resolvable (SC-007, FR-014)

```sql
select short_ref, count(*) from orders group by short_ref having count(*) > 1;
```

**Expect**: no rows. Then pick any reference from a WhatsApp message and look it up — exactly one
order comes back.

To exercise the collision retry directly, call `place_order` twice with the same `p_short_ref`:
both calls succeed, and the second returns a **different** reference from the one it proposed.

## Gate before calling this done

```bash
npm run lint     # zero errors
npm run test     # all green
npm run build    # succeeds; gzipped JS still under 150 KB (Principle IV)
```
