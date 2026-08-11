# Feature Specification: Admin Authentication & Menu Management

**Feature Branch**: `main` (no feature branch created — work is being done on `main`)

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Admin authentication and menu management. The vendor (a single, non-technical admin) must be able to sign in and manage the live menu themselves, so the catalogue stops being placeholder data seeded by a developer. Scope: sign in and out with email and password; create, edit and delete menu items with name, description, price, photo and category; manage the size/pack variants of an item that sells in tiers; toggle an item's availability without deleting it; create, rename, reorder and remove categories. Photos upload to storage and must be small enough for a phone on 4G. Everything a customer already sees — the menu read path, the cart, checkout and the WhatsApp handoff — must keep working unchanged throughout, and an admin mistake must never leave the customer menu broken or an in-flight order unrecordable. Only the authenticated admin may write catalogue data; the anonymous public keeps read-only access to available items and no write access whatsoever. Design input: the wireframes in \"Zeeli Admin Wireframes.dc.html\" in the Claude Design project (turn 4 sign-in, turn 5 menu management, turn 6 item editor with the variant repeater), built on the Modernist design system. Out of scope: the orders dashboard and its realtime alerts (a later feature), multiple admin accounts, and role-based permissions."

## Why now

The customer side is finished and works: customers browse, build a cart, and their orders reach both WhatsApp and the vendor's records. But the menu they browse is **provisional data a developer seeded** — every item, price and size tier is a placeholder nobody at Zeeli has confirmed. Today, changing a price means asking a developer.

This feature is what makes the product the vendor's own. It is also the last thing standing between the seeded catalogue and a real one.

## Clarifications

### Session 2026-08-11

- Q: A single admin with no password recovery risks total lockout. Keep as specified, add a reset flow, go passwordless, or add a standby account? → A: Passwordless — sign in by emailed magic link, no password at all.
- Q: Where are photos reduced — in the browser before upload, on delivery, server-side on arrival, or not at all? → A: In the browser, before upload.
- Q: Does deleting an item destroy it, hide it restorably, require type-to-confirm, or not exist? → A: Hide it restorably — removal is reversible, nothing is destroyed.
- Q: Can the vendor order items within a category (wireframe 5b draws drag handles, but no requirement covered it)? → A: Yes — drag to reorder, as drawn.

Follow-up hardening, same session, closing two gaps the answers above opened:

- Q: Answer 1 put email on the path of every sign-in. Keep it there? → A: No — a session lasts at least 30 days and renews with use, so a link is needed only on a new device or after sign-out (FR-005, FR-006). The link itself now dies in 15 minutes (FR-004).
- Q: Answer 3 let removed items and their photos accumulate forever. Accept that? → A: No — removed items stay restorable for at least 30 days and may then be discarded, the vendor can discard sooner, and discarding releases the photo (FR-017, FR-022).
- Correction: an earlier edge case claimed a compromised inbox could not reach orders. That was wrong — an admin session reads every customer's name, phone and address. The edge case and Assumptions now say so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The vendor corrects the live menu themselves (Priority: P1)

Puff Puff has gone up to ₦1,000 and the Chapman has run out. The vendor enters their email, taps the link that arrives, changes one price, flips one switch, signs out. Customers see both changes on their next visit. No developer involved, no deploy, no password to remember.

**Why this priority**: it is the smallest complete loop that removes the developer from the critical path, and it is the change the vendor will make most often — prices move and things sell out daily. Everything else in this feature is a bigger version of this loop.

**Independent Test**: sign in, change a price and toggle an item's availability, sign out, then load the customer menu. Both changes are visible, and the unavailable item cannot be ordered. Delivers real value with no other story built.

**Acceptance Scenarios**:

1. **Given** the vendor is signed out, **When** they enter their registered email and open the link sent to it, **Then** they reach the menu management screen.
2. **Given** the vendor is signed in, **When** they change an item's price and save, **Then** the customer menu shows the new price and any new order records it.
3. **Given** an item is available, **When** the vendor toggles it unavailable, **Then** it disappears from the customer menu and cannot be added to a cart — but it remains in the vendor's list, ready to switch back on.
4. **Given** the vendor is signed in, **When** they sign out, **Then** they can no longer reach any management screen, and returning to it asks them to sign in again.
5. **Given** someone enters an email that is not the vendor's, **When** they submit it, **Then** they are told a link has been sent if the address is recognised — the same message either way, revealing nothing about who holds an account — and no link that grants access is ever sent to them.

