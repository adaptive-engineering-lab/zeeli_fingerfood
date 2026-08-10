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
    supabase
      .from('menu_items')
      .select(
        'id, category_id, name, description, price, image_url, is_available, sort_order, menu_item_variants(id, label, price, is_available, sort_order)'
      )
      .order('sort_order'),
  ])

  if (categories.error) throw categories.error
  if (items.error) throw items.error

  return normaliseMenu(categories.data ?? [], items.data ?? [])
}

/**
 * Loads the menu, falling back to the seed data whenever Supabase is not
 * configured or the read fails — the Instagram link must never land on a blank
 * page. `usingFallback` lets the UI say so instead of pretending it is live.
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
        if (menu.items.length === 0) {
          showSeedMenu()
          return
        }
        setState({ ...menu, loading: false, usingFallback: false })
      })
      .catch((error) => {
        console.error('Menu load failed, showing placeholder menu:', error)
        showSeedMenu()
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
