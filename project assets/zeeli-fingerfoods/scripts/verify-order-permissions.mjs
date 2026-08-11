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

// ---------------------------------------------------------------------------
// The admin boundary — spec 002, T012 / T067 / T013
//
// Everything above probes the ANONYMOUS visitor. The case that does not exist
// today and must never work is a session that is authenticated but is not the
// vendor: before `is_admin()`, all nine admin policies said `auth.role() =
// 'authenticated'`, so any account at all held full catalogue write and read
// access to every customer's name, phone and address.
//
// This section provisions its own two identities and deletes them afterwards.
// It deliberately does NOT use the vendor's real account: a boundary check that
// needs production credentials is one nobody runs.
//
// Needs a service-role key, which mints users and is far too powerful to sit in
// a browser. Add to .env (already gitignored):
//
//   SUPABASE_SERVICE_ROLE_KEY=...   # Dashboard → Project Settings → API keys
//
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceKey) {
  console.log(
    '\n  --   admin boundary (T012/T067) SKIPPED: set SUPABASE_SERVICE_ROLE_KEY in .env to run it.\n' +
      '       Until it runs, "authenticated is not admin" is asserted nowhere.'
  )
} else {
  console.log('\nVerifying the admin boundary with two throwaway identities\n')

  const admin = createClient(env.VITE_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stamp = Math.random().toString(36).slice(2, 8)
  const users = {}
  const asUser = {}
  let probeCategoryId = null

  const makeUser = async (label) => {
    const email = `zf-probe-${label}-${stamp}@example.com`
    const password = `Probe!${stamp}${label}`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw new Error(`could not create the ${label} probe user: ${error.message}`)
    users[label] = data.user

    // Sign in with the SAME publishable key a browser holds — a session created
    // through the service key would not exercise the policies at all.
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const signIn = await client.auth.signInWithPassword({ email, password })
    if (signIn.error) throw new Error(`could not sign in as ${label}: ${signIn.error.message}`)
    asUser[label] = client
    return client
  }

  const tinyPng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ])

  try {
    const stranger = await makeUser('stranger')
    const vendor = await makeUser('vendor')

    const { data: category } = await admin
      .from('categories')
      .insert({ name: `ZZ probe ${stamp}`, sort_order: 999 })
      .select('id')
      .single()
    probeCategoryId = category?.id ?? null

    // -- the stranger: a real session, absent from `admins` ------------------

    const isAdminStranger = await stranger.rpc('is_admin')
    check('10 stranger: is_admin() is false', isAdminStranger.data === false, String(isAdminStranger.data))

    for (const [n, table] of [
      ['11', 'orders'],
      ['12', 'order_items'],
      ['13', 'admins'],
    ]) {
      const { data, error } = await stranger.from(table).select('*').limit(5)
      check(
        `${n} stranger: ${table} reads 0 rows`,
        Boolean(error) || (Array.isArray(data) && data.length === 0),
        error ? error.message : `${data?.length ?? 0} rows`
      )
    }

    const strangerWrite = await stranger
      .from('menu_items')
      .insert({ category_id: probeCategoryId, name: 'Stranger item', price: 100, has_variants: false })
      .select()
    check(
      '14 stranger: catalogue write is rejected',
      Boolean(strangerWrite.error) || (strangerWrite.data?.length ?? 0) === 0,
      strangerWrite.error?.code ?? `${strangerWrite.data?.length ?? 0} rows`
    )

    const strangerRpc = await stranger.rpc('save_menu_item', {
      p_id: null, p_name: 'Stranger via RPC', p_category_id: probeCategoryId,
      p_description: null, p_price: 100, p_is_available: true,
      p_image_url: null, p_image_card_url: null, p_sizes: [],
    })
    check(
      '15 stranger: save_menu_item is refused by the function itself',
      Boolean(strangerRpc.error),
      strangerRpc.error?.code ?? 'SUCCEEDED'
    )

    const strangerUpload = await stranger.storage
      .from('menu-images')
      .upload(`probe/${stamp}-stranger.png`, tinyPng, { contentType: 'image/png' })
    check('16 stranger: storage upload is rejected', Boolean(strangerUpload.error), strangerUpload.error?.message)

    const { data: visible } = await stranger.from('menu_items').select('id').limit(5)
    check(
      '17 stranger: can still read available items, like any visitor',
      Array.isArray(visible) && visible.length > 0,
      `${visible?.length ?? 0} rows`
    )

    // -- the vendor: the SAME operations must SUCCEED ------------------------
    //
    // Without this half the suite is worthless. Every assertion above is a
    // denial, and a policy that denied everyone — `using (false)`, a mistyped
    // function name, a revoked grant — would satisfy all of them while locking
    // the vendor out of their own product. The check must fail both ways.

    await admin.from('admins').insert({ user_id: users.vendor.id, email: users.vendor.email })

    const isAdminVendor = await vendor.rpc('is_admin')
    check('18 vendor: is_admin() is true', isAdminVendor.data === true, String(isAdminVendor.data))

    const vendorOrders = await vendor.from('orders').select('id').limit(5)
    check('19 vendor: can read orders', !vendorOrders.error, vendorOrders.error?.message ?? 'allowed')

    const vendorRpc = await vendor.rpc('save_menu_item', {
      p_id: null, p_name: `ZZ vendor probe ${stamp}`, p_category_id: probeCategoryId,
      p_description: null, p_price: 250, p_is_available: true,
      p_image_url: null, p_image_card_url: null, p_sizes: [],
    })
    check(
      '20 vendor: save_menu_item succeeds',
      !vendorRpc.error && typeof vendorRpc.data === 'string',
      vendorRpc.error?.message ?? `created ${vendorRpc.data}`
    )

    const vendorUpload = await vendor.storage
      .from('menu-images')
      .upload(`probe/${stamp}-vendor.png`, tinyPng, { contentType: 'image/png' })
    check('21 vendor: storage upload succeeds', !vendorUpload.error, vendorUpload.error?.message ?? 'allowed')

    const vendorAdmins = await vendor.from('admins').select('*')
    check(
      '22 vendor: still cannot read `admins` — nobody can',
      (vendorAdmins.data?.length ?? 0) === 0,
      `${vendorAdmins.data?.length ?? 0} rows`
    )

    // -- T013: revoke the grant and watch the positives collapse -------------

    await admin.from('admins').delete().eq('user_id', users.vendor.id)

    const revoked = await vendor.rpc('is_admin')
    check('23 revoking the grant takes access away again', revoked.data === false, String(revoked.data))
  } catch (error) {
    check('admin boundary section completed', false, error.message)
  } finally {
    // Leave nothing behind, whether or not the assertions passed.
    if (probeCategoryId) {
      await admin.from('menu_items').delete().eq('category_id', probeCategoryId)
      await admin.from('categories').delete().eq('id', probeCategoryId)
    }
    await admin.storage.from('menu-images').remove([
      `probe/${stamp}-stranger.png`,
      `probe/${stamp}-vendor.png`,
    ])
    for (const user of Object.values(users)) {
      await admin.auth.admin.deleteUser(user.id) // cascades the `admins` row
    }
    await admin.from('orders').delete().like('short_ref', 'ZF-PROBE%')
  }
}

const failed = results.filter((r) => !r.passed)
console.log(
  failed.length
    ? `\n✗ ${failed.length}/${results.length} failed\n`
    : `\n✓ ${results.length}/${results.length} passed.\n`
)
process.exit(failed.length ? 1 : 0)
