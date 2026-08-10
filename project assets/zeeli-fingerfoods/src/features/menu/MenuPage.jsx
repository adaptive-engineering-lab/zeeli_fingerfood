import { useEffect, useState } from 'react'
import AppHeader from '../../components/AppHeader'
import CartBar from '../../components/CartBar'
import ItemSheet from './ItemSheet'
import MenuItemCard from './MenuItemCard'
import useMenu from './useMenu'
import { useCart } from '../cart/cartContext'

/**
 * Wireframe 1a — categories in a left sidebar on desktop, a scrolling chip row
 * on mobile, items in an equal-width grid either way.
 */
export default function MenuPage() {
  const { categories, items, loading, usingFallback } = useMenu()
  const { addLine, setQuantity, quantityFor, keyFor } = useCart()

  const [activeCategory, setActiveCategory] = useState(null)
  const [openItem, setOpenItem] = useState(null)

  // Default to the first category once the menu arrives; if it later reloads
  // without that category, fall back to the first one again.
  useEffect(() => {
    if (categories.length === 0) return
    setActiveCategory((current) =>
      current && categories.some((category) => category.id === current) ? current : categories[0].id
    )
  }, [categories])

  const visibleItems = items.filter((item) => item.categoryId === activeCategory)

  // Stepping a no-variant item straight from its card: 0 → 1 adds a line, and
  // any later change edits that line in place.
  const handleQuantityChange = (item, next) => {
    if (next <= 0) {
      setQuantity(keyFor({ itemId: item.id, variantId: null }), 0)
      return
    }
    const current = quantityFor(item.id, null)
    if (current === 0) {
      addLine({
        itemId: item.id,
        variantId: null,
        name: item.name,
        variantLabel: null,
        unitPrice: item.price,
        quantity: next,
      })
      return
    }
    setQuantity(keyFor({ itemId: item.id, variantId: null }), next)
  }

  return (
    <div className="app app--has-cartbar">
      <AppHeader />

      <div className="cat-chips" role="tablist" aria-label="Menu categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className="cat-chip"
            aria-pressed={category.id === activeCategory}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="menu-layout">
        <nav className="cat-sidebar" aria-label="Menu categories">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="cat-link"
              aria-current={category.id === activeCategory}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="status-line">Loading the menu…</p>
        ) : visibleItems.length === 0 ? (
          <p className="status-line">Nothing in this category yet.</p>
        ) : (
          <div className="menu-grid">
            {visibleItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                quantity={quantityFor(item.id, null)}
                onQuantityChange={handleQuantityChange}
                onOpen={setOpenItem}
              />
            ))}
          </div>
        )}
      </div>

      {usingFallback && (
        <p className="status-line">
          Showing a sample menu — live prices load once the menu is published.
        </p>
      )}

      {openItem && <ItemSheet item={openItem} onClose={() => setOpenItem(null)} />}

      <CartBar />
    </div>
  )
}
