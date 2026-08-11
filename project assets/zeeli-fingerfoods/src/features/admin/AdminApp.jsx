import useAdminSession from './useAdminSession'
import SignInPage from './SignInPage'
import MenuManagerPage from './MenuManagerPage'
import './admin.css'

/**
 * The root of the admin tree (spec 002), and its gate.
 *
 * The gate answers two separate questions, which is the point: "has a session"
 * and "is the vendor" are not the same, and treating them as one is the
 * privilege-escalation path research Finding 0 describes.
 */
export default function AdminApp() {
  const { status, email, signIn, signOut } = useAdminSession()

  // Never render 'loading' as signed-out. Doing so flashes the sign-in form on
  // every reload, which would make FR-005's persistent session feel broken even
  // though it is working perfectly.
  if (status === 'loading') {
    return <p className="status-line">Loading…</p>
  }

  // 'not-admin' deliberately lands here rather than on an error page. A stranger
  // holding a session learns nothing — not that they signed in successfully, not
  // that an admin account exists, not whose it is. They see what a signed-out
  // visitor sees. The database refuses them regardless; this only ensures the UI
  // does not narrate the refusal.
  if (status !== 'admin') {
    return <SignInPage signIn={signIn} />
  }

  return <MenuManagerPage email={email} onSignOut={signOut} />
}
