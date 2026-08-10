# Contract: recording a guest order

Two contracts, one at each side of the boundary: the database function the browser calls, and the
pure client module that builds its argument. The client module's contract is the thing to write
tests against first (Principle I) — it is where every decidable rule lives.

---

## 1. Database function — `public.place_order`

Exposed to the browser by PostgREST at `POST /rest/v1/rpc/place_order`, called as
`supabase.rpc('place_order', args)`.

### Signature

```text
place_order(
  p_short_ref        text,                     -- customer's proposed reference; may be null
  p_customer_name    text,
  p_customer_phone   text,
  p_fulfillment_type public.fulfillment_type,  -- 'delivery' | 'pickup'
  p_address          text,                     -- required when delivery, ignored for pickup
  p_note             text,                     -- nullable
  p_lines            jsonb                     -- non-empty array, shape below
) RETURNS text                                 -- the short_ref actually recorded
```

Declared `SECURITY DEFINER`, `search_path` pinned to `public, pg_temp`, `VOLATILE`.
`EXECUTE` revoked from `PUBLIC`, granted to `anon` and `authenticated`.

### `p_lines` element

```json
{
  "menu_item_id":  "uuid | null",
  "variant_id":    "uuid | null",
  "item_name":     "string, non-empty",
  "variant_label": "string | null",
  "unit_price":    "number >= 0",
  "quantity":      "integer > 0"
}
```

### Behaviour

1. Validate per the rules table in [data-model.md](../data-model.md#validation-rules). Any failure
   raises — no partial write is possible, the whole function body is one transaction.
2. Insert one `orders` row: `status` forced to `'new'`, `subtotal` derived as the sum of
   `round(unit_price × quantity, 2)` across the lines, `address` nulled for pickup,
   `short_ref` taken from `p_short_ref` when non-blank else the column default.
3. On `unique_violation` against `orders_short_ref_key`, regenerate the reference and retry, up to
   5 attempts total, then raise.
4. Insert one `order_items` row per line, each with `line_total = round(unit_price × quantity, 2)`.
5. Return the `short_ref` actually stored.

### Guarantees

- **Atomic** — caller observes all rows or none (FR-012).
- **No read permission implied** — the caller gains nothing beyond the returned scalar, which is a
  value it proposed (FR-007, FR-008).
- **Client cannot set** `id`, `status`, `subtotal`, `line_total`, `created_at`, `updated_at`.

### Errors

Every error is opaque to the customer by design — the client's only branch is
persisted / not persisted.

| Condition | Raised as |
|---|---|
| `p_lines` empty, absent, or not an array | `invalid_parameter_value` |
| Blank name or phone | `invalid_parameter_value` |
| Delivery with blank address | `invalid_parameter_value` |
| Line with `quantity <= 0` or `unit_price < 0` | `invalid_parameter_value` |
| Reference still colliding after 5 attempts | `unique_violation` |
| Caller lacks EXECUTE | `insufficient_privilege` |

---

## 2. Client module — `src/features/checkout/orderPayload.js`

Pure. No React, no Supabase, no network. **Tests first.**

### `isUuid(value) → boolean`

True only for a canonical 8-4-4-4-12 hex uuid. Everything else — including the sample menu's
`'puff-puff'` and `'combo-20'` — is false.

### `toOrderLines(cartLines) → Array`

Maps cart lines to `p_lines` elements.

| Input | Output |
|---|---|
| `itemId` that is a uuid | `menu_item_id: <that uuid>` |
| `itemId` that is not a uuid (sample menu) | `menu_item_id: null` |
| `variantId` uuid / non-uuid / `null` | `variant_id` same rule, `null` passes through |
| `name` | `item_name` |
| `variantLabel` (may be `null`) | `variant_label` |
| `unitPrice` | `unit_price` |
| `quantity` | `quantity` |

Lines with `quantity <= 0` are dropped — they cannot legally be recorded and would fail the whole
call.

### `toOrderPayload({ form, lines, shortRef }) → args | null`

Assembles the full argument object. Returns `null` when there is nothing recordable (no lines
survive `toOrderLines`), so the caller can skip the round trip entirely.

- `p_address` is the trimmed address for delivery, `null` for pickup.
- `p_note` is the trimmed note, or `null` when blank.
- `p_short_ref` is the caller's generated reference.
- No subtotal is sent — the server derives it.

### Test cases the implementation must satisfy

1. A uuid item id survives; a sample-menu id becomes `null`.
2. A variant line carries both `variant_id` and `variant_label`; a plain line carries `null` for both.
3. A zero-quantity line is dropped.
4. An all-zero-quantity cart yields `null` from `toOrderPayload`.
5. Pickup nulls the address even when the form holds one.
6. A whitespace-only note becomes `null`.
7. Money passes through unrounded — rounding is the server's job — but the values match `cartMath`.

---

## 3. Caller — `submitOrder(order) → { persisted, shortRef, error? }`

The existing signature is kept, with `shortRef` added.

- Returns `{ persisted: false, shortRef: order.shortRef }` when Supabase is unconfigured, when the
  payload is `null`, or on **any** thrown error. **It never throws** (FR-010, Principle II).
- Returns `{ persisted: true, shortRef: <value returned by the function> }` on success.
- `CheckoutPage` awaits it *before* building the WhatsApp message, then builds the message with the
  returned `shortRef` (FR-015).
