# Feature Specification: Guest Order Persistence

**Feature Branch**: `main` (no feature branch created — work is being done on `main`)

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Guest checkout order persistence: a customer completing checkout must have their order and its line items written to Supabase so the vendor's admin dashboard receives it. Today the insert is rejected by row level security (42501 new row violates row-level security policy for table \"orders\"), so orders only ever reach WhatsApp and nothing is recorded. Scope: the RLS policies and any schema corrections needed for an anonymous, unauthenticated customer to insert exactly one order plus its order_items rows and nothing else — no read, no update, no delete, no access to anyone else's orders. Includes verifying the policy against a real anon-key request, and confirming the client insert path in src/features/checkout/submitOrder.js matches what the policies allow (note: order_items.menu_item_id and variant_id are uuid FKs, and the app currently falls back to non-uuid seed menu ids when Supabase has no menu data). The existing WhatsApp fallback behaviour must not regress: a failed write must still let the order through to WhatsApp."

## Context: what the investigation found

The premise in the input turned out to be half right, and the correction matters for scope.

A permissive insert permission for unauthenticated customers **already exists** on both the order
and order-line stores. Reproducing the failure against the live project as an anonymous customer
showed:

- Recording an order **without** asking for anything back **succeeds**.
- Recording an order **and asking to read back the created record's identifier** fails with
  "new row violates row-level security policy".

The customer is granted permission to write an order and explicitly denied permission to read any
order — which is the intended privacy boundary. The defect is that the checkout code asks for the
new record back so it can attach the line items to it. Insert-only permission forbids exactly that,
so the request is rejected and **nothing is recorded at all**, including the order itself.

This feature is therefore about making the recording path work *within* the insert-only boundary,
not about loosening the boundary.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The vendor receives every order that was sent (Priority: P1)

A customer fills in their name, phone and delivery address, taps to send the order, and their
WhatsApp opens with the order pre-filled. The vendor also finds that same order waiting in their
records, with every line, the quantities, the prices charged, and the customer's contact and
delivery details — matching the WhatsApp message exactly.

**Why this priority**: this is the whole point of the feature. Today the vendor's only record is
the WhatsApp chat, so there is no order list, no status tracking, and no way to build the admin
dashboard on top. Every order placed right now is invisible to the business.

**Independent Test**: place an order as an anonymous customer, then look at the stored records as
the vendor. The order and all its lines are present and match what the customer was shown at
checkout. Delivers the complete value of this feature on its own.

**Acceptance Scenarios**:

1. **Given** a customer with three different items in their bag, one of them a size variant,
   **When** they complete checkout, **Then** one order is recorded with exactly three lines, and
   each line carries its item name, variant label where applicable, unit price, quantity and line
   total as shown at checkout.
2. **Given** a recorded order, **When** the vendor views it, **Then** the customer name, phone,
   fulfilment choice, address (for delivery), optional note, subtotal, reference and a
   creation timestamp are all present.
3. **Given** a customer chooses pickup rather than delivery, **When** the order is recorded,
   **Then** it is marked as pickup and carries no delivery address.
4. **Given** an order has just been recorded, **When** nothing else happens, **Then** its status is
   the initial "new" state, ready for the vendor to progress.

---

### User Story 2 - A recording failure never costs the customer their order (Priority: P1)

Something goes wrong on the recording side — the service is unreachable, the request is rejected,
the customer is offline at that moment. The customer notices nothing: WhatsApp still opens with
their order pre-filled, and they still reach the confirmation screen.

**Why this priority**: equal-first with Story 1 because it is the existing behaviour and this
feature must not regress it. WhatsApp is the channel that actually reaches the vendor; recording is
bookkeeping. Trading a working order for a saved record would be a net loss to the business.

**Independent Test**: force the recording step to fail, then complete checkout. The WhatsApp
handoff still happens with the correct message, and the customer is told their copy wasn't saved.
Testable without any of Story 1 working.

**Acceptance Scenarios**:

1. **Given** the recording step fails for any reason, **When** the customer completes checkout,
   **Then** the WhatsApp handoff still proceeds with the complete and correct order message.
2. **Given** the recording step fails, **When** the customer reaches the confirmation screen,
   **Then** they are told the copy was not saved, in language that doesn't imply their order was
   lost.
