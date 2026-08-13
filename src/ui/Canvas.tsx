import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { CardBoxes, CardNode, RelEdge, type Box, type CardData } from './graph-parts'
import { ChevRight, Close, Expand, Ranks, RanksDown, Search, Shrink, Target } from './icons'
import { Pane, type Focus, type LinkShow } from './Detail'
import { NODE_H, NODE_W, autoLayout, egoLayout, hops } from '../lib/layout'
import { degrees, type Graph } from '../lib/parse'
import { ACCENT_BRIGHT, DOT_GAP, DOT_GRID, EDGE, UNRESOLVED, mixHex } from '../lib/palette'

const nodeTypes = { card: CardNode }
const edgeTypes = { rel: RelEdge }

export type Positions = Record<string, { x: number; y: number }>

type StageProps = {
  graph: Graph
  /** The map's own name — the toolbar's button onto the map surface. */
  title: string
  positions: Positions
  onPositions: (p: Positions) => void
  focus: Focus | null
  onFocus: (f: Focus | null) => void
  query: string
  onQuery: (q: string) => void
  hiddenTypes: Set<string>
  onToggleType: (t: string) => void
  dir: 'LR' | 'TB'
  onRelayout: (dir: 'LR' | 'TB') => void
  layoutNonce: number
  ego: boolean
  onEgo: (v: boolean) => void
  source: string
  onEditSource: (path: string, text: string) => void
  /** Actions on the whole map that only some sessions have — sharing, so far. */
  toolbarExtra?: React.ReactNode
  /** The shared view: the pane reads its source out, it does not take typing. */
  readOnly?: boolean
  /**
   * Both optional and both the same bargain: pass one and you are driving it,
   * leave it off and the stage keeps its own. The embed's tour drives them to
   * play a visit back; nothing else passes them.
   */
  glow?: string | null
  linkShow?: LinkShow
}

export function Stage(props: StageProps) {
  // How far each of the focused node's link directions runs on the canvas; a
  // freshly focused node starts with the direct ring of both.
  const [ownLink, setLinkShow] = useState<LinkShow>({ out: 1, in: 1 })
  const linkShow = props.linkShow ?? ownLink
  const sel = props.focus?.kind === 'node' ? props.focus.id : null
  useEffect(() => setLinkShow({ out: 1, in: 1 }), [sel])

  // A row hovered in the pane lights its node on the canvas exactly as
  // hovering the card would. Cleared when the surface changes — a list that
  // unmounts under the pointer never sends its leave.
  const [ownGlow, setGlow] = useState<string | null>(null)
  const glow = props.glow ?? ownGlow
  useEffect(() => setGlow(null), [props.focus])

  return (
    <ReactFlowProvider>
      <Toolbar {...props} />
      <div className="canvas">
        <Canvas {...props} linkShow={linkShow} glow={glow} />
        <div className="stat">
          <span>{props.graph.nodes.length} nodes</span>
          <span>{props.graph.edges.length} links</span>
          {props.graph.nodes.some((n) => n.ghost) && (
            <span>{props.graph.nodes.filter((n) => n.ghost).length} unresolved</span>
          )}
        </div>
      </div>
      <Drawer {...props} linkShow={linkShow} onLinkShow={setLinkShow} onGlow={setGlow} />
    </ReactFlowProvider>
  )
}

