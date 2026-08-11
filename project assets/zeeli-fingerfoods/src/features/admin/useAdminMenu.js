import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * The vendor's view of the catalogue — everything the customer sees plus the
 * items they have switched off.
 *
 * Two differences from `useMenu`, and both matter:
 *
 * 1. No seed fallback. A developer's placeholder menu in the vendor's own
 *    management screen would be actively misleading: they would edit items that
 *    do not exist. If the read fails, say so.
 *
 * 2. `removed_at is null` is filtered HERE, explicitly. The policy hides removed
 *    items from customers, but the vendor's session can read them — so without
 *    this line every item they ever removed reappears in the list they removed
 *    it from, and the removed-items view becomes a duplicate rather than the
 *    only place they live (FR-015).
 */
export default function useAdminMenu() {
  const [state, setState] = useState({
    categories: [],
    items: [],
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    if (!supabase) {
      setState({ categories: [], items: [], loading: false, error: new Error('Not configured') })
      return
    }

    setState((current) => ({ ...current, loading: true, error: null }))

    const [categories, items] = await Promise.all([
      supabase.from('categories').select('id, name, sort_order').order('sort_order'),
      supabase
        .from('menu_items')
        .select(
          'id, category_id, name, description, price, image_url, image_card_url, is_available, has_variants, sort_order, menu_item_variants(id, label, price, is_available, sort_order)'
        )
        .is('removed_at', null)
        .order('sort_order'),
    ])

    const error = categories.error ?? items.error
    if (error) {
      console.error('Could not load the menu:', error)
      setState({ categories: [], items: [], loading: false, error })
      return
    }

    setState({
      categories: (categories.data ?? []).map((row) => ({ id: row.id, name: row.name })),
      items: (items.data ?? []).map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        description: row.description ?? '',
        price: row.price === null ? null : Number(row.price),
        imageUrl: row.image_card_url ?? row.image_url ?? null,
        isAvailable: row.is_available !== false,
        sellsInSizes: row.has_variants === true,
        sizes: (row.menu_item_variants ?? [])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((variant) => ({
            id: variant.id,
            label: variant.label,
            price: Number(variant.price),
            isAvailable: variant.is_available !== false,
          })),
      })),
      loading: false,
      error: null,
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}
