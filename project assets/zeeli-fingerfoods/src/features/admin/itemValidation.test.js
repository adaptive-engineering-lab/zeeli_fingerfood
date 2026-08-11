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
    // The sizes rules themselves arrive with T031; this only fixes the boundary
    // so the price rule cannot claim territory that is not its own.
    const { errors } = validateItem(
      draft({ price: null, sellsInSizes: true, sizes: [{ label: '20 pieces', price: 5000 }] })
    )

    expect(errors).not.toHaveProperty('price')
  })
})
