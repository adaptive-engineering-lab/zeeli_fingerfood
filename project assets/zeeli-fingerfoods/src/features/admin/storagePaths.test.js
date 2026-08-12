import { describe, it, expect } from 'vitest'
import { photoPaths, itemPrefix } from './storagePaths'

const ITEM = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('itemPrefix', () => {
  it('scopes every object to its item, with a trailing slash', () => {
    // Discarding an item clears one prefix in a single call (FR-017). If paths
    // were flat, discard would have to know every filename it ever wrote.
    expect(itemPrefix(ITEM)).toBe(`menu/${ITEM}/`)
  })
})

describe('photoPaths', () => {
  it('puts both derivatives under the item prefix', () => {
    const { card, detail } = photoPaths(ITEM, 'webp')
    expect(card.startsWith(itemPrefix(ITEM))).toBe(true)
    expect(detail.startsWith(itemPrefix(ITEM))).toBe(true)
  })

  it('gives card and detail one shared stem, differing only by suffix', () => {
    // The pair must rise and fall together: replacing a photo releases both
    // (FR-022), and a mismatched stem would strand one of them forever.
    const { card, detail, stem } = photoPaths(ITEM, 'webp')
    expect(card).toBe(`${itemPrefix(ITEM)}${stem}-card.webp`)
    expect(detail).toBe(`${itemPrefix(ITEM)}${stem}-detail.webp`)
  })

  it('produces a different stem on every call', () => {
    // Reusing a path would serve the old photo from cache after a replacement —
    // the vendor would swap the picture and see no change.
    const a = photoPaths(ITEM, 'webp')
    const b = photoPaths(ITEM, 'webp')
    expect(a.stem).not.toBe(b.stem)
  })

  it('honours the extension on both, with no double dots', () => {
    for (const extension of ['webp', 'jpg', '.png']) {
      const { card, detail } = photoPaths(ITEM, extension)
      expect(card).not.toMatch(/\.\./)
      expect(detail).not.toMatch(/\.\./)
      expect(card.endsWith(extension.replace(/^\./, ''))).toBe(true)
    }
  })

  it('falls back to a sane extension rather than producing a dotless path', () => {
    const { card } = photoPaths(ITEM, '')
    expect(card).toMatch(/\.[a-z0-9]+$/)
  })
})
