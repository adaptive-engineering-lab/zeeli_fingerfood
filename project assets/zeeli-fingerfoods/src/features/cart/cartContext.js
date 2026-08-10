import { createContext, useContext } from 'react'

// Split from CartProvider so the module exports no components — keeps Fast
// Refresh happy and the lint rule about mixed exports satisfied.
export const CartContext = createContext(null)

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside <CartProvider>')
  return value
}
