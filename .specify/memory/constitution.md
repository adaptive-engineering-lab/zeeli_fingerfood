<!--
Sync Impact Report
- Version change: (uninitialised template) → 1.0.0
- Bump rationale: MAJOR/initial ratification. The template carried no principles;
  this is the first concrete governance document for the project.
- Principles defined:
  - I. Test-First for Decidable Logic (NON-NEGOTIABLE)
  - II. The Order Always Reaches the Vendor
  - III. Design System Fidelity
  - IV. Mobile-First Performance Budget
  - V. Least-Privilege Data
- Added sections: Technology & Scope Constraints; Development Workflow & Quality Gates
- Removed sections: none (all placeholder slots filled)
- Templates reviewed:
  - .specify/templates/plan-template.md ✅ no change needed — its Constitution Check
    gate reads this file at plan time rather than restating principles
  - .specify/templates/spec-template.md ✅ no change needed — no constitution-coupled sections
  - .specify/templates/tasks-template.md ✅ no change needed — task categories already
    cover the testing and quality gates this constitution mandates
  - .specify/templates/checklist-template.md ✅ no change needed
  - README.md (project assets/zeeli-fingerfoods/README.md) ✅ already documents the design
    system rules and fallback behaviour Principles II and III require
- Deferred TODOs: none

Amendment 1.0.0 → 1.0.1 (2026-08-10)
- Bump rationale: PATCH. No requirement changed; Principle III gains the enforcement mechanism it
  previously described only in prose, and the workflow gate names it.
- Modified: III. Design System Fidelity (added the mechanical-enforcement paragraph);
  Development Workflow & Quality Gates (lint gate now names the adherence check).
- Trigger: the design handoff shipped `_adherence.oxlintrc.json`, which was missed during import.
  It cannot run on oxlint, so `scripts/check-design-adherence.mjs` replaces it and is wired into
  `npm run lint`. It caught 6 real violations in `src/App.css` on first run, all since fixed.
- Templates requiring updates: none — the plan template's Constitution Check reads this file.
-->

# Zeeli Finger Foods Constitution

The product is a single-page ordering site for a Lagos small chops and grills vendor.
Customers arrive from an Instagram bio link on a phone, browse a live menu, build a cart,
and hand a pre-formatted order to WhatsApp. An admin panel lets non-technical staff manage
the menu and watch orders arrive. Everything below is scoped to that product.

## Core Principles

### I. Test-First for Decidable Logic (NON-NEGOTIABLE)

Any logic with a decidable right answer — money arithmetic, cart line identity, message
templating, URL encoding, form validation, status transitions — MUST live in a pure module
under `src/features/*/` or `src/lib/`, free of React and of Supabase, and MUST have a
failing Vitest test written before its implementation.

Presentational components are exempt from mandatory unit tests. That exemption is
conditional: when a component starts making decisions, the decision MUST be extracted into a
tested module rather than tested through the DOM.

*Rationale:* a wrong subtotal or a mangled WhatsApp link costs the vendor a real order and is
invisible in a screenshot. `src/features/cart/cartMath.js` and
`src/features/checkout/whatsapp.js` are the reference pattern.

### II. The Order Always Reaches the Vendor

No dependency may strand a customer's order. Every remote call on the customer path MUST
have a defined, implemented, and demonstrated degraded path:

- Menu read fails or Supabase is unconfigured → render the seed menu and tell the customer
  it is a sample. A blank menu page is a defect, never an acceptable error state.
- Order write to Supabase fails → the WhatsApp handoff MUST still proceed. Persistence is
  bookkeeping for the admin; WhatsApp is the channel that reaches the vendor.
- WhatsApp deep link fails to open → show the order as copyable text alongside the vendor's
  number.

A feature that adds a remote call to the customer path is incomplete until its fallback is
implemented and exercised. "It will not fail in practice" is not an argument.

*Rationale:* the customer is on a phone, on mobile data, one tap from leaving. There is no
retry queue and no support desk.

### III. Design System Fidelity

The UI is built on Modernist, imported from the project's Claude Design workspace and
vendored at `src/styles/modernist.css`. That file is a copy, not a fork: it MUST be
re-imported from the design project rather than hand-edited, and app rules MUST live in
`src/App.css`.

Colors, fonts, spacing, radii and shadows MUST be taken from `var(--color-*)`, `var(--font-*)`,
`var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`. Hard-coded hex values, font names, or
raw pixel values that a token already carries are prohibited. Modernist's structural rules —
zero corner radius, 2px dividers instead of whitespace or shadow, labels flush left including
inside wide buttons, the accent reserved for the primary action and small emphasis, and
`--color-accent-700` for accent text at paragraph size — are binding.

Deviations are permitted but MUST be commented at the point of deviation and recorded in the
README. One deviation stands today: item photographs render in colour rather than through
Modernist's `.grayscale` wrapper, because food photography is the product.

