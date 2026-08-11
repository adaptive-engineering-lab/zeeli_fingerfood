/**
 * The root of the admin tree (spec 002). Everything the vendor sees lives under
 * here and nowhere else, because this file is the only thing App.jsx reaches —
 * and it reaches it lazily, so none of this weight lands on the customer route.
 *
 * Deliberately empty for now: T002 establishes the split boundary before there
 * is anything behind it to split off, and the auth gate (T018) has to be in
 * place before a management screen exists to gate.
 */
export default function AdminApp() {
  return null
}
