import { parse as parseYaml } from 'yaml'
import { PALETTE, UNRESOLVED } from './palette'

/**
 * The md2hd markdown language.
 *
 * A project is a bag of .md files. Every YAML frontmatter block starts a node.
 * A file may hold many nodes: a `---` line whose next non-blank line looks like
 * a YAML key opens a new node. Anything else (`***`, `___`, a `---` followed by
 * prose) stays an ordinary horizontal rule.
 *
 * Edges come from three places, all optional:
 *   rel: { employs: [jane, bob] }   frontmatter map of relation -> id(s)
 *   manager: "[[jane]]"             any frontmatter value that is a wikilink
 *   owns:: [[globex]]               inline field anywhere in the body
 *   [[jane]]                        a bare wikilink -> untyped "mentions" edge
 *
 * One node with `type: map` configures the project (title, type colors, layout).
 */

export type MdNode = {
  id: string
  type: string
  title: string
  subtitle?: string
  description?: string
  /** 1 (faint) to 5 (lead). Drives how loudly the card is drawn. */
  weight: number
  tags: string[]
  body: string
  file: string
  fields: Record<string, unknown>
  ghost?: boolean
}

export type MdEdge = {
  id: string
  source: string
  target: string
  /** The relationship in the direction it is drawn: "employs". */
  label: string
  /** The same relationship worded from the target's side: "works at". */
  reverse?: string
  /** True when the relation reads the same both ways — "met", "knows". */
  symmetric?: boolean
}

export type TypeStyle = { label: string; color: string }

export type MapConfig = {
  title: string
  layout: 'LR' | 'TB'
  types: Record<string, TypeStyle>
  /** `works_at: employs` — "X works_at Y" is the same fact as "Y employs X". */
  inverse: Record<string, string>
  /** Relations that read the same from both ends: `symmetric: [knows, met]`. */
  symmetric: string[]
}

export type Graph = {
  nodes: MdNode[]
  edges: MdEdge[]
  config: MapConfig
  warnings: string[]
}

export type SourceFile = { path: string; text: string }

/** Weight is a tier, not a score: five steps, named or numbered. */
export const WEIGHT_NAMES = ['', 'faint', 'minor', 'normal', 'major', 'lead'] as const

/** How many links touch each node — the canvas badge and the shell lists agree. */
export function degrees(edges: MdEdge[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const e of edges) {
    d.set(e.source, (d.get(e.source) ?? 0) + 1)
    d.set(e.target, (d.get(e.target) ?? 0) + 1)
  }
  return d
}

const WEIGHT_WORDS: Record<string, number> = {
  lead: 5,
  critical: 5,
  primary: 5,
  key: 5,
  major: 4,
  high: 4,
  normal: 3,
  medium: 3,
  default: 3,
  minor: 2,
  low: 2,
  faint: 1,
  background: 1,
  trivial: 1,
}

export function asWeight(v: unknown): number {
  if (v == null || v === '') return 3
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (Number.isFinite(n)) return Math.min(5, Math.max(1, Math.round(n)))
  return WEIGHT_WORDS[String(v).trim().toLowerCase()] ?? 3
}

const YAML_KEY = /^[A-Za-z_][\w .-]*\s*:(\s|$)/
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
const INLINE_FIELD = /(?:^|\s)([A-Za-z][\w-]*)::\s*(.+)$/gm

export const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')

type RawDoc = { fm: Record<string, unknown>; body: string }

/** Split one file into frontmatter/body documents. */
export function splitDocs(text: string): RawDoc[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const docs: RawDoc[] = []
  let i = 0
  // Preamble before the first frontmatter block is not a node — skip to it.
  while (i < lines.length) {
    if (lines[i].trim() !== '---' || !opensFrontmatter(lines, i)) {
      i++
      continue
    }
    const fmStart = ++i
    while (i < lines.length && lines[i].trim() !== '---') i++
    const fmText = lines.slice(fmStart, i).join('\n')
    i++ // consume closing ---
    const bodyStart = i
    while (i < lines.length && !(lines[i].trim() === '---' && opensFrontmatter(lines, i))) i++
    let fm: Record<string, unknown> = {}
    try {
      const parsed = parseYaml(fmText, {
        merge: true,
        customTags: ['timestamp'],
      })
      if (parsed && typeof parsed === 'object') fm = parsed as Record<string, unknown>
    } catch {
      /* malformed frontmatter: treat as an empty block, body still renders */
    }
    docs.push({ fm, body: lines.slice(bodyStart, i).join('\n').trim() })
  }
  return docs
}

