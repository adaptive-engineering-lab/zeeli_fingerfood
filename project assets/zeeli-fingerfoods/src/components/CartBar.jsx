import { Link } from 'react-router-dom'
import { useCart } from '../features/cart/cartContext'
import { formatNaira } from '../lib/money'

/** The sticky bottom summary from the wireframes. Renders nothing on an empty bag. */
export default function CartBar({ to = '/cart', label = 'View Cart' }) {
  const { itemCount, subtotal } = useCart()
  if (itemCount === 0) return null

  return (
    <div className="cart-bar">
      <span className="cart-bar__count">
        {itemCount} item{itemCount === 1 ? '' : 's'} · {formatNaira(subtotal)}
      </span>
      <Link className="cta cta--compact" to={to}>
        {label}
      </Link>
    </div>
  )
}