---

### User Story 2 - The vendor adds a new item, with a photo, in under a minute (Priority: P1)

Zeeli starts selling Asun. The vendor adds it: name, short description, price, category, photo from their phone. It appears on the customer menu immediately.

**Why this priority**: joint-first with US1 because a menu that can't grow is a menu that goes stale. This is also the PRD's headline usability metric — under 60 seconds, unaided.

**Independent Test**: time a non-technical person adding one item with a photo, from signed-in to visible on the customer menu.

**Acceptance Scenarios**:

1. **Given** the vendor is on the menu screen, **When** they add an item with a name, price, category and photo, **Then** it appears on the customer menu in that category with that photo.
2. **Given** the vendor is adding an item, **When** they leave the name or price empty, **Then** they are told what is missing before anything is saved, and nothing partial is created.
3. **Given** the vendor picks a photo straight from a phone camera roll, **When** it is saved, **Then** the upload finishes in seconds rather than minutes on 4G, it loads quickly for customers, and the vendor never had to resize anything.
4. **Given** the vendor is editing an item, **When** they change its photo, **Then** the new photo replaces the old one everywhere the item appears.
5. **Given** the vendor removes an item, **When** they confirm, **Then** it disappears from the customer menu and from their own list, every past order that included it still reads exactly as it did, and they can restore it later with everything intact.
6. **Given** the vendor removed an item by mistake, **When** they find it among removed items and restore it, **Then** it returns to the menu with its description, price, photo and sizes unchanged.

---

### User Story 3 - The vendor manages an item that sells in sizes (Priority: P2)

The Combo Tray sells as 20, 50 or 100 pieces. The vendor adds a fourth tier, reprices one, and retires another without deleting the item.

**Why this priority**: below the P1s because most items have a single price, but a tray item with wrong tiers is actively wrong — the customer picks a size that doesn't exist or pays last month's price.

**Independent Test**: add, reprice and retire a size on one item; the customer's size picker reflects each change and the "from" price follows the cheapest available tier.

**Acceptance Scenarios**:

1. **Given** an item sells in sizes, **When** the vendor adds a size with a label and price, **Then** customers can pick it and the item's "from" price reflects the cheapest available size.
2. **Given** an item has three sizes, **When** the vendor marks one unavailable, **Then** customers no longer see that size but the item and its other sizes stay orderable.
3. **Given** the vendor switches an item to sell in sizes, **When** they save without adding a single size, **Then** they are stopped and told the item needs at least one — an item sellable at no price must never reach customers.
4. **Given** the vendor switches an item from sizes back to a single price, **When** they save, **Then** customers see one price and no size picker.

---

### User Story 4 - The vendor organises the menu (Priority: P2)

The vendor renames "Platters/Trays" to "Party Trays", adds "Sides", and drags it above "Drinks". Inside Small Chops they drag the Puff Puff to the top, because it is what sells.

**Why this priority**: the categories and the order items appear in are currently a developer's guess (PRD §11 lists the taxonomy as unconfirmed). Getting them right is what makes the menu feel like Zeeli's own — and item order is merchandising, not decoration: the first thing in a category is the thing most people buy. Nothing is broken while it's wrong, which is why this sits below the P1s.

**Independent Test**: rename, add and reorder categories, and reorder items within one; the customer menu shows the new names, in the new order, with items in the order the vendor set.

**Acceptance Scenarios**:

1. **Given** categories exist, **When** the vendor renames one, **Then** customers see the new name and every item stays in it.
2. **Given** the vendor adds a category, **When** they save it, **Then** it is available to assign items to, and appears to customers once it holds at least one available item.
3. **Given** the vendor reorders categories, **When** they save, **Then** customers see them in that order.
4. **Given** the vendor drags an item to the top of its category, **When** they save, **Then** customers see it first in that category.
5. **Given** the vendor is on a phone, **When** they reorder items or categories, **Then** they can do it there too — the ordering is not desktop-only.
6. **Given** a category still holds items, **When** the vendor tries to remove it, **Then** they are stopped and told how many items must be moved first — no item is ever silently orphaned or removed with its category.

