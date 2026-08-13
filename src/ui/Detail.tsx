import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevRight, Chevron, Code, Link, TextLines } from './icons'
import { ringDepths } from '../lib/layout'
import { degrees, slug, type Graph, type MdNode } from '../lib/parse'
import { UNRESOLVED } from '../lib/palette'

/**
 * Three surfaces, one pane. A map holds types, a type holds nodes, and the
 * drawer strip is the lift between the upper two; a node's own type eyebrow
 * climbs back to its type. Every pane keeps the same anatomy — a header band
 * naming the surface, then columns: detail or config on the left, itemised
 * regions taking the rest — so moving between surfaces never moves your eyes.
 */
export type Focus =
  { kind: 'node'; id: string } | { kind: 'type'; type: string } | { kind: 'project' }

/** What the upper surfaces configure, threaded down from the app. The layout
    controls themselves live in the toolbar now, beside the fit button. */
type Config = {
  hiddenTypes: Set<string>
  onToggleType: (t: string) => void
}

/** How far one of the focused node's link directions runs on the canvas:
    1–3 rings of connections, or 0 — greyed out, first ring kept as reference. */
export type Degree = 0 | 1 | 2 | 3
export type LinkShow = { out: Degree; in: Degree }

export type PaneProps = Config & {
  graph: Graph
  /** The map's name — the overview pane's own title. */
  title: string
  focus: Focus
  source: string
  linkShow: LinkShow
  onLinkShow: (v: LinkShow) => void
  /** False folds the pane to its header band alone. */
  bodyOpen: boolean
  onBodyOpen: (v: boolean) => void
  onFocus: (f: Focus | null) => void
  /** A row under the pointer lights its node on the canvas, hover-for-hover. */
  onGlow: (id: string | null) => void
  onEditSource: (path: string, text: string) => void
  /** The shared view. Source is still shown — reading it is the point — but not typed into. */
  readOnly?: boolean
}

/** The chevron ahead of every pane title: details in, details away. */
const FoldBtn = ({ open, onOpen }: { open: boolean; onOpen: (v: boolean) => void }) => (
  <button
    className="icon-btn pane-fold-btn"
    aria-expanded={open}
    aria-label={open ? 'Collapse details' : 'Expand details'}
    onClick={() => onOpen(!open)}
  >
    <Chevron />
  </button>
)

export function Pane(props: PaneProps) {
  if (props.focus.kind === 'project') return <MapPane {...props} />
  if (props.focus.kind === 'type') return <TypePane {...props} type={props.focus.type} />
  const { id } = props.focus
  const node = props.graph.nodes.find((n) => n.id === id)
  return node ? <NodePane {...props} node={node} /> : null
}

/* Config rows ---------------------------------------------------------------- */

const DockRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="dock-row">
    <span className="eyebrow dock-label">{label}</span>
    {children}
  </div>
)

/* Map surface --------------------------------------------------------------- */

