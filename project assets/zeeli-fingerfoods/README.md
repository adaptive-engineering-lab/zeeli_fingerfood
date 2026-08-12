# Zeeli Finger Foods — Ordering SPA

See `docs/prd.md` for the full product spec (this file is generated from the project's PRD — feed it to speckit's `/specify`).

## Stack
- React + Vite
- Supabase (Postgres + Storage + Auth + Realtime) — project `zeeli-fingerfoods` (`rhkioufbffisvpfwavly`, eu-west-1)
- Vitest + React Testing Library for TDD
- Deploys to Vercel

## Supabase setup (already done for this project)
- **Schema**: `categories`, `menu_items`, `menu_item_variants`, `orders`, `order_items` — see migration `initial_schema`.
- **RLS**: the public can read available, non-removed menu items and variants. It cannot insert
  orders directly — `place_order` is the only write path. Catalogue writes and order reads are
  gated on `public.is_admin()`, **not** on merely being authenticated: those are different
  questions, and conflating them is a privilege-escalation path (see the admin section).
- **Storage**: `menu-images` bucket, public read, admin write — for item photos.
- **Realtime**: enabled on `orders` for a future admin dashboard's new-order alert. Nothing in the
  app subscribes to it yet, but `@supabase/supabase-js` bundles the Realtime client regardless —
  see Known gaps, where it is the larger half of the Principle IV miss.

To connect a fresh clone to this same Supabase project, copy `.env.example` to `.env` — it's already filled in with this project's public URL and publishable key (safe to commit as an example; the values are not secret, they're the anon/publishable pair Supabase designs for frontend use).

## Getting started
```bash
npm install
cp .env.example .env   # already pre-filled — just confirm it, or add your own project's values
npm run dev
```

## Testing (TDD)
```bash
npm run test        # run once
npm run test:watch  # watch mode
```
Write the failing test first, then the implementation — see `src/features/cart/cartMath.{js,test.js}` for the pattern used throughout this project.

## Project structure
```
src/
  styles/           # modernist.css — the design system, vendored from Claude Design
  lib/              # Supabase client, shared utilities
  features/
    menu/           # customer-facing browse (Phase 3)
    cart/           # cart state + math (Phase 4)
    checkout/       # checkout form + WhatsApp handoff (Phase 5)
    admin/          # admin auth + menu management (shipped); orders dashboard still to come
  components/       # shared/presentational components
  test/             # test setup
```

## Design system

The UI is built on **Modernist**, imported from the Claude Design project
*Wireframe scope pending*. `src/styles/modernist.css` is a verbatim copy of that
project's `styles.css` — re-import it rather than editing it, and keep app-level
rules in `src/App.css`.

Modernist's rules are load-bearing: zero corner radius everywhere, 2px dividers
instead of whitespace or shadows, labels flush left (including inside wide
buttons), Archivo throughout, and the accent (`#ec3013`) reserved for the primary
action and small emphasis. Accent text at paragraph size uses
`--color-accent-700`, since the raw accent only clears 3:1 against the ground.

One deliberate departure: the system asks for photographs in black and white
(`.grayscale`). Food photography is the product here, so item photos stay in
colour — see `.item-card__photo` in `src/App.css`.

**Adherence is machine-checked**, by `scripts/check-design-adherence.mjs`, which
`npm run lint` runs after oxlint:

```bash
npm run check:design   # or just: npm run lint
```

It fails the build on four things: a raw hex colour, a `font-family` that isn't
`var(--font-*)`, a `border-radius` that isn't a radius token (`50%` is allowed —
the system uses it for radio dots), and a raw px value in a spacing property that
duplicates a `--space-*` token. Values with no token — font sizes, hairline
borders, the odd `5px` — are legitimately raw and pass. `src/styles/modernist.css`
is exempt: it is the vendored system and defines the raw values everything else
references. The spacing tokens are read out of that file at run time, so
re-importing the design system keeps the check honest.

The design project ships its own `_adherence.oxlintrc.json` covering the first two
rules. It cannot run here: it relies on `no-restricted-syntax`, which oxlint does
not implement, and its selectors match JavaScript literals only — so it would miss
`App.css`, which is where the risk actually lives. This script is the local
equivalent.

## Screens implemented