function Toolbar({
  title,
  query,
  onQuery,
  focus,
  onFocus,
  dir,
  onRelayout,
  ego,
  onEgo,
  toolbarExtra,
}: StageProps) {
  const input = useRef<HTMLInputElement>(null)

  /**
   * Fullscreen is the browser's, not ours, so the button reads its state rather
   * than keeping one: pressing Escape or F11 leaves fullscreen without going
   * near this component, and a boolean we set on click would be wrong the moment
   * that happened. `fullscreenchange` is the only thing that knows.
   */
  const [full, setFull] = useState(false)

  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement))
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  // The whole document, not the canvas element: the toolbar and the drawer are
  // part of reading a map, and a fullscreen that hid them would be a worse view
  // of the same map. Refusal is silent — some browsers deny it outside a user
  // gesture they trust, and there is nothing useful to say about that.
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
      if (e.key === 'Escape' && document.activeElement === input.current) {
        onQuery('')
        input.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onQuery])

  return (
    <div className="toolbar">
      {/* Search leads the header: finding is the strip's one verb now that the
          type legend lives in its own drawer under the canvas. */}
      <label className="search">
        <span style={{ color: 'var(--ink-faint)', display: 'flex' }}>
          <Search />
        </span>
        <input
          ref={input}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Find in map"
          aria-label="Find in map"
        />
        <kbd>⌘K</kbd>
      </label>

      <span className="divider" />

      {/* The map named in its own header; opens the map surface below. */}
      <div className="filters">
        <button
          className="filters-home"
          aria-pressed={focus?.kind === 'project'}
          onClick={() => onFocus({ kind: 'project' })}
          title="Open the map surface"
        >
          {title}
        </button>
      </div>

      {/* How the map lays itself out, kept beside fit: the toolbar's right
          corner holds everything that moves the camera or the ranks. */}
      <div className="toolbar-layout" role="group" aria-label="Layout">
        <button
          className="icon-btn"
          aria-pressed={dir === 'LR'}
          onClick={() => onRelayout('LR')}
          title="Rank left to right"
          aria-label="Rank left to right"
        >
          <Ranks />
        </button>
        <button
          className="icon-btn"
          aria-pressed={dir === 'TB'}
          onClick={() => onRelayout('TB')}
          title="Rank top to bottom"
          aria-label="Rank top to bottom"
        >
          <RanksDown />
        </button>
        <button
          className="icon-btn"
          aria-pressed={ego}
          onClick={() => onEgo(!ego)}
          title={
            ego
              ? 'Opening a node reframes the map around it'
              : 'The map holds still when a node is opened'
          }
          aria-label="Reframe on open"
        >
          <Target />
        </button>
      </div>

      {/* Left of the share button, which holds the corner. Fitting the map
          lives on the control stack by the minimap; this is the display. */}
      <button
        className="icon-btn"
        aria-pressed={full}
        onClick={toggleFull}
        title={full ? 'Leave fullscreen' : 'Fullscreen'}
        aria-label={full ? 'Leave fullscreen' : 'Fullscreen'}
      >
        {full ? <Shrink /> : <Expand />}
      </button>

      {toolbarExtra}
    </div>
  )
}

/* The drawer, resting as a tab bar at the foot of the canvas in the rail
   footer's own band. Overview stands for the map surface; then a tab per type,
   select-to-focus. The focused surface — map, type or node — expands out of
   the strip's top edge as this bar's expanded state; the strip itself never
   moves. A second click on the current tab puts the pane away. */
/** The pane height a reader dragged to, kept across maps for the session. */
let rememberedH: number | null = null

