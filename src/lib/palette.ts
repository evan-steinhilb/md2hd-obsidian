/**
 * The colour system, for the parts of the app that cannot read CSS variables.
 * Everything here has a twin in `theme.css` under the same name — change both.
 *
 * The graph keeps the logo blue as its foundation, and the categorical palette
 * is an even walk around the wheel starting from it. The shell does not: it is
 * built on the neutral ramp in `theme.css`, so the map is the only thing on
 * screen carrying hue.
 */

/** The logo blue, unmodified. UI state — selection, focus, active — only. */
export const ACCENT = '#0071f9'

/** The same blue lifted until it holds up as text and hairlines on the dark ground. */
export const ACCENT_BRIGHT = '#4d9bff'

/** Node types, in assignment order. Even lightness so none shouts over the others. */
export const PALETTE = [
  '#4a9bff', // blue — the foundation
  '#3fc8d4', // aqua
  '#4fbe8b', // green
  '#a8c25c', // moss
  '#e3ae52', // amber
  '#ea8a62', // coral
  '#e2749f', // rose
  '#9e8aec', // violet
]

/** Referenced but never defined: present, but with nothing of its own to say. */
export const UNRESOLVED = '#67717f'

/** The ground every link colour is mixed toward. Twin: `--edge` in base.css. */
export const EDGE = '#2b3a4c'

/**
 * Linear mix of two `#rgb`/`#rrggbb` colours, `t` being `a`'s share. A link at
 * rest is its source type's colour mixed 32% into `EDGE` — enough hue to say
 * where it starts, not enough to compete with a card. Anything unparseable (a
 * named colour in a map's own config) falls back to `b`.
 */
export function mixHex(a: string, b: string, t: number): string {
  const read = (s: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
    if (!m) return null
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const ca = read(a)
  const cb = read(b)
  if (!ca || !cb) return b
  const mix = ca.map((x, i) =>
    Math.round(x * t + cb[i] * (1 - t))
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${mix.join('')}`
}

/**
 * Ground, not stroke: the grid belongs to the shell's ramp — theme.css --n-4.
 *
 * Sized against n8n's canvas, which is the reference for this texture: they run
 * #444 dots on a #171717 ground at a 16px pitch, roughly a 6× jump in luminance.
 * Ours lands a little under that so the grid never out-shouts an edge, and makes
 * the difference up in density — the tighter pitch is what reads as material.
 */
export const DOT_GRID = '#34363c'
export const DOT_GAP = 16