3. **Given** the recording step succeeds, **When** the customer reaches the confirmation screen,
   **Then** no failure message is shown.
4. **Given** the recording step is slow, **When** the customer taps send, **Then** they are not made
   to wait indefinitely before WhatsApp opens.

---

### User Story 3 - An order is recorded whole or not at all (Priority: P2)

The vendor never opens their records to find an order with no items in it, or items belonging to an
order that isn't there.

**Why this priority**: below the two P1s because a partial record is still better than today's
nothing — but a phantom order with no lines is actively misleading. The vendor would call a
customer with no idea what they ordered.

**Independent Test**: force the line-recording step to fail while the order step succeeds. No
half-written order is visible to the vendor.

**Acceptance Scenarios**:

1. **Given** the order is recorded but its lines cannot be, **When** the vendor views their records,
   **Then** they see no order rather than an empty one.
2. **Given** a partial write occurred, **When** the customer completes checkout, **Then** Story 2's
   guarantee still holds — the WhatsApp handoff proceeds and the customer is told the copy was not
   saved.

---

### User Story 4 - Customer details stay private (Priority: P2)

A customer's name, phone number and home address are visible to the vendor and to nobody else —
including other customers, and including the customer who placed the order.

**Why this priority**: the boundary already exists and is working today; this feature must not
weaken it while making recording work. The public access credential is in every visitor's browser,
so this permission model is the only thing protecting the data.

**Independent Test**: as an anonymous visitor, attempt to list, read, change or delete orders and
order lines. Every attempt returns nothing or is rejected.

**Acceptance Scenarios**:

1. **Given** recorded orders exist, **When** an anonymous visitor attempts to list or read them,
   **Then** they receive no order data.
2. **Given** a recorded order, **When** an anonymous visitor attempts to change its status or
   delete it, **Then** the attempt is rejected and the record is unchanged.
3. **Given** an anonymous visitor has just placed an order, **When** they attempt to read back that
   same order, **Then** they receive no order data — placing an order grants no read access to it.
4. **Given** the vendor is signed in, **When** they list orders, **Then** they see every order and
   its lines.

---

### Edge Cases

- **Customer ordered from the sample menu.** When the live menu is unavailable the app shows
  placeholder items whose identifiers do not exist in the catalogue. The order MUST still be
  recorded, with the line's catalogue reference left empty and the stored name, variant label and
  price carrying the meaning. A rejected recording here would fail exactly when the system is
  already degraded.
- **An item is renamed, repriced or deleted after the order is placed.** The recorded order MUST
  continue to show what the customer was actually charged, not today's catalogue values.
- **The customer taps send twice, or returns to checkout and sends again.** Each send is treated as
  a separate order; the vendor reconciles duplicates in chat. The system MUST NOT silently discard
  a resend.
- **Two orders generate the same customer-facing reference.** References are unique, so the second
  order would otherwise be rejected. The system MUST resolve the collision at recording time rather
  than let it cost the customer their record, and the reference the customer is given MUST be the one
  actually recorded.
- **The bag is empty or the form is incomplete.** No order is recorded and no WhatsApp handoff
  occurs; the customer is shown what to fix.
- **A line quantity is zero or a price is missing.** No such line reaches the vendor's records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record a completed guest order, together with all of its lines, at the
  moment the customer sends it.
- **FR-002**: The system MUST record each order line's item name, variant label where one applies,
  unit price, quantity and line total as they were shown to the customer at checkout, independently
  of the current catalogue.
- **FR-003**: The system MUST record the customer's name, phone, fulfilment choice, delivery address
  (delivery only), optional note, subtotal, customer-facing reference and creation time.
- **FR-004**: The system MUST record a delivery address only for delivery orders, and MUST NOT
  record one for pickup orders.
- **FR-005**: A newly recorded order MUST carry the initial "new" status.
- **FR-006**: An unauthenticated customer MUST be able to record an order and its lines.
- **FR-007**: An unauthenticated customer MUST NOT be able to read, list, change or delete any
  order or order line — including one they just placed.
- **FR-008**: Recording an order MUST NOT require the customer to read back any part of the stored
  record.
- **FR-009**: The signed-in vendor MUST be able to read every order and every order line, and to
  change order status.