---

### User Story 5 - Nothing the vendor does can break the customer's menu (Priority: P2)

Whatever the vendor edits, deletes or mis-types, a customer browsing at that moment still sees a working menu, keeps their cart, and can still send their order.

**Why this priority**: below the feature's own stories because it protects work that already exists, but it is the reason this feature can be trusted at all. The vendor edits the live menu with no staging step.

**Independent Test**: perform edits and deletions while a customer session has items in its cart mid-checkout; the customer completes their order successfully throughout.

**Acceptance Scenarios**:

1. **Given** a customer has an item in their cart, **When** the vendor deletes or renames that item, **Then** the customer can still complete checkout, and the order records what they were actually shown and charged.
2. **Given** the vendor is mid-edit, **When** a customer loads the menu, **Then** the customer sees the last saved state — never a half-saved item.
3. **Given** any catalogue change, **When** a customer orders immediately after, **Then** the order is still recorded and still reaches WhatsApp.
4. **Given** an anonymous visitor, **When** they attempt to create, change or delete any catalogue data, **Then** every attempt is rejected.
5. **Given** an anonymous visitor, **When** they attempt to read items the vendor has marked unavailable, **Then** they receive nothing.

---

### Edge Cases

- **An item priced at zero or below.** Rejected before saving — a free item is far more likely a typo than an offer.
- **An item that sells in sizes but has none.** Rejected (US3). Equally, an item with sizes must not also present a single base price to customers.
- **Removing an item that appears in past orders.** Allowed. Past orders keep the name, size label and price the customer was actually charged; the vendor's history never changes retroactively.
- **Removing an item by mistake.** Recoverable — it is hidden, not destroyed, and can be restored whole.
- **Restoring an item whose category was removed in the meantime.** The vendor is asked which category it should return to rather than the restore failing or the item reappearing uncategorised.
- **Removing a category that still holds items.** Blocked, with a count of what must move first. Already-removed items don't count toward that total.
- **An item removed while it sits in a customer's cart.** The customer keeps it and can still check out — the order records what they were shown (see US5).
- **A multi-megabyte photo straight off a phone camera.** Reduced on the device before uploading, so the vendor waits seconds rather than minutes on 4G and customers are never served a camera original.
- **A file that isn't an image.** Rejected with a plain-language message, before any upload starts.
- **A device that cannot reduce the photo.** The vendor is told, rather than a multi-megabyte original being uploaded silently on their behalf.
- **Signing out, or the session expiring, with unsaved edits.** The vendor is told their changes weren't saved rather than losing them silently.
- **The vendor's own device goes offline mid-save.** They are told the change didn't save; no partial item is created.
- **The last category is removed, or every item is switched off.** The customer menu shows a clear
  empty state, not an error — and specifically **not** the seeded sample menu. An empty menu the
  vendor created deliberately must not be papered over with developer placeholder items at
  unconfirmed prices, which is the very thing this feature exists to abolish (FR-034).
- **Two browser tabs editing the same item.** The last save wins; this is a single-admin product and the risk is accepted.
- **The sign-in link doesn't arrive.** The vendor can request another without waiting out a
  cooldown they weren't told about, and the screen says plainly where the link was sent and to check
  spam. This is the feature's single point of failure, which is why FR-005 and FR-006 keep email off
  the path of a routine visit — a working session on the vendor's phone means a bad email day costs
  them nothing.
- **The link has expired, or was already used.** Opening it says so plainly and offers to send a
  fresh one, rather than failing into a dead end or a generic error.
- **The link is opened on a different device** from the one that requested it (requested on desktop,
  email read on the phone). The vendor ends up signed in on the device where they opened it.
- **The vendor's email account is compromised.** Whoever can read the inbox can request a link and
  obtain an admin session. **The blast radius is not limited to menu edits**: an admin session can
  read every recorded order, which means every customer's name, phone number and delivery address.
  Two things bound it — the link is single-use and dies in 15 minutes (FR-004), so an old email is
  not a standing key, and signing out ends the session. It is not eliminated: with no password and
  no second factor, the vendor's inbox *is* the credential. Accepted for v1 and stated plainly here
  so the decision is visible rather than implied.

## Requirements *(mandatory)*

### Functional Requirements

