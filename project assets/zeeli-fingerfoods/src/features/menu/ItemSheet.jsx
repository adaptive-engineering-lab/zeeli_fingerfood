import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import QtyStepper from '../../components/QtyStepper'
import { useCart } from '../cart/cartContext'
import { formatNaira } from '../../lib/money'

/**
 * Wireframe 2a — a bottom sheet on mobile, a centred modal on desktop (CSS
 * decides which), with the sizes as a segmented row of label-over-price cells.
 */
export default function ItemSheet({ item, onClose }) {
  const { addLine } = useCart()
  const sheetRef = useRef(null)

  const sizes = item.variants.filter((variant) => variant.isAvailable)
  const [variantId, setVariantId] = useState(sizes[0]?.id ?? null)
  const [quantity, setQuantity] = useState(1)

  const variant = sizes.find((size) => size.id === variantId) ?? null
  const unitPrice = variant ? variant.price : item.price
  const canAdd = unitPrice !== null && quantity > 0

  useEffect(() => {
    sheetRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleAdd = () => {
    if (!canAdd) return
    addLine({
      itemId: item.id,
      variantId: variant?.id ?? null,
      name: item.name,
      variantLabel: variant?.label ?? null,
      unitPrice,
      quantity,
    })
    onClose()
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        ref={sheetRef}
        tabIndex={-1}
      >
        <span className="sheet__grabber" aria-hidden="true" />
        <button type="button" className="icon-btn sheet__close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>

        {item.imageUrl ? (
          <img className="sheet__photo" src={item.imageUrl} alt={item.name} />
        ) : (
          <div className="sheet__photo item-card__photo--empty" aria-hidden="true">
            Photo
          </div>
        )}

        <h2 className="sheet__title">{item.name}</h2>
        {item.description && <p className="sheet__desc">{item.description}</p>}

        {sizes.length > 0 && (
          <>
            <span className="eyebrow">Choose a size</span>
            <div className="sizes" role="group" aria-label="Size">
              {sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  className="size-opt"
                  aria-pressed={size.id === variantId}
                  onClick={() => setVariantId(size.id)}
                >
                  {size.label}
                  <span className="size-opt__price">{formatNaira(size.price)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sheet__row">
          <span className="eyebrow">Qty</span>
          <QtyStepper value={quantity} onChange={setQuantity} min={1} size="lg" label={item.name} />
        </div>

        <button type="button" className="cta" onClick={handleAdd} disabled={!canAdd}>
          Add to Cart{canAdd ? ` — ${formatNaira(unitPrice * quantity)}` : ''}
        </button>
      </div>
    </div>
  )
}
