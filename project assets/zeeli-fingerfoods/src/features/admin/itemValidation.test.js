import { describe, it, expect } from 'vitest'
import validateItem from './itemValidation'

const CATEGORY = 'a3f1c9d2-1111-4b7e-9c1a-8d2e5f7a6b40'

// A valid single-price draft. Each test breaks exactly one thing, so a failure
// names the rule that broke rather than "the draft is invalid".
const draft = (overrides = {}) => ({
  name: 'Puff Puff (6pc)',
  categoryId: CATEGORY,
  description: 'Six pieces, fried to order',
  price: 800,
  sellsInSizes: false,
  sizes: [],
  ...overrides,
})

describe('validateItem — single-price items', () => {
  it('accepts a complete draft', () => {
    expect(validateItem(draft())).toEqual({ ok: true, errors: {} })
  })

  it('rejects a blank name', () => {
    expect(validateItem(draft({ name: '' })).errors).toHaveProperty('name')
  })

  it('treats a whitespace-only name as blank', () => {
    expect(validateItem(draft({ name: '   ' })).errors).toHaveProperty('name')
  })

  it('requires a category', () => {
    for (const categoryId of [null, undefined, '']) {
      expect(validateItem(draft({ categoryId })).errors).toHaveProperty('categoryId')
    }
  })

  it('rejects a price of zero or below', () => {
    for (const price of [0, -1, -0.01]) {
      expect(validateItem(draft({ price })).errors).toHaveProperty('price')
    }
  })

  it('accepts a price below one naira', () => {
    // 0.5 is odd for this menu but the rule is "above zero", not "at least 1".
    expect(validateItem(draft({ price: 0.5 })).ok).toBe(true)
  })

  it('rejects a missing or non-numeric price', () => {
    for (const price of [null, undefined, '', 'free', NaN]) {
      expect(validateItem(draft({ price })).errors).toHaveProperty('price')
    }
  })

  // The contract's real point (FR-010): the vendor fixes one form, not four in
  // sequence. A validator that returned the first error would pass every test
  // above and still fail the requirement.
  it('reports every failure at once, not just the first', () => {
    const { ok, errors } = validateItem(draft({ name: '  ', categoryId: null, price: 0 }))

    expect(ok).toBe(false)
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'name', 'price'])
  })

  it('never reports an error for a field that is fine', () => {
    const { errors } = validateItem(draft({ price: 0 }))

    expect(errors).toHaveProperty('price')
    expect(errors).not.toHaveProperty('name')
    expect(errors).not.toHaveProperty('categoryId')
  })

  it('does not demand a price when the item sells in sizes', () => {
    const { errors } = validateItem(
      draft({ price: null, sellsInSizes: true, sizes: [{ label: '20 pieces', price: 5000 }] })
    )

    expect(errors).not.toHaveProperty('price')
  })
})

// The Combo Tray sells as 20, 50 or 100 pieces. An item sellable at no price
// must never reach a customer, which is what these rules exist to prevent.
const sized = (sizes, overrides = {}) =>
  draft({ price: null, sellsInSizes: true, sizes, ...overrides })

describe('validateItem — items that sell in sizes', () => {
  it('accepts a sized item with two sizes', () => {
    const result = validateItem(
      sized([
        { label: 'Tray of 20', price: 3500 },
        { label: 'Tray of 50', price: 7000 },
      ])
    )
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects sizes-mode with no sizes at all', () => {
    expect(validateItem(sized([])).errors).toHaveProperty('sizes')
  })

  it('rejects a size with a blank label', () => {
    expect(validateItem(sized([{ label: '', price: 3500 }])).errors).toHaveProperty('sizes')
    expect(validateItem(sized([{ label: '   ', price: 3500 }])).errors).toHaveProperty('sizes')
  })

  it('rejects a size priced at zero or below', () => {
    for (const price of [0, -1]) {
      expect(validateItem(sized([{ label: 'Tray of 20', price }])).errors).toHaveProperty('sizes')
    }
  })

  it('rejects a size with a missing or non-numeric price', () => {
    for (const price of [null, undefined, '', 'free']) {
      expect(validateItem(sized([{ label: 'Tray of 20', price }])).errors).toHaveProperty('sizes')
    }
  })

  it('rejects one bad size among good ones', () => {
    // The obvious implementation checks sizes[0] and stops.
    const result = validateItem(
      sized([
        { label: 'Tray of 20', price: 3500 },
        { label: 'Tray of 50', price: 0 },
      ])
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveProperty('sizes')
  })

  it('refuses a sized item that also carries a base price', () => {
    // Two prices for one thing. FR-026 says the customer sees the cheapest
    // available size, so a base price alongside them is unanswerable.
    const result = validateItem(
      sized([{ label: 'Tray of 20', price: 3500 }], { price: 5000 })
    )
    expect(result.errors).toHaveProperty('price')
  })

  it('still reports name and size faults together', () => {
    const result = validateItem(sized([], { name: '' }))
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'sizes'])
  })

  it('ignores the sizes list entirely when the item is not sizes-mode', () => {
    // Switching sizes-mode off with rubbish left in the list must not block a
    // save — the sizes are discarded, not validated.
    const result = validateItem(
      draft({ sellsInSizes: false, price: 800, sizes: [{ label: '', price: -5 }] })
    )
    expect(result.ok).toBe(true)
  })
})
