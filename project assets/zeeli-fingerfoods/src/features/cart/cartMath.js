// Pure cart math — no React, no Supabase. Kept isolated so it's trivially unit-testable.
// Money is handled in kobo-safe fashion by rounding to 2dp at each step to avoid
// floating point drift (e.g. 0.1 + 0.2 !== 0.3).

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineTotal({ unitPrice, quantity }) {
  return round2(unitPrice * quantity)
}

export function cartSubtotal(lines) {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0))
}

// A "line" is uniquely identified by itemId + variantId (null variantId = no-variant item).
const sameLine = (a, b) => a.itemId === b.itemId && a.variantId === b.variantId

export function addOrUpdateLine(cart, newLine) {
  const existingIndex = cart.findIndex((line) => sameLine(line, newLine))

  if (existingIndex === -1) {
    return [...cart, newLine]
  }

  return cart.map((line, i) =>
    i === existingIndex ? { ...line, quantity: line.quantity + newLine.quantity } : line
  )
}

export function removeZeroQtyLines(cart) {
  return cart.filter((line) => line.quantity > 0)
}
