import { describe, it, expect } from 'vitest'
import { isUuid, toOrderLines, toOrderPayload } from './orderPayload'

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const VARIANT_UUID = '9c858901-8a57-4791-81fe-4c455b099bc9'

const cartLine = (overrides = {}) => ({
  itemId: UUID,
  variantId: null,
  name: 'Puff Puff (6pc)',
  variantLabel: null,
  unitPrice: 800,
  quantity: 2,
  ...overrides,
})

const form = (overrides = {}) => ({
  customerName: 'Ada Obi',
  customerPhone: '08012345678',
  fulfillmentType: 'delivery',
  address: '12 Bode Thomas, Surulere',
  note: '',
  ...overrides,
})

describe('isUuid', () => {
  it('accepts a canonical uuid', () => {
    expect(isUuid(UUID)).toBe(true)
  })

  it('rejects the sample menu ids, which are slugs not uuids', () => {
    expect(isUuid('puff-puff')).toBe(false)
    expect(isUuid('combo-20')).toBe(false)
  })

  it('rejects null, undefined and non-strings', () => {
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(12345)).toBe(false)
  })
})

describe('toOrderLines', () => {
  it('passes a uuid item id through', () => {
    expect(toOrderLines([cartLine()])[0].menu_item_id).toBe(UUID)
  })

  it('nulls a sample-menu id rather than sending a bad uuid', () => {
    // FR-013: an order placed while the live menu is down must still record.
    const [line] = toOrderLines([cartLine({ itemId: 'puff-puff' })])
    expect(line.menu_item_id).toBeNull()
    expect(line.item_name).toBe('Puff Puff (6pc)')
  })

  it('carries variant id and label together', () => {
    const [line] = toOrderLines([
      cartLine({ variantId: VARIANT_UUID, variantLabel: 'Tray of 20', unitPrice: 3500, quantity: 1 }),
    ])
    expect(line.variant_id).toBe(VARIANT_UUID)
    expect(line.variant_label).toBe('Tray of 20')
  })

  it('nulls a non-uuid variant id but keeps its label', () => {
    const [line] = toOrderLines([cartLine({ variantId: 'combo-20', variantLabel: 'Tray of 20' })])
    expect(line.variant_id).toBeNull()
    expect(line.variant_label).toBe('Tray of 20')
  })

  it('leaves variant fields null for a plain item', () => {
    const [line] = toOrderLines([cartLine()])
    expect(line.variant_id).toBeNull()
    expect(line.variant_label).toBeNull()
  })

  it('drops a zero-quantity line, which could never be recorded', () => {
    expect(toOrderLines([cartLine(), cartLine({ quantity: 0 })])).toHaveLength(1)
  })

  it('passes money through untouched — rounding is the server’s job', () => {
    const [line] = toOrderLines([cartLine({ unitPrice: 350.5, quantity: 3 })])
    expect(line.unit_price).toBe(350.5)
    expect(line.quantity).toBe(3)
  })
})

describe('toOrderPayload', () => {
  it('builds the full argument set for a delivery order', () => {
    const payload = toOrderPayload({
      form: form({ note: '  Extra pepper  ' }),
      lines: [cartLine()],
      shortRef: 'ZF-K7P2M',
    })

    expect(payload).toEqual({
      p_short_ref: 'ZF-K7P2M',
      p_customer_name: 'Ada Obi',
      p_customer_phone: '08012345678',
      p_fulfillment_type: 'delivery',
      p_address: '12 Bode Thomas, Surulere',
      p_note: 'Extra pepper',
      p_lines: [
        {
          menu_item_id: UUID,
          variant_id: null,
          item_name: 'Puff Puff (6pc)',
          variant_label: null,
          unit_price: 800,
          quantity: 2,
        },
      ],
    })
  })

  it('nulls the address for pickup even when the form holds one', () => {
    const payload = toOrderPayload({
      form: form({ fulfillmentType: 'pickup' }),
      lines: [cartLine()],
      shortRef: 'ZF-K7P2M',
    })
    expect(payload.p_address).toBeNull()
    expect(payload.p_fulfillment_type).toBe('pickup')
  })

  it('turns a whitespace-only note into null', () => {
    const payload = toOrderPayload({ form: form({ note: '   ' }), lines: [cartLine()], shortRef: 'X' })
    expect(payload.p_note).toBeNull()
  })

  it('sends no subtotal — the server derives it', () => {
    const payload = toOrderPayload({ form: form(), lines: [cartLine()], shortRef: 'X' })
    expect(payload).not.toHaveProperty('p_subtotal')
  })

  // US2: the caller skips the round trip entirely rather than sending a call the
  // function would reject.
  it('returns null for an empty cart', () => {
    expect(toOrderPayload({ form: form(), lines: [], shortRef: 'X' })).toBeNull()
  })

  it('returns null when every line has zero quantity', () => {
    const lines = [cartLine({ quantity: 0 }), cartLine({ quantity: 0 })]
    expect(toOrderPayload({ form: form(), lines, shortRef: 'X' })).toBeNull()
  })
})
