import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import MenuPage from './features/menu/MenuPage'
import CartPage from './features/cart/CartPage'
import CheckoutPage from './features/checkout/CheckoutPage'
import OrderSentPage from './features/checkout/OrderSentPage'
import './App.css'

// The admin tree is loaded on demand so its weight — an image pipeline, a
// drawer, a variant repeater — never reaches the customer route, whose budget
// constitution Principle IV fixes at 150 KB gzipped (currently 132.86 KB).
//
// This is the only import of features/admin/ anywhere outside that folder.
// A second one, or any static import from it, silently collapses the split:
// the bundle is still correct, just no longer separate. T046 greps the built
// assets for exactly that, because nothing else would notice.
const AdminApp = lazy(() => import('./features/admin/AdminApp'))

// The customer flow from the wireframes, plus /admin/* from spec 002.
function App() {
  return (
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/order-sent" element={<OrderSentPage />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<p className="status-line">Loading…</p>}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<MenuPage />} />
    </Routes>
  )
}

export default App
