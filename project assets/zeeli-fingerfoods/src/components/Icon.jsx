// Lucide icons (https://lucide.dev), inlined rather than pulled from a package —
// the customer route has a 150KB gzipped JS budget and we need six glyphs.
// Paths are copied verbatim from Lucide so they stay swappable for the real
// library later. Modernist specifies Lucide throughout.
const PATHS = {
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  arrowLeft: ['m12 19-7-7 7-7', 'M19 12H5'],
  chevronDown: ['m6 9 6 6 6-6'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  check: ['M20 6 9 17l-5-5'],
}

export default function Icon({ name, size = 16, ...rest }) {
  const paths = PATHS[name]
  if (!paths) return null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
