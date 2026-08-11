# Phase 0 Research: Admin Authentication & Menu Management

Everything below was checked against the live project (`rhkioufbffisvpfwavly`) rather than assumed.

## Finding 0: shipping sign-in would open a privilege-escalation path

The single most important thing found. All nine policies that guard writes and customer data test
**`auth.role() = 'authenticated'`**:

| Object | Policies testing `auth.role() = 'authenticated'` |
|---|---|
| `categories`, `menu_items`, `menu_item_variants` | admin full access (ALL) — 3 policies |
| `orders` | admin can read, admin can update — 2 policies |
| `order_items` | admin can read — 1 policy |
| `storage.objects` (`menu-images`) | upload, update, delete — 3 policies |

`auth.role()` answers *"is this request signed in?"*, not *"is this the vendor?"*. Today
`select count(*) from auth.users` returns **0**, so nothing can be authenticated and the distinction
has never mattered. This feature's whole purpose is to create the first authenticated session.

The consequence, if shipped unchanged: **any** account that becomes authenticated gets full
catalogue write **and read access to every order** — every customer's name, phone number and
delivery address. Supabase's `signInWithOtp` defaults to `shouldCreateUser: true`, so with default
project settings a stranger entering their own email would be issued an account, sign in, and land
inside all of it.

This is what the spec's Assumptions describe as "the vendor's inbox is the credential" — except
without a fix, it is *anyone's* inbox.

**Decision**: introduce a real admin predicate before building any sign-in UI (D3), and disable
self-signup at the project level (D2). The sequencing matters: the predicate lands first, so there
is never a window where a door exists without a lock.

---

## D1: which wireframe option per screen

The design doc offers three per turn. Chosen on fit with the requirements, not taste.

| Turn | Chosen | Why, and what was rejected |
|---|---|---|
| 4 — sign-in | **4c** flush-left with error state | Magic link has no password field but *does* have a prominent post-submit state ("link sent, check your email") and a failure state. 4c is the only option that wireframes an inline message under the field, and flush-left is the system's own instruction. **4a** (centred card) is fine but centres content the readme says to keep flush left; its stacked layout is adopted for phones, where 4c has no frame drawn. **4b**'s red poster panel is the most striking but spends the accent as a field on a utility screen the vendor sees once a month. |
| 5 — menu management | **5b** grouped by category, drag handles | The only option that wireframes item ordering (FR-028) and category management (FR-027, FR-030) together. **5a**'s table is denser and has the better phone treatment — adopted for the mobile breakpoint — but has no ordering affordance and no category management. **5c**'s photo grid looks best and serves FR-015 worst: fewer rows visible, and price/availability are secondary. |
| 6 — item editor | **6a** side drawer with variant repeater | Keeps the list visible while editing, which matters when the vendor is repricing several items; the repeater is exactly FR-023's add/rename/reprice/retire loop. Decisive extra: on mobile a drawer becomes a bottom sheet, which is **the pattern the customer app already implements** in `ItemSheet.jsx` — same CSS idiom, less new surface. **6b** (full page) is a reasonable second and better for a long form, but a route change per edit works against SC-001's 60 seconds. **6c** (modal) hides the list entirely and is the riskiest for SC-001, as the spec checklist already flagged. |

**Rationale for the set**: 5b + 6a compose — the drawer opens beside the list it edits. 4c matches
them tonally. All three are frames the Modernist system already draws.

---

## D2: how the vendor signs in

**Decision**: Supabase Auth magic link — `signInWithOtp({ email, options: { shouldCreateUser: false } })`
— with **self-signup disabled at the project level** and **OTP validity reduced to 15 minutes**.

**Rationale**: FR-001 mandates passwordless. `shouldCreateUser: false` is necessary but *not*
sufficient on its own — it is a client-supplied flag, and a crafted request can simply omit it. The
project-level setting is the enforcement; the client flag is defence in depth. The 15-minute window
satisfies FR-004 (Supabase's default is one hour, which is a long time for a standing key to sit in
an inbox).

**Alternatives rejected**: **email+password** was ruled out by the clarification session.
**OTP codes** typed into the app avoid the "link opened on a different device" problem (an edge case
in the spec) but ask a non-technical user to transcribe six digits under time pressure, and Supabase
issues both from the same primitive anyway — the link is the friendlier default.

