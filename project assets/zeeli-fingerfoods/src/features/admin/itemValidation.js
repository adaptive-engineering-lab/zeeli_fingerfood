/**
 * Whether a draft item may be saved, and everything wrong with it if not.
 *
 * Pure: no React, no Supabase, no I/O. That is what makes it testable under
 * constitution Principle I, and it is why the rules live here rather than
 * scattered through the drawer's event handlers.
 *
 * This is for the vendor's benefit — all the errors at once, in their language
 * (FR-010). It is NOT the guarantee. An admin session holds a real API key and
 * can write directly, so the same rules are enforced again as check constraints
 * and inside `save_menu_item`. SC-007 promises zero invalid items reach
 * customers, and only the database can promise that.
 */

const isBlank = (value) => String(value ?? '').trim() === ''

// Number('') is 0 and Number(null) is 0, which would let both through as a
// valid price. Reject anything that is not a finite number above zero.
const isPositiveNumber = (value) => {
  if (value === null || value === undefined || value === '') return false
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

export default function validateItem(draft = {}) {
  const errors = {}
  const sellsInSizes = draft.sellsInSizes === true
  const sizes = Array.isArray(draft.sizes) ? draft.sizes : []

  if (isBlank(draft.name)) {
    errors.name = 'Give the item a name.'
  }

  if (isBlank(draft.categoryId)) {
    errors.categoryId = 'Choose a category.'
  }

  if (sellsInSizes) {
    // Priced one way or the other, never both — a customer must never see two
    // prices for one thing (FR-009, FR-026).
    if (draft.price !== null && draft.price !== undefined && draft.price !== '') {
      errors.price = 'An item that sells in sizes has no single price.'
    }
    if (sizes.length === 0) {
      errors.sizes = 'Add at least one size, or switch off selling in sizes.'
    } else if (sizes.some((size) => isBlank(size?.label))) {
      errors.sizes = 'Every size needs a label.'
    } else if (sizes.some((size) => !isPositiveNumber(size?.price))) {
      // `some`, not a check of the first: a good size followed by a bad one is
      // the likely shape of the mistake, since the vendor adds rows in order.
      errors.sizes = 'Every size needs a price above zero.'
    }
  } else if (!isPositiveNumber(draft.price)) {
    errors.price = 'Give the item a price above zero.'
  }

  // Every failure, never just the first: the vendor fixes one form rather than
  // discovering a new problem on each save.
  return { ok: Object.keys(errors).length === 0, errors }
}
