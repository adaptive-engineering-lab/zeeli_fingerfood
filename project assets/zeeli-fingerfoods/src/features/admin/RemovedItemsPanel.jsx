import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { restoreItem, discardItem } from './catalogueWrites'
import { formatNaira } from '../../lib/money'

/**
 * Where removed items live until they are restored or discarded.
 *
 * The vendor's main list deliberately excludes them (FR-015); this is the only
 * place they appear, which is what makes "removed" feel different from "off".
 */
export default function RemovedItemsPanel({ categories, onChanged, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [failure, setFailure] = useState(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(null)
  const [needsCategory, setNeedsCategory] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, price, category_id, image_card_url, image_url, removed_at')
      .not('removed_at', 'is', null)
      .order('removed_at', { ascending: false })

    if (error) {
      console.error('Could not load removed items:', error)
      setFailure('Could not load removed items.')
    }
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const categoryExists = (id) => categories.some((category) => category.id === id)

  const handleRestore = async (item, categoryId = null) => {
    // Its category may have been deleted while it was away — removed items do
    // not block a category's removal (FR-030), so this is reachable by design.
    // Ask rather than fail, and never let it come back belonging to nowhere.
    if (!categoryId && !categoryExists(item.category_id)) {
      setNeedsCategory({ item, categoryId: categories[0]?.id ?? null })
      return
    }

    setBusy(item.id)
    setFailure(null)
    try {
      await restoreItem(item.id, categoryId)
      setNeedsCategory(null)
      await load()
      onChanged?.()
    } catch (error) {
      console.error('Restore failed:', error)
      setFailure(`Could not restore ${item.name}. Nothing was changed.`)
    } finally {
      setBusy(null)
    }
  }

  const handleDiscard = async (item) => {
    setBusy(item.id)
    setFailure(null)
    try {
      await discardItem(item)
      setConfirmingDiscard(null)
      await load()
      onChanged?.()
    } catch (error) {
      console.error('Discard failed:', error)
      setFailure(`Could not discard ${item.name}. Nothing was changed.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="drawer-scrim" role="dialog" aria-modal="true" aria-label="Removed items">
      <div className="drawer">
        <div className="drawer__head">
          <h2 className="drawer__title">Removed items</h2>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer__rule" />

        {failure && <p className="admin__error">{failure}</p>}

        {loading ? (
          <p className="status-line">Loading…</p>
        ) : items.length === 0 ? (
          <p className="drawer__hint">Nothing removed. Items you remove wait here, restorable.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="admin-row">
              <span className="admin-row__name">{item.name}</span>
              <span className="admin-row__price">{item.price ? formatNaira(item.price) : '—'}</span>

              {confirmingDiscard === item.id ? (
                <span className="drawer__confirminline">
                  <button
                    type="button"
                    className="drawer__remove"
                    disabled={busy === item.id}
                    onClick={() => handleDiscard(item)}
                  >
                    Discard for good
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setConfirmingDiscard(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="drawer__confirminline">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy === item.id}
                    onClick={() => handleRestore(item)}
                  >
                    Restore
                  </button>
                  {/* Discard is the one irreversible edge in this feature, so it
                      reads differently from remove on purpose. If the two looked
                      alike the vendor would learn to dismiss both. */}
                  <button
                    type="button"
                    className="drawer__remove"
                    onClick={() => setConfirmingDiscard(item.id)}
                  >
                    Discard
                  </button>
                </span>
              )}
            </div>
          ))
        )}

        {needsCategory && (
          <div className="drawer__confirm">
            <p className="drawer__confirmtext">
              The category <strong>{needsCategory.item.name}</strong> belonged to is gone. Which
              category should it return to?
            </p>
            <select
              className="input"
              value={needsCategory.categoryId ?? ''}
              onChange={(event) =>
                setNeedsCategory({ ...needsCategory, categoryId: event.target.value })
              }
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div className="drawer__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleRestore(needsCategory.item, needsCategory.categoryId)}
              >
                Restore here
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setNeedsCategory(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
