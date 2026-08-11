# Contract: catalogue editing

The pure modules are the part to write tests against first (Principle I) — every rule with a
decidable answer lives here rather than inside a component.

---

## 1. `itemValidation.js` — pure

```text
validateItem(draft) → { ok: boolean, errors: { [field]: string } }
```

`draft`: `{ name, categoryId, description, price, sellsInSizes, sizes: [{ label, price, isAvailable }] }`

**Rules** (each maps to a requirement in [data-model.md](../data-model.md#validation-rules)):

| Condition | Result |
|---|---|
| `name` blank after trimming | `errors.name` |
| no `categoryId` | `errors.categoryId` |
| `sellsInSizes` false and `price` missing, ≤ 0, or not a number | `errors.price` |
| `sellsInSizes` true and `sizes` empty | `errors.sizes` |
| any size with a blank label | `errors.sizes` |
| any size with price ≤ 0 | `errors.sizes` |
| `sellsInSizes` true **and** a base price set | `errors.price` — an item is priced one way or the other, never both |

**Contract**: returns *all* failures at once, never the first — the vendor fixes one form, not four
in sequence (FR-010).

### Test cases the implementation must satisfy

1. A valid single-price item passes.
2. A valid sized item with two sizes passes.
3. A blank name and a zero price both report, in one call.
4. `sellsInSizes` with an empty size list fails on `sizes`.
5. `sellsInSizes` with a base price fails on `price`.
6. Whitespace-only name and label are blank.
7. Price `0` and `-1` both fail; `0.5` passes.

---

## 2. `sortOrder.js` — pure

```text
reorder(items, fromIndex, toIndex) → items          // new array, contiguous sort_order from 0
placeNewItem(items, newItem)      → items           // appended last
changedRows(before, after)        → [{ id, sort_order }]  // only rows whose order actually moved
```

**Contract**: `sort_order` is always contiguous from 0 with no gaps or duplicates.
`changedRows` exists so a reorder writes the rows that moved rather than the whole category.

### Test cases

1. Moving the last item to the front renumbers every row.
2. Moving an item onto itself changes nothing and yields **no** changed rows.
3. A new item lands last.
4. `changedRows` returns only the affected span, not the untouched tail.
5. An empty list and a single-item list are both safe.

---

## 3. `imageResize.js`

```text
targetSize({ width, height }, maxEdge) → { width, height }        // pure
reduceImage(file)  → Promise<{ card: Blob, detail: Blob, type }>  // thin wrapper over canvas
```

**`targetSize` contract** — the pure part, tested first:

- Scales so the **long** edge equals `maxEdge`, preserving aspect ratio.
- **Never upscales**: an image already within `maxEdge` is returned unchanged.
- Rounds to whole pixels; never returns a zero dimension.

**`reduceImage` contract**: decode once with `createImageBitmap`, then draw twice — a **card**
derivative at long edge **800** and a **detail** derivative at **1600** — and `toBlob` each,
preferring `image/webp` and falling back to `image/jpeg` at quality 0.82.

Two sizes, not one, because constitution Principle IV requires photographs to be *served
responsively*, and one stored size gives the browser nothing to choose between (FR-035,
[research D5](../research.md#d5-reducing-photos-on-the-device)). Cards render 150–300px wide on a
phone; sending 1600px there wastes most of the bytes SC-006 is trying to save.

**Rejects** when the file is not an image (FR-019) or when the browser cannot do the work (FR-021) —
it MUST NOT fall back to uploading the original. Exercised in a browser, not mocked.

**Type check contract (FR-019)**: reject on MIME type *and* on `createImageBitmap` throwing. A file
renamed `.jpg` is not an image, and only the decode attempt proves it.

### Test cases (`targetSize`)

1. 4000×3000, max 1600 → 1600×1200.
2. 3000×4000, max 1600 → 1200×1600 (portrait).
3. 800×600, max 1600 → 800×600, untouched.
4. A square image stays square.
5. Extreme ratios never round to 0.

---

## 4. `storagePaths.js` — pure

```text
photoPaths(itemId, extension) → { card, detail, stem }
  // 'menu/{itemId}/{random}-card.{ext}', 'menu/{itemId}/{random}-detail.{ext}'
itemPrefix(itemId)            → 'menu/{itemId}/'
```

**Contract**: item-scoped so discarding clears a prefix in one call (FR-017). Both derivatives share
one random stem, so a replacement releases the pair together (FR-022) and neither collides with a
cached URL.

### Test cases

1. Both paths start with the item prefix.
2. Card and detail share a stem and differ only by suffix.
3. Two calls for one item produce different stems.
4. Extension is honoured on both; no double dots.

---

## 5. `save_menu_item` — the one write that cannot be two calls

Everything else in §6 is a single statement and can be a straight `supabase` call. Saving an item
that sells in sizes cannot: it writes `menu_items` **and** replaces that item's `menu_item_variants`,
and from the client those are two round trips with no transaction around them.

A failure between them is not hypothetical bookkeeping — it is FR-032 breaking in the way that
matters most. Switch an item to sizes-mode, clear its base price, and lose the connection before the
sizes land, and customers see an item with **no price at all** that is still `is_available`. SC-007
promises zero invalid items reach customers; two client calls cannot promise it.

```text
save_menu_item(
  p_id uuid,                -- null to create
  p_name text, p_category_id uuid, p_description text,
  p_price numeric,          -- null when selling in sizes
  p_is_available boolean,
  p_image_url text, p_image_card_url text,
  p_sizes jsonb             -- [] when not selling in sizes
) → uuid                    -- the item id

  volatile, security definer, set search_path = public, pg_temp
```

**Contract**:

- **Re-checks `is_admin()` in its own body and raises otherwise.** `security definer` bypasses RLS,
  so the policy that protects the tables does **not** protect this function. Feature 001 learned this
  with `place_order`; the same rule applies here and for the same reason.
- Insert-or-update the item, then reconcile its sizes to `p_sizes` — update those that persist,
  insert those that are new, delete those absent — all in the one implicit transaction.
- Deleting a size that a past order references MUST NOT cascade into that order. Retire preserves
  history; the FK behaviour here must be verified, not assumed (see [D9](../research.md#d9-discard-vs-a-customers-in-flight-order)).
- Enforces the same rules as `validateItem`, since a session holds a real API key and can call this
  function directly, bypassing any form. The client rule is for the vendor; this is the guarantee.
- Returns the item id so a create can immediately attach photos under `menu/{itemId}/`.

`validateItem` still runs first in the browser — the vendor gets all their errors at once (FR-010)
rather than the first one Postgres happens to raise.

---

## 6. Other write operations

Straight `supabase` calls, gated by `is_admin()`. Listed for the contract they owe, not to prescribe
their shape.

| Operation | Owes |
|---|---|
| create / update item | validated first, then written through `save_menu_item` (§5) — never as a separate item write and sizes write |
| remove item | sets `removed_at`; **never** deletes |
| restore item | clears `removed_at`; if its category is gone, the vendor picks a new one first (spec edge case) |
| discard item | deletes the row, then clears its storage prefix. Row first: an orphaned object is recoverable, a photo-less row is not |
| replace photo | upload new → point row at it → delete old. Never delete first |
| reorder | writes only `changedRows` |
| remove category | refused while it holds **live** items; already-removed items do not count (FR-030) |

**Shared contract**: every write is gated by `is_admin()` in the database, not by hiding a button.
The UI hides what the vendor cannot do; the policy is what makes it true.
