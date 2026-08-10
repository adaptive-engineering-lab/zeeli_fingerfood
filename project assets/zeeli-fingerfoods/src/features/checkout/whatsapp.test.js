import { describe, it, expect } from 'vitest'
import { buildOrderMessage, buildWhatsAppUrl, describeLine, makeShortRef } from './whatsapp'

const baseOrder = {
  customerName: 'Ada Obi',
  customerPhone: '08012345678',
  fulfillmentType: 'delivery',
  address: '12 Bode Thomas, Surulere',
  note: '',
  lines: [
    { itemId: 'a1', variantId: null, name: 'Puff Puff (6pc)', variantLabel: null, unitPrice: 800, quantity: 2 },
    {
      itemId: 'b2',
      variantId: 'combo-20',
      name: 'Small Chops Combo Tray',
      variantLabel: 'Tray of 20',
      unitPrice: 3500,
      quantity: 1,
    },
  ],
  subtotal: 5100,
  shortRef: 'ZF-K7P2M',
}

describe('describeLine', () => {
  it('folds the variant label into the printed name', () => {
    expect(describeLine(baseOrder.lines[1])).toBe('Small Chops Combo Tray (Tray of 20)')
  })

  it('leaves a no-variant item alone', () => {
    expect(describeLine(baseOrder.lines[0])).toBe('Puff Puff (6pc)')
  })
})

describe('buildOrderMessage', () => {
  it('renders the PRD template for a delivery order', () => {
    expect(buildOrderMessage(baseOrder)).toBe(
      [
        '🛍️ New Order — Zeeli Finger Foods',
        'Name: Ada Obi',
        'Phone: 08012345678',
        'Delivery/Pickup: Delivery',
        'Address: 12 Bode Thomas, Surulere',
        '',
        'Items:',
        '- 2 x Puff Puff (6pc) — ₦1,600',
        '- 1 x Small Chops Combo Tray (Tray of 20) — ₦3,500',
        '',
        'Subtotal: ₦5,100',
        'Order Ref: ZF-K7P2M',
      ].join('\n')
    )
  })

  it('drops the address line for pickup', () => {
    const message = buildOrderMessage({ ...baseOrder, fulfillmentType: 'pickup' })
    expect(message).toContain('Delivery/Pickup: Pickup')
    expect(message).not.toContain('Address:')
  })

  it('includes the note only when one was written', () => {
    expect(buildOrderMessage(baseOrder)).not.toContain('Note:')
    expect(buildOrderMessage({ ...baseOrder, note: '  Extra pepper  ' })).toContain(
      'Note: Extra pepper'
    )
  })

  it('prices each line by quantity, not unit price', () => {
    expect(buildOrderMessage(baseOrder)).toContain('- 2 x Puff Puff (6pc) — ₦1,600')
  })
})

describe('buildWhatsAppUrl', () => {
  it('strips everything but digits from the vendor number', () => {
    const url = buildWhatsAppUrl('+234 800 000 0000', 'hi')
    expect(url.startsWith('https://wa.me/2348000000000?text=')).toBe(true)
  })

  it('encodes newlines and naira signs so the deep link survives', () => {
    const url = buildWhatsAppUrl('2348000000000', 'Line one\nSubtotal: ₦5,100')
    expect(url).toContain('%0A')
    expect(url).toContain('%E2%82%A6')
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('Line one\nSubtotal: ₦5,100')
  })
})

describe('makeShortRef', () => {
  it('is prefixed and fixed-length', () => {
    expect(makeShortRef(() => 0)).toBe('ZF-AAAAA')
    expect(makeShortRef()).toMatch(/^ZF-[A-Z2-9]{5}$/)
  })

  it('avoids glyphs that get misheard on the phone', () => {
    const refs = Array.from({ length: 200 }, () => makeShortRef()).join('')
    expect(refs).not.toMatch(/[IO01]/)
  })
})
