/**
 * Ordering, as arithmetic. Pure — no React, no Supabase.
 *
 * `sort_order` carries a merchandising decision: the first item in a category
 * is the one most people buy. The rules here exist to keep that decision
 * stable, which mostly means never letting two rows claim the same position.
 */

const clamp = (value, max) => Math.min(Math.max(value, 0), max)

// Contiguous from 0. Duplicates are the failure that matters — two rows sharing
// a position render in whatever order Postgres returns them, so the vendor's
// arrangement quietly stops being an arrangement.
const renumber = (items) => items.map((item, index) => ({ ...item, sort_order: index }))

export function reorder(items, fromIndex, toIndex) {
  if (!Array.isArray(items) || items.length === 0) return []

  const last = items.length - 1
  const from = clamp(fromIndex, last)
  const to = clamp(toIndex, last)
  if (from === to) return renumber(items)

  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  return renumber(next)
}

/**
 * One step up (-1) or down (+1). The touch path — FR-029 requires ordering to
 * work on a phone, where dragging a row inside a scrolling list fights the
 * scroll. It routes through `reorder` so the two paths cannot diverge.
 */
export function move(items, index, direction) {
  return reorder(items, index, index + direction)
}

/** A new item goes last in its category until the vendor moves it. */
export function placeNewItem(items, newItem) {
  return renumber([...(items ?? []), newItem])
}

/**
 * Only the rows whose position actually changed.
 *
 * A reorder near the top of a long category should write two rows, not thirty.
 * That is the difference between instant and visibly slow on the 4G connection
 * the vendor is actually using.
 */
export function changedRows(before, after) {
  const was = new Map((before ?? []).map((item) => [item.id, item.sort_order]))

  return (after ?? [])
    .filter((item) => was.get(item.id) !== item.sort_order)
    .map((item) => ({ id: item.id, sort_order: item.sort_order }))
}
