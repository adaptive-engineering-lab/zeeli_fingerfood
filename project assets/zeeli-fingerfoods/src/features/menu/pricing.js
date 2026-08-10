/** Cheapest available variant — what "From ₦x" quotes on a multi-size item. */
export function startingPrice(item) {
  const prices = item.variants.filter((variant) => variant.isAvailable).map((v) => v.price)
  if (prices.length > 0) return Math.min(...prices)
  return item.price
}
