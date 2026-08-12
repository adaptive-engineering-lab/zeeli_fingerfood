import { supabase } from '../../lib/supabaseClient'
import { reduceImage, extensionFor } from './imageResize'
import { photoPaths, itemPrefix } from './storagePaths'

const BUCKET = 'menu-images'

const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

// Storage paths are not recoverable from a public URL by string surgery alone —
// the URL carries a bucket prefix. Keep it in one place so upload and delete
// cannot disagree about the shape.
const pathFromUrl = (url) => {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const at = url.indexOf(marker)
  return at === -1 ? null : url.slice(at + marker.length)
}

/**
 * Reduce a chosen file and upload both derivatives.
 *
 * Returns the pair of public URLs. Does NOT touch the item row — the caller
 * points the row at them, so a failed upload never leaves a row referencing an
 * object that does not exist.
 */
export async function uploadPhoto(itemId, file) {
  const { card, detail, type } = await reduceImage(file)
  const paths = photoPaths(itemId, extensionFor(type))

  const uploads = await Promise.all([
    supabase.storage.from(BUCKET).upload(paths.card, card, { contentType: type }),
    supabase.storage.from(BUCKET).upload(paths.detail, detail, { contentType: type }),
  ])

  const failed = uploads.find((result) => result.error)
  if (failed) {
    // Half an upload is worse than none: it leaves an object nothing references.
    await supabase.storage.from(BUCKET).remove([paths.card, paths.detail])
    throw failed.error
  }

  return { imageUrl: publicUrl(paths.detail), imageCardUrl: publicUrl(paths.card) }
}

/**
 * Release a card/detail pair. Safe to call with nulls.
 *
 * Never call this before the row points somewhere else — an orphaned object is
 * recoverable, a row pointing at a deleted photo is not (FR-022).
 */
export async function releasePhoto({ imageUrl, imageCardUrl }) {
  const paths = [pathFromUrl(imageUrl), pathFromUrl(imageCardUrl)].filter(Boolean)
  if (paths.length === 0) return
  await supabase.storage.from(BUCKET).remove(paths)
}

/**
 * Save an item and its sizes together, through the RPC.
 *
 * The two cannot be separate calls: a failure between them leaves a sizes-mode
 * item with no base price and no sizes — priced at nothing, still available, in
 * front of customers (FR-032). The function is also where the rules are
 * actually enforced, since an admin session could otherwise write directly.
 */
export async function saveItem(draft) {
  const sellsInSizes = draft.sellsInSizes === true

  const { data, error } = await supabase.rpc('save_menu_item', {
    p_id: draft.id ?? null,
    p_name: draft.name,
    p_category_id: draft.categoryId,
    p_description: draft.description || null,
    p_price: sellsInSizes ? null : Number(draft.price),
    p_is_available: draft.isAvailable !== false,
    p_image_url: draft.imageUrl ?? null,
    p_image_card_url: draft.imageCardUrl ?? null,
    p_sizes: sellsInSizes
      ? draft.sizes.map((size) => ({
          id: size.id ?? null,
          label: size.label,
          price: Number(size.price),
          is_available: size.isAvailable !== false,
        }))
      : [],
  })

  if (error) throw error
  return data
}

/** Hide, reversibly. Never deletes (FR-012). */
export async function removeItem(id) {
  const { error } = await supabase
    .from('menu_items')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Bring it back. `categoryId` is required only when the original category was
 * deleted while the item was away — a state the schema deliberately allows,
 * since removed items do not block a category's removal (FR-030).
 */
export async function restoreItem(id, categoryId = null) {
  const patch = { removed_at: null }
  if (categoryId) patch.category_id = categoryId

  const { error } = await supabase.from('menu_items').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Gone for good: the row, then its photos.
 *
 * Row first, deliberately. An orphaned object is recoverable — you can find it
 * and delete it. A row pointing at a photo that no longer exists renders a
 * broken image to customers and cannot be repaired without the original.
 */
export async function discardItem(item) {
  const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
  if (error) throw error

  const { data } = await supabase.storage.from(BUCKET).list(itemPrefix(item.id).slice(0, -1))
  const paths = (data ?? []).map((object) => `${itemPrefix(item.id)}${object.name}`)
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
}
