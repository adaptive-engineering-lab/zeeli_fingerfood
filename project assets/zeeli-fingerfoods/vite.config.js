import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Variables the customer app cannot function without. Vite inlines VITE_* at
// build time, so a missing one is not a runtime misconfiguration — it is baked
// into the artifact and cannot be fixed without rebuilding.
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_VENDOR_WHATSAPP_NUMBER']

/**
 * Fail the production build when a required variable is absent.
 *
 * Without this the failure is silent and actively misleading. `supabaseClient.js`
 * reads the URL and key into a ternary; with them undefined the condition folds to
 * a constant at build time and Rollup tree-shakes the ENTIRE Supabase client out.
 * The build then succeeds, faster and 54 KB gzipped smaller, and produces an app
 * that can never reach the database: the menu falls back to seed data forever and
 * no order is ever recorded. Nothing errors, and the seed menu looks plausible.
 *
 * Measured 2026-08-12 on a clean checkout: 79.15 KB gzipped without the variables,
 * 133.23 KB with them. A deploy that "worked" and shrank the bundle is exactly the
 * shape of failure nobody investigates.
 *
 * Build only. `dev` has its own loud console error, and tests deliberately run
 * without a live backend.
 */
function requireEnv() {
  return {
    name: 'zeeli-require-env',
    apply: 'build',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      const missing = REQUIRED.filter((key) => !env[key] && !process.env[key])

      if (missing.length > 0) {
        throw new Error(
          `\n\nMissing required environment variable(s):\n` +
            missing.map((key) => `  - ${key}`).join('\n') +
            `\n\nThese are inlined at build time. Building without them produces an app\n` +
            `that silently cannot reach Supabase — the Supabase client is tree-shaken\n` +
            `out entirely and the menu falls back to sample data forever.\n\n` +
            `Set them in the deployment environment (see DEPLOY.md) or in .env locally.\n`
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [requireEnv(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
