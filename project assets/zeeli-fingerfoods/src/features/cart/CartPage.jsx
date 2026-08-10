import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import QtyStepper from '../../components/QtyStepper'
import CartBar from '../../components/CartBar'
import { useCart } from './cartContext'
import { lineTotal } from './cartMath'
import { formatNaira } from '../../lib/money'

/** The bag between the menu and checkout: adjust quantities, remove, see subtotal. */
export default function CartPage() {
  const { lines, itemCount, setQuantity, keyFor } = useCart()

  return (
    <div className={itemCount > 0 ? 'app app--has-cartbar' : 'app'}>
      <div className="page-head">
        <Link className="icon-btn" to="/" aria-label="Back to menu">
          <Icon name="arrowLeft" size={14} />
        </Link>
        <h1 className="page-head__title">Your Bag</h1>
      </div>

      {itemCount === 0 ? (
        <div className="empty">
          <p>Your bag is empty.</p>
          <Link className="cta cta--compact" to="/">
            Browse the menu
          </Link>
        </div>
      ) : (
        <div className="stack">
          <div className="cart-lines">
            {lines.map((line) => {
              const key = keyFor(line)
              return (
                <div className="cart-line" key={key}>
                  <div className="cart-line__main">
                    <div className="cart-line__name">{line.name}</div>
                    <div className="cart-line__meta">
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}
                      {formatNaira(line.unitPrice)} each
                    </div>
                  </div>
                  <div className="cart-line__side">
                    <span className="price">{formatNaira(lineTotal(line))}</span>
                    <QtyStepper
                      value={line.quantity}
                      onChange={(next) => setQuantity(key, next)}
                      label={line.name}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <CartBar to="/checkout" label="Checkout" />
    </div>
  )
}
