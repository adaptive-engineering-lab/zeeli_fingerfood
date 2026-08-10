// Naira formatting. Prices are whole naira in practice, but cart math rounds to
// 2dp, so we show kobo only when a price actually has them.
const HAS_KOBO = (amount) => Math.round(amount * 100) % 100 !== 0

export function formatNaira(amount) {
  const digits = HAS_KOBO(amount) ? 2 : 0
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}
