# Phase 1 Data Model: Admin Authentication & Menu Management

Column facts were read from the live project. Only the **deltas** are detailed; unchanged columns
are listed in [001's data model](../001-guest-order-persistence/data-model.md).

## New: `public.admins`

Answers "is this session the vendor?" — the question `auth.role()` cannot (see
[research Finding 0](./research.md#finding-0-shipping-sign-in-would-open-a-privilege-escalation-path)).

| Field | Type | Null | Notes |
|---|---|---|---|
| `user_id` | uuid | no | PK, FK → `auth.users(id)` **ON DELETE CASCADE** — deleting the account revokes the grant automatically |
| `email` | text | yes | Convenience for a human reading the table; not the identity |
| `created_at` | timestamptz | no | `now()` |

**RLS**: enabled, with **no policy granting any client access**. Nothing outside `is_admin()` needs
to read it, and a table that lists who holds power should not be readable by the anonymous public.

### `public.is_admin()`

```text
is_admin() → boolean
  stable, security definer, search_path = public, pg_temp
  returns: exists (select 1 from admins where user_id = auth.uid())
```

`security definer` so it can read `admins` despite that table's own lockdown. `stable` so Postgres
evaluates it once per statement rather than per row.

Granted to `anon` and `authenticated`, which makes it two things at once: the predicate behind all
nine policies, **and** the client's only way to ask whether this session is the vendor. The browser
cannot answer that by reading `admins` — the table has no client policy, so a `select` returns zero
rows for the vendor exactly as it does for a stranger. One function serving both means the UI and
the policies cannot disagree about who the admin is
([contracts/admin-auth.md](./contracts/admin-auth.md#where-admin-vs-not-admin-comes-from)).

### `public.save_menu_item(...)`

The second `security definer` function this feature adds, and the only catalogue write that is not a
plain statement: it writes `menu_items` and reconciles that item's `menu_item_variants` in one
transaction. From the browser those are two round trips, and a failure between them leaves a
sizes-mode item with no base price and no sizes — priced at nothing, still `is_available`, in front
of customers. Contract and signature in
[contracts/catalogue.md](./contracts/catalogue.md#5-save_menu_item--the-one-write-that-cannot-be-two-calls).

It **re-checks `is_admin()` in its own body**. `security definer` runs as the owner and bypasses
RLS, so the nine policies do not protect it — exactly the shape of `place_order` in feature 001.

## Changed: `public.menu_items`

| Field | Type | Null | Notes |
|---|---|---|---|
| `removed_at` | timestamptz | yes | **NEW.** Null = live. Set = removed, hidden everywhere, restorable. Doubles as the retention clock for FR-017 |

Index: partial index on `(category_id, sort_order) where removed_at is null` — every customer read
and the admin's main list share that predicate.

**No other schema change.** `sort_order` already exists on `menu_items` and `categories`, and
`is_available` already exists — the three hiding/ordering mechanisms this feature needs are present.

## Two ways to hide, one way to remove

Easy to conflate, so stated explicitly — `useMenu` must filter on both:

| State | Set by | Customer sees | Vendor's main list | Reversible |
|---|---|---|---|---|
| Live | default | ✅ | ✅ | — |
| Unavailable (`is_available = false`) | availability toggle | ❌ | ✅, marked off | Instantly — "not today" |
| Removed (`removed_at` set) | remove + confirm | ❌ | ❌, in removed view | Yes, ≥30 days — "not any more" |
| Discarded | discard, or retention lapse | ❌ | ❌ | **No** — row and photo are gone |

## Permission matrix

The change this feature makes. "Signed-in non-admin" is the case that does not exist today and must
never work.

| Operation | Object | Anonymous | Signed-in **non-admin** | Admin |
|---|---|---|---|---|
| read available, non-removed items | catalogue | ✅ | ✅ | ✅ |
| read removed or unavailable items | catalogue | ❌ | ❌ | ✅ |
| write | catalogue | ❌ | ❌ **(today: ✅)** | ✅ |
| read | `orders`, `order_items` | ❌ | ❌ **(today: ✅ — all customer PII)** | ✅ |
| update | `orders` | ❌ | ❌ **(today: ✅)** | ✅ |
| insert | `orders` | via `place_order` only | via `place_order` only | via `place_order` only |
| upload / delete | `menu-images` | ❌ | ❌ **(today: ✅)** | ✅ |
| read | `menu-images` | ✅ | ✅ | ✅ |
| read | `admins` | ❌ | ❌ | ❌ (only `is_admin()`) |

Every **bold** cell is a privilege that exists in the database right now and is unreachable only
because no account exists. All nine policies move from `auth.role() = 'authenticated'` to
`is_admin()`.

## Validation rules

Enforced in the pure modules (client) *and* by database constraints where a constraint can express
them — the client rule is for the vendor's benefit, the constraint is the guarantee.

**Corrected 2026-08-11.** An earlier version of this table claimed several of these were already
enforced by `check` constraints. They are not: `contype = 'c'` returns **zero** rows for both
`menu_items` and `menu_item_variants`. The "Today" column below is what the live database actually
does; "Target" is what migration `20260811d` adds.

| Rule | Today | Target | Source |
|---|---|---|---|
| Name non-blank after trimming | nothing | client + `check` | FR-010 |
| Category required | FK, nullable | client + `check` (not null) | FR-009 |
| Price > 0 when not selling in sizes | nothing | client + `check` | FR-010 |
| Sizes-mode requires ≥1 size | nothing | client, verified on save | FR-024 |
| A sized item has no base price | nothing | client + `check` | FR-009, FR-026 |
| Size label non-blank, price > 0 | nothing | client + `check` | FR-023 |
| Category with live items cannot be removed | **`ON DELETE SET NULL` — silently orphans them** | `before delete` trigger | FR-030 |
| Removed items excluded from customer reads | n/a (column doesn't exist) | **policy**, not client | FR-016 |
| Restorable ≥30 days | n/a | `removed_at` age | FR-017 |

Two notes on why the target column looks the way it does:

**The category FK is the sharp edge.** `menu_items_category_id_fkey` is `ON DELETE SET NULL`, so
deleting a populated category succeeds and leaves its items with `category_id = null` — still
available, still not removed, but belonging to nowhere. The customer menu renders by category, so
they would silently disappear from it while every admin view still calls them live. A trigger (not
`on delete restrict`) is needed because FR-030 must allow deleting a category that holds only
*removed* items, which requires a `where` clause.

**Client rules are for the vendor; constraints are the guarantee.** SC-007 promises zero invalid
items reach customers, and an admin session holds a real API key — it can write directly, bypassing
any form. Same reasoning that put `place_order` in the database in feature 001.

The removed-item exclusions are deliberately policy-level too. A client-side filter is a display
convention; a policy is a guarantee, and FR-016's whole point is that removed means invisible rather
than merely unlisted.

## Glossary

The spec speaks the customer's language; the schema and code speak the database's. They mean the
same things:

| Spec | Plan, tasks, schema |
|---|---|
| size | a `menu_item_variants` row — "variant" in code |
| retire a size | `menu_item_variants.is_available = false` |
| remove an item | `menu_items.removed_at` set |
| discard an item | the row is deleted |

## State transitions

```text
                 ┌──────────── restore (≤30d) ───────────┐
                 ▼                                        │
   (new) ──> Live ──availability off──> Unavailable       │
              │  ▲                          │             │
              │  └──availability on─────────┘             │
              │                                            │
              └── remove + confirm ──> Removed ────────────┘
                                          │
                                          └── discard, or retention lapse ──> gone
```

Only the admin may drive any transition. `Removed → gone` is the sole irreversible edge, and the
only one FR-012 permits a confirmation to reach.

## Effect on feature 001

`place_order` currently inserts `order_items.menu_item_id` straight against the FK. Once discard
exists, a customer holding a discarded item in their cart would have their **whole order rejected**
([research D9](./research.md#d9-discard-vs-a-customers-in-flight-order)). The function changes to
store `null` for a catalogue id that no longer resolves, matching how it already treats sample-menu
ids. Snapshots keep the line complete.