/** A `---` line only opens frontmatter when a YAML key follows it. */
function opensFrontmatter(lines: string[], at: number): boolean {
  for (let j = at + 1; j < lines.length; j++) {
    const line = lines[j]
    if (!line.trim()) continue
    if (line.trim() === '---') return false
    return YAML_KEY.test(line)
  }
  return false
}

const asArray = (v: unknown): string[] => {
  if (v == null) return []
  if (Array.isArray(v)) return v.flatMap(asArray)
  return [String(v)]
}

/** `[[target]]` or `target` -> canonical id. */
const asRef = (v: string) => {
  const m = /^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(v)
  return slug(m ? m[1] : v)
}

const isWikilink = (v: unknown) => typeof v === 'string' && /^\s*\[\[[^\]]+\]\]\s*$/.test(v)

const RESERVED = new Set([
  'id',
  'type',
  'title',
  'name',
  'subtitle',
  'description',
  'weight',
  'tags',
  'rel',
  'rels',
  'links',
  'layout',
  'types',
  'inverse',
  'symmetric',
])

export function parseGraph(files: SourceFile[]): Graph {
  const nodes: MdNode[] = []
  const edges: MdEdge[] = []
  const warnings: string[] = []
  const byId = new Map<string, MdNode>()
  let config: MapConfig = { title: '', layout: 'TB', types: {}, inverse: {}, symmetric: [] }

  const addEdge = (source: string, target: string, label: string) => {
    if (!target || target === source) return
    const id = `${source}→${target}:${label}`
    if (edges.some((e) => e.id === id)) return
    edges.push({ id, source, target, label })
  }

  for (const file of files) {
    const docs = splitDocs(file.text)
    if (!docs.length && file.text.trim()) {
      warnings.push(`${file.path}: no frontmatter block, skipped`)
    }
    docs.forEach((doc, n) => {
      const fm = doc.fm
      const type = String(fm.type ?? 'note')

      if (type === 'map') {
        config = {
          title: String(fm.title ?? config.title),
          layout: fm.layout === 'LR' ? 'LR' : 'TB',
          types: normalizeTypes(fm.types),
          inverse: normalizeInverse(fm.inverse),
          symmetric: asArray(fm.symmetric).map(stem),
        }
        return
      }

      const title = String(fm.title ?? fm.name ?? firstHeading(doc.body) ?? 'Untitled')
      const id = slug(String(fm.id ?? title ?? `${file.path}-${n}`))
      if (byId.has(id)) {
        warnings.push(`duplicate id "${id}" in ${file.path}, later copy merged`)
      }

      const node: MdNode = {
        id,
        type,
        title,
        subtitle: fm.subtitle ? String(fm.subtitle) : undefined,
        description: fm.description ? String(fm.description) : undefined,
        weight: asWeight(fm.weight),
        tags: asArray(fm.tags),
        body: doc.body,
        file: file.path,
        fields: fm,
      }
      nodes.push(node)
      byId.set(id, node)

      // 1. rel / rels / links map
      for (const key of ['rel', 'rels', 'links']) {
        const block = fm[key]
        if (!block || typeof block !== 'object') continue
        if (Array.isArray(block)) {
          // - employs: jane   (list of single-key maps)
          for (const item of block) {
            if (item && typeof item === 'object') {
              for (const [label, v] of Object.entries(item))
                asArray(v).forEach((t) => addEdge(id, asRef(t), label))
            } else if (item != null) {
              addEdge(id, asRef(String(item)), 'links')
            }
          }
        } else {
          for (const [label, v] of Object.entries(block as Record<string, unknown>))
            asArray(v).forEach((t) => addEdge(id, asRef(t), label))
        }
      }

      // 2. any frontmatter value that is itself a wikilink
      for (const [key, v] of Object.entries(fm)) {
        if (RESERVED.has(key)) continue
        for (const item of Array.isArray(v) ? v : [v])
          if (isWikilink(item)) addEdge(id, asRef(String(item)), key)
      }

      // 3. inline fields, then bare wikilinks
      const typed = new Set<string>()
      for (const m of doc.body.matchAll(INLINE_FIELD)) {
        const label = m[1]
        for (const link of m[2].matchAll(WIKILINK)) {
          const target = slug(link[1])
          typed.add(target)
          addEdge(id, target, label)
        }
      }
      for (const m of doc.body.matchAll(WIKILINK)) {
        const target = slug(m[1])
        if (!typed.has(target)) addEdge(id, target, 'mentions')
      }
    })
  }

  const linked = normalizeEdges(edges, config.inverse, config.symmetric)

  // Referenced but never defined — keep them, drawn as ghosts.
  for (const e of linked) {
    for (const end of [e.source, e.target]) {
      if (byId.has(end)) continue
      const ghost: MdNode = {
        id: end,
        type: 'unresolved',
        title: end.replace(/-/g, ' '),
        weight: 2,
        tags: [],
        body: '',
        file: '',
        fields: {},
        ghost: true,
      }
      nodes.push(ghost)
      byId.set(end, ghost)
    }
  }

  // Fill in colors for types the map config didn't name.
  let next = Object.keys(config.types).length
  for (const n of nodes) {
    if (config.types[n.type]) continue
    config.types[n.type] =
      n.type === 'unresolved'
        ? { label: 'unresolved', color: UNRESOLVED }
        : { label: n.type, color: PALETTE[next++ % PALETTE.length] }
  }

  return { nodes, edges: linked, config, warnings }
}

