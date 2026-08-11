# Quickstart: validating Admin Authentication & Menu Management

Every scenario maps to a success criterion. The feature is done when all ten pass.

Scenario 1 is not optional and not last: it proves the privilege-escalation path found in
[research Finding 0](./research.md#finding-0-shipping-sign-in-would-open-a-privilege-escalation-path)
is actually closed.

## Prerequisites

```bash
cd "project assets/zeeli-fingerfoods"
npm install
```

Applied to the target project, **in this order**:

1. `supabase/migrations/20260811a__admin_identity.sql` — `admins`, `is_admin()`, nine repointed policies
2. `supabase/migrations/20260811b__soft_removal.sql` — `removed_at`, narrowed public read
3. `supabase/migrations/20260811c__place_order_fk_guard.sql` — the 001 fix

Then, in the Supabase dashboard — neither is expressible as a migration, and both are load-bearing:

- **Disable self-signup.** Without it, a stranger can mint an account (research D2).
- **Set the magic-link/OTP validity to 15 minutes** (FR-004; the default is 60).
- **Confirm the refresh-token lifetime outlasts 30 days** (FR-005, SC-010).

Finally, create the admin user and grant it:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = '<the vendor''s address>';
```

## Scenario 1 — a signed-in stranger gets nothing (SC-005, FR-007)

The one that would matter most if it regressed.

```bash
npm run verify:permissions
```

Extended from 001 with a second identity: a real authenticated session that is **not** in `admins`.

**Expect** — as the signed-in non-admin, every one of these fails or returns nothing:

| Attempt | Expected |
|---|---|
| read `orders` / `order_items` | 0 rows — **no customer names, phones or addresses** |
| insert / update / delete any catalogue row | rejected |
| upload or delete in `menu-images` | rejected |
| read `admins` | 0 rows |
| read available items | ✅ allowed — same as any visitor |

Plus 001's nine anonymous assertions, still passing.

**And the positive half**, which matters as much: as a session that **is** in `admins`, every one of
those same operations succeeds, and `is_admin()` returns true. Denials alone prove nothing — a
policy that refused *everyone* (a `using (false)`, a mistyped function name, a missing grant) would
satisfy the whole table above while leaving the vendor locked out of their own product. The check
must fail in both directions.

**Then break it deliberately**: add that user to `admins`, re-run, and watch the same assertions
fail. A permissions check that has only ever passed proves nothing — 001 established this and it
applies here with more force.

## Scenario 2 — the vendor signs in (SC-009, US1)

```bash
npm run dev
```

Visit `/admin`, enter the vendor's address, open the emailed link.

**Expect**: the menu manager. Then:

- Enter an address that is **not** registered → the *same* message as a registered one, and no link
  arrives (FR-003).
- Open a link twice → the second says it is spent and offers a fresh one (FR-004).
- Wait past 15 minutes → expired, with a re-request (FR-004).

## Scenario 3 — email stays off the routine path (SC-010, FR-005, FR-006)

Sign in, close the tab, reopen `/admin`.

**Expect**: straight into the manager, no email. Repeat after a browser restart. The vendor should
be asked for a link at most once a week of daily use — sign out and back in to confirm a link *is*
required when there genuinely is no session.

## Scenario 4 — correct the live menu (SC-002, US1)

Change a price; toggle an item unavailable.

**Expect**: within 10 seconds the customer menu shows the new price, and the unavailable item is gone
from it and cannot be added to a cart. It is still in the vendor's list, marked off.

## Scenario 5 — add an item in under a minute (SC-001, US2)

Time a non-technical person, on a phone, adding a complete item with a photo from the camera roll.

**Expect**: under 60 seconds, unaided, and the photo uploads in seconds rather than minutes. Then
check the stored object is a few hundred KB, not the multi-megabyte original (SC-006), and that it
loads in under 2 seconds on a throttled 4G profile.

Also try a PDF (rejected in plain language, FR-019) and a photo already smaller than the target
(passes through without upscaling).

## Scenario 6 — remove, restore, discard (SC-011, SC-012, US2)

1. Remove an item with sizes and a photo → gone from the customer menu **and** from the vendor's
   main list; still reachable in removed items.
2. Restore it → back complete, with description, price, photo and every size (under 30 seconds).
3. Remove and discard it → gone for good.
4. Reconcile storage against live rows:

```sql
-- every remaining object should belong to a live item
select name from storage.objects where bucket_id = 'menu-images';
select id from menu_items;
```

**Expect**: no orphans, from discards or from photo replacements (FR-017, FR-022).

Also confirm a removed item does not block removing its category (FR-030), and that a **live** one
does, with a count.

Then the state those two rules make reachable: remove an item, remove its now-empty category, and
restore the item. **Expect**: the vendor is asked which category it should return to, and it comes
back there. Not an error, and not an item with no category at all — which the customer menu, being
rendered by category, would silently drop while the vendor's list called it live.

Finally, interrupt a save: go offline mid-edit and save. **Expect**: a plain message that it did not
save, with the typed-in edits still on screen. Losing a half-entered item silently is the failure
most likely to cost the vendor's trust in the tool.

## Scenario 7 — a discard cannot cost a customer their order (SC-004, FR-031, Principle II)

The regression this plan exists to prevent — see
[research D9](./research.md#d9-discard-vs-a-customers-in-flight-order).

1. As a customer, add an item to the cart. Leave checkout open.
2. As the vendor, **discard** that exact item.
3. Complete the customer's checkout.

**Expect**: the order **is recorded**, with its line intact from the snapshots and `menu_item_id`
null — and WhatsApp still opens with the correct message. Before the 001 fix this records nothing at
all.

Repeat for a *soft* removal and for a rename: both already work, and the run confirms it rather than
assuming.

## Scenario 8 — the customer bundle is unchanged (Principle IV)

```bash
npm run build
```

**Expect**: the **customer entry chunk** still under 150 KB gzipped — it was 132.86 KB before this
feature, leaving ~17 KB. Read the customer chunk, not the total: the admin chunk is supposed to add
weight, just not there.

Then confirm the split is real:

```bash
grep -rl "features/admin" dist/assets/*.js
```

**Expect**: only the lazy admin chunk. A stray static import silently defeats `React.lazy`, and the
byte count alone would not catch it until it was expensive.

Then the **other two** Principle IV thresholds, which the byte count does not cover — this feature is
the first to put vendor-supplied images on the customer path:

- Lighthouse mobile ≥ 90, FCP < 1.5s on a 4G profile.
- In the network panel, a phone downloads the **card** derivative (~800px), not the detail one
  (SC-013). If both sizes are the same bytes, `srcset` is not doing its job.

## Scenario 11 — an empty catalogue shows an empty menu (SC-014, FR-034)

The trap this feature would otherwise walk into on day one — the vendor's first act is to clear the
seeded placeholder menu and enter their own.

1. As the vendor, remove or switch off **every** item.
2. Load the customer menu as an anonymous visitor.

**Expect**: the empty state. **Not** the seeded sample menu — no Puff Puff, no Combo Tray, nothing
orderable at a price nobody confirmed.

Then confirm the genuine fallback still works, because it is a different situation: point
`VITE_SUPABASE_URL` at an unreachable host and reload. **Now** the sample menu appears, with its
"showing a sample menu" note. Read failed → seed; read succeeded and empty → empty state.

## Scenario 9 — ordering, including on a phone (SC-003, FR-028, FR-029)

Drag an item to the top of its category on desktop; do the same on a phone with the move controls.

**Expect**: the customer menu reflects both. The touch path is not a degraded afterthought — it is
how the vendor will actually do it.

## Scenario 10 — design fidelity (Principle III)

```bash
npm run lint
```

**Expect**: `check-design-adherence.mjs` clean across the new admin CSS — no raw hex, no non-token
font, no non-token radius, no px duplicating a `--space-*` token. Then compare the three screens
against wireframes 4c, 5b and 6a.

## Gate before calling this done

```bash
npm run lint     # oxlint + design adherence
npm run test     # vitest, all green
npm run build    # customer chunk inside the Principle IV budget
npm run verify:permissions
```
