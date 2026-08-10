# PRD: Zeeli Finger Foods — Online Ordering SPA

**Owner:** Zeeli Finger Foods (Lagos small chops/grills vendor)
**Doc status:** v1 draft, ready for speckit `/specify`
**Last updated:** 2026-08-10

---

## 1. Background

Zeeli Finger Foods currently takes orders via Instagram DM/WhatsApp with no digital menu or cart. Customers scroll posts to figure out what's available and prices, which is slow and error-prone for both sides. This project builds a single-page ordering site: customers browse a live menu, build a cart, and check out by sending a pre-formatted order straight into WhatsApp. An admin panel lets the vendor manage the menu and see order history — no code edits required to add a new snack.

Business context (from public profile): small chops & grills, delivery Mon–Sun 9am–5pm, outdoor catering/events, Lagos-based, 5k+ customers served.

## 2. Goals

- Replace "scroll Instagram to find prices" with a fast, real menu the customer can browse and filter.
- Let the customer build a cart and hand off a clean, structured order to WhatsApp in one tap — no manual typing of item lists.
- Let the admin (non-technical) add/edit/remove menu items and photos from a simple dashboard, no deploys required.
- Give the admin a running list of orders placed (status: new → confirmed → fulfilled) even though payment/confirmation still happens in WhatsApp.
- Fast, lightweight, mobile-first — most traffic will land from an Instagram bio link on a phone.

## 3. Non-goals (v1)

- No in-app payment processing (Paystack/Flutterwave) — payment is arranged manually in the WhatsApp chat (bank transfer).
- No WhatsApp Business API / automated bot replies — this uses a `wa.me` deep link that opens the customer's own WhatsApp with a pre-filled message.
- No delivery-fee calculation or zone logic — vendor quotes delivery cost in chat.
- No multi-vendor/marketplace support — single business only.
- No customer accounts/login — guest checkout only. Admin is the only authenticated role.
- No native mobile app.

## 4. Users

| Role | Description | Key needs |
|---|---|---|
| **Customer** | Discovers via Instagram bio link, browses on phone | See photos, prices, categories fast; build cart; one-tap order to WhatsApp |
| **Admin (vendor)** | Zeeli staff, non-technical | Log in; add/edit/remove items + photos; toggle item availability; view/update order status |

## 5. Confirmed tech decisions

| Decision | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Small, fast dev loop, small bundle with tree-shaking |
| Backend/storage | **Supabase** (Postgres + Storage + Auth) | Admin needs a real upload UI, not a JSON file in Git; Supabase gives DB + image storage + admin auth without running a server |
| Order delivery | `wa.me` deep link with pre-filled, URL-encoded message | Free, no approval process, works immediately, customer sends from their own WhatsApp |
| Order history | Also persisted in Supabase (`orders` table) | Admin gets a dashboard/status tracking beyond the WhatsApp chat log |
| Payment | Manual, arranged in WhatsApp (bank transfer) | v1 simplicity; revisit Paystack integration later |
| Delivery pricing | Not calculated in-app; vendor quotes it | Keeps checkout simple; delivery cost varies too much for v1 rules |
| Hosting | Vercel | Zero-config Vite deploys, fast global CDN, free tier |

## 6. Core user flows

### 6.0 Order-lifecycle decisions