From `Zeeli Wireframes.dc.html` in the same design project. Each turn offered
three directions; these are the ones built:

| Screen | Wireframe | Notes |
| --- | --- | --- |
| Menu browse | **1a** — sidebar categories, grid | Sidebar on desktop, scrolling chip row on mobile |
| Item detail / variants | **2a** — bottom sheet, segmented sizes | Centred modal above 768px, same component |
| Checkout | **3c** — tabbed fulfillment, table summary, merged CTA | Single column, centred on desktop |

Plus a bag screen and an order-sent confirmation, which the wireframes reference
but don't draw.

| Admin sign-in | **4c** — flush left, no card, inline error | One email field; 4c draws a password, which the passwordless decision obsoleted |
| Menu management | **5b** — category sidebar, drag to reorder | Move buttons replace the drag grip on touch |
| Item editor | **6a** — side drawer, size repeater | Bottom sheet at phone width, reusing `ItemSheet`'s idiom |

The orders dashboard and its realtime alerts remain unbuilt — deliberately out of scope for
feature 002.

## Fallbacks

- **Menu**: if Supabase is unconfigured or the read fails, `src/features/menu/menuData.js`
  is shown and the page says it's a sample menu. The Instagram link never lands on a blank page.
- **Order write**: a failed write never blocks the WhatsApp handoff — the customer
  still gets their pre-filled message and the confirmation screen says the copy wasn't saved.
  `submitOrder` is contracted never to throw.
- **WhatsApp deep link**: if `window.open` is blocked (desktop, popup blockers),
  checkout shows the order as copyable text plus the vendor's number.

## Catalogue data

`supabase/seed.sql` holds **provisional** categories, items and variants — the ones
drawn in the wireframes, not a menu the vendor has confirmed. It uses fixed ids, so
it is idempotent and order lines keep pointing at the same items across re-runs.

It exists so the live read path is exercised and order lines record real
`menu_item_id` / `variant_id` values instead of nulls. Every price in it is a
placeholder. The admin panel (PRD phase 2) is how the vendor replaces it.

## Still needed before this is customer-ready
- ~~Vendor's WhatsApp number~~ — **set 2026-08-12** to the vendor's real number.
  It lives in `.env` (gitignored) as `VITE_VENDOR_WHATSAPP_NUMBER`, digits only with
  the country code and no `+`. **It must also be set in the deployment environment** —
  it is baked into the bundle at build time, so a deploy without it opens a chat with
  nobody and the failure is silent.
- Confirmed category list, items and prices to replace `supabase/seed.sql`.
  The vendor can now do this themselves through `/admin` — see
  [specs/002-admin-menu-management](../../specs/002-admin-menu-management/).
- Which items really have size/pack variants, and their labels/prices (PRD §11)

## How a guest order is recorded

Shipped as [specs/001-guest-order-persistence](../../specs/001-guest-order-persistence/).

Checkout calls one database function, `place_order`, which is the **sole write path**
for orders. It inserts the order and every line in a single transaction and returns
the stored short reference. Customers hold **no** direct write permission on `orders`
or `order_items` and no read permission at all — the function decides `status`,
`subtotal` and every `line_total` itself.

The client must not ask for the row back: Postgres applies `SELECT` policies to
`RETURNING` rows, so the earlier "insert, read the id, insert the lines" path was
rejected outright and recorded nothing. `src/features/checkout/orderPayload.js` builds
the call (pure, unit-tested); `submitOrder.js` makes it and never throws.

Verify the permission boundary against the live project with the same publishable key
a visitor's browser holds:

```bash
npm run verify:permissions   # 23 assertions; writes ZF-PROBE… rows, see the script header for cleanup
```

Migration: `supabase/migrations/20260810__place_order_rpc.sql`.

**The Supabase linter flags this function twice and both warnings are expected**
(`0028_anon_security_definer_function_executable`,
`0029_authenticated_security_definer_function_executable`). They report that
`place_order` is callable by unauthenticated users as a `SECURITY DEFINER` function —
which is the design. Guests are never signed in, hold no table write permission, and
this is the only route by which an order can be recorded. Revoking `EXECUTE` or
switching to `SECURITY INVOKER` stops every order reaching the vendor.

## The admin area

