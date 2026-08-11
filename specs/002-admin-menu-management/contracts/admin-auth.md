# Contract: admin identity and sign-in

Two halves: the predicate Postgres uses to recognise the vendor, and the sign-in flow the browser
drives. The predicate lands **first** — see the ordering note at the bottom, which is the one thing
in this feature that must not be resequenced.

---

## 1. `public.is_admin()`

```text
is_admin() → boolean
  language sql, stable, security definer, set search_path = public, pg_temp
  exists (select 1 from public.admins where user_id = auth.uid())
```

`revoke execute from public; grant execute to anon, authenticated;` — the anonymous role needs it
because policies it is subject to call it, and it leaks nothing: it answers only about the caller.

### The nine policies that change

Each moves from `auth.role() = 'authenticated'` to `public.is_admin()`:

| Object | Policy | Command |
|---|---|---|
| `categories` | admin full access categories | ALL |
| `menu_items` | admin full access menu_items | ALL |
| `menu_item_variants` | admin full access menu_item_variants | ALL |
| `orders` | admin can read orders | SELECT |
| `orders` | admin can update orders | UPDATE |
| `order_items` | admin can read order_items | SELECT |
| `storage.objects` | admin can upload menu images | INSERT |
| `storage.objects` | admin can update menu images | UPDATE |
| `storage.objects` | admin can delete menu images | DELETE |

**Contract**: after this change, a session that is authenticated but absent from `admins` MUST be
refused by every row above, and MUST read zero orders.

### Public catalogue read, narrowed

`menu_items` public SELECT changes from `is_available = true` to
`is_available = true and removed_at is null` (FR-016). Variants and categories are unchanged.

---

## 2. Sign-in flow

### Requesting a link

```text
supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: false, emailRedirectTo: <origin>/admin }
})
```

**Contract**:

- Resolves the same way whether or not the address belongs to the vendor (FR-003). The UI MUST show
  one message — "if that address is registered, a link is on its way" — and MUST NOT branch on the
  result in a way an observer could distinguish.
- `shouldCreateUser: false` is **defence in depth, not the control**. Self-signup MUST also be
  disabled at the project level, because this flag is client-supplied and a crafted request can omit
  it.
- Link validity MUST be 15 minutes (FR-004) — a project setting, not a client parameter.

### Completing sign-in

The client library exchanges the link for a session on load. **Contract**: the admin area MUST treat
"has a session" and "is the admin" as different questions. A signed-in non-admin MUST see the same
thing as a signed-out visitor — never a management screen whose contents merely fail to load.

### Session

**Contract**: FR-005 requires ≥30 days of ordinary use without a fresh link, and FR-006 requires a
link only when there is no valid session. `supabase-js` persists and auto-refreshes by default; the
**refresh-token lifetime is a project setting that MUST be verified to outlast 30 days**. Getting
this wrong is invisible until the vendor is unexpectedly signed out, so it is a task, not an
assumption.

### Signing out

`supabase.auth.signOut()`. **Contract**: afterwards no management screen is reachable and no
catalogue write succeeds from that browser.

---

## 3. `useAdminSession()`

```text
useAdminSession() → { status, email, signIn(email), signOut() }
  status: 'loading' | 'signed-out' | 'not-admin' | 'admin'
```

**Contract**: `status` starts `'loading'` and MUST NOT be treated as signed-out while loading — a
flash of the sign-in form on every reload would make FR-005's persistent session feel broken. The
`'not-admin'` state is distinct from `'signed-out'` on purpose: it is the state a self-signed-up
stranger lands in, and it MUST render the sign-in screen rather than an error that confirms the
account exists.

### Where `'admin'` vs `'not-admin'` comes from

`admins` has **no client read policy** (§1), so the browser cannot answer this by querying the table
— a `select` against it returns zero rows for the vendor and for a stranger alike, which is
indistinguishable from "not an admin" and would lock the vendor out of their own product.

**Contract**: the hook resolves the distinction by calling `is_admin()` directly:

```text
const { data, error } = await supabase.rpc('is_admin')
// data === true  → 'admin'
// data === false → 'not-admin'
// error          → 'not-admin' (fail closed)
```

This is what the `grant execute to anon, authenticated` in §1 is for — the function is already the
project's single answer to "is this session the vendor?", and reusing it means the UI and the nine
policies cannot drift apart. It leaks nothing: it answers only about the caller, never about who
else holds an account (FR-003, FR-037).

Three properties this relies on, all of which §1 already provides:

- **`security definer`** — it reads `admins` despite that table's lockdown.
- **`auth.uid()`** — it is scoped to the caller, so an anonymous visitor gets `false`, not an error.
- **Fail closed** — a network or permission error resolves to `'not-admin'`, never `'admin'`. This
  is a UI convenience only; the actual guarantee is the policy, which is evaluated server-side on
  every write regardless of what the client believes.

---

## Ordering requirement

`is_admin()` and the nine repointed policies MUST be applied to the target project **before** any
sign-in UI is merged or deployed.

Today no account can exist, so the over-broad `authenticated` predicate is unreachable. Shipping
sign-in first would make it reachable — a stranger who obtained a session would hold full catalogue
write and read access to every customer's name, phone and address. There is no window in which both
are true, and this ordering is what guarantees it.
