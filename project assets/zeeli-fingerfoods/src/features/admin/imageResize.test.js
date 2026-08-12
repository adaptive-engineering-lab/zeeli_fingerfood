import { describe, it, expect } from 'vitest'
import { targetSize, CARD_EDGE, DETAIL_EDGE } from './imageResize'

// Only `targetSize` is tested here. `reduceImage` needs a real canvas and a real
// decoder — mocking those would prove the mock behaves, not that a photo off a
// phone camera survives the trip. It is exercised in a browser by T030.
describe('targetSize', () => {
  it('scales the long edge down to the maximum, keeping the ratio', () => {
    expect(targetSize({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('treats portrait the same way — long edge, not width', () => {
    expect(targetSize({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never upscales an image already within the maximum', () => {
    // The vendor photographing a receipt at 800px must not have it blown up to
    // 1600 and re-encoded: bigger file, no more detail.
    expect(targetSize({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('leaves an image exactly at the maximum alone', () => {
    expect(targetSize({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900 })
  })

  it('keeps a square square', () => {
    expect(targetSize({ width: 3000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('returns whole pixels', () => {
    const { width, height } = targetSize({ width: 1001, height: 333 }, 800)
    expect(Number.isInteger(width)).toBe(true)
    expect(Number.isInteger(height)).toBe(true)
  })

  it('never rounds a dimension to zero, however extreme the ratio', () => {
    // A panorama would otherwise round its short edge to 0 and produce a canvas
    // that throws on drawImage.
    const { width, height } = targetSize({ width: 10000, height: 3 }, 800)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it('produces a card that is genuinely smaller than the detail size', () => {
    // If these ever collapse to the same number, srcset has nothing to choose
    // between and FR-035 is silently unmet.
    expect(CARD_EDGE).toBeLessThan(DETAIL_EDGE)

    const source = { width: 4000, height: 3000 }
    const card = targetSize(source, CARD_EDGE)
    const detail = targetSize(source, DETAIL_EDGE)
    expect(card.width).toBeLessThan(detail.width)
  })
})
