import { Link, useLocation } from 'react-router-dom'
import Icon from '../../components/Icon'

/** PRD §6.1 step 7 — the confirmation the customer lands back on. */
export default function OrderSentPage() {
  const { state } = useLocation()

  return (
    <div className="app">
      <div className="page-head">
        <Icon name="check" size={16} />
        <h1 className="page-head__title">Order sent</h1>
      </div>

      <div className="stack">
        <p>We’ll confirm payment details with you in WhatsApp.</p>
        {state?.shortRef && (
          <p className="eyebrow">Order ref: {state.shortRef}</p>
        )}
        {state?.persisted === false && (
          <p className="status-line status-line--error">
            We couldn’t save a copy on our side — if you don’t hear back, send the message again
            from WhatsApp.
          </p>
        )}
        <Link className="cta" to="/">
          Back to the menu
        </Link>
      </div>
    </div>
  )
}