> Numbering is **append-only** from 2026-08-11, when planning began citing these identifiers.
> FR-034 onward were added after the first analysis pass and sit with their topic rather than at the
> end of the list, so existing references stay valid.

**Access**

- **FR-001**: The system MUST let the vendor sign in by entering their email address and opening a
  single-use link sent to it, and MUST let them sign out. There is no password.
- **FR-002**: The system MUST refuse access to every management screen and every catalogue write to anyone not signed in.
- **FR-003**: Submitting any email address MUST show the same message on screen whether or not it
  belongs to the vendor, so the form never reveals who holds an account. A usable link MUST only
  ever be sent to a registered address.
  **Amended 2026-08-11 after implementation.** This originally said "the same response". It now says
  "the same message on screen", because the stronger version is not achievable on this stack and was
  quietly failing: requesting a link for an unregistered address returns HTTP **422** where a
  registered one returns 200. The rejection is how the auth provider enforces "do not create an
  account", so the enforcement *is* the disclosure. The screen is neutral; the network tab is not.
  See the Assumptions entry for what this costs and what was rejected.
- **FR-004**: A sign-in link MUST stop working once used and MUST expire within **15 minutes** of
  being requested, so a link sitting in an inbox is not a standing key to the account. It MUST be
  re-requestable when it expires or fails to arrive.
- **FR-005**: Once signed in on a device, the vendor MUST stay signed in there for **at least 30
  days** of ordinary use, across page reloads and app restarts, renewing silently while they keep
  using it. Email MUST NOT be on the path of a routine visit.
- **FR-006**: A sign-in link MUST be required only when there is no valid session on that device —
  a first sign-in, a new device, an explicit sign-out, or a lapsed session. Everyday menu edits from
  the vendor's own phone MUST NOT require one.
- **FR-007**: Only the signed-in vendor MUST be able to create, change or remove categories, items or sizes. The anonymous public MUST keep read access to available items only, and no write access of any kind.
- **FR-037**: The system MUST be able to tell a signed-in vendor from someone who merely holds a
  session, and MUST show the latter the sign-in screen rather than a management screen that fails to
  load or an error confirming an account exists. Being signed in and being the vendor are different
  questions and MUST be answered separately.

**Menu items**

- **FR-008**: The vendor MUST be able to create, edit and remove a menu item.
- **FR-009**: An item MUST carry a name, a category, and either a single price or at least one size; description and photo are optional.
- **FR-010**: The system MUST reject an item with a blank name, no category, or a price of zero or less, and MUST say what is wrong before saving anything.
- **FR-011**: The vendor MUST be able to mark an item unavailable and available again without removing it, and an unavailable item MUST NOT be visible or orderable to customers.
- **FR-012**: Removing an item MUST require confirmation, MUST hide it from customers and from the
  vendor's normal list, and MUST NOT destroy it.
- **FR-013**: The vendor MUST be able to find a removed item and restore it, complete with its
  description, price, photo and sizes as they were.
- **FR-014**: Removing an item MUST NOT alter any past order's record of it.
- **FR-015**: The vendor MUST be able to see, at a glance, every item with its category, price and availability, without removed items cluttering that view.
- **FR-016**: Removed items MUST be absent from **every** customer-facing view — the menu, every
  category, search, and any direct link to the item. Removed is invisible, not merely unlisted.
- **FR-017**: A removed item MUST remain restorable for **at least 30 days**. After that the system
  MAY discard it permanently, and the vendor MUST be able to discard one immediately from the
  removed-items view. Discarding an item MUST also release its photo, so removed items do not
  accumulate storage indefinitely, and MUST NOT alter any past order's record of it.

**Photos**

- **FR-018**: The vendor MUST be able to attach a photo taken on a phone, and replace it later.
- **FR-019**: The system MUST reject files that are not images, in plain language.
- **FR-020**: A photo MUST be reduced on the vendor's own device **before** it is uploaded, so that
  neither the upload nor the customer's later download carries a full-size camera image. The vendor
  MUST never be asked to resize anything by hand.
- **FR-021**: If a device cannot reduce the photo, the vendor MUST be told plainly rather than
  having a multi-megabyte original uploaded silently on their behalf.
