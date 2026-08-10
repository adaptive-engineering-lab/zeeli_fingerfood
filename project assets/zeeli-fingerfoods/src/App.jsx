import { Route, Routes } from 'react-router-dom'
import MenuPage from './features/menu/MenuPage'
import CartPage from './features/cart/CartPage'
import CheckoutPage from './features/checkout/CheckoutPage'
import OrderSentPage from './features/checkout/OrderSentPage'
import './App.css'

// The customer flow from the wireframes. Admin routes land under /admin in a
// later phase (PRD §10) and are deliberately absent here.
function App() {
  return (
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/order-sent" element={<OrderSentPage />} />
      <Route path="*" element={<MenuPage />} />
    </Routes>
  )
}

export default App
