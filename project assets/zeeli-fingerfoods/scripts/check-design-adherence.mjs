#!/usr/bin/env node
// Design-system adherence check for Modernist (constitution Principle III).
//
// The design project ships `_adherence.oxlintrc.json`, but it cannot run here: it
// relies on `no-restricted-syntax`, which oxlint does not implement, and its
// selectors match JavaScript literals only — so it would miss App.css, which is
// where the risk actually lives. This covers CSS and JSX, and derives the spacing
// tokens from the vendored stylesheet so a re-import keeps it honest.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const VENDORED = join(SRC, 'styles', 'modernist.css') // the one file allowed to hold raw values

const spacing = new Map(
  [...readFileSync(VENDORED, 'utf8').matchAll(/(--space-\d+):\s*([\d.]+)px/g)]
    .map(([, token, px]) => [parseFloat(px), token])
)

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.(css|jsx?)$/.test(entry.name) && path !== VENDORED) files.push(path)
  }
})(SRC)

// The first rule is the design project's own; the other two check a declaration's
// value rather than lookahead past it — `\s*(?!…)` silently passes by matching
// zero spaces. 50% radius is allowed: the system itself uses it for radio dots.
const HEX = /#[0-9a-fA-F]{3,8}\b/
const VALUE_RULES = [
  [
    'font-family',
    // `inherit` is not an escape from the system, it is a deferral to it: the
    // cascade already resolved to a token on body. Form controls need exactly
    // this, because they do not inherit type by default.
    (value) => value.startsWith('var(--font-') || value === 'inherit',
    'Font outside the system — use var(--font-heading), var(--font-body), or inherit.',
  ],
  [
    'border-radius',
    (value) => value.startsWith('var(--radius-') || ['0', '0px', '50%'].includes(value),
    'Modernist rounds no corners — use var(--radius-*).',
  ],
]

let violations = 0
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const code = line.split(/\/\*|\/\//)[0] // ignore anything in a comment
    const flag = (message) => {
      console.error(`${relative(process.cwd(), file)}:${index + 1}  ${message}\n    ${line.trim()}`)
      violations += 1
    }
    if (HEX.test(code)) flag('Raw hex colour — use a --color-* token via var().')

    for (const [property, isAllowed, message] of VALUE_RULES) {
      const found = new RegExp(`\\b${property}\\s*:\\s*([^;]+)`).exec(code)
      if (found && !isAllowed(found[1].trim())) flag(message)
    }

    // A px value that duplicates a spacing token the system already carries.
    // Sizes without a token (font-size, hairline borders) are legitimately raw.
    const declaration = /\b(padding|margin|gap|row-gap|column-gap|inset)[a-z-]*\s*:([^;]*)/.exec(code)
    if (declaration) {
      for (const [, px] of declaration[2].matchAll(/\b([\d.]+)px/g)) {
        const token = spacing.get(parseFloat(px))
        if (token) flag(`Raw ${px}px duplicates var(${token}).`)
      }
    }
  })
}

// A rule the line-by-line checks structurally cannot make: they inspect
// declarations that exist, and the failure here is one that does not.
//
// Buttons, inputs, selects and textareas do not inherit font-family. Without an
// explicit rule the browser substitutes a UA default — Arial, next to Archivo —
// and no stylesheet line is wrong, so nothing is flagged. It was found by
// reading computed styles off a rendered page, which this script cannot do.
// Asserting the rule exists is the cheap half, and it is the half that catches
// a future refactor deleting it.
const globals = readFileSync(join(SRC, 'index.css'), 'utf8')
if (!/button[\s\S]{0,80}?font-family:\s*inherit/.test(globals.replace(/\/\*[\s\S]*?\*\//g, ''))) {
  console.error(
    "src/index.css  Form controls must inherit the page font — without it buttons\n" +
      '    and inputs silently render in the browser default, not Archivo.'
  )
  violations += 1
}

console.log(
  violations
    ? `\n✗ ${violations} design-system violation${violations === 1 ? '' : 's'}`
    : `✓ design-system adherence clean (${files.length} files)`
)
process.exit(violations ? 1 : 0)
