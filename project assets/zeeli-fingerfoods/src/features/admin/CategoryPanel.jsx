import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { reorder, move, placeNewItem, changedRows } from './sortOrder'

/**
 * Create, rename, reorder and remove categories.
 *
 * The removal guard is enforced in Postgres by a `before delete` trigger, not
 * here (FR-030). This screen's job is to ask well and to report the database's
 * answer in the vendor's language — the trigger is what makes it true even for
 * a request that never came from this screen.
 */
export default function CategoryPanel({ categories, counts, onChanged, onClose }) {
  // The STORED positions, not array indices. Comparing against a synthetic
  // index meant rows whose index happened not to move were never rewritten,
  // so old stored values survived alongside new ones and collided.
  const [rows, setRows] = useState(categories)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(null)

  // `baseline` defaults to what is on screen. Removal passes its own, because
  // by then the deleted row is already gone from the comparison set.
  const persistOrder = async (next, baseline = rows) => {
    const rowsToWrite = changedRows(baseline, next)
    setRows(next)
    if (rowsToWrite.length === 0) return

    setFailure(null)
    // Only what moved (T040). Reordering the top of a long list should write
    // two rows, not the whole category.
    const results = await Promise.all(
      rowsToWrite.map((row) =>
        supabase.from('categories').update({ sort_order: row.sort_order }).eq('id', row.id)
      )
    )
    const failed = results.find((result) => result.error)
    if (failed) {
      console.error('Could not save the order:', failed.error)
      setFailure('Could not save the new order. Reload to see what stuck.')
      return
    }
    onChanged?.()
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    const name = newName.trim()
    if (name === '' || busy) return

    setBusy(true)
    setFailure(null)
    const placed = placeNewItem(rows, { id: null, name })
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, sort_order: placed.at(-1).sort_order })
      .select('id, name, sort_order')
      .single()
    setBusy(false)

    if (error) {
      console.error('Could not add the category:', error)
      setFailure('Could not add that category. Nothing was changed.')
      return
    }
    setRows([...rows, { ...data }])
    setNewName('')
    onChanged?.()
  }

  const handleRename = async (row, name) => {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === row.name) return

    const { error } = await supabase.from('categories').update({ name: trimmed }).eq('id', row.id)
    if (error) {
      console.error('Could not rename:', error)
      setFailure(`Could not rename ${row.name}. Nothing was changed.`)
      return
    }
    setRows(rows.map((r) => (r.id === row.id ? { ...r, name: trimmed } : r)))
    onChanged?.()
  }

  const handleRemove = async (row) => {
    setBusy(true)
    setFailure(null)
    const { error } = await supabase.from('categories').delete().eq('id', row.id)
    setBusy(false)

    if (error) {
      // The trigger raises with a countable, human message — "Move 3 item(s)
      // out of "Drinks" before removing it." Show it rather than a generic
      // failure: it already says exactly what to do (FR-030).
      console.error('Could not remove the category:', error)
      setFailure(error.message)
      setConfirmingRemove(null)
      return
    }
    // Close the gap in the DATABASE, not just on screen. Leaving 0,1,3,4 behind
    // looks harmless — ordering still works — but `placeNewItem` derives the
    // next position from the list length, so the next category created would
    // claim 4 and collide with the row already holding it. A gap becomes a
    // duplicate one step later.
    const remaining = rows.filter((r) => r.id !== row.id)
    await persistOrder(reorder(remaining, 0, 0), remaining)

    setConfirmingRemove(null)
    onChanged?.()
  }

  return (
    <div className="drawer-scrim" role="dialog" aria-modal="true" aria-label="Categories">
      <div className="drawer">
        <div className="drawer__head">
          <h2 className="drawer__title">Categories</h2>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer__rule" />

        {failure && <p className="admin__error">{failure}</p>}

        {rows.map((row, index) => (
          <div key={row.id} className="drawer__size">
            <input
              className="input drawer__sizelabel"
              defaultValue={row.name}
              aria-label={`Name of ${row.name}`}
              onBlur={(event) => handleRename(row, event.target.value)}
            />
            <span className="admin__count">{counts[row.id] ?? 0}</span>

            {/* Always visible, not a fallback. On a phone this IS the way to
                reorder — dragging a row inside a scrolling list fights the
                scroll (FR-029). */}
            <button
              type="button"
              className="drawer__sizedrop"
              aria-label={`Move ${row.name} up`}
              disabled={index === 0}
              onClick={() => persistOrder(move(rows, index, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="drawer__sizedrop"
              aria-label={`Move ${row.name} down`}
              disabled={index === rows.length - 1}
              onClick={() => persistOrder(move(rows, index, +1))}
            >
              ↓
            </button>
            <button
              type="button"
              className="drawer__remove"
              onClick={() => setConfirmingRemove(row.id)}
            >
              Remove
            </button>
          </div>
        ))}

        {confirmingRemove && (
          <div className="drawer__confirm">
            <p className="drawer__confirmtext">
              Remove <strong>{rows.find((r) => r.id === confirmingRemove)?.name}</strong>? This
              cannot be undone. Items you have already removed do not stand in the way.
            </p>
            <div className="drawer__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => handleRemove(rows.find((r) => r.id === confirmingRemove))}
              >
                Remove it
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmingRemove(null)}>
                Keep it
              </button>
            </div>
          </div>
        )}

        <form className="drawer__size" onSubmit={handleCreate}>
          <input
            className="input drawer__sizelabel"
            placeholder="New category"
            aria-label="New category name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" className="btn btn--ghost" disabled={busy}>
            + Add
          </button>
        </form>
      </div>
    </div>
  )
}
