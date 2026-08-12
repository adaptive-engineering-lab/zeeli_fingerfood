/**
 * Where an item's photos live in storage. Pure — no Supabase, no I/O.
 */

// Item-scoped rather than flat, so discarding an item clears one prefix in a
// single call instead of needing to remember every filename it ever wrote
// (FR-017).
export function itemPrefix(itemId) {
  return `menu/${itemId}/`
}

/**
 * A card/detail pair for one upload.
 *
 * They share a random stem for two reasons, both of which bite if broken:
 *
 * - **Released together.** Replacing a photo deletes the pair it replaced
 *   (FR-022). One stem means one thing to track; two would eventually strand a
 *   derivative nobody references and nobody notices.
 * - **Never reused.** A fresh stem per upload means a replacement cannot be
 *   served from a cache under the old URL — otherwise the vendor swaps the
 *   picture, sees the old one, and swaps it again.
 */
export function photoPaths(itemId, extension) {
  const stem = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const suffix = String(extension ?? '').replace(/^\./, '').toLowerCase() || 'webp'
  const prefix = itemPrefix(itemId)

  return {
    stem,
    card: `${prefix}${stem}-card.${suffix}`,
    detail: `${prefix}${stem}-detail.${suffix}`,
  }
}