- **FR-022**: Replacing an item's photo MUST release the photo it replaced, for the same reason as FR-017.
- **FR-035**: Each photo MUST be stored at **more than one size**, and customers' browsers MUST be
  given enough information to download the size that suits the space the photo occupies rather than
  always the largest. A phone showing a photo two inches wide must not pay for a display-sized image.
- **FR-036**: Photos below the fold MUST NOT be downloaded until they are needed.

**Sizes**

- **FR-023**: The vendor MUST be able to add, rename, reprice, retire and remove the sizes of an item that sells in tiers.
- **FR-024**: An item marked as selling in sizes MUST have at least one size before it can be saved.
- **FR-025**: A retired size MUST disappear from the customer's picker while leaving the item and its other sizes orderable.
- **FR-026**: The price a customer sees for a sized item MUST be the cheapest available size.

**Organisation**

- **FR-027**: The vendor MUST be able to create, rename and reorder categories, and the customer menu MUST reflect that order.
- **FR-028**: The vendor MUST be able to set the order of items within a category by dragging them, and the customer menu MUST reflect that order.
- **FR-029**: Item and category ordering MUST be usable on a phone as well as a desktop; where dragging is impractical on a touch device, an equivalent way to move an item MUST be available.
- **FR-030**: The system MUST prevent removing a category that still holds items, and MUST state how many must be moved first. Items the vendor has already removed MUST NOT count toward that total or block the category.

**Not breaking what works**

- **FR-031**: Catalogue changes MUST NOT interrupt a customer's in-progress session: their cart survives, and checkout still records the order and still opens WhatsApp.
- **FR-032**: A customer MUST never see a partially saved item.
- **FR-033**: The customer menu MUST show a clear empty state, not an error, when no items are available.
- **FR-034**: An empty catalogue and an unreachable one MUST be treated as different situations. When
  the catalogue is reachable and legitimately empty — because the vendor removed or switched off
  everything — customers MUST see the empty state and MUST NOT be shown sample data. Falling back to
  placeholder items is reserved for the case where the catalogue could not be read at all.

### Key Entities

- **Admin account**: the single vendor login, identified by an email address and holding no password. Provisioned out of band; not self-service, and not something this feature creates.
- **Sign-in link**: a single-use, expiring credential emailed on request. Grants a session when opened; worthless afterwards.
- **Category**: a named grouping with a position in the menu. Holds items; cannot be removed while it does.
- **Menu item**: what a customer orders — name, optional description, optional photo, a category, availability, and either one price or a set of sizes. Also carries whether it has been removed: removed items are invisible to customers and absent from the vendor's normal list, but intact and restorable. Removed and unavailable are different states — unavailable is "not today", removed is "not any more".
- **Size**: one purchasable tier of an item (label plus price), individually retirable. Meaningless without its item.
- **Photo**: an image belonging to one item, stored so customers load it quickly.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A non-technical person adds a complete new item, photo included, in **under 60 seconds** without help, on first attempt (PRD §9).
- **SC-002**: A price change or availability toggle is visible to customers within **10 seconds** of saving.
- **SC-003**: The vendor completes every routine menu change — price, availability, new item, new size, category rename, item order — with **zero developer involvement**, measured over a week of real use.
- **SC-004**: **100%** of customer checkouts started before a catalogue change still complete successfully, over at least 10 trials spanning edits and deletions.
- **SC-005**: An anonymous visitor attempting to create, change or delete catalogue data succeeds **0 times** out of at least 12 attempts spanning categories, items and sizes.
- **SC-006**: Item photos load on the customer menu in **under 2 seconds** on a mid-range phone over 4G.
- **SC-007**: **0** invalid items reach customers — no blank names, no zero prices, no sized items without sizes — across a test pass that deliberately attempts each.
- **SC-008**: The vendor replaces the entire provisional catalogue with their real menu without a developer touching the database.
- **SC-009**: A requested sign-in link arrives and works within **2 minutes**, in at least 9 of 10 attempts — and on the tenth the vendor can request another and get in without help.
- **SC-010**: Across a week of daily use from the vendor's usual phone, they are asked for a sign-in link **at most once**. Email is not part of a routine visit.
- **SC-011**: A vendor who removes the wrong item restores it, complete, in **under 30 seconds** and without help. **0** items are lost irrecoverably within the retention window, across a test pass that deliberately removes and restores each kind of item, including one with sizes and a photo.
- **SC-012**: Removed items and replaced photos leave **no** orphaned storage behind once discarded — measured by comparing stored photos against live items after a pass of removals, restores, discards and photo replacements.
- **SC-013**: A customer loading the menu on a phone downloads **card-sized** photos, not
  display-sized ones — verified by inspecting transferred bytes per image against the rendered size.