function Drawer(
  props: StageProps & {
    linkShow: LinkShow
    onLinkShow: (v: LinkShow) => void
    onGlow: (id: string | null) => void
  },
) {
  const { graph, hiddenTypes, focus, onFocus } = props
  const types = Object.entries(graph.config.types).filter(([t]) => t !== 'unresolved')

  // The header's chevron folds the pane to its title band alone.
  const [bodyOpen, setBodyOpen] = useState(true)

  // The pane's content lingers through the closing fold — unmounting it with
  // the focus would snap the drawer shut instead of letting it close. And
  // every freshly opened surface arrives unfolded: a fold or a close is how
  // that viewing ended, not a standing preference for the next one.
  const [linger, setLinger] = useState<Focus | null>(null)
  useEffect(() => {
    if (focus) {
      setLinger(focus)
      setBodyOpen(true)
    }
  }, [focus])

  // The pane's top edge drags; double-click returns the default height.
  const [paneH, setPaneH] = useState<number | null>(rememberedH)
  const [dragging, setDragging] = useState(false)
  const paneRef = useRef<HTMLElement>(null)
  const grip = useRef<{ y: number; h: number } | null>(null)

  // A node that vanished mid-edit closes the pane rather than exhibiting nothing.
  const focusNode = focus?.kind === 'node' ? graph.nodes.find((n) => n.id === focus.id) : null
  const open = !!focus && (focus.kind !== 'node' || !!focusNode)
  const shown = focus ?? linger

  // The strip scrolls; the current tab may sit under a sticky bookend or past
  // an edge. When focus marks a tab, bring it into the window between the
  // bookends — and never fight a hand that scrolled the strip on purpose, so
  // this runs only when the marked tab changes.
  const stripRef = useRef<HTMLElement>(null)
  const currentType = focus?.kind === 'type' ? focus.type : (focusNode?.type ?? null)
  useEffect(() => {
    const nav = stripRef.current
    if (!nav || !currentType) return
    const tab = nav.querySelector<HTMLElement>('.drawer-tab[aria-current]:not(.overview)')
    if (!tab) return
    const lead = nav.querySelector<HTMLElement>('.overview')?.offsetWidth ?? 0
    const tail = nav.querySelector<HTMLElement>('.drawer-end')?.offsetWidth ?? 0
    const lo = nav.scrollLeft + lead
    const hi = nav.scrollLeft + nav.clientWidth - tail
    if (tab.offsetLeft >= lo && tab.offsetLeft + tab.offsetWidth <= hi) return
    const left =
      tab.offsetLeft < lo
        ? tab.offsetLeft - lead - 12
        : tab.offsetLeft + tab.offsetWidth - nav.clientWidth + tail + 12
    nav.scrollTo({
      left,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [currentType])

  return (
    <>
      <div
        className="drawer-fold"
        data-open={open || undefined}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !focus) setLinger(null)
        }}
      >
        <div className="drawer-fold-clip">
          {shown && (
            <section
              ref={paneRef}
              className="drawer-pane"
              data-folded={!bodyOpen || undefined}
              aria-label="Focused surface"
              style={paneH ? ({ '--pane-h': `${paneH}px` } as React.CSSProperties) : undefined}
            >
              {bodyOpen && (
                <div
                  className="pane-grip"
                  data-dragging={dragging || undefined}
                  title="Drag to resize · double-click to reset"
                  onPointerDown={(e) => {
                    if (!paneRef.current) return
                    grip.current = { y: e.clientY, h: paneRef.current.offsetHeight }
                    setDragging(true)
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    if (!grip.current) return
                    const h = Math.round(
                      Math.min(
                        window.innerHeight * 0.75,
                        Math.max(140, grip.current.h + (grip.current.y - e.clientY)),
                      ),
                    )
                    rememberedH = h
                    setPaneH(h)
                  }}
                  onPointerUp={() => {
                    grip.current = null
                    setDragging(false)
                  }}
                  onDoubleClick={() => {
                    rememberedH = null
                    setPaneH(null)
                  }}
                />
              )}
              <Pane {...props} focus={shown} bodyOpen={bodyOpen} onBodyOpen={setBodyOpen} />
            </section>
          )}
        </div>
      </div>

      <nav className="drawer" aria-label="Map surfaces" ref={stripRef}>
        <button
          className="drawer-tab overview"
          aria-current={focus?.kind === 'project' || undefined}
          onClick={() => onFocus(focus?.kind === 'project' ? null : { kind: 'project' })}
          title="Open the map surface"
        >
          {/* Typed tabs point with their type's colour; the whole map stands
              apart in plain ink, bold. */}
          <span className="rel-chev" style={{ color: 'var(--ink)' }}>
            <ChevRight size={10} />
          </span>
          Overview
        </button>
        {types.map(([type, style]) => (
          <button
            key={type}
            className="drawer-tab"
            aria-current={
              (focus?.kind === 'type' && focus.type === type) ||
              focusNode?.type === type ||
              undefined
            }
            data-off={hiddenTypes.has(type) || undefined}
            style={{ '--tab-color': style.color } as React.CSSProperties}
            onClick={() =>
              onFocus(focus?.kind === 'type' && focus.type === type ? null : { kind: 'type', type })
            }
            title={
              hiddenTypes.has(type)
                ? `${style.label}: hidden on the canvas. Open to itemise and unhide.`
                : `Focus ${style.label}`
            }
          >
            <span className="rel-chev" style={{ color: style.color }}>
              <ChevRight size={10} />
            </span>
            {style.label}
          </button>
        ))}
        {open && (
          <div className="drawer-end">
            <button
              className="icon-btn"
              onClick={() => onFocus(null)}
              aria-label="Collapse the pane"
            >
              <Close />
            </button>
          </div>
        )}
      </nav>
    </>
  )
}

/** How much a link is mixed toward its source type's colour, by emphasis. */
const REST_MIX = 0.32
const ASIDE_MIX = 0.58

const rank = (e: Edge) =>
  e.data?.tone === 'out' || e.data?.tone === 'in' ? 2 : e.data?.tone === 'aside' ? 1 : 0

/** Past this, label chips at rest are dust — they wait for focus instead. */
const DENSE = 40

