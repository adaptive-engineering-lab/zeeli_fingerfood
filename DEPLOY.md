# Deploying to Vercel

`vercel.json` at the repo root carries the whole build configuration, so nothing
here depends on a dashboard setting somebody has to remember.

## Why the config looks unusual

The app is not at the repo root. It lives in **`project assets/zeeli-fingerfoods`** —
a path with a space in it. Vercel's usual answer is the *Root Directory* project
setting, but that is a dashboard field with no representation in the repo: it is
invisible in code review, absent from a fresh import, and silently wrong if anyone
recreates the project. So the build is pinned in `vercel.json` instead:

| Key | Value | Why |
|---|---|---|
| `installCommand` | `cd 'project assets/zeeli-fingerfoods' && npm ci` | `ci`, not `install` — the lockfile is committed and a deploy should build the dependency tree that was tested, not resolve a fresh one |
| `buildCommand` | `cd 'project assets/zeeli-fingerfoods' && npm run build` | single-quoted; the space in the path breaks an unquoted `cd` |
| `outputDirectory` | `project assets/zeeli-fingerfoods/dist` | relative to the repo root |
| `framework` | `null` | there is no root `package.json`, so auto-detection has nothing to detect. Stating it beats letting Vercel guess |

## The SPA rewrite is load-bearing

```json
{ "source": "/((?!assets/).*)", "destination": "/index.html" }
```

The customer app is client-routed: `/cart`, `/checkout`, `/order-sent`, `/admin`.
Without this, those paths exist only after React has booted — a hard refresh, or the
**magic-link redirect to `/admin`**, would hit the CDN, find no such file and 404.

The `(?!assets/)` guard matters as much as the rewrite. A blanket `/(.*)` also
rewrites the hashed JS and CSS to `index.html`, so the browser receives HTML where it
expected a script and the site fails with no obvious cause.

## Environment variables

Vite inlines anything prefixed `VITE_` **at build time**. These must exist in the
Vercel project before the first build, for every environment that serves real traffic:

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | |
| `VITE_SUPABASE_ANON_KEY` | The publishable key. Safe in a browser bundle by design — RLS is what protects the data |
| `VITE_VENDOR_WHATSAPP_NUMBER` | Digits only, country code, no `+`. **Fails silently**: checkout opens a chat with nobody, and nothing errors |

### A build without them does not fail — it succeeds, and lies

This is the important part, and it was measured on a clean checkout rather than
reasoned about.

`supabaseClient.js` reads the URL and key into a ternary. Vite replaces
`import.meta.env.VITE_*` with literals at build time, so with the variables absent the
condition folds to a constant and Rollup **tree-shakes the entire Supabase client
out**. The build then succeeds — *faster, and 54 KB gzipped smaller*:

| | Bundle | Realtime markers | Works |
|---|---|---|---|
| Without the variables | 79.15 KB gz | 0 | no — no client at all |
| With them | 133.23 KB gz | 3 | yes |

The resulting site shows the seeded sample menu forever and records no order, with no
error anywhere. Because the sample menu is a designed fallback, it looks plausible.
A deploy that "worked" and shrank the bundle is the shape of failure nobody
investigates.

`vite.config.js` now fails the build when any of the three is missing, so this
converts to a loud error at deploy time. Verified in all three supply modes: absent
(exit 1, named variables), `.env` file, and `process.env` only — which is how Vercel
provides them.

### Never add `SUPABASE_SERVICE_ROLE_KEY`

It exists in the local `.env` for `npm run verify:permissions`, which needs to create
throwaway identities. It **bypasses RLS entirely** — it makes every policy, the
`is_admin()` predicate and both security-definer functions irrelevant.

Vite would not inline it into the bundle, since it lacks the `VITE_` prefix, so this
is not about browser exposure. It is that a build environment has no use for a
credential that can read every customer's name, phone number and address, and any
future build step could log or ship it.

## Also required, and not expressible here

Three Supabase project settings carry the admin area and none is a migration or a
config file — see the admin section of
[the app README](project%20assets/zeeli-fingerfoods/README.md):

- self-signup disabled
- Email OTP expiration 900s
- session timeouts left off

The magic-link redirect also needs the deployed origin added to Supabase's
**Redirect URLs** allow-list, or sign-in will bounce in production while working
perfectly on `localhost`.

## First deploy

```bash
vercel link          # from the repo root
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_VENDOR_WHATSAPP_NUMBER
vercel --prod
```

Then check, in this order, because each failure looks like the next one:

1. the menu loads with real items, not the "sample menu" notice — that notice means
   the Supabase variables did not reach the build
2. a hard refresh on `/checkout` returns the app, not a 404 — that is the rewrite
3. an order opens WhatsApp at the vendor's real number, not `234000…`
4. `/admin` renders the sign-in form, and a magic link completes against the
   deployed origin
