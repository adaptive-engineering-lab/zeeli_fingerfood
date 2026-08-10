import QtyStepper from '../../components/QtyStepper'
import { formatNaira } from '../../lib/money'
import { startingPrice } from './pricing'

export default function MenuItemCard({ item, quantity, onQuantityChange, onOpen }) {
  const hasVariants = item.variants.length > 0
  const price = startingPrice(item)

  return (
    <article className={item.isAvailable ? 'item-card' : 'item-card item-card--out'}>
      {item.imageUrl ? (
        <img className="item-card__photo" src={item.imageUrl} alt={item.name} loading="lazy" />
      ) : (
        <div className="item-card__photo item-card__photo--empty" aria-hidden="true">
          Photo
        </div>
      )}

      <h3 className="item-card__name">{item.name}</h3>
      {item.description && <p className="item-card__desc">{item.description}</p>}

      <div className="item-card__foot">
        <span className="price">
          {price === null ? '—' : `${hasVariants ? 'From ' : ''}${formatNaira(price)}`}
        </span>

        {!item.isAvailable ? (
          <span className="tag tag-neutral">Sold out</span>
        ) : hasVariants ? (
          <button type="button" className="options-btn" onClick={() => onOpen(item)}>
            Options
          </button>
        ) : (
          <QtyStepper
            value={quantity}
            onChange={(next) => onQuantityChange(item, next)}
            label={item.name}
          />
        )}
      </div>
    </article>
  )
}
