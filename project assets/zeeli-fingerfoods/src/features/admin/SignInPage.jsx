import { useEffect, useState } from 'react'

// A rejected link comes back as an error in the URL fragment, not as an
// exception anywhere we could catch. Without reading it the vendor lands on a
// blank sign-in form having just clicked a link, with nothing to explain why —
// the dead end the spec's edge case exists to forbid (FR-004).
function readLinkError() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.includes('error')) return null

  const params = new URLSearchParams(hash)
  const code = params.get('error_code')

  // Supabase reports a spent link and a timed-out one with the same code, and
  // the difference does not change what the vendor should do next.
  if (code === 'otp_expired') {
    return 'That link has already been used, or it has expired. Links last 15 minutes and work once — send yourself a fresh one.'
  }
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'That link did not work. Send yourself a fresh one.'
}

/**
 * Wireframe 4c — flush left, no card, a 2px rule under the heading, errors
 * inline in accent-700.
 *
 * 4c draws a Password field. That is stale: the clarification session settled on
 * passwordless sign-in by emailed link (FR-001), so there is one field here, not
 * two. The layout is 4c's; the credential is not.
 */
export default function SignInPage({ signIn }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [linkError, setLinkError] = useState(null)

  useEffect(() => {
    const message = readLinkError()
    if (!message) return
    setLinkError(message)
    // Strip the fragment so a reload does not re-accuse a link the vendor has
    // already been told about.
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (sending || email.trim() === '') return

    setSending(true)
    setError(null)

    const { error: signInError } = await signIn(email.trim())

    setSending(false)

    // One outcome, whether or not that address is the vendor's (FR-003). The
    // only errors surfaced are ones that say nothing about who holds an account
    // — a network failure, a misconfigured client. An "unknown address" reply
    // would turn this form into a way to enumerate accounts.
    if (signInError && !isSafeToShow(signInError)) {
      setSent(true)
      return
    }
    if (signInError) {
      setError('Could not send the link just now. Check your connection and try again.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="stack admin-signin">
        <h1 className="admin-signin__title">Check your email</h1>
        <div className="admin-signin__rule" />
        <p className="admin-signin__note">
          If <strong>{email.trim()}</strong> is registered, a sign-in link is on its way. It works
          once and expires in 15 minutes.
        </p>
        <p className="admin-signin__note">Not arrived? Check spam, or send another.</p>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setSent(false)
            setError(null)
          }}
        >
          Send another link
        </button>
      </div>
    )
  }

  return (
    <form className="stack admin-signin" onSubmit={handleSubmit}>
      <h1 className="admin-signin__title">Sign in</h1>
      <div className="admin-signin__rule" />

      {linkError && <p className="admin-signin__error">{linkError}</p>}

      <label className="admin-signin__field">
        <span className="admin-signin__label">Email</span>
        <input
          type="email"
          name="email"
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          autoFocus
        />
      </label>

      {error && <p className="admin-signin__error">{error}</p>}

      <button type="submit" className="btn btn--primary" disabled={sending}>
        {sending ? 'Sending…' : 'Email me a link'}
      </button>

      <p className="admin-signin__note">
        No password. We email a link that signs you in on this device and keeps you signed in.
      </p>
    </form>
  )
}

// Errors that reveal nothing about whether an address is registered. Anything
// else is swallowed into the neutral "check your email" state rather than
// risking a message that distinguishes one address from another.
function isSafeToShow(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('network') || message.includes('fetch') || message.includes('configured')
}
