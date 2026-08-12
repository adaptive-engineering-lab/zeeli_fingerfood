import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import useAdminMenu from './useAdminMenu'
import ItemDrawer from './ItemDrawer'
import RemovedItemsPanel from './RemovedItemsPanel'
import { formatNaira } from '../../lib/money'

/**
 * Wireframe 5b — category sidebar with counts, item rows with a thumbnail,
 * name, price and an availability switch.
 *
 * US1's whole business case lives on this screen: change a price, flip a switch.
 * The drag handles 5b draws arrive with T039; the item drawer behind "Edit"
 * arrives with T025. Neither is stubbed here — a control that looks live and
 * does nothing is worse than one that is not drawn yet.
 */
export default function MenuManagerPage({ email, onSignOut }) {
  const { categories, items, loading, error, reload } = useAdminMenu()
  const [activeCategory, setActiveCategory] = useState(null)
  const [saving, setSaving] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showingRemoved, setShowingRemoved] = useState(false)

  useEffect(() => {
    if (categories.length === 0) return
    setActiveCategory((current) =>
      current && categories.some((category) => category.id === current)
        ? current
        : categories[0].id
    )
  }, [categories])

  const countFor = (categoryId) => items.filter((item) => item.categoryId === categoryId).length
  const visibleItems = items.filter((item) => item.categoryId === activeCategory)

  // Availability is a straight column write — the only catalogue change simple
  // enough not to need save_menu_item, since it touches one row and no sizes.
  const toggleAvailability = async (item) => {
    setSaving(item.id)
    setSaveError(null)

    const { error: updateError } = await supabase
      .from('menu_items')
      .update({ is_available: !item.isAvailable })
      .eq('id', item.id)

    setSaving(null)

    if (updateError) {
      console.error('Could not change availability:', updateError)
      setSaveError(`Could not update ${item.name}. Nothing was changed.`)
      return
    }
    reload()
  }

  // Only on the FIRST load, while there is genuinely nothing to show. Every
  // save calls reload(), which sets loading true again — and returning early
  // here unmounted the whole page including the open drawer, taking the
  // vendor's half-typed item with it. Found 2026-08-12: adding a photo to a new
  // item silently reset the form to blank, after the item had already saved.
  if (loading && items.length === 0) return <p className="status-line">Loading the menu…</p>

  if (error) {
    return (
      <div className="empty">
        <p>Could not load the menu.</p>
        <button type="button" className="btn btn--ghost" onClick={reload}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="admin__bar">
        <span className="admin__brand">Zeeli Admin</span>
        <nav className="admin__nav">
          <span className="admin__tab admin__tab--on">Menu</span>
          {/* T062 — FR-001 and US1 scenario 4. 5b also draws an "Orders" tab;
              that dashboard is explicitly out of scope for this feature. */}
          <button type="button" className="admin__tab admin__signout" onClick={onSignOut}>
            Sign out
          </button>
        </nav>
      </header>

      {email && <p className="admin__who">Signed in as {email}</p>}

      <div className="admin__layout">
        <nav className="admin__cats" aria-label="Categories">
          <span className="admin__catlabel">Categories</span>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="admin__cat"
              aria-current={category.id === activeCategory}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.name} <span className="admin__count">{countFor(category.id)}</span>
            </button>
          ))}
        </nav>

        <section className="admin__items">
          <div className="admin__itemshead">
            <button
              type="button"
              className="btn btn--primary"
              disabled={categories.length === 0}
              onClick={() => setEditing({})}
            >
              + New item
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setShowingRemoved(true)}>
              Removed items
            </button>
          </div>

          {saveError && <p className="admin__error">{saveError}</p>}

          {visibleItems.length === 0 ? (
            <p className="status-line">Nothing in this category yet.</p>
          ) : (
            visibleItems.map((item) => (
              <div key={item.id} className="admin-row">
                <span className="admin-row__thumb" aria-hidden="true">
                  {/* the card derivative: a 26px thumbnail has no business
                      downloading the 1600px detail image */}
                  {item.imageCardUrl ?? item.imageUrl ? (
                    <img src={item.imageCardUrl ?? item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    'Img'
                  )}
                </span>
                <button type="button" className="admin-row__name admin-row__edit" onClick={() => setEditing(item)}>
                  {item.name}
                </button>
                <span className="admin-row__price">
                  {item.sellsInSizes ? cheapestSize(item) : formatNaira(item.price)}
                </span>
                <label className="admin-row__switch">
                  <input
                    type="checkbox"
                    checked={item.isAvailable}
                    disabled={saving === item.id}
                    onChange={() => toggleAvailability(item)}
                  />
                  <span className="admin-row__switchlabel">
                    {item.isAvailable ? 'On' : 'Off'}
                  </span>
                </label>
              </div>
            ))
          )}
        </section>
      </div>

      {editing && (
        <ItemDrawer
          item={editing.id ? editing : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}

      {showingRemoved && (
        <RemovedItemsPanel
          categories={categories}
          onChanged={reload}
          onClose={() => setShowingRemoved(false)}
        />
      )}
    </div>
  )
}

// The "from" price follows the cheapest AVAILABLE size, matching what the
// customer is shown (FR-026).
function cheapestSize(item) {
  const available = item.sizes.filter((size) => size.isAvailable)
  if (available.length === 0) return '—'
  return `from ${formatNaira(Math.min(...available.map((size) => size.price)))}`
}
