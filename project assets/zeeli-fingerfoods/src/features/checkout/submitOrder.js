import { supabase } from '../../lib/supabaseClient'
import { toOrderPayload } from './orderPayload'

/**
 * Records the order through `place_order`, the sole write path (see
 * specs/001-guest-order-persistence). One call, one transaction: the order and all
 * its lines commit together or not at all.
 *
 * Never throws. WhatsApp is the channel that actually reaches the vendor, so a failed
 * write must not block the handoff — the caller gets `persisted: false` and carries on
 * with the reference it generated locally.
 *
 * Returns `{ persisted, shortRef, error? }`. On success `shortRef` is the reference
 * actually stored, which may differ from the one proposed if it collided.
 */
export default async function submitOrder(order) {
  const fallback = { persisted: false, shortRef: order.shortRef }

  if (!supabase) {
    return { ...fallback, error: new Error('Supabase is not configured') }
  }

  try {
    // Inside the try on purpose: building the payload touches caller-supplied
    // fields, and this function is contracted never to throw.
    const payload = toOrderPayload({
      form: order,
      lines: order.lines,
      shortRef: order.shortRef,
    })

    if (!payload) {
      return { ...fallback, error: new Error('Nothing recordable in this order') }
    }

    const { data, error } = await supabase.rpc('place_order', payload)
    if (error) throw error

    return { persisted: true, shortRef: data ?? order.shortRef }
  } catch (error) {
    console.error('Order write failed; continuing to WhatsApp anyway:', error)
    return { ...fallback, error }
  }
}