- **SC-014**: With the catalogue reachable and empty, **0** placeholder items appear to customers.

## Assumptions

- **One admin, provisioned out of band.** A single account is created directly in the auth provider's console. There is no sign-up screen, no invitations and no roles.
- **No passwords anywhere.** Sign-in is an emailed single-use link. There is nothing to forget and
  no reset flow to build. The obvious cost — depending on email to get in — is confined to first
  sign-in on a device: a session lasts at least 30 days and renews with use (FR-005, FR-006), so
  email is off the path of a routine visit rather than in front of every one.
- **Account enumeration is possible, and accepted for v1.** Requesting a sign-in link returns a
  different HTTP status for a registered address than an unregistered one (200 vs 422), so someone
  watching the network tab can learn whether a given address holds an account. The UI does not
  reveal it; the transport does. Three fixes were weighed:
  *(a)* allow self-signup so every request returns 200 — rejected, it accumulates stranger accounts
  and contradicts the project-level setting that FR-002 depends on;
  *(b)* proxy sign-in through a server-side function that always returns 200 — rejected for v1, it
  adds serverless infrastructure to a project that has none, to protect an address that is on the
  vendor's public Instagram page;
  *(c)* accept and record it — **chosen**. Knowing the address gains an attacker nothing on its own:
  the credential is inbox access, and authorisation is the `admins` allow-list, not the address.
  Revisit if the product ever gains a second admin, where the set of privileged addresses stops
  being public knowledge.
- **The vendor's inbox is the credential, and it reaches customer data.** With no password and no
  second factor, inbox access converts to an admin session, and an admin session can read every
  order — customer names, phone numbers, delivery addresses. The 15-minute single-use link bounds
  the window but does not close it. Adding a second factor is out of scope for v1; this is the
  security posture, recorded as a decision rather than left to be discovered.
- **The vendor edits the live menu directly.** No drafts, no staging, no publish step, no preview. Every save is immediately what customers see — which is why US5 exists.
- **Removal is reversible, but not forever.** A confirmed removal hides an item rather than destroying it, and it can be restored whole for at least 30 days. After that it may be discarded permanently, and the vendor can discard one sooner if they are sure — which stops removed items and their photos accumulating without bound. Past orders are unaffected either way, because they keep their own record of what was ordered.
- **A category is a simple flat grouping.** No nesting, no sub-categories.
- **Photos are one per item.** Multiple images per item is out of scope (PRD §11).
- **Photo reduction happens on the vendor's device**, which puts image-handling weight in the admin
  experience. That weight MUST NOT reach the customer-facing route, whose budget is fixed by
  constitution Principle IV and currently sits at 132.86 KB of its 150 KB.
- **The original photo is not kept, but two derivatives are.** The camera original is discarded on
  the device. Two sizes are stored — one sized for a menu card, one for the item detail view — so
  photos can be served responsively (FR-035) without keeping a full-resolution archive. Adding a
  third size later means re-uploading, which is accepted: the vendor has the original on their phone.
- **Sort order is the vendor's, not automatic.** Categories and items appear in the order the vendor sets by dragging, not alphabetically or by popularity. A newly added item goes last in its category until moved.
- **Availability is a switch, not a count.** No stock quantities to keep in step (PRD §6.0).
- **Concurrency is not a real risk.** One admin means simultaneous conflicting edits are vanishingly unlikely; last-write-wins is accepted.
- **The customer experience is not being redesigned.** Menu, cart, checkout and the WhatsApp handoff are finished and must keep behaving exactly as they do; this feature only changes where their data comes from.
- **The provisional seed data is disposable.** Once the vendor enters the real menu, the seeded catalogue is replaced, not merged.
- **Design is already decided.** Screens follow the wireframes in `Zeeli Admin Wireframes.dc.html` (turns 4–6) and the Modernist design system; this spec does not restate layout.
