/**
 * Reducing a phone photo before it is uploaded (FR-020).
 *
 * On the device, not the server: a vendor on 4G waits seconds instead of
 * minutes, and a camera original never crosses the network in either direction.
 * No dependency — `createImageBitmap` and `canvas.toBlob` are in every browser
 * this product targets, and an image library would land in the admin bundle to
 * do what the platform already does.
 */

// Two sizes, because constitution Principle IV requires photos to be *served
// responsively* and one stored size gives the browser nothing to choose
// between. Cards render 150-300px wide on a phone; sending 1600px there wastes
// most of the bytes SC-006 is trying to save.
export const CARD_EDGE = 800
export const DETAIL_EDGE = 1600

const QUALITY = 0.82

/**
 * Pure. The dimensions an image should be reduced to, never enlarged to.
 */
export function targetSize({ width, height }, maxEdge) {
  const longest = Math.max(width, height)

  // Never upscale: a smaller photo re-encoded larger costs bytes and adds no
  // detail. Returning it untouched is the whole rule.
  if (longest <= maxEdge) return { width, height }

  const scale = maxEdge / longest
  return {
    // Math.max(1, …) so an extreme panorama cannot round its short edge to 0,
    // which would make drawImage throw on a canvas of zero height.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function draw(bitmap, maxEdge, type) {
  const { width, height } = targetSize(bitmap, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('no-2d-context')
  context.drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode-failed'))),
      type,
      QUALITY
    )
  })
}

/**
 * A card and a detail derivative from ONE decode of the vendor's file.
 *
 * Rejects rather than falling back to the original. If a device cannot do this
 * work the vendor is told (FR-021) — uploading a multi-megabyte camera file
 * silently on their behalf is the one outcome FR-020 exists to prevent, and it
 * would be invisible until a customer on 4G paid for it.
 */
export async function reduceImage(file) {
  // Two checks, because either alone is a hole. The MIME type rejects a PDF
  // the vendor picked by mistake (FR-019); the decode rejects a file merely
  // *named* .jpg, which nothing but an attempted decode can prove.
  if (!file || !String(file.type ?? '').startsWith('image/')) {
    throw new Error('not-an-image')
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('not-an-image')
  }

  try {
    const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
    // Sequential, not Promise.all: two full-size canvases alive at once is how
    // a mid-range phone runs out of memory on a 12-megapixel photo.
    const detail = await draw(bitmap, DETAIL_EDGE, type)
    const card = await draw(bitmap, CARD_EDGE, type)
    return { card, detail, type }
  } finally {
    bitmap.close?.()
  }
}

function supportsWebp() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}

export function extensionFor(type) {
  return type === 'image/webp' ? 'webp' : 'jpg'
}
