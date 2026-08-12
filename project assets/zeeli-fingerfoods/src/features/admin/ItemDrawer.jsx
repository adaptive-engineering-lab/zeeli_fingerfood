import { useState } from 'react'
import validateItem from './itemValidation'
import { saveItem, uploadPhoto, releasePhoto, removeItem } from './catalogueWrites'

const blank = (categoryId) => ({
  id: null,
  name: '',
  categoryId,
  description: '',
  price: '',
  isAvailable: true,
  sellsInSizes: false,
  sizes: [],
  imageUrl: null,
  imageCardUrl: null,
})

/**
 * Wireframe 6a — a side drawer over the list on desktop, a bottom sheet at
 * phone width, reusing the CSS idiom already in `features/menu/ItemSheet.jsx`.
 *
 * The size repeater lands with T033; `sizes` is carried through the save path
 * from the start so the two never have to be retrofitted onto each other.
 */
export default function ItemDrawer({ item, categories, onClose, onSaved }) {
  const [draft, setDraft] = useState(item ?? blank(categories[0]?.id ?? null))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [photoState, setPhotoState] = useState(null)
  const [failure, setFailure] = useState(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const set = (field) => (event) => setDraft({ ...draft, [field]: event.target.value })

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFailure(null)
    setPhotoState('Reducing and uploading…')
    try {
      // Needs an id to file the photo under. A brand-new item is saved first so
      // storage stays item-scoped and a discard can clear one prefix (FR-017).
      let id = draft.id
      if (!id) {
        const check = validateItem(draft)
        if (!check.ok) {
          setErrors(check.errors)
          setPhotoState(null)
          setFailure('Fill in the item first, then add the photo.')
          return
        }
        id = await saveItem(draft)
      }

      const previous = { imageUrl: draft.imageUrl, imageCardUrl: draft.imageCardUrl }
      const uploaded = await uploadPhoto(id, file)

      // Point the row at the new pair BEFORE releasing the old one. Reversing
      // this order is how an item ends up referencing a deleted photo.
      await saveItem({ ...draft, id, ...uploaded })
      if (previous.imageUrl) await releasePhoto(previous)

      setDraft({ ...draft, id, ...uploaded })
      setPhotoState(null)
      onSaved?.()
    } catch (error) {
      console.error('Photo failed:', error)
      setPhotoState(null)
      setFailure(
        error.message === 'not-an-image'
          ? 'That file is not a photo. Choose a JPG or PNG from your camera roll.'
          : 'Could not prepare that photo on this device. Nothing was changed.'
      )
    }
  }

  const handleSave = async (event) => {
    event.preventDefault()

    const check = validateItem(draft)
    setErrors(check.errors)
    if (!check.ok) return

    setSaving(true)
    setFailure(null)
    try {
      await saveItem(draft)
      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Save failed:', error)
      // The edits stay on screen. Clearing the form on failure is how a vendor
      // loses a half-typed item and stops trusting the tool (FR-032's other half).
      setFailure('That did not save — you may be offline. Your changes are still here; try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setSaving(true)
    try {
      await removeItem(draft.id)
      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Remove failed:', error)
      setFailure('Could not remove that item. Nothing was changed.')
      setSaving(false)
    }
  }

  return (
    <div className="drawer-scrim" role="dialog" aria-modal="true" aria-label="Edit item">
      <form className="drawer" onSubmit={handleSave}>
        <div className="drawer__head">
          <h2 className="drawer__title">{draft.id ? 'Edit item' : 'New item'}</h2>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer__rule" />

        {failure && <p className="admin__error">{failure}</p>}

        <div className="drawer__photo">
          <span className="drawer__thumb">
            {draft.imageCardUrl ? <img src={draft.imageCardUrl} alt="" /> : 'Photo'}
          </span>
          <div className="drawer__photoside">
            <label className="btn btn--ghost drawer__file">
              {draft.imageUrl ? 'Replace photo' : 'Add photo'}
              <input type="file" accept="image/*" onChange={handlePhoto} hidden />
            </label>
            <span className="drawer__hint">
              {photoState ?? 'JPG or PNG. Reduced on this device before upload.'}
            </span>
          </div>
        </div>

        <label className="admin-signin__field">
          <span className="admin-signin__label">Name</span>
          <input className="input" value={draft.name} onChange={set('name')} />
          {errors.name && <span className="drawer__err">{errors.name}</span>}
        </label>

        <label className="admin-signin__field">
          <span className="admin-signin__label">Category</span>
          <select className="input" value={draft.categoryId ?? ''} onChange={set('categoryId')}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <span className="drawer__err">{errors.categoryId}</span>}
        </label>

        <label className="admin-signin__field">
          <span className="admin-signin__label">Description</span>
          <textarea className="input" rows={2} value={draft.description} onChange={set('description')} />
        </label>

        <label className="admin-signin__field">
          <span className="admin-signin__label">Price</span>
          <input
            className="input"
            inputMode="decimal"
            value={draft.price ?? ''}
            onChange={set('price')}
            disabled={draft.sellsInSizes}
          />
          {errors.price && <span className="drawer__err">{errors.price}</span>}
        </label>

        <div className="drawer__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* 6a labels this "Delete item". It is a REMOVE: reversible, restorable
            for at least 30 days. The wireframe predates that clarification, and
            calling a reversible action "delete" is how a vendor hesitates over
            something safe — or worse, trusts something that isn't. */}
        {draft.id &&
          (confirmingRemove ? (
            <div className="drawer__confirm">
              <p className="drawer__confirmtext">
                Remove <strong>{draft.name}</strong>? Customers stop seeing it immediately. You can
                restore it, complete, from removed items.
              </p>
              <div className="drawer__actions">
                <button type="button" className="btn btn--primary" onClick={handleRemove}>
                  Remove it
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmingRemove(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="drawer__remove" onClick={() => setConfirmingRemove(true)}>
              Remove item
            </button>
          ))}
      </form>
    </div>
  )
}