**Session longevity (FR-005, FR-006, SC-010)**: `supabase-js` persists the session and refreshes it
in the background by default. The requirement is 30 days of ordinary use; this is a **project
configuration** to verify, not code to write — the refresh-token lifetime must outlast it. Listed as
a task rather than assumed, because getting it wrong is invisible until the vendor is unexpectedly
signed out.

---

## D3: how Postgres knows the session is the vendor

**Decision**: an `admins` table holding the authorised `auth.uid()`s. Every one of the nine policies
changes from `auth.role() = 'authenticated'` to `public.is_admin()` — a `stable` `security definer`
function returning `exists (select 1 from admins where user_id = auth.uid())`.

**Rationale**: it puts the answer to "who is the vendor?" in data, where it can be read, tested and
changed without a migration. A helper function keeps nine policies from each growing a subquery, and
means a future change touches one definition. It also gives the verification script something
concrete to assert against: *authenticated but not admin* must be refused everywhere.

**Alternatives considered**:

- **Hard-code the uuid** in each policy. No new table; but the vendor's identity becomes policy text
  in nine places, and rotating the account means a migration.
- **A custom JWT claim** (`app_metadata.role = 'admin'`) checked with `auth.jwt()`. Avoids a table
  read per policy evaluation, but requires an auth hook to set it, and hides authorisation outside
  the schema where a reviewer would look for it.
- **Leave `authenticated`, rely on signup being disabled.** Rejected outright: it makes a
  project-settings checkbox the only thing standing between a stranger and every customer's home
  address. Defence in depth is the whole point.

**Note on scope**: the spec says multiple admins are out of scope. A table *permits* several without
requiring them — v1 inserts exactly one row. That is not scope creep; it is the natural shape.

---

## D4: reversible removal

**Decision**: `menu_items.removed_at timestamptz null`. Removal sets it, restore clears it. The
public read policy gains `and removed_at is null`. Discard (FR-017) is a real `delete`.

**Rationale**: one nullable column, and the timestamp doubles as the retention clock — "restorable
for at least 30 days" is `removed_at > now() - interval '30 days'`, with no second field. Variants
ride along with their parent and need no flag of their own.

**Alternative rejected**: a separate `deleted_items` archive table. Truer to "archive", but every
restore becomes a cross-table move that must carry variants and photo references with it, and every
query needs a union to check. A nullable timestamp does the same job.

**Consequence to handle**: `is_available` and `removed_at` are now two independent hiding mechanisms.
Every customer-facing read must filter on **both** (FR-016), which is why the policy — not the
client — enforces it.

---

## D5: reducing photos on the device

**Decision**: `createImageBitmap(file)` → draw to `<canvas>` at a target long edge of **1600px** →
`canvas.toBlob(type, 0.82)`, preferring `image/webp` and falling back to `image/jpeg`. No library.

**Rationale**: both APIs are native in every browser this project targets, so the cost to the bundle
is a few hundred bytes of our own code rather than 10–40 KB of dependency — and Principle IV has
about 17 KB of headroom on the customer route. A 4000px phone photo at ~4 MB lands around
150–250 KB, which serves SC-006 directly and, more importantly, makes the *upload* quick on the
vendor's own 4G (the part that actually threatens SC-001's 60 seconds).

**Alternatives rejected**: a compression library (weight, supply chain, for something native APIs
do); server-side resize on upload (the slow upload remains, and it is new server code to run and
maintain); storage-layer transformation on delivery (does nothing for upload time and may be a paid
tier).

**Cost accepted**: where `createImageBitmap` or `toBlob` is unavailable or throws, there is no
fallback path that keeps the guarantee. FR-021 already says the vendor must be told rather than
having a 4 MB original uploaded on their behalf — that is the designed outcome, not a gap.

**What is testable**: the sizing arithmetic (target dimensions preserving aspect ratio, no upscaling
of already-small images) is pure and gets tests first. The canvas call itself is a thin wrapper
around browser APIs and is exercised in the browser, not mocked into a false green.

---

## D6: photo lifecycle

**Decision**: objects live at `menu/{item_id}/{random}.webp`. Replacing a photo uploads the new
object, points the row at it, then deletes the old. Discarding an item deletes its folder.

