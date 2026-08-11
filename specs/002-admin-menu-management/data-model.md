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

| Rule | Where | Source |
|---|---|---|
| Name non-blank after trimming | client + `check` | FR-010 |
| Category required | client + FK not-null | FR-009 |
| Price > 0 when not selling in sizes | client + `check` | FR-010 |
| Sizes-mode requires ≥1 size | client, then verified on save | FR-024 |
| A sized item has no base price | client + `check` | FR-009, FR-026 |
| Size label non-blank, price > 0 | client + `check` | FR-023 |
| Category with live items cannot be removed | database | FR-030 |
| Removed items excluded from customer reads | **policy**, not client | FR-016 |
| Restorable ≥30 days | `removed_at` age | FR-017 |

The last two are deliberately not client-side. A client-side filter is a display convention; a
policy is a guarantee, and FR-016's whole point is that removed means invisible rather than unlisted.

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