| Decision | Choice |
|---|---|
| Ordering outside business hours (Mon–Sun 9am–5pm) | **Allowed anytime.** Show a small banner/note when outside hours: "We're currently offline — orders placed now will be confirmed when we reopen." No hard block on checkout. |
| Stock/availability | **Manual toggle** per item (`is_available` boolean, already in section 7's data model) — admin flips it, no quantity counts to manage. |
| Minimum order | **None for v1.** |
| Admin new-order alerts | **Active**, not just a passive list. Dashboard needs a live signal (sound + badge/toast) the moment a new row lands in `orders`, via a Supabase Realtime subscription on the table — admin doesn't have to refresh or rely solely on WhatsApp to notice a new order. |
| Catering/events | **Out of scope for v1.** No event date/headcount fields; catering enquiries continue off-app via DM/WhatsApp as today. |
| Item variants | **Yes, needed.** Some items sell in size/pack tiers (e.g. tray of 20 vs 50). Modeled as `menu_item_variants` (section 7) — variant picker replaces the plain price on any item with `has_variants = true`. |
| Admin access | **Single admin login** for v1 (one Supabase Auth user). |


### 6.1 Customer flow
1. Land on menu page (default view: all categories, e.g. Small Chops, Grills, Platters/Trays, Drinks).
2. Filter/search by category; each item shows photo, name, price, short description, and an "Add to cart" stepper.
3. Sticky cart summary (bottom bar on mobile) shows item count + subtotal.
4. Cart view: adjust quantities, remove items, see subtotal.
5. Checkout form: name, phone number, delivery address **or** pickup, optional note (e.g. spice level, allergies). No catering/event fields in v1 — catering enquiries stay off-app (handled directly in DM/WhatsApp as today).
6. Tap **"Send order on WhatsApp"** →
   - Order is written to Supabase (`orders` + `order_items`) with status `new`.
   - App opens `https://wa.me/<vendor-number>?text=<encoded order summary>`.
   - Customer's WhatsApp opens with the message pre-filled; they tap send.
7. Confirmation screen: "Order sent! We'll confirm payment details in WhatsApp."

**WhatsApp message template:**
```
🛍️ New Order — Zeeli Finger Foods
Name: {customer_name}
Phone: {customer_phone}
Delivery/Pickup: {delivery_or_pickup}
Address: {address_if_delivery}

Items:
- {qty} x {item_name} — ₦{line_total}
...

Subtotal: ₦{subtotal}
Note: {optional_note}
Order Ref: {short_order_id}
```

### 6.2 Admin flow
1. Log in at `/admin` (Supabase Auth — email/password, single or small set of admin accounts).
2. **Menu management:** list of items with category, price, photo, availability toggle; add/edit/delete item (name, price, category, description, photo upload to Supabase Storage, in-stock toggle).
3. **Category management:** add/rename/reorder categories.
4. **Orders dashboard:** list of orders newest-first, filter by status (`new`, `confirmed`, `fulfilled`, `cancelled`); tap an order to see full detail and update status.

## 7. Data model (Supabase / Postgres)

```
categories
  id (uuid, pk)
  name (text)
  sort_order (int)

menu_items
  id (uuid, pk)
  category_id (fk -> categories.id)
  name (text)
  description (text, nullable)
  price (numeric, nullable)     -- base price; null if item ONLY sells via variants
  image_url (text, nullable)   -- Supabase Storage public URL
  is_available (bool, default true)
  has_variants (bool, default false)
  sort_order (int)
  created_at, updated_at (timestamptz)

menu_item_variants
  id (uuid, pk)
  menu_item_id (fk -> menu_items.id)
  label (text)                  -- e.g. "Tray of 20", "Tray of 50"
  price (numeric)
  is_available (bool, default true)
  sort_order (int)

orders
  id (uuid, pk)
  short_ref (text)              -- human-friendly ref shown in WhatsApp msg
  customer_name (text)
  customer_phone (text)
  fulfillment_type (enum: delivery | pickup)
  address (text, nullable)
  note (text, nullable)
  subtotal (numeric)
  status (enum: new | confirmed | fulfilled | cancelled, default new)
  created_at, updated_at (timestamptz)

order_items
  id (uuid, pk)
  order_id (fk -> orders.id)
  menu_item_id (fk -> menu_items.id)
  variant_id (fk -> menu_item_variants.id, nullable)  -- null if item has no variants
  item_name_snapshot (text)     -- in case item/variant is edited/deleted later
  variant_label_snapshot (text, nullable)
  unit_price_snapshot (numeric)
  quantity (int)
  line_total (numeric)
```

**RLS (Row Level Security) notes:**
- `categories`, `menu_items`, `menu_item_variants`: public read (available items only); write restricted to authenticated admin.
- `orders`, `order_items`: public **insert only** (customer checkout, no read/update); read/update restricted to authenticated admin.

## 8. Non-functional requirements

- **Performance:** Lighthouse mobile performance score ≥ 90; first contentful paint < 1.5s on 4G; total JS bundle (customer-facing route) < 150KB gzipped.
- **Images:** served responsively (Supabase Storage + on-upload resize/compress, or a CDN transform), lazy-loaded below the fold.
- **Mobile-first:** primary breakpoint is phone; admin panel can be less optimized for mobile but must be usable.
- **Offline/error handling:** if the WhatsApp deep link fails to open (rare, mostly desktop without WhatsApp Web session) or Supabase write fails, show a fallback: a copyable order summary + the vendor's WhatsApp number.
- **Accessibility:** basic semantic HTML, alt text on item photos (from item name), sufficient color contrast.
- **No PII beyond what's needed:** customer name/phone/address stored only for order fulfillment.

## 9. Success metrics (v1)

- Menu page loads in < 2s on a mid-range phone over 4G.
- Checkout-to-WhatsApp completion rate (cart started → WhatsApp opened) — track via simple event count in Supabase.
- Admin can add a new item (with photo) in under 60 seconds without help.

## 10. Suggested build phases (maps to spec-driven / TDD units)

1. **Foundation:** Supabase schema + RLS policies; Vite + React scaffold; deploy pipeline to Vercel.
2. **Admin auth + menu CRUD:** login, category management, item + variant management, image upload — tests for validation rules (required fields, price > 0, at least one variant if `has_variants`). Building this first means there's real menu data to test the customer side against.
3. **Customer menu (read path):** category list, item grid, item card component (incl. variant picker where applicable) — unit tests for filtering/search logic.
4. **Cart:** cart state (context or lightweight store), add/remove/update qty, variant-aware line items — unit tests for cart math (subtotals, edge cases like qty 0, switching variants).
5. **Checkout → WhatsApp:** form validation, order persistence to Supabase, message template builder, `wa.me` link construction — unit tests for message encoding/template correctness.
6. **Admin orders dashboard:** list, filter, status update, Supabase Realtime subscription for live new-order alerts (sound + badge) — tests for status transitions and for the alert firing on insert.
7. **Polish:** performance pass (bundle size, image optimization), empty states, error fallbacks.

## 11. Open questions / risks

- **Vendor WhatsApp number:** confirm the exact number to embed in the `wa.me` link.
- **Category list:** confirm the actual category taxonomy against the real menu (currently assumed: Small Chops / Grills / Platters/Trays / Drinks).
- **Which items have variants, and their labels/prices:** needed to seed `menu_item_variants` — e.g. does every tray-based item have the same tier labels (20/50/100), or does each item define its own?
- **Multiple photos per item:** single photo assumed sufficient for v1.

---

### Using this with speckit

This PRD is written to seed a speckit spec. Suggested flow:
1. `specify init` the project.
2. Feed section 2 (Goals), 6 (Flows), and 7 (Data model) into `/specify` to generate the formal spec.
3. Use section 10 (Build phases) as the basis for `/plan` and `/tasks` breakdown, keeping each phase as its own testable slice.
4. Answer the open questions in section 11 before `/plan` locks the data model, since the variant question especially would change the schema.