**Rationale**: FR-017 and FR-022 both exist to stop storage growing forever, and the item-scoped
folder makes "delete everything belonging to this item" a single prefix operation. Upload-then-swap
rather than delete-then-upload means a failure mid-replace leaves the old photo working instead of
an item with no image.

**Cost accepted**: a failed delete after a successful swap leaks one object. Cheap and rare; SC-012
measures it by reconciling stored objects against live rows rather than trusting the happy path.

---

## D7: ordering

**Decision**: integer `sort_order`, already present on `categories` and `menu_items`. Reordering
recomputes a contiguous sequence and writes the affected rows. Native HTML5 drag events on pointer
devices, plus **always-visible move up / move down controls** that serve as the touch path (FR-029).

**Rationale**: no drag-and-drop library, so no bundle cost. The move controls are not a grudging
fallback — they are the primary mechanism on a phone, which is where the vendor actually is, and
they are keyboard-reachable for free. Recomputing contiguous order avoids fractional-index
cleverness nobody needs at tens of items.

**Alternative rejected**: fractional indices (insert between 1.0 and 2.0) write one row instead of
several. At this scale that optimisation buys nothing and costs precision drift.

---

## D8: keeping admin out of the customer bundle

**Decision**: `React.lazy` around the whole `features/admin/` tree, split at the route.

**Rationale**: Principle IV's budget is explicitly the *customer-facing route*. A vendor on a
management screen is not on that route, so the correct measurement is the customer chunk, not the
total build size — and the quickstart says so, because reading the total would either fail the gate
falsely or hide a real regression.

**Verification that matters**: assert no module under `features/admin/` appears in the customer
entry chunk. A lazy import that is *also* statically imported somewhere silently defeats the split,
and the byte count alone would not catch it early.

---

## D9: discard vs. a customer's in-flight order

**The problem**, traced through code rather than guessed:

1. A customer adds an item; the cart stores `itemId` in `localStorage`.
2. The vendor discards that item (FR-017 hard delete).
3. The customer checks out. `place_order` inserts `order_items.menu_item_id` = that uuid.
4. The FK finds no such row. The insert raises. **The entire function is one transaction, so the
   order is not recorded at all** — exactly the behaviour 001 deliberately built for atomicity, here
   working against us.

The customer still reaches WhatsApp (Principle II holds), but FR-031 requires checkout to *record*
the order, and it would not. Confirmed by the same class of failure probed in 001, where a
non-existent `menu_item_id` rolled back the whole order.

**Decision**: `place_order` resolves catalogue ids defensively — an id that no longer exists is
stored as `null` rather than raising. The snapshots already carry the name, variant label and price,
so the record stays complete in every way that matters to the vendor.

**Rationale**: this is the same principle 001 established for the sample menu (FR-013 there): a line
whose catalogue pointer is missing is still a real line. Soft removal alone never triggers it — the
row still exists — so this is specifically about discard, and about items deleted by any future
means.

**Alternative rejected**: block discard while any cart might reference the item. Unknowable — carts
live in browsers' `localStorage`, not on the server.

---

## D10: what gets tests first

Per Principle I, the decidable logic is extracted and tested before implementation:

| Module | Decides |
|---|---|
| `itemValidation.js` | required fields, price > 0, sizes-mode needs ≥1 size, single-price and sizes are mutually exclusive |
| `sortOrder.js` | new contiguous ordering after a move; where a newly added item lands |
| `imageResize.js` | target dimensions from source dimensions; never upscale |
| `storagePaths.js` | object path from item id; which prefix a discard clears |

Excluded deliberately: the canvas call, the Supabase calls and the components. They are exercised in
the browser and by the permissions script, where a failure means something real — rather than mocked
into a test that passes whatever the code does.

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Does "authenticated" imply admin? | No — and 9 policies assume it does. Repointed to `is_admin()` (D3, Finding 0) |
| Does an admin account exist? | No — `auth.users` is empty. Provisioning is a task, and self-signup must be disabled first (D2) |
| Does the storage bucket exist? | Yes — `menu-images`, public read, 3 admin-write policies that need the same repointing (D3) |
| Is `removed_at` present? | No — added by migration (D4) |
| Is user story 5 already satisfied? | Mostly. Cart and order snapshots already survive edits and soft removal; only discard breaks it (D9) |
| Can we afford a DnD or image library? | No — 17 KB of customer headroom; both replaced with native APIs (D5, D7) |