- **FR-010**: A failure at any point in recording MUST NOT prevent the WhatsApp handoff, and MUST
  NOT prevent the customer reaching the confirmation screen.
- **FR-011**: When recording fails, the customer MUST be told that the saved copy failed, in wording
  that does not suggest their order was lost.
- **FR-012**: An order MUST become visible to the vendor only once it and all of its lines are
  recorded; a partially recorded order MUST NOT appear.
- **FR-013**: The system MUST record an order whose lines reference items absent from the catalogue,
  leaving the catalogue reference empty rather than rejecting the order.
- **FR-014**: Customer-facing references MUST be unique across orders. When a newly generated
  reference collides with an existing one, the system MUST resolve the collision and still record the
  order; a collision MUST NOT cause an order to go unrecorded.
- **FR-015**: The customer-facing reference shown to the customer and sent in their WhatsApp message
  MUST be the reference actually recorded against their order. When recording fails and no record
  exists, the customer MUST still be given a reference in their message.
- **FR-016**: The recording behaviour MUST be verified against the live service using the same
  public credential a real visitor's browser holds — not only against a stand-in.

### Key Entities

- **Order**: one customer's completed checkout. Carries who they are (name, phone), how they want it
  (delivery or pickup, address, note), what it came to (subtotal), where it is in the vendor's
  process (status), a customer-facing reference, and when it was placed. Owned by the vendor;
  writable once by the customer who creates it.
- **Order Line**: one item on an order, with the quantity ordered and the price charged. Belongs to
  exactly one Order and has no meaning without it. Holds a snapshot of the item's name, variant
  label and unit price so the record stays true after catalogue edits, plus an optional pointer back
  to the catalogue item and variant.
- **Menu Item / Variant (referenced)**: the catalogue entry a line came from. The pointer is
  optional — it may be absent when the order was placed from the sample menu, or when the item is
  later deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of orders that reach WhatsApp are also present in the vendor's records, measured
  over a test run of at least 10 orders covering delivery, pickup, variant items and notes.
- **SC-002**: Every recorded order matches its WhatsApp message exactly on customer name, phone,
  fulfilment type, address, every line and quantity, subtotal and reference — zero discrepancies.
- **SC-003**: 0% of orders reach the vendor's records in a partial state (an order without its
  lines, or lines without their order).
- **SC-004**: An anonymous visitor attempting to read, list, change or delete order data succeeds
  0 times out of at least 8 attempts spanning both stores and all four operations.
- **SC-005**: With recording forced to fail, 100% of checkouts still open WhatsApp with the correct
  message and still reach the confirmation screen.
- **SC-006**: Recording adds no more than 1 second to the time between the customer tapping send and
  WhatsApp opening, at the 95th percentile.
- **SC-007**: The vendor can identify any individual order from the reference the customer quotes in
  chat, in under 10 seconds, and that lookup returns exactly one order.

## Assumptions

- **Guest checkout only.** Customers are never authenticated, so an order cannot be tied to an
  account and the customer cannot be granted read access to "their own" order. Confirmation
  detail lives in the WhatsApp message, not in the app.
- **The privacy boundary is correct as it stands** — customers write, only the vendor reads. This
  feature adapts the recording path to that boundary rather than relaxing it. Granting customers any
  read access to orders is out of scope and would contradict the project constitution.
- **The vendor's records are not the delivery mechanism.** WhatsApp delivers the order; these
  records exist so the admin dashboard, order history and status tracking can be built. This is why
  a recording failure is recoverable and a WhatsApp failure is not.
- **Orders placed from the sample menu are worth recording.** The stored name, variant label and
  price carry the order's meaning, so a missing catalogue pointer does not make the record useless.
- **Duplicate sends are a human problem.** The vendor already reconciles duplicates in chat;
  deduplication logic is out of scope for v1.
- **The existing catalogue, cart and checkout behaviour is unchanged.** This feature touches only
  what happens when the order is recorded, plus whatever the recording path needs from the client.
- **No change to what is collected.** The fields already gathered at checkout are exactly the fields
  recorded; this feature introduces no new customer data.
- **Admin reading and status updates already work** for the signed-in vendor and are only verified
  here, not built. Building the dashboard that consumes these records is a separate feature.
