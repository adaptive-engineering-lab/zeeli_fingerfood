import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon'
import { useCart } from '../cart/cartContext'
import { lineTotal } from '../cart/cartMath'
import { formatNaira } from '../../lib/money'
import submitOrder from './submitOrder'
import { buildOrderMessage, buildWhatsAppUrl, makeShortRef, vendorNumber } from './whatsapp'

function validate(form) {
  const errors = {}
  if (!form.customerName.trim()) errors.customerName = 'We need a name for the order.'
  // Deliberately loose: Nigerian numbers arrive as 080…, +234… or with spaces.
  if (form.customerPhone.replace(/\D/g, '').length < 10) {
    errors.customerPhone = 'Enter a phone number we can reach you on.'
  }
  if (form.fulfillmentType === 'delivery' && !form.address.trim()) {
    errors.address = 'Where should we deliver?'
  }
  return errors
}

/**
 * Wireframe 3c — one column, fulfillment as underline tabs, the order as a
 * table, and a single merged CTA carrying the item count and total.
 */
export default function CheckoutPage() {
  const { lines, itemCount, subtotal, clear } = useCart()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    fulfillmentType: 'delivery',
    address: '',
    note: '',
  })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [fallback, setFallback] = useState(null)
  const [copied, setCopied] = useState(false)

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSending(true)
    const order = { ...form, lines, subtotal, shortRef: makeShortRef() }

    // Record first, then build the message: `place_order` returns the reference
    // actually stored, which differs from the one we proposed if it collided. The
    // customer must quote a reference the vendor can find (FR-015). When recording
    // fails there is no stored record to disagree with, so the local one stands.
    const { persisted, shortRef } = await submitOrder(order)

    const message = buildOrderMessage({ ...order, shortRef })
    const url = buildWhatsAppUrl(vendorNumber(), message)

    // Deliberately NOT `window.open(url, '_blank', 'noopener')`: the noopener
    // feature makes window.open return null even on success, so the fallback below
    // fired on every desktop checkout. Sever the opener by hand instead, which
    // keeps reverse-tabnabbing closed and leaves null meaning "actually blocked".
    const opened = window.open(url, '_blank')
    if (opened) opened.opener = null

    // Mostly desktop browsers without a WhatsApp Web session, or a popup
    // blocker: fall back to a copyable summary rather than losing the order.
    if (!opened) {
      setFallback({ message, url })
      setSending(false)
      return
    }

    clear()
    navigate('/order-sent', { state: { shortRef, persisted } })
  }

  if (itemCount === 0 && !fallback) {
    return (
      <div className="app">
        <div className="page-head">
          <Link className="icon-btn" to="/" aria-label="Back to menu">
            <Icon name="arrowLeft" size={14} />
          </Link>
          <h1 className="page-head__title">Checkout</h1>
        </div>
        <div className="empty">
          <p>Your bag is empty.</p>
          <Link className="cta cta--compact" to="/">
            Browse the menu
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="page-head">
        <Link className="icon-btn" to="/cart" aria-label="Back to bag">
          <Icon name="arrowLeft" size={14} />
        </Link>
        <h1 className="page-head__title">Checkout</h1>
      </div>

      <form className="checkout" onSubmit={handleSubmit} noValidate>
        <div className="field-row">
          <div className="field">
            <label htmlFor="customerName">Name</label>
            <input
              id="customerName"
              className="input"
              value={form.customerName}
              onChange={update('customerName')}
              placeholder="Your full name"
              autoComplete="name"
              aria-invalid={Boolean(errors.customerName)}
            />
            {errors.customerName && <span className="field__error">{errors.customerName}</span>}
          </div>
          <div className="field">
            <label htmlFor="customerPhone">Phone</label>
            <input
              id="customerPhone"
              className="input"
              type="tel"
              inputMode="tel"
              value={form.customerPhone}
              onChange={update('customerPhone')}
              placeholder="080…"
              autoComplete="tel"
              aria-invalid={Boolean(errors.customerPhone)}
            />
            {errors.customerPhone && <span className="field__error">{errors.customerPhone}</span>}
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Fulfillment">
          {['delivery', 'pickup'].map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              className="tab"
              aria-selected={form.fulfillmentType === type}
              onClick={() => setForm((f) => ({ ...f, fulfillmentType: type }))}
            >
              {type === 'delivery' ? 'Delivery' : 'Pickup'}
            </button>
          ))}
        </div>

        {form.fulfillmentType === 'delivery' && (
          <div className="field">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              className="input"
              value={form.address}
              onChange={update('address')}
              placeholder="Delivery address"
              autoComplete="street-address"
              aria-invalid={Boolean(errors.address)}
            />
            {errors.address && <span className="field__error">{errors.address}</span>}
          </div>
        )}

        <div className="field">
          <label htmlFor="note">Note (optional)</label>
          <input
            id="note"
            className="input"
            value={form.note}
            onChange={update('note')}
            placeholder="Spice level, allergies…"
          />
        </div>

        <table className="summary">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="summary__qty">
                Qty
              </th>
              <th scope="col" className="summary__price">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.itemId}::${line.variantId ?? ''}`}>
                <td>
                  {line.name}
                  {line.variantLabel && (
                    <span className="summary__variant"> ({line.variantLabel})</span>
                  )}
                </td>
                <td className="summary__qty">{line.quantity}</td>
                <td className="summary__price">{formatNaira(lineTotal(line))}</td>
              </tr>
            ))}
            <tr className="summary__total">
              <td>Subtotal</td>
              <td />
              <td className="summary__price">{formatNaira(subtotal)}</td>
            </tr>
          </tbody>
        </table>

        {fallback ? (
          <div className="checkout__error">
            <strong>WhatsApp didn’t open.</strong> Copy the order below and send it to{' '}
            +{String(vendorNumber()).replace(/\D/g, '')} on WhatsApp — nothing has been lost.
            <pre>{fallback.message}</pre>
            <div className="field-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(fallback.message)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy order'}
              </button>
              <a className="btn btn-secondary" href={fallback.url} target="_blank" rel="noreferrer">
                Open WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <button type="submit" className="cta" disabled={sending}>
            <Icon name="send" size={15} />
            {sending
              ? 'Sending…'
              : `Send Order — ${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatNaira(subtotal)}`}
          </button>
        )}
      </form>
    </div>
  )
}