function Canvas({
  graph,
  positions,
  onPositions,
  focus,
  onFocus,
  query,
  hiddenTypes,
  dir,
  layoutNonce,
  ego,
  linkShow,
  glow,
}: StageProps & { linkShow: LinkShow; glow: string | null }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const { fitView } = useReactFlow()
  const store = useStoreApi()

  const selected = focus?.kind === 'node' ? focus.id : null
  const focusType = focus?.kind === 'type' ? focus.type : null

  // Non-null while the ego layout is showing: the ids it kept on screen.
  const castRef = useRef<Set<string> | null>(null)

  // Read-only. Keeping positions out of the layout effect's deps is what stops
  // the place -> persist -> place loop.
  const posRef = useRef(positions)
  posRef.current = positions

  // Read-only, same reason. The layout effect below rebuilds every node object
  // from the graph, and a node handed to React Flow without `measured` is a
  // node it has to measure again: it throws away that node's handle bounds, so
  // every edge touching it stops drawing, and it drops the node from the fit,
  // so `fitView` has nothing to frame and the camera stays where it was while
  // the new layout lands off screen. The heights come back on the next DOM
  // round trip — which a throttled or offscreen frame never gets, leaving the
  // map stranded without its lines. So the rebuild carries the last measure
  // forward. Nodes never measured still arrive undefined and get observed.
  const nodesRef = useRef<Node[]>([])
  nodesRef.current = nodes

  // What each card actually renders at, read off the live DOM rather than
  // predicted: a subtitle and a tag row each add a line, and the small type
  // inherits `line-height: normal`, so the real height follows the font's own
  // metrics. Read from the element and not from React Flow's `measured`: that
  // arrives a DOM round trip behind the layout that asked for it, so feeding it
  // back in would place a card at the height it had one layout ago. A ref, so
  // reading it never re-renders.
  const heightsRef = useRef<Map<string, number>>(new Map())
  const [remeasured, setRemeasured] = useState(0)

  const readHeights = useCallback(() => {
    let changed = false
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')) {
      const id = el.dataset.id
      if (!id) continue
      const h = el.offsetHeight
      if (!h) continue
      if (Math.abs((heightsRef.current.get(id) ?? NODE_H) - h) > 0.5) {
        heightsRef.current.set(id, h)
        changed = true
      }
    }
    return changed
  }, [])

  const degree = useMemo(() => degrees(graph.edges), [graph])

  // Selecting a node re-frames the map around it; deselecting restores the
  // map. The pane's degree dials set how many rings each side seats, and a
  // new cast means a new frame — the fit effect below watches this value.
  const egoOn = useMemo(
    () => (ego && selected ? egoLayout(selected, graph.edges, linkShow, heightsRef.current) : null),
    // `remeasured` counts height reads, not renders: it re-seats the column once
    // the cards have told us how tall they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ego, selected, graph, linkShow, remeasured],
  )

  useEffect(() => {
    const stored = posRef.current
    // No axis choice to make here: `egoLayout` has already placed every node when
    // the ego view is on, so nothing is `missing` and `autoLayout` below never
    // runs in that case.
    const was = new Map(nodesRef.current.map((n) => [n.id, n.measured]))
    const base: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: 'card',
      position: egoOn?.get(n.id) ?? stored[n.id] ?? { x: 0, y: 0 },
      measured: was.get(n.id),
      data: {
        node: n,
        color: graph.config.types[n.type]?.color ?? UNRESOLVED,
        typeLabel: graph.config.types[n.type]?.label ?? n.type,
        degree: degree.get(n.id) ?? 0,
      } satisfies CardData as unknown as Record<string, unknown>,
    }))
    const missing = !egoOn && base.some((n) => !stored[n.id])
    const placed = missing ? autoLayout(base, graph.edges, dir, heightsRef.current) : base
    const at = new Map(placed.map((n) => [n.id, n.position]))

    // Labels are grouped by where they land, not by which pair they belong to:
    // unrelated edges crossing in the same spot collide just as badly as
    // reciprocal ones. Each group then spreads along its own path.
    const cellOf = (e: (typeof graph.edges)[number]) => {
      const a = at.get(e.source) ?? { x: 0, y: 0 }
      const b = at.get(e.target) ?? { x: 0, y: 0 }
      return `${Math.round((a.x + b.x) / 90)}~${Math.round((a.y + b.y) / 40)}`
    }
    const colorOf = (id: string) =>
      graph.config.types[graph.nodes.find((n) => n.id === id)?.type ?? '']?.color ?? UNRESOLVED

    const crowd = new Map<string, number>()
    for (const e of graph.edges) crowd.set(cellOf(e), (crowd.get(cellOf(e)) ?? 0) + 1)

    // Two relations between the same two cards leave and land on the same
    // handles, so without this they draw the identical curve and every label
    // and badge lands on top of its twin.
    const pairOf = (e: (typeof graph.edges)[number]) => [e.source, e.target].sort().join('~')
    const twins = new Map<string, number>()
    for (const e of graph.edges) twins.set(pairOf(e), (twins.get(pairOf(e)) ?? 0) + 1)
    const twinSeen = new Map<string, number>()

    const lanes = new Map<string, number>()
    const flowEdges: Edge[] = graph.edges.map((e) => {
      const a = at.get(e.source) ?? { x: 0, y: 0 }
      const b = at.get(e.target) ?? { x: 0, y: 0 }
      const cell = cellOf(e)
      const lane = lanes.get(cell) ?? 0
      lanes.set(cell, lane + 1)
      const pair = pairOf(e)
      const twin = twinSeen.get(pair) ?? 0
      twinSeen.set(pair, twin + 1)

      // Leave by whichever face the other card actually sits behind, scaled by
      // the card's own proportions — otherwise same-column links wrap around.
      const dx = b.x - a.x
      const dy = b.y - a.y
      let [from, to] =
        Math.abs(dx) / NODE_W >= Math.abs(dy) / NODE_H
          ? dx >= 0
            ? ['right', 'left']
            : ['left', 'right']
          : dy >= 0
            ? ['bottom', 'top']
            : ['top', 'bottom']
      let bow = twin - ((twins.get(pair) ?? 1) - 1) / 2

      // In the ego view a neighbour-to-neighbour link arcs around the cast
      // instead of running through it: same-column links leave by the outer
      // face and bow past the column's own cards, links crossing over the
      // focus bow away from the card sitting at the origin. A link between
      // two rings of the same side is a chain — it reads column to column
      // like any ranked edge, so it keeps the ordinary faces.
      if (egoOn && selected && e.source !== selected && e.target !== selected) {
        if (a.x === b.x) {
          const face = a.x < 0 ? 'left' : 'right'
          from = face
          to = face
          bow = (a.x < 0 ? 1 : -1) * Math.sign(b.y - a.y || 1)
        } else if (Math.sign(a.x) !== Math.sign(b.x)) {
          bow = ((a.y + b.y) / 2 >= 0 ? 1 : -1) * Math.sign(dx || 1)
        }
      }
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `s-${from}`,
        targetHandle: `t-${to}`,
        type: 'rel',
        label: e.label,
        data: {
          tone: '',
          lane,
          lanes: crowd.get(cell) ?? 1,
          from: colorOf(e.source),
          bow,
          reverse: e.reverse,
          symmetric: e.symmetric,
        },
        // A symmetric relation has no head end; everything else points with an
        // arrow tinted the same mix its line carries.
        markerEnd: e.symmetric
          ? undefined
          : {
              type: MarkerType.ArrowClosed,
              width: 11,
              height: 11,
              color: mixHex(colorOf(e.source), EDGE, REST_MIX),
            },
      }
    })

    castRef.current = egoOn ? new Set(egoOn.keys()) : null
    setBoxes(
      placed
        .filter((n) => !egoOn || egoOn.has(n.id))
        .map((n) => ({
          x: n.position.x,
          y: n.position.y,
          w: NODE_W,
          h: heightsRef.current.get(n.id) ?? NODE_H,
        })),
    )
    setNodes(placed)
    setEdges(flowEdges)
    if (missing) onPositions(Object.fromEntries(placed.map((n) => [n.id, n.position])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, layoutNonce, egoOn, remeasured])

  // Give back the link ports of any card that is on screen without them.
  //
  // React Flow discards a card's handle bounds the moment that card is hidden,
  // and the ego view hides everything outside the focus's neighbourhood. So the
  // cards returning to a widening cast are in the DOM with no ports, and an
  // edge whose end has no port declines to draw at all. It repairs itself when
  // the resize observer next reports — one frame later, or never in a frame the
  // browser is throttling — and the commit in between is painted meanwhile.
  // That paint is the blink of missing lines.
  //
  // A layout effect lands after the commit and before the paint, so measuring
  // here means the frame that reaches the screen already has its ports. Reading
  // the lookup first keeps it cheap: emphasis rewrites every node object on
  // hover, and in the ordinary case every card on screen already has its ports,
  // so this walks the lookup and touches no DOM at all.
  useLayoutEffect(() => {
    const { domNode, nodeLookup, updateNodeInternals } = store.getState()
    const updates = new Map()
    for (const [id, node] of nodeLookup) {
      if (node.internals.handleBounds || node.hidden) continue
      const el = domNode?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
      if (el) updates.set(id, { id, nodeElement: el, force: true })
    }
    if (updates.size) updateNodeInternals(updates)
  }, [nodes, store])

  // A card can only be measured once it is on screen, so the first placement
  // runs on the fallback height and this re-runs it on the real ones. It
  // settles because the heights it reads are the DOM's own and do not change
  // when the cards are repositioned: the second read finds nothing new, the
  // counter stops moving, and the layout effect goes quiet.
  useLayoutEffect(() => {
    if (nodes.length && readHeights()) setRemeasured((n) => n + 1)
  }, [nodes, readHeights])

  // Frame the map once its cards have been measured, and only when the cast
  // or the drawer's open state changes — refitting on every keystroke in the
  // Source view would yank the view.
  const initialized = useNodesInitialized()
  const paneOpen = !!focus
  const roster = graph.nodes.map((n) => n.id).join('|')
  useEffect(() => {
    if (!initialized) return
    let timer = 0
    const fit = () => {
      timer = 0
      fitView({ padding: 0.16, maxZoom: 1, duration: 380 })
    }
    timer = window.setTimeout(fit, 30)

    // One pan per change, aimed at the frame the map settles into. Opening or
    // closing the pane runs the drawer's fold, which changes how much canvas
    // there is to frame into, so a fit that ran while the fold was still going
    // would aim at a viewport that no longer exists. This used to be answered
    // by fitting a second time afterwards, but the second fit interrupted the
    // first one mid-flight: the camera aimed twice, and two aims read as one
    // elastic pan that overshoots and comes back. So the pending fit waits out
    // the resize instead. A resize with no fit pending is a reader dragging the
    // pane or the window, and is none of this effect's business.
    const observer = new ResizeObserver(() => {
      if (!timer) return
      clearTimeout(timer)
      timer = window.setTimeout(fit, 60)
    })
    const canvas = store.getState().domNode
    if (canvas) observer.observe(canvas)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, roster, layoutNonce, egoOn, paneOpen])

  // Emphasis pass: rewrites classes only, so it is cheap enough to run on hover.
  const focused = selected ?? hovered ?? glow
  const q = query.trim().toLowerCase()

  useEffect(() => {
    // A focused type reads exactly like a search hit — the same nodes stand
    // forward, everything else recedes — so it takes the same path. A row
    // glowing under the pane's pointer asks about one node the way hovering
    // its card would, so it lifts the type wash for the duration.
    const washType = focusType && !glow
    const matches = new Set<string>()
    if (q)
      for (const n of graph.nodes) {
        const hay = `${n.title} ${n.type} ${n.tags.join(' ')} ${n.body}`.toLowerCase()
        if (hay.includes(q)) matches.add(n.id)
      }
    else if (washType) for (const n of graph.nodes) if (n.type === focusType) matches.add(n.id)
    const marked = q || washType

    const cast = castRef.current
    const hiddenNode = (id: string) => {
      const n = graph.nodes.find((x) => x.id === id)
      return (!!n && hiddenTypes.has(n.type)) || (!!cast && !cast.has(id))
    }

    // A direction unticked in the pane is greyed, not dropped: distances are
    // walked over the graph minus the cut edges, so everything reachable only
    // through them loses its distance and takes the far tone with the line,
    // while anything still connected another way keeps its standing.
    const cut = (e: { source: string; target: string }) =>
      !!selected &&
      ((e.source === selected && !linkShow.out) || (e.target === selected && !linkShow.in))

    const dist = focused
      ? hops(
          [focused],
          graph.edges.filter((e) => !cut(e)),
          // The falloff walks as far as the cast seats; hover keeps its two.
          cast ? Math.max(linkShow.out || 1, linkShow.in || 1) : 2,
        )
      : null

    setNodes((ns) =>
      ns.map((n) => {
        let cls = ''
        if (marked) cls = matches.has(n.id) ? 'hit' : 'nomatch'
        else if (dist) {
          const d = dist.get(n.id)
          // The third ring is a seated guest only in the ego view; elsewhere
          // three hops out is already the far country.
          cls =
            d === 0 ? '' : d === 1 ? 'hop1' : d === 2 ? 'hop2' : d === 3 && cast ? 'hop3' : 'hopfar'
        }
        const hidden = hiddenNode(n.id)
        const sel = n.id === selected
        return n.className === cls && n.hidden === hidden && n.selected === sel
          ? n
          : { ...n, className: cls, hidden, selected: sel }
      }),
    )

    setEdges((es) =>
      es
        .map((e) => {
          let tone = ''
          const touchesFocus = e.source === focused || e.target === focused
          const lost = (id: string) => !!dist && dist.get(id) === undefined
          // In the ego view a line that misses the focus is context between two of
          // its neighbours, not another link to it — unless a cut direction has
          // greyed an endpoint, in which case the aside greys with it.
          if (cast && !touchesFocus) tone = lost(e.source) || lost(e.target) ? 'far' : 'aside'
          else if (marked) tone = matches.has(e.source) && matches.has(e.target) ? '' : 'far'
          else if (focused && cut(e)) tone = 'far'
          else if (focused && !touchesFocus) {
            // The ladder: what touches the focus is live; what runs between two
            // of its direct neighbours is aside; what stays inside the lit
            // two-hop lattice keeps the rest tone; anything reaching a dimmed
            // card dims with it — a full-strength line into a ghost invents an
            // emphasis the card no longer has.
            const ds = dist?.get(e.source)
            const dt = dist?.get(e.target)
            tone =
              ds === 1 && dt === 1 ? 'aside' : ds !== undefined && dt !== undefined ? '' : 'far'
          } else if (focused) tone = e.source === focused ? 'out' : 'in'
          const cls = tone ? `tr-${tone}` : ''
          const hidden = hiddenNode(e.source) || hiddenNode(e.target)
          if (e.className === cls && e.hidden === hidden && e.data?.tone === tone) return e
          const live = tone === 'out' || tone === 'in'
          const from = (e.data?.from as string) ?? ACCENT_BRIGHT
          return {
            ...e,
            className: cls,
            hidden,
            data: { ...e.data, tone },
            markerEnd: e.data?.symmetric
              ? undefined
              : {
                  type: MarkerType.ArrowClosed,
                  width: live ? 13 : 11,
                  height: live ? 13 : 11,
                  color: live ? from : mixHex(from, EDGE, tone === 'aside' ? ASIDE_MIX : REST_MIX),
                },
          }
        })
        // SVG paints in document order, so the links you are asking about go
        // last and end up over every link you are not — live above aside,
        // aside above the rest.
        .sort((a, b) => rank(a) - rank(b)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, selected, q, focusType, hiddenTypes, graph, egoOn, linkShow, glow])

  const onNodesChange = useCallback(
    (cs: NodeChange[]) => setNodes((ns) => applyNodeChanges(cs, ns)),
    [],
  )

  const persist = useCallback(
    (_: unknown, node: Node) => {
      // Ego placement is a temporary view — never let it overwrite the real map.
      if (!castRef.current) onPositions({ ...posRef.current, [node.id]: node.position })
    },
    [onPositions],
  )

  return (
    <CardBoxes.Provider value={boxes}>
      <ReactFlow
        className={graph.edges.length > DENSE ? 'dense' : undefined}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={persist}
        onNodeClick={(_, n) => onFocus({ kind: 'node', id: n.id })}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onPaneClick={() => onFocus(null)}
        minZoom={0.15}
        maxZoom={2.2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={DOT_GAP} size={1} color={DOT_GRID} />
        {/* Fit only. Zoom has three better answers already — the wheel, a pinch,
            and the minimap — so a pair of buttons for it was the stack earning
            its corner back from the map it sits on. */}
        <Controls
          position="bottom-right"
          showZoom={false}
          showInteractive={false}
          style={{ bottom: 127 }}
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          style={{ width: 148, height: 100 }}
          nodeColor={(n) => (n.data as unknown as CardData).color}
          nodeStrokeWidth={0}
          nodeBorderRadius={2}
        />
      </ReactFlow>
    </CardBoxes.Provider>
  )
}
