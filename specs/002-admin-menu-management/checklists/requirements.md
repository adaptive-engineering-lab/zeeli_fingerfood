# Specification Quality Checklist: Admin Authentication & Menu Management

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation log

**Iteration 1** — two items failed and were fixed before this checklist was marked complete.

1. *No implementation details* — **failed, fixed.** The first draft named Supabase Auth, Storage
   buckets and RLS policies in the requirements. Rewritten as capabilities ("only the signed-in
   vendor MUST be able to…", "stored photos MUST be small enough to load quickly on a phone over
   4G"). The one deliberate exception is the Assumptions note that the design is fixed by
   `Zeeli Admin Wireframes.dc.html` — that is an input to planning, not a requirement.

2. *Success criteria are technology-agnostic* — **failed, fixed.** Two criteria referenced upload
   byte limits and policy counts. Replaced with SC-006 (photos load in under 2s on 4G) and SC-005
   (0 successful anonymous writes out of 12 attempts) — both observable from outside the system.

**Zero `[NEEDS CLARIFICATION]` markers.** Five points were open; each had a defensible default and
became a documented Assumption instead: single admin provisioned out of band with no in-app
password reset; live editing with no draft/publish step; permanent deletes behind a confirmation;
flat categories; one photo per item.

**Re-validated 2026-08-11** after the clarification session: still 16/16, no state changes. Three of
those five assumptions were overturned by the session — the account model, the deletion model and
the photo pipeline all changed — and the spec was updated in place rather than left carrying
contradictions. One borderline call worth flagging: the Assumptions section now cites the
customer-route bundle budget in KB, which is closer to an implementation detail than the rest of the
spec. It is kept because the constraint genuinely binds the solution space, and it sits in
Assumptions rather than in a requirement.

### Open risks carried into planning

Updated after the 2026-08-11 clarification session. Risks 1 and 4 were resolved there; 2 and 3 stand.

1. ~~**No password reset.**~~ ~~**Traded, not removed.**~~ **Closed.** Sign-in is a passwordless
   emailed link (FR-001). The follow-up hardening took email off the routine path — a session lasts
   at least 30 days and renews with use, so a link is needed only on a new device or after sign-out
   (FR-005, FR-006), and SC-010 measures it. What remains is a **security** posture, not a
   reliability one: the vendor's inbox is the credential, and an admin session reads every
   customer's name, phone and address. Bounded by the 15-minute single-use link (FR-004), not
   eliminated. A second factor is the only real fix and is out of scope for v1.

2. **FR-031 spans two features.** "Catalogue changes must not interrupt a customer's session"
   constrains code that 001 already shipped (`place_order` records snapshots, and `menu_item_id` is
   nullable with `ON DELETE SET NULL`). Planning should confirm the existing behaviour satisfies it
   rather than assuming new work is needed — most of user story 5 may already be true.
   *(Was FR-021, then FR-027; the clarification session renumbered twice.)*

3. **SC-001's 60 seconds is a design constraint, not just a target.** It rules out a multi-step
   wizard for adding an item. Wireframe 6a (side drawer) and 6b (full page) both plausibly meet it;
   6c (modal) is the riskiest because it hides the list behind a dialog. Worth measuring, not
   assuming. **Choosing among 6a/6b/6c was deliberately deferred to `/speckit-plan`** as a design
   decision rather than a spec ambiguity.

4. ~~**Item ordering gap.**~~ **Resolved** — wireframe 5b drew drag handles on item rows that no
   requirement covered. Now FR-024 and FR-025, including the touch-device fallback, since
   drag-and-drop on a phone is the part most likely to be built desktop-only by accident.

5. ~~**Soft removal has a maintenance tail.**~~ **Closed.** Removal hides rather than destroys
   (FR-012, FR-013), which originally meant unbounded growth. Now bounded: removed items stay
   restorable for at least 30 days and may then be discarded, the vendor can discard sooner, and
   discarding releases the photo — as does replacing one (FR-017, FR-022). FR-016 makes "absent
   from every customer-facing view" an explicit requirement rather than an assumption for planning
   to infer, and SC-012 measures that no orphaned storage is left behind.

6. **New: a factual error was corrected.** An edge case previously asserted that a compromised
   inbox "cannot read or alter orders". That was wrong — the shipped policy is
   `admin can read orders USING (auth.role() = 'authenticated')`, so any admin session reads all
   customer contact and address data. The spec now states this accurately. Worth planning knowing
   that admin auth is protecting customer PII, not just menu edits.