Shipped as [specs/002-admin-menu-management](../../specs/002-admin-menu-management/).
The vendor runs their own menu at `/admin` — prices, availability, items, photos,
sizes, categories and their order. `supabase/seed.sql` is no longer the catalogue;
it is disposable starting data the vendor replaces.

### Signing in

Passwordless. The vendor enters their email and opens a single-use link; there is no
password to forget and no reset flow. A session lasts as long as it is used, so a link
is needed only on a new device or after signing out — email is off the path of a
routine visit, which is what makes a link-only scheme tolerable at all.

Three project settings carry this and none is expressible as a migration:

- **Self-signup disabled.** Without it a stranger can mint an account. `shouldCreateUser:
  false` in the client is defence in depth, not the control — the flag is client-supplied
  and a crafted request can omit it.
- **Email OTP expiration 900s.** With no password and no second factor the vendor's
  inbox *is* the credential; this bounds how long a link left sitting in it stays a key.
- **Access token expiry 3600s, session timeouts off.** The access token is not the
  session; the client refreshes it silently. Raising it only lengthens how long a
  leaked token works.

### Who counts as an admin

Being signed in and being the vendor are different questions. `public.admins` is an
allow-list, keyed to `auth.users` with `on delete cascade`, and it has **RLS enabled
with no policy** — no client can read it, including the vendor. Everything asks
`public.is_admin()` instead, a `security definer` function that answers only about the
caller. It is both the predicate behind all nine admin policies and the browser's way
to ask "am I the vendor?", so the UI and the database cannot drift apart.

Adding an admin is one insert:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'them@example.com';
```

Deleting the auth user revokes the grant automatically.

### Two functions do the writing

`place_order` is not the only `security definer` function now. `save_menu_item` writes a
menu item **and reconciles its sizes in one transaction**, because from the browser
those are two round trips: a failure between them leaves a sizes-mode item with no base
price and no sizes — priced at nothing, still visible to customers.

Both re-check permission **inside** their own body. `security definer` bypasses RLS, so
the policies protecting these tables do not protect these functions. `save_menu_item`
calls `is_admin()` itself; removing that line turns it into a public catalogue-write
endpoint. It carries the same two expected linter warnings as `place_order`, for the
same reason.

### Removing is not deleting

`menu_items.removed_at` is a soft removal: hidden from customers *by policy* and from
the vendor's main list, but intact and restorable. Discarding is the one irreversible
action — it deletes the row and then clears the item's storage prefix, in that order,
because an orphaned object is recoverable and a photo-less row is not.

A category cannot be removed while it holds **live** items; a `before delete` trigger
raises with a count of what must move first. Already-removed items do not block it, so
an item can outlive its category — which is why restoring one asks where it should go.

### Photos

Reduced on the vendor's device before upload, never server-side and never skipped: a
6 MB camera photo becomes roughly 200 KB (card, 800px) and 800 KB (detail, 1600px),
both WebP, from a single decode. Two sizes exist so the customer's browser can choose —
one stored size gives `srcset` nothing to pick between. A phone renders cards at about
170px and takes the 800px candidate.

Files that are not images are rejected on MIME type **and** on a failed decode, since a
text file renamed `.jpg` is only proved by trying to decode it.

## Known gaps

- **Constitution Principle IV is not met on two of its three clauses.** The customer
  bundle is inside budget (133 KB of 150), but Lighthouse mobile scores **82** against a
  target of ≥90, and FCP is **2.0s** against <1.5s. Two causes, both measured:
  `@supabase/supabase-js` statically imports its Realtime client — roughly 60 websocket
  code markers in a bundle that opens no websocket — and Archivo arrives via an
  `@import` inside the vendored `modernist.css`, which serialises DNS, TLS and two
  stylesheet round trips before any text can paint. Preconnect hints in `index.html`
  recovered part of it (79 → 82). Closing the rest means importing `postgrest-js`,
  `auth-js` and `storage-js` directly instead of the umbrella package, and self-hosting
  the font — neither is a small change, and both touch the shipped customer path.
- No audit trail. `updated_at` records *when* an item changed, never *who*. With two
  admins that question is now askable and unanswerable.
- Both admins hold identical privileges, including read access to every order and so to
  every customer's name, phone number and address. There are no roles.
