import { describe, it, expect } from 'vitest'
import { lineTotal, cartSubtotal, addOrUpdateLine, removeZeroQtyLines } from './cartMath'

describe('lineTotal', () => {
  it('multiplies unit price by quantity', () => {
    expect(lineTotal({ unitPrice: 1500, quantity: 3 })).toBe(4500)
  })

  it('returns 0 for quantity 0', () => {
    expect(lineTotal({ unitPrice: 1500, quantity: 0 })).toBe(0)
  })

  it('handles decimal prices without floating point drift', () => {
    // classic JS float trap: 0.1 + 0.2 !== 0.3
    expect(lineTotal({ unitPrice: 350.5, quantity: 3 })).toBeCloseTo(1051.5, 2)
  })
})

describe('cartSubtotal', () => {
  it('sums line totals across multiple lines', () => {
    const lines = [
      { unitPrice: 1500, quantity: 2 }, // 3000
      { unitPrice: 800, quantity: 3 }, // 2400
    ]
    expect(cartSubtotal(lines)).toBe(5400)
  })

  it('returns 0 for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0)
  })

  it('ignores zero-quantity lines in the total', () => {
    const lines = [
      { unitPrice: 1500, quantity: 2 },
      { unitPrice: 999, quantity: 0 },
    ]
    expect(cartSubtotal(lines)).toBe(3000)
  })
})

describe('addOrUpdateLine', () => {
  it('adds a new line for an item not yet in the cart', () => {
    const cart = []
    const result = addOrUpdateLine(cart, {
      itemId: 'a1',
      variantId: null,
      name: 'Puff Puff',
      unitPrice: 500,
      quantity: 2,
    })
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('increments quantity when the same item+variant is added again', () => {
    const cart = [{ itemId: 'a1', variantId: null, name: 'Puff Puff', unitPrice: 500, quantity: 2 }]
    const result = addOrUpdateLine(cart, {
      itemId: 'a1',
      variantId: null,
      name: 'Puff Puff',
      unitPrice: 500,
      quantity: 1,
    })
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
  })

  it('treats different variants of the same item as distinct lines', () => {
    const cart = [
      { itemId: 'b2', variantId: 'tray-20', name: 'Small Chops Tray', unitPrice: 8000, quantity: 1 },
    ]
    const result = addOrUpdateLine(cart, {
      itemId: 'b2',
      variantId: 'tray-50',
      name: 'Small Chops Tray',
      unitPrice: 18000,
      quantity: 1,
    })
    expect(result).toHaveLength(2)
  })
})

describe('removeZeroQtyLines', () => {
  it('drops lines whose quantity has been decremented to 0', () => {
    const cart = [
      { itemId: 'a1', variantId: null, quantity: 0 },
      { itemId: 'b2', variantId: null, quantity: 1 },
    ]
    const result = removeZeroQtyLines(cart)
    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe('b2')
  })
})
