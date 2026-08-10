// Cart lines → the argument set `place_order` expects. Pure: no React, no Supabase,
// no network, so every rule here is unit-testable (constitution Principle I).
//
// The one non-obvious job is guarding the uuid columns. When the live menu is
// unreachable the app serves a sample menu whose ids are slugs ('puff-puff'), and
// `order_items.menu_item_id` is a uuid FK. Those columns are nullable precisely so a
// degraded order still records (FR-013) — so a non-uuid id becomes null rather than
// failing the whole call.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

const uuidOrNull = (value) => (isUuid(value) ? value : null)
const trimmedOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

export function toOrderLines(cartLines) {
  return cartLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      menu_item_id: uuidOrNull(line.itemId),
      variant_id: uuidOrNull(line.variantId),
      item_name: line.name,
      variant_label: line.variantLabel ?? null,
      unit_price: line.unitPrice,
      quantity: line.quantity,
    }))
}

/**
 * Returns null when there is nothing recordable, so the caller can skip the round
 * trip instead of sending a call the function would only reject.
 *
 * No subtotal or line total is sent — the server derives both, which removes a whole
 * class of disagreement between the record and the WhatsApp message.
 */
export function toOrderPayload({ form, lines, shortRef }) {
  const orderLines = toOrderLines(lines)
  if (orderLines.length === 0) return null

  const isDelivery = form.fulfillmentType === 'delivery'

  return {
    p_short_ref: shortRef,
    p_customer_name: form.customerName.trim(),
    p_customer_phone: form.customerPhone.trim(),
    p_fulfillment_type: form.fulfillmentType,
    p_address: isDelivery ? trimmedOrNull(form.address) : null,
    p_note: trimmedOrNull(form.note),
    p_lines: orderLines,
  }
}
