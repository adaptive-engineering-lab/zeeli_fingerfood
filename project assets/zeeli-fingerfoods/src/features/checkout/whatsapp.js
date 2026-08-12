// Building the WhatsApp handoff: the order summary text and the wa.me deep link.
// Pure functions — the vendor number is passed in rather than read from the
// environment here, so the template is testable without a build.
import { lineTotal } from '../cart/cartMath'
import { formatNaira } from '../../lib/money'

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 — these get read aloud on the phone

/** Short, human-friendly reference the customer and vendor can quote in chat. */
export function makeShortRef(random = Math.random) {
  let ref = ''
  for (let i = 0; i < 5; i += 1) {
    ref += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)]
  }
  return `ZF-${ref}`
}

/** "Combo Tray (Tray of 20)" — variant label folded into the printed name. */
export function describeLine(line) {
  return line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name
}

/**
 * The message template from the PRD. Address is omitted for pickup and the note
 * line only appears when the customer wrote one.
 */
export function buildOrderMessage(order) {
  const { customerName, customerPhone, fulfillmentType, address, note, lines, subtotal, shortRef } =
    order

  const head = [
    // No emoji here, deliberately. wa.me's redirect to api.whatsapp.com
    // re-encodes the text parameter and destroys anything outside the Basic
    // Multilingual Plane: 🛍️ (U+1F6CD + U+FE0F) arrived as U+FFFD, so every
    // order the vendor received opened with a replacement character. BMP
    // characters survive intact — the em dash and ₦ below are proof, and they
    // are why this line keeps its typography. Verified 2026-08-12.
    'New Order — Zeeli Finger Foods',
    `Name: ${customerName}`,
    `Phone: ${customerPhone}`,
    `Delivery/Pickup: ${fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup'}`,
  ]
  if (fulfillmentType === 'delivery') head.push(`Address: ${address}`)

  const items = lines.map(
    (line) => `- ${line.quantity} x ${describeLine(line)} — ${formatNaira(lineTotal(line))}`
  )

  const tail = [`Subtotal: ${formatNaira(subtotal)}`]
  if (note?.trim()) tail.push(`Note: ${note.trim()}`)
  tail.push(`Order Ref: ${shortRef}`)

  return [...head, '', 'Items:', ...items, '', ...tail].join('\n')
}

/** wa.me wants digits only — no +, spaces or dashes. */
export function buildWhatsAppUrl(vendorNumber, message) {
  const digits = String(vendorNumber ?? '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function vendorNumber() {
  return import.meta.env.VITE_VENDOR_WHATSAPP_NUMBER ?? ''
}
