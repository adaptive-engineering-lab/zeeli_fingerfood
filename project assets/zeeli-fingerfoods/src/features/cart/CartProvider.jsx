import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartContext } from './cartContext'
import { addOrUpdateLine, cartSubtotal, removeZeroQtyLines } from './cartMath'

const STORAGE_KEY = 'zeeli.cart.v1'

// A line is keyed by itemId + variantId (null variantId = item with no variants),
// matching the identity cartMath uses and the order_items rows we later insert.
const lineKey = (line) => `${line.itemId}::${line.variantId ?? ''}`

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Private mode, quota, or a stale shape — an empty bag is the safe start.
    return []
  }
}

export default function CartProvider({ children }) {
  const [lines, setLines] = useState(readStoredCart)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Persistence is a convenience; never let it break checkout.
    }
  }, [lines])

  const addLine = useCallback((line) => {
    setLines((current) => addOrUpdateLine(current, line))
  }, [])

  const setQuantity = useCallback((key, quantity) => {
    setLines((current) =>
      removeZeroQtyLines(
        current.map((line) => (lineKey(line) === key ? { ...line, quantity } : line))
      )
    )
  }, [])

  const removeLine = useCallback((key) => {
    setLines((current) => current.filter((line) => lineKey(line) !== key))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
    return {
      lines,
      itemCount,
      subtotal: cartSubtotal(lines),
      quantityFor: (itemId, variantId = null) =>
        lines.find((line) => line.itemId === itemId && line.variantId === variantId)?.quantity ?? 0,
      keyFor: lineKey,
      addLine,
      setQuantity,
      removeLine,
      clear,
    }
  }, [lines, addLine, setQuantity, removeLine, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
