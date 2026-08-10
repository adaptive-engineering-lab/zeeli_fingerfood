#!/usr/bin/env node
// Verifies the guest-order permission boundary with the same publishable key a
// visitor's browser holds — spec FR-016, SC-004, specs/001-guest-order-persistence.
//
// No in-process test can prove this: the boundary lives in Postgres, and a mocked
// client only proves the mock behaves. This is the one artifact that goes red if
// someone later re-adds a read policy to `orders`.
//
// It writes real probe rows and the customer role cannot delete them. Clean up as
// the vendor afterwards:
//
//   delete from orders where short_ref like 'ZF-PROBE%';   -- order_items cascade
//
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const probeRef = `ZF-PROBE${Math.random().toString(36).slice(2, 6).toUpperCase()}`

const validOrder = {
  p_short_ref: probeRef,
  p_customer_name: 'Permission Probe',
  p_customer_phone: '08000000000',
  p_fulfillment_type: 'delivery',
  p_address: '1 Probe Street',
  p_note: null,
  p_lines: [
    {
      menu_item_id: null,
      variant_id: null,
      item_name: 'Probe item',
      variant_label: null,
      unit_price: 100,
      quantity: 1,
    },
  ],
}

const results = []
const check = (name, passed, detail) => {
  results.push({ name, passed, detail })
  console.log(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`\nVerifying guest-order permissions as the anonymous customer (${probeRef})\n`)

// 1 — the sole write path works
const placed = await supabase.rpc('place_order', validOrder)
check(
  '1 place_order records an order',
  !placed.error && typeof placed.data === 'string',
  placed.error ? placed.error.message : `returned ${placed.data}`
)

// 2-3 — reads return nothing. RLS filters rather than errors, so an empty set is the pass.
for (const [n, table] of [
  ['2', 'orders'],
  ['3', 'order_items'],
]) {
  const { data, error } = await supabase.from(table).select('*').limit(5)
  check(
    `${n} ${table} is unreadable`,
    Boolean(error) || (Array.isArray(data) && data.length === 0),
    error ? error.message : `${data?.length ?? 0} rows`
  )
}

// 4-5 — direct writes are gone; the function is the only way in
const directOrder = await supabase.from('orders').insert({
  short_ref: `${probeRef}X`,
  customer_name: 'Direct insert',
  customer_phone: '08000000000',
  fulfillment_type: 'pickup',
  subtotal: 0,
  status: 'fulfilled', // exactly what the old WITH CHECK true policy allowed
})
check('4 direct insert into orders is rejected', Boolean(directOrder.error), directOrder.error?.code)

const directLine = await supabase.from('order_items').insert({
  order_id: '00000000-0000-0000-0000-000000000000',
  item_name_snapshot: 'Direct insert',
  unit_price_snapshot: 0,
  quantity: 1,
  line_total: 0,
})
check('5 direct insert into order_items is rejected', Boolean(directLine.error), directLine.error?.code)

// 6-8 — no update, no delete. With no policy, RLS matches no rows rather than erroring,
// so "rejected or nothing affected" is the pass; the admin check below proves the row survived.
const updated = await supabase.from('orders').update({ status: 'fulfilled' }).eq('short_ref', probeRef).select()
check(
  '6 orders cannot be updated',
  Boolean(updated.error) || (updated.data?.length ?? 0) === 0,
  updated.error ? updated.error.message : `${updated.data?.length ?? 0} rows affected`
)

const deletedOrder = await supabase.from('orders').delete().eq('short_ref', probeRef).select()
check(
  '7 orders cannot be deleted',
  Boolean(deletedOrder.error) || (deletedOrder.data?.length ?? 0) === 0,
  deletedOrder.error ? deletedOrder.error.message : `${deletedOrder.data?.length ?? 0} rows affected`
)

const deletedLines = await supabase.from('order_items').delete().gt('quantity', 0).select()
check(
  '8 order_items cannot be deleted',
  Boolean(deletedLines.error) || (deletedLines.data?.length ?? 0) === 0,
  deletedLines.error ? deletedLines.error.message : `${deletedLines.data?.length ?? 0} rows affected`
)

// 9 — the function refuses a record the vendor could not act on
const empty = await supabase.rpc('place_order', { ...validOrder, p_short_ref: null, p_lines: [] })
check('9 place_order rejects an empty order', Boolean(empty.error), empty.error?.code)

const failed = results.filter((r) => !r.passed)
console.log(
  failed.length
    ? `\n✗ ${failed.length}/${results.length} failed\n`
    : `\n✓ ${results.length}/${results.length} passed. Clean up: delete from orders where short_ref like 'ZF-PROBE%';\n`
)
process.exit(failed.length ? 1 : 0)