function normalizeInverse(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {}
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, String(val)]),
  )
}

/** Crude lemma, enough to see that `owns` and `owned` are the same verb. */
const stem = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/(ed|s|d)$/, '')

/**
 * The same relationship gets written from both ends — `dana owns portal` in one
 * note and `portal owned_by dana` in the other. Both mean one line on the
 * canvas, so every edge is turned to face the same way before it is drawn:
 * a declared `inverse:` pair flips, and so does any `_by` label, since passive
 * voice always points backwards. Whatever still coincides is one edge.
 *
 * The wording from the other end is kept rather than discarded. A relationship
 * has one direction but two voices — an organisation *employs* a person, and
 * that person *works at* the organisation — and each end should be able to
 * state its own.
 */
export function normalizeEdges(
  edges: MdEdge[],
  inverse: Record<string, string>,
  symmetric: string[] = [],
): MdEdge[] {
  const facing = edges.map((e) => {
    let { source, target, label } = e
    let flipped = false
    for (let guard = 0; guard < 3; guard++) {
      const declared = inverse[label]
      const passive = /^(.+?)[\s_-]by$/.exec(label)
      if (declared) label = declared
      else if (passive) label = passive[1]
      else break
      ;[source, target] = [target, source]
      flipped = !flipped
    }
    return { id: `${source}→${target}:${label}`, source, target, label, authored: e.label, flipped }
  })

  const key = (e: { source: string; target: string; label: string }) =>
    `${e.source}>${e.target}>${stem(e.label)}`

  // Whatever the author wrote from the far end is the far end's own wording.
  const fromTheOtherEnd = new Map<string, string>()
  for (const e of facing) if (e.flipped) fromTheOtherEnd.set(key(e), e.authored)

  // Failing that, a declared pair names both voices: `works_at: employs`.
  const declared: Record<string, string> = Object.fromEntries(
    Object.entries(inverse).map(([passive, active]) => [active, passive]),
  )

  const declaredSymmetric = new Set(symmetric)

  const byMeaning = new Map<string, MdEdge>()
  for (const e of facing) {
    const k = key(e)
    if (byMeaning.has(k)) continue
    byMeaning.set(k, {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      reverse: fromTheOtherEnd.get(k) ?? declared[e.label],
      symmetric: declaredSymmetric.has(stem(e.label)) || undefined,
    })
  }

  // "A knows B" and "B knows A" are one fact with no direction to it. Written
  // both ways round, they fold into a single link that points both ways.
  for (const [k, e] of [...byMeaning]) {
    const mirror = `${e.target}>${e.source}>${stem(e.label)}`
    if (!byMeaning.has(mirror)) continue
    byMeaning.delete(mirror)
    byMeaning.set(k, { ...e, symmetric: true })
  }

  // A bare wikilink says nothing extra once a named relation already connects the pair.
  const kept = [...byMeaning.values()]
  const pair = (e: MdEdge) => [e.source, e.target].sort().join('~')
  const named = new Set(kept.filter((e) => e.label !== 'mentions').map(pair))
  return kept.filter((e) => e.label !== 'mentions' || !named.has(pair(e)))
}

function normalizeTypes(v: unknown): Record<string, TypeStyle> {
  const out: Record<string, TypeStyle> = {}
  if (!v || typeof v !== 'object') return out
  let i = 0
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    const spec = (typeof val === 'string' ? { color: val } : (val ?? {})) as Record<string, unknown>
    out[key] = {
      label: String(spec.label ?? key),
      color: String(spec.color ?? PALETTE[i % PALETTE.length]),
    }
    i++
  }
  return out
}

function firstHeading(body: string): string | undefined {
  return /^#{1,6}\s+(.+)$/m.exec(body)?.[1]?.trim()
}
