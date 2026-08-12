import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SEED_CATEGORIES, SEED_ITEMS } from './menuData'

// Postgres rows (snake_case, nested variants) → the camelCase shape the screens
// render. Keeping this in one place means the seed data and the live data are
// interchangeable everywhere downstream.
export function normaliseMenu(categoryRows, itemRows) {
  const categories = categoryRows.map((row) => ({ id: row.id, name: row.name }))

  const items = itemRows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? '',
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    imageUrl: row.image_url ?? null,
    imageCardUrl: row.image_card_url ?? null,
    isAvailable: row.is_available !== false,
    variants: (row.menu_item_variants ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: Number(variant.price),
        isAvailable: variant.is_available !== false,
      })),
  }))

  return { categories, items }
}

async function fetchMenu() {
  const [categories, items] = await Promise.all([
    supabase.from('categories').select('id, name, sort_order').order('sort_order'),
    // Both filters are defence in depth — the policy already applies them for
    // anonymous visitors, and the policy remains the guarantee (FR-011, FR-016).
    //
    // They are here because an ADMIN's session is not filtered by that policy:
    // it may read unavailable and removed items. Without these lines the vendor
    // opening their own storefront sees a different menu from the one customers
    // see — they switch an item off, check the shop, still see it, and conclude
    // the toggle is broken. Verified 2026-08-11: anonymous reads returned 8
    // items where the signed-in admin's browser returned 9.
    supabase
      .from('menu_items')
      .select(
        'id, category_id, name, description, price, image_url, image_card_url, is_available, sort_order, menu_item_variants(id, label, price, is_available, sort_order)'
      )
      .eq('is_available', true)
      .is('removed_at', null)
      .order('sort_order'),
  ])

  if (categories.error) throw categories.error
  if (items.error) throw items.error

  return normaliseMenu(categories.data ?? [], items.data ?? [])
}

/**
 * Loads the menu, falling back to the seed data when the catalogue cannot be
 * READ — the client is unconfigured, the network is down, the query errored.
 * The Instagram link must never land on a blank page, and `usingFallback` lets
 * the UI say the prices are samples rather than pretending they are live.
 *
 * An empty catalogue is NOT a failure and must never reach that fallback
 * (FR-034, SC-014). Zero rows is an answer: the vendor removed or switched off
 * everything, and the honest response is an empty menu.
 *
 * This distinction is the entire point. The vendor's first act with the admin
 * panel is to clear the developer's seeded placeholder catalogue and enter
 * their own — and the previous version treated that successful empty read as a
 * failure and served the seed straight back. Customers would have been offered
 * Puff Puff and Combo Trays at prices nobody at Zeeli ever confirmed,
 * orderable, with a WhatsApp message to match. Feature 002 exists to abolish
 * the placeholder catalogue; papering over its removal would have been the
 * exact opposite.
 */
export default function useMenu() {
  const [state, setState] = useState({
    categories: [],
    items: [],
    loading: true,
    usingFallback: false,
  })

  useEffect(() => {
    let cancelled = false

    const showSeedMenu = () => {
      if (!cancelled) {
        setState({
          categories: SEED_CATEGORIES,
          items: SEED_ITEMS,
          loading: false,
          usingFallback: true,
        })
      }
    }

    if (!supabase) {
      showSeedMenu()
      return
    }

    fetchMenu()
      .then((menu) => {
        if (cancelled) return
        // Read succeeded. Whatever came back is the truth, including nothing.
        setState({ ...menu, loading: false, usingFallback: false })
      })
      .catch((error) => {
        // Read failed. Only here does the seed belong.
        console.error('Menu load failed, showing placeholder menu:', error)
        showSeedMenu()
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
