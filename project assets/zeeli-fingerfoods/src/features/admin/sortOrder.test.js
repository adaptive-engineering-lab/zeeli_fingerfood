import { describe, it, expect } from 'vitest'
import { reorder, placeNewItem, changedRows, move } from './sortOrder'

// `sort_order` is the vendor's merchandising decision — the first thing in a
// category is the thing most people buy — so these rules are about keeping that
// decision expressible, not about tidiness.
const list = (...names) => names.map((name, index) => ({ id: name, sort_order: index }))
const orderOf = (items) => items.map((item) => item.id)
const positions = (items) => items.map((item) => item.sort_order)

describe('reorder', () => {
  it('moves the last item to the front and renumbers every row', () => {
    const after = reorder(list('a', 'b', 'c'), 2, 0)
    expect(orderOf(after)).toEqual(['c', 'a', 'b'])
    expect(positions(after)).toEqual([0, 1, 2])
  })

  it('moves the first item to the end', () => {
    const after = reorder(list('a', 'b', 'c'), 0, 2)
    expect(orderOf(after)).toEqual(['b', 'c', 'a'])
    expect(positions(after)).toEqual([0, 1, 2])
  })

  it('always leaves sort_order contiguous from 0, with no gaps or duplicates', () => {
    // Gaps are survivable; duplicates are not — two items with the same
    // sort_order render in whatever order Postgres feels like that day, so the
    // vendor's arrangement silently stops being stable.
    const after = reorder(list('a', 'b', 'c', 'd', 'e'), 4, 1)
    expect(positions(after)).toEqual([0, 1, 2, 3, 4])
    expect(new Set(positions(after)).size).toBe(5)
  })

  it('does not mutate the array it was given', () => {
    const before = list('a', 'b', 'c')
    reorder(before, 2, 0)
    expect(orderOf(before)).toEqual(['a', 'b', 'c'])
  })

  it('treats a move onto itself as a no-op', () => {
    const before = list('a', 'b', 'c')
    expect(orderOf(reorder(before, 1, 1))).toEqual(['a', 'b', 'c'])
  })

  it('is safe on empty and single-item lists', () => {
    expect(reorder([], 0, 0)).toEqual([])
    expect(orderOf(reorder(list('a'), 0, 0))).toEqual(['a'])
  })

  it('clamps an out-of-range target rather than producing holes', () => {
    const after = reorder(list('a', 'b', 'c'), 0, 99)
    expect(orderOf(after)).toEqual(['b', 'c', 'a'])
    expect(positions(after)).toEqual([0, 1, 2])
  })
})

describe('move', () => {
  it('steps an item one place up or down', () => {
    // The touch path (FR-029). It must land on exactly the same result as a
    // drag, or the phone and the desktop disagree about what the vendor did.
    expect(orderOf(move(list('a', 'b', 'c'), 2, -1))).toEqual(['a', 'c', 'b'])
    expect(orderOf(move(list('a', 'b', 'c'), 0, +1))).toEqual(['b', 'a', 'c'])
  })

  it('refuses to step off either end', () => {
    expect(orderOf(move(list('a', 'b', 'c'), 0, -1))).toEqual(['a', 'b', 'c'])
    expect(orderOf(move(list('a', 'b', 'c'), 2, +1))).toEqual(['a', 'b', 'c'])
  })
})

describe('placeNewItem', () => {
  it('appends a new item last', () => {
    const after = placeNewItem(list('a', 'b'), { id: 'c' })
    expect(orderOf(after)).toEqual(['a', 'b', 'c'])
    expect(after.at(-1).sort_order).toBe(2)
  })

  it('gives the first item in an empty category position 0', () => {
    expect(placeNewItem([], { id: 'a' })[0].sort_order).toBe(0)
  })
})

describe('changedRows', () => {
  it('returns only the rows whose position actually moved', () => {
    // A reorder must write the rows that moved, not the whole category — the
    // difference between three updates and thirty on a phone connection.
    const before = list('a', 'b', 'c', 'd', 'e')
    const after = reorder(before, 1, 0)

    expect(changedRows(before, after).map((row) => row.id).sort()).toEqual(['a', 'b'])
  })

  it('returns nothing at all when the order did not change', () => {
    const before = list('a', 'b', 'c')
    expect(changedRows(before, reorder(before, 1, 1))).toEqual([])
  })

  it('reports the new sort_order for each moved row', () => {
    const before = list('a', 'b')
    const rows = changedRows(before, reorder(before, 0, 1))
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: 'b', sort_order: 0 },
        { id: 'a', sort_order: 1 },
      ])
    )
  })

  it('leaves an untouched tail alone', () => {
    const before = list('a', 'b', 'c', 'd', 'e', 'f')
    const after = reorder(before, 0, 1)
    const touched = changedRows(after === before ? before : after, after).map((r) => r.id)
    expect(touched).not.toContain('f')
  })

  it('is safe on empty lists', () => {
    expect(changedRows([], [])).toEqual([])
  })

  // Regression, 2026-08-12. The caller seeded its baseline from array indices
  // (0,1,2,3) while the database held 1,2,3,4. `changedRows` then reported only
  // the rows whose *index* moved, so rows keeping their index were never
  // rewritten and their stale stored values survived — two categories ended up
  // both holding sort_order 3.
  //
  // The pure function was never wrong; it was handed the wrong baseline. This
  // pins the contract that makes the mistake impossible to repeat silently:
  // compare against STORED positions, and every row whose stored value differs
  // from its new one must be written.
  it('reports rows whose stored position differs, even when their index does not move', () => {
    const stored = [
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ]
    const after = reorder(stored, 0, 0) // no visual move; renumbers to 0,1,2

    expect(changedRows(stored, after)).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ])
  })

  it('never lets two rows claim the same position after a write', () => {
    const stored = [
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
      { id: 'c', sort_order: 3 },
      { id: 'new', sort_order: 3 }, // the collision, as it actually occurred
    ]
    const after = reorder(stored, 3, 2)
    const written = new Map(changedRows(stored, after).map((r) => [r.id, r.sort_order]))

    // Apply the writes over the stored values, as the database would.
    const final = stored.map((row) => written.get(row.id) ?? row.sort_order)
    expect(new Set(final).size).toBe(final.length)
  })
})
