import { supabase } from '../../lib/supabaseClient'
import { lineTotal } from '../cart/cartMath'

/**
 * Writes the order to Supabase so the admin dashboard has it. Never throws:
 * WhatsApp is the channel that actually reaches the vendor, so a failed write
 * must not block the handoff — the caller surfaces `persisted: false` instead.
 */
export default async function submitOrder(order) {
  if (!supabase) {
    return { persisted: false, error: new Error('Supabase is not configured') }
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        short_ref: order.shortRef,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        fulfillment_type: order.fulfillmentType,
        address: order.fulfillmentType === 'delivery' ? order.address : null,
        note: order.note?.trim() || null,
        subtotal: order.subtotal,
        status: 'new',
      })
      .select('id')
      .single()

    if (error) throw error

    const { error: itemsError } = await supabase.from('order_items').insert(
      order.lines.map((line) => ({
        order_id: data.id,
        menu_item_id: line.itemId,
        variant_id: line.variantId,
        // Snapshots: the item or variant may be renamed or deleted later.
        item_name_snapshot: line.name,
        variant_label_snapshot: line.variantLabel,
        unit_price_snapshot: line.unitPrice,
        quantity: line.quantity,
        line_total: lineTotal(line),
      }))
    )

    if (itemsError) throw itemsError

    return { persisted: true, orderId: data.id }
  } catch (error) {
    console.error('Order write failed; continuing to WhatsApp anyway:', error)
    return { persisted: false, error }
  }
}
