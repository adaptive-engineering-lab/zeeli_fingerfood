import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useCart } from '../features/cart/cartContext'
import { formatNaira } from '../lib/money'

export default function AppHeader() {
  const { itemCount, subtotal } = useCart()
  const navigate = useNavigate()

  return (
    <header className="app-header">
      <Link className="app-header__brand" to="/">
        <span className="app-header__brand-short">Zeeli</span>
        <span className="app-header__brand-long">Zeeli Finger Foods</span>
      </Link>
      <button
        type="button"
        className="bag-btn"
        onClick={() => navigate('/cart')}
        aria-label={`Bag: ${itemCount} item${itemCount === 1 ? '' : 's'}, ${formatNaira(subtotal)}`}
      >
        <Icon name="bag" size={14} />
        {itemCount} · {formatNaira(subtotal)}
      </button>
    </header>
  )
}
