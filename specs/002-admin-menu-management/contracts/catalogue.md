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
targetSize({ width, height }, maxEdge) → { width, height }   // pure
reduceImage(file, options)             → Promise<Blob>       // thin wrapper over canvas
```

**`targetSize` contract** — the pure part, tested first:

- Scales so the **long** edge equals `maxEdge` (default 1600), preserving aspect ratio.
- **Never upscales**: an image already within `maxEdge` is returned unchanged.
- Rounds to whole pixels; never returns a zero dimension.

**`reduceImage` contract**: `createImageBitmap` → canvas → `toBlob`, preferring `image/webp` and
falling back to `image/jpeg` at quality 0.82. **Rejects** when the file is not an image (FR-019) or
when the browser cannot do the work (FR-021) — it MUST NOT fall back to uploading the original.
Exercised in a browser, not mocked.

### Test cases (`targetSize`)

1. 4000×3000, max 1600 → 1600×1200.
2. 3000×4000, max 1600 → 1200×1600 (portrait).
3. 800×600, max 1600 → 800×600, untouched.
4. A square image stays square.
5. Extreme ratios never round to 0.

---

## 4. `storagePaths.js` — pure

```text
photoPath(itemId, extension) → 'menu/{itemId}/{random}.{ext}'
itemPrefix(itemId)           → 'menu/{itemId}/'
```

**Contract**: item-scoped so discarding clears a prefix in one call (FR-017), and a fresh random
filename per upload so a replacement never collides with a cached URL.

### Test cases

1. Path starts with the item prefix.
2. Two calls for one item differ.
3. Extension is honoured; no double dots.

---

## 5. Write operations

Straight `supabase` calls, gated by `is_admin()`. Listed for the contract they owe, not to prescribe
their shape.

| Operation | Owes |
|---|---|
| create / update item | validated first; a sized item writes its sizes in the same save so the two never disagree |
| remove item | sets `removed_at`; **never** deletes |
| restore item | clears `removed_at`; if its category is gone, the vendor picks a new one first (spec edge case) |
| discard item | deletes the row, then clears its storage prefix. Row first: an orphaned object is recoverable, a photo-less row is not |
| replace photo | upload new → point row at it → delete old. Never delete first |
| reorder | writes only `changedRows` |
| remove category | refused while it holds **live** items; already-removed items do not count (FR-030) |

**Shared contract**: every write is gated by `is_admin()` in the database, not by hiding a button.
The UI hides what the vendor cannot do; the policy is what makes it true.