This principle is **enforced mechanically**, not by review: `npm run lint` runs
`scripts/check-design-adherence.mjs`, which fails on a raw hex colour, a non-token font, a
non-token corner radius, or a raw px value duplicating a `--space-*` token — across CSS as well
as JSX. The design project's own `_adherence.oxlintrc.json` cannot run here (it needs
`no-restricted-syntax`, absent from oxlint, and matches JavaScript literals only); the script is
its local equivalent and reads its spacing tokens out of the vendored stylesheet, so re-importing
the design system keeps the check honest.

*Rationale:* the wireframes and the design system are the specification for how this looks.
Silent drift makes every future screen a negotiation.

### IV. Mobile-First Performance Budget

The customer-facing route MUST stay under **150 KB gzipped JavaScript**, reach a Lighthouse
mobile performance score of **≥ 90**, and hit first contentful paint under **1.5s on 4G**.
Item photographs MUST be served responsively and lazy-loaded below the fold.

Phones are the primary breakpoint and every customer screen MUST be designed at phone width
first. The admin panel MAY be less optimised for mobile but MUST remain usable on one.

Adding a dependency that pushes the customer bundle past the budget requires either removing
weight elsewhere or an explicit, recorded amendment to this number.

*Rationale:* the budget is measurable at every build (`npm run build` prints it), so it is a
gate rather than an aspiration.

### V. Least-Privilege Data

Row Level Security MUST be enabled and policied on every table. The customer path holds the
anon key in the browser, so the policies are the only real boundary:

- `categories`, `menu_items`, `menu_item_variants`: public read of available rows; write
  restricted to the authenticated admin.
- `orders`, `order_items`: public **insert only**; read and update restricted to the
  authenticated admin.

Customer name, phone and address are collected solely to fulfil an order and MUST NOT be used
for anything else or duplicated into other stores. No customer accounts exist; admin is the
only authenticated role.

A schema change is not done until its RLS policies are applied and verified against a real
anon-key request. A policy that has been written in a migration but never exercised is
assumed broken.

*Rationale:* a permissive policy on `orders` exposes every customer's name, phone and home
address to anyone holding the public key.

## Technology & Scope Constraints

The stack is decided and MUST NOT be relitigated per feature: React + Vite; Supabase for
Postgres, Storage and Auth; Vitest with React Testing Library; oxlint; Vercel for hosting;
`wa.me` deep links for order delivery.

The following are out of scope for v1. Proposing one is a constitutional amendment, not a
feature request:

- In-app payment processing — payment is arranged manually in the WhatsApp chat.
- WhatsApp Business API or automated bot replies.
- Delivery-fee calculation or zone logic — the vendor quotes delivery cost in chat.
- Multi-vendor or marketplace support.
- Customer accounts or login — guest checkout only.
- Native mobile applications.
- Catering and event enquiry flows — these stay in DM/WhatsApp.

Ordering is allowed at any hour. Outside business hours (Mon–Sun, 9am–5pm) the site MUST show
a notice that orders will be confirmed when the vendor reopens, and MUST NOT block checkout.
Availability is a manual per-item boolean; there are no quantity counts. There is no minimum
order.

## Development Workflow & Quality Gates

Work proceeds through spec-kit: `/speckit-specify` → `/speckit-clarify` (when the spec has
open questions) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Feature specs
live in `specs/###-slug/`. The PRD at `project assets/zeeli-fingerfoods-prd.md` is the source
of product intent; where the PRD and this constitution disagree, this document wins and the
PRD MUST be corrected.

Before any feature is called done, all three of these MUST pass and MUST be reported honestly,
including failures:

```bash
npm run lint     # oxlint + design-system adherence, zero errors
npm run test     # vitest, all green
npm run build    # succeeds, and the gzipped JS line is inside the Principle IV budget
```

Changes to a customer-facing screen MUST additionally be exercised in a real browser at phone
width and at desktop width before being reported as working. A passing unit test is not
evidence that a screen renders.

Open questions MUST be recorded in the spec rather than resolved by silent assumption. Where
an assumption is unavoidable to make progress, it MUST be stated explicitly in the delivered
work.

## Governance

This constitution supersedes ad-hoc practice and prior convention in this repository. It
applies to every feature spec, plan, task list and implementation.

**Amendments** require: a written statement of what changes and why, a version bump per the
policy below, an update to the Sync Impact Report at the top of this file, and propagation to
any template or document the amendment invalidates.

**Versioning** follows semantic versioning:

- MAJOR — a principle is removed or redefined in a backward-incompatible way, or a scope
  constraint is reversed.
- MINOR — a principle or section is added, or existing guidance is materially expanded.
- PATCH — clarification, wording, or typo fixes that do not change what is required.

**Compliance.** Every `/speckit-plan` MUST evaluate its Constitution Check gate against this
file before Phase 0 and again after Phase 1 design. Violations MUST be either resolved or
justified in the plan's Complexity Tracking section — an unjustified violation blocks
implementation. Complexity MUST be justified against a principle, not against preference.

**Version**: 1.0.1 | **Ratified**: 2026-08-10 | **Last Amended**: 2026-08-10
