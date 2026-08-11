import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Who is at the keyboard, in four states.
 *
 *   loading    — we do not know yet. NOT the same as signed out.
 *   signed-out — no session on this device.
 *   not-admin  — a real session that is not the vendor's.
 *   admin      — the vendor.
 *
 * `not-admin` is distinct from `signed-out` on purpose: it is where a stranger
 * who obtained an account lands, and it must render the sign-in screen rather
 * than a management screen whose contents merely fail to load, or an error that
 * confirms an account exists.
 */

// The client cannot answer "is this the vendor?" by reading `admins` — that
// table has no client read policy, so a select returns zero rows for the vendor
// exactly as it does for a stranger, and building it that way would lock the
// vendor out of their own product. is_admin() is the one function the nine
// policies also use, so the UI and the database cannot drift apart (FR-037).
async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin')

  // Fail closed. A network blip must never read as "yes". This is only what the
  // UI shows; every write is checked again in Postgres regardless.
  if (error) {
    console.error('Could not confirm admin status:', error)
    return false
  }
  return data === true
}

export default function useAdminSession() {
  const [state, setState] = useState({ status: 'loading', email: null })

  useEffect(() => {
    if (!supabase) {
      setState({ status: 'signed-out', email: null })
      return
    }

    let cancelled = false

    const resolve = async (session) => {
      if (!session) {
        if (!cancelled) setState({ status: 'signed-out', email: null })
        return
      }
      const admin = await isAdmin()
      if (cancelled) return
      setState({
        status: admin ? 'admin' : 'not-admin',
        email: session.user?.email ?? null,
      })
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))

    // Fires on sign-in, sign-out, and every silent token refresh — which is what
    // keeps FR-005's 30-day session from expiring under the vendor mid-edit.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session)
    })

    return () => {
      cancelled = true
      subscription?.subscription?.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email) => {
    if (!supabase) return { error: new Error('Supabase is not configured') }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Defence in depth, NOT the control: this flag is client-supplied and a
        // crafted request can omit it. Self-signup must also be off at the
        // project level (T007).
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    })

    // Deliberately returned whole: the caller must show one message either way,
    // so the form never reveals who holds an account (FR-003).
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setState({ status: 'signed-out', email: null })
  }, [])

  return { ...state, signIn, signOut }
}
