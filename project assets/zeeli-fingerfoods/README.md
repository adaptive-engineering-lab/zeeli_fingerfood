# Zeeli Finger Foods — Ordering SPA

See `docs/prd.md` for the full product spec (this file is generated from the project's PRD — feed it to speckit's `/specify`).

## Stack
- React + Vite
- Supabase (Postgres + Storage + Auth + Realtime) — project `zeeli-fingerfoods` (`rhkioufbffisvpfwavly`, eu-west-1)
- Vitest + React Testing Library for TDD
- Deploys to Vercel

## Supabase setup (already done for this project)
- **Schema**: `categories`, `menu_items`, `menu_item_variants`, `orders`, `order_items` — see migration `initial_schema`.
- **RLS**: public can read available menu items/variants and insert orders; only authenticated (admin) users can write menu data or read/update orders.
- **Storage**: `menu-images` bucket, public read, admin write — for item photos.
- **Realtime**: enabled on `orders` for the admin dashboard's live new-order alert.

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
    admin/          # admin auth, menu CRUD, orders dashboard (Phases 2 & 6)
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

Admin routes (`/admin`) are not built yet — Phases 2 and 6.

## Fallbacks

- **Menu**: if Supabase is unconfigured or the read fails, `src/features/menu/menuData.js`
  is shown and the page says it's a sample menu. The Instagram link never lands on a blank page.
- **Order write**: a failed insert never blocks the WhatsApp handoff — the customer
  still gets their pre-filled message and the confirmation screen says the copy wasn't saved.
- **WhatsApp deep link**: if `window.open` is blocked (desktop, popup blockers),
  checkout shows the order as copyable text plus the vendor's number.

## Still needed before this is customer-ready
- Vendor's WhatsApp number (`VITE_VENDOR_WHATSAPP_NUMBER` in `.env` is still the `234000…` placeholder)
- Real category list + menu items (seed via the admin panel once Phase 2 is built)
- Which items have size/pack variants, and their labels/prices
- **RLS on `orders`**: a guest checkout insert currently fails with
  `42501 new row violates row-level security policy for table "orders"`, so no order
  reaches the dashboard. The public **insert** policy on `orders` and `order_items`
  still needs to be applied (PRD §7).