function MapPane({
  graph,
  title,
  onFocus,
  hiddenTypes,
  onToggleType,
  bodyOpen,
  onBodyOpen,
}: PaneProps) {
  const types = useMemo(
    () =>
      Object.entries(graph.config.types)
        .map(([type, style]) => ({
          type,
          style,
          nodes: graph.nodes.filter((n) => n.type === type),
        }))
        .filter((t) => t.nodes.length > 0)
        .sort((a, b) => b.nodes.length - a.nodes.length),
    [graph],
  )

  return (
    <>
      <header className="pane-head">
        <span className="eyebrow">Map</span>
        <h2 className="pane-title">{title}</h2>
        <span className="pane-sub">
          {graph.nodes.length} nodes · {graph.edges.length} links · {types.length} types
        </span>
        <span className="pane-head-end">
          <FoldBtn open={bodyOpen} onOpen={onBodyOpen} />
        </span>
      </header>

      <div className="pane-body">
        <div className="pane-config">
          <div className="pane-list-head">
            <span className="eyebrow">Settings</span>
          </div>
          <div className="pane-scroll">
            <DockRow label="Show">
              {types.map(({ type, style }) => (
                <button
                  key={type}
                  className="chip"
                  aria-pressed={!hiddenTypes.has(type)}
                  style={{ '--chip-color': style.color } as React.CSSProperties}
                  onClick={() => onToggleType(type)}
                >
                  <span className="swatch" style={{ background: style.color }} />
                  {style.label}
                </button>
              ))}
            </DockRow>
          </div>
        </div>

        <section className="pane-list" aria-label="Contents">
          <div className="pane-list-head">
            <span className="eyebrow">Contents</span>
          </div>
          <div className="pane-scroll">
            <div className="pane-grid">
              {types.map(({ type, style, nodes }) => (
                <button
                  key={type}
                  className="rel-item"
                  data-off={hiddenTypes.has(type) || undefined}
                  onClick={() => onFocus({ kind: 'type', type })}
                >
                  <span className="swatch" style={{ background: style.color }} />
                  <span className="rel-item-name">{style.label}</span>
                  <span className="rel-item-type">{nodes.length}</span>
                </button>
              ))}
            </div>
            {graph.warnings.length > 0 && (
              <details className="fold">
                <summary>
                  Warnings<span className="fold-count">{graph.warnings.length}</span>
                </summary>
                {graph.warnings.map((w, i) => (
                  <p className="hint" key={i}>
                    {w}
                  </p>
                ))}
              </details>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

/* Type surface -------------------------------------------------------------- */

function TypePane({
  graph,
  type,
  onFocus,
  onGlow,
  hiddenTypes,
  bodyOpen,
  onBodyOpen,
}: PaneProps & { type: string }) {
  const style = graph.config.types[type]
  const label = style?.label ?? type
  const deg = useMemo(() => degrees(graph.edges), [graph])
  const nodes = useMemo(
    () =>
      graph.nodes
        .filter((n) => n.type === type)
        .sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title)),
    [graph, type],
  )
  const links = nodes.reduce((a, n) => a + (deg.get(n.id) ?? 0), 0)

  return (
    <>
      <header className="pane-head">
        <h2 className="pane-title">{label}</h2>
        <span className="pane-sub">
          {nodes.length} nodes · {links} link ends
        </span>
        <span className="pane-head-end">
          <FoldBtn open={bodyOpen} onOpen={onBodyOpen} />
        </span>
      </header>

      <div className="pane-body">
        <section
          className="pane-list bare"
          data-off={hiddenTypes.has(type) || undefined}
          aria-label={label}
        >
          <div className="pane-scroll">
            <div className="rel-group">
              <div className="pane-grid">
                {nodes.map((n) => (
                  <ItemRow
                    key={n.id}
                    node={n}
                    color={style?.color ?? UNRESOLVED}
                    degree={deg.get(n.id) ?? 0}
                    onFocus={onFocus}
                    onGlow={onGlow}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function ItemRow({
  node,
  color,
  degree,
  onFocus,
  onGlow,
}: {
  node: MdNode
  color: string
  degree: number
  onFocus: (f: Focus) => void
  onGlow: (id: string | null) => void
}) {
  const sub = node.subtitle
  const tags = node.tags.length > 0
  // Once a row runs to more than one line the swatch and the count belong beside
  // the title, not floating at the row's midpoint.
  return (
    <button
      className={`rel-item${sub || tags ? ' stacked' : ''}`}
      onClick={() => onFocus({ kind: 'node', id: node.id })}
      onMouseEnter={() => onGlow(node.id)}
      onMouseLeave={() => onGlow(null)}
      onFocus={() => onGlow(node.id)}
      onBlur={() => onGlow(null)}
    >
      <span className="rel-chev" style={{ color }}>
        <ChevRight />
      </span>
      <span className="rel-item-name">
        {node.title}
        {sub && <span className="rel-item-sub">{node.subtitle}</span>}
        {tags && <span className="rel-item-tags">{node.tags.join(' · ')}</span>}
      </span>
      {degree > 0 && <span className="rel-item-type">{degree}</span>}
    </button>
  )
}

/* Node surface -------------------------------------------------------------- */

/** Handled by the header, the connection lists, or the graph — not by the field list. */
const NOT_A_FIELD = new Set([
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
])

function NodePane({
  graph,
  node,
  source,
  linkShow,
  onLinkShow,
  bodyOpen,
  onBodyOpen,
  onFocus,
  onEditSource,
  readOnly,
}: PaneProps & { node: MdNode }) {
  // Text is the reading view; Code hands the whole body to the editor.
  const [code, setCode] = useState(false)
  const onSelect = (id: string) => onFocus({ kind: 'node', id })

  // Grouped in this node's own voice: it *employs* the people it employs, and
  // it *works at* the organisation that employs it. Only when the other voice
  // was never written does an incoming link fall back to pointing inward.
  const { out, incoming } = useMemo(() => {
    const group = (list: typeof graph.edges, key: 'source' | 'target') => {
      const m = new Map<string, Group>()
      for (const e of list) {
        const other = graph.nodes.find((n) => n.id === e[key])
        if (!other) continue
        const label = key === 'target' ? e.label : (e.reverse ?? e.label)
        const mirror = key === 'target' ? e.reverse : e.label
        const g = m.get(label) ?? {
          label,
          mirror: mirror === label || e.symmetric ? undefined : mirror,
          nodes: [],
        }
        g.nodes.push(other)
        m.set(label, g)
      }
      return [...m.values()]
    }
    return {
      out: group(
        graph.edges.filter((e) => e.source === node.id),
        'target',
      ),
      incoming: group(
        graph.edges.filter((e) => e.target === node.id),
        'source',
      ),
    }
  }, [graph, node.id])

  const fields = Object.entries(node.fields).filter(
    ([k, v]) => !NOT_A_FIELD.has(k) && v != null && v !== '' && !isWikilink(v),
  )
  const body = useMemo(() => linkify(node.body, node, graph), [node, graph])

  // A stop that would seat nothing is not offered: the dial only goes as far
  // out as this direction actually reaches.
  const rings = useMemo(() => ringDepths(node.id, graph.edges), [node.id, graph.edges])

  return (
    <>
      <header className="pane-head">
        <h2 className="pane-title">{node.title}</h2>
        {/* The tags say what kind of thing this is, which belongs beside the
            name — not filed under Detail below the fold. */}
        {node.tags.length > 0 && (
          <div className="pane-head-tags">
            {node.tags.map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        {node.subtitle && <span className="pane-sub">{node.subtitle}</span>}
        <span className="pane-head-end">
          {node.file && (
            <span className="seg" role="group" aria-label="Detail format">
              <button
                className="icon-btn"
                aria-pressed={!code}
                onClick={() => setCode(false)}
                title="Formatted detail"
                aria-label="Formatted detail"
              >
                <TextLines />
              </button>
              <button
                className="icon-btn"
                aria-pressed={code}
                onClick={() => setCode(true)}
                title="Raw markdown"
                aria-label="Raw markdown"
              >
                <Code />
              </button>
            </span>
          )}
          <FoldBtn open={bodyOpen} onOpen={onBodyOpen} />
        </span>
      </header>

      <div className="pane-body">
        {code && node.file ? (
          <div className="pane-editor">
            <textarea
              className="raw"
              spellCheck={false}
              readOnly={readOnly}
              value={source}
              onChange={(e) => onEditSource(node.file, e.target.value)}
              aria-label={`Markdown source of ${node.file}`}
            />
            <p className="source-note">
              {readOnly
                ? 'The markdown this node was written in. Copy it anywhere.'
                : 'The map redraws as you type.'}
            </p>
          </div>
        ) : (
          <>
            <div className="pane-detail">
              <div className="pane-list-head">
                <span className="eyebrow">Detail</span>
              </div>
              <div className="pane-scroll">
                {node.description && <p className="pane-desc">{node.description}</p>}

                {fields.length > 0 && (
                  <dl className="fields">
                    {fields.map(([key, value]) => (
                      <div className="field" key={key}>
                        <dt>{key.replace(/[_-]/g, ' ')}</dt>
                        <dd>
                          <FieldValue value={value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {node.ghost ? (
                  <Hint>
                    Referenced by other nodes but never defined. Add a block with{' '}
                    <code>id: {node.id}</code> to bring it into the map.
                  </Hint>
                ) : body.trim() ? (
                  <div className="prose">
                    <Markdown remarkPlugins={[remarkGfm]} components={{ a: anchor(onSelect) }}>
                      {body}
                    </Markdown>
                  </div>
                ) : (
                  !node.description &&
                  !fields.length && (
                    <Hint>
                      No notes yet. Write below the frontmatter in {node.file || 'the source'}.
                    </Hint>
                  )
                )}
              </div>
            </div>

            <ConnCol
              side="out"
              groups={out}
              graph={graph}
              onSelect={onSelect}
              degree={linkShow.out}
              onDegree={(d) => onLinkShow({ ...linkShow, out: d })}
              rings={rings.out}
            />
            <ConnCol
              side="in"
              groups={incoming}
              graph={graph}
              onSelect={onSelect}
              degree={linkShow.in}
              onDegree={(d) => onLinkShow({ ...linkShow, in: d })}
              rings={rings.in}
            />
          </>
        )}
      </div>
    </>
  )
}

/** In-app node links navigate; everything else opens in a new tab. */
const anchor =
  (onSelect: (id: string) => void) =>
  ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const id = href?.startsWith('#node/') ? href.slice(6) : null
    return id ? (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault()
          onSelect(id)
        }}
      >
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }

function FieldValue({ value }: { value: unknown }) {
  if (Array.isArray(value))
    return (
      <span className="field-list">
        {value.map((v, i) => (
          <span className="chip" key={i}>
            {String(v)}
          </span>
        ))}
      </span>
    )

  // YAML turns `2026-05-14` into a Date; nobody wants to read its toString.
  if (value instanceof Date) return <>{value.toISOString().slice(0, 10)}</>

  const text = String(value)
  const href = asHref(text)
  if (!href) return <>{text}</>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="field-link">
      <Link />
      {text.replace(/^https?:\/\//, '').replace(/\/$/, '')}
    </a>
  )
}

/** URLs, bare domains, emails and phone numbers all become something clickable. */
function asHref(text: string): string | null {
  const v = text.trim()
  if (/^https?:\/\/\S+$/i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) && !/\s/.test(v)) return `https://${v}`
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`
  if (/^\+?[\d][\d\s().-]{6,}$/.test(v)) return `tel:${v.replace(/[^\d+]/g, '')}`
  return null
}

const isWikilink = (v: unknown) => typeof v === 'string' && /^\s*\[\[[^\]]+\]\]\s*$/.test(v)

/** One relation, this node's wording, and — where it exists — the other node's. */
type Group = { label: string; mirror?: string; nodes: MdNode[] }

/** The degree dial's four stops, in the order they read on the dial. */
const DEGREES: { d: Degree; mark: string; hint: string }[] = [
  { d: 1, mark: '1st', hint: 'Direct connections' },
  { d: 2, mark: '2nd', hint: 'And what those connect to' },
  { d: 3, mark: '3rd', hint: 'Three rings out' },
  { d: 0, mark: 'X', hint: 'Greyed out, direct links kept as reference' },
]

/**
 * One direction of a node's connections: To is every link it makes, From is
 * every link made to it. The head's dial sets how far the canvas walks this
 * direction — I is the direct ring, II and III add further rings, each a step
 * more muted, and the camera reframes to take each ring in. X greys the
 * direction instead: the first ring stays visible as reference, and the list
 * below mutes to match.
 */
function ConnCol({
  side,
  groups,
  graph,
  onSelect,
  degree,
  onDegree,
  rings,
}: {
  side: 'out' | 'in'
  groups: Group[]
  graph: Graph
  onSelect: (id: string) => void
  degree: Degree
  onDegree: (d: Degree) => void
  /** How many rings this direction actually reaches; deeper stops are dropped. */
  rings: number
}) {
  const count = groups.reduce((a, g) => a + g.nodes.length, 0)
  const label = side === 'out' ? 'Outbound connections' : 'Inbound connections'
  return (
    <section className="pane-list" data-off={degree === 0 || undefined} aria-label={label}>
      <div className="pane-list-head">
        <span className="eyebrow">{label}</span>
        <span className="pane-count">{count}</span>
        <span
          className="dial"
          role="group"
          aria-label={`How far ${label.toLowerCase()} run on the canvas`}
        >
          {/* 1st and X always stand: one is the direct ring, the other is how
              you put the direction away. II and III only appear if there is
              something out there to walk to. */}
          {DEGREES.filter(({ d }) => d < 2 || d <= rings).map(({ d, mark, hint }) => (
            <button
              key={d}
              className={d === 0 ? 'dial-off' : undefined}
              aria-pressed={degree === d}
              onClick={() => onDegree(d)}
              title={hint}
            >
              {mark}
            </button>
          ))}
        </span>
      </div>
      <div className="pane-scroll">
        {count === 0 ? (
          <Hint>
            {side === 'out' ? (
              <>
                No links out. Add a <code>rel:</code> entry or a <code>[[wikilink]]</code>.
              </>
            ) : (
              'Nothing links here yet.'
            )}
          </Hint>
        ) : (
          groups.map(({ label, mirror, nodes }) => (
            <div className="rel-group" key={label}>
              <div className="rel-group-head">
                <span className="eyebrow">{label.replace(/_/g, ' ')}</span>
                {mirror && (
                  <span className="rel-mirror" title={`and in the other direction: ${mirror}`}>
                    ↔ {mirror.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <div className="pane-grid">
                {nodes.map((n) => (
                  <button className="rel-item" key={n.id} onClick={() => onSelect(n.id)}>
                    <span
                      className="rel-chev"
                      style={{ color: graph.config.types[n.type]?.color ?? UNRESOLVED }}
                    >
                      <ChevRight />
                    </span>
                    <span className="rel-item-name">{n.title}</span>
                    <span className="rel-item-type">
                      {graph.config.types[n.type]?.label ?? n.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="hint">{children}</p>

/**
 * Wikilinks become in-app navigation carrying the target's real title, inline
 * fields read as prose, and a leading heading that just repeats the node title
 * is dropped — the pane header already says it.
 */
function linkify(body: string, node: MdNode, graph: Graph) {
  return body
    .replace(/^#{1,6}\s+(.+)\n*/, (whole, heading: string) =>
      heading.trim() === node.title.trim() ? '' : whole,
    )
    .replace(/^([A-Za-z][\w-]*)::\s*/gm, '*$1*: ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
      const id = slug(target)
      const label = alias?.trim() || graph.nodes.find((n) => n.id === id)?.title || target.trim()
      return `[${label}](#node/${id})`
    })
}
