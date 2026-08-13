import dagre from '@dagrejs/dagre'
import type { Node } from '@xyflow/react'

export const NODE_W = 232
export const NODE_H = 78

/** The vertical air between two stacked cards, whatever their heights. */
const GAP_Y = 26

/**
 * Measured card heights by id. A card is only as tall as its content — a
 * subtitle and a row of tags each add a line — and nothing about that is
 * knowable before it renders, since the small type inherits `line-height:
 * normal` and so depends on the font's own metrics. So the layout takes what
 * the DOM measured and falls back to `NODE_H` for cards not yet on screen.
 */
export type Heights = ReadonlyMap<string, number>

const heightOf = (heights: Heights | undefined, id: string) => heights?.get(id) ?? NODE_H

/** Ranked layout. Direction is the map's `layout:` field. */
export function autoLayout(
  nodes: Node[],
  edges: { source: string; target: string }[],
  dir: 'LR' | 'TB',
  heights?: Heights,
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Cards are 3:1, so ranks need very different gaps depending on direction.
  g.setGraph({
    rankdir: dir,
    nodesep: dir === 'LR' ? 32 : 40,
    ranksep: dir === 'LR' ? 110 : 78,
    marginx: 40,
    marginy: 40,
  })

  // Dagre separates ranks edge to edge, so a card that declares 78px and
  // renders 110px overlaps its neighbour by the difference.
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: heightOf(heights, n.id) })
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target)
  dagre.layout(g)

  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - heightOf(heights, n.id) / 2 } }
  })
}

/**
 * The focus's neighbourhood laid out as an ego network: what points at it on
 * the left, what it points at on the right, itself in the middle. No crossings
 * by construction, which is the whole point of clicking a node.
 *
 * `show` sets how far each side runs: outbound chains keep walking source →
 * target into further right-hand columns, inbound chains target → source into
 * further left-hand ones. A side at 0 (greyed on the canvas) still seats its
 * first ring — the reference the pane promises stays visible.
 *
 * Returns null when the node is isolated — a lone card centred in space reads
 * as a bug, so the caller keeps the full map instead.
 */
export function egoLayout(
  focus: string,
  edges: { source: string; target: string }[],
  show: { out: number; in: number } = { out: 1, in: 1 },
  heights?: Heights,
) {
  const out = [...new Set(edges.filter((e) => e.source === focus).map((e) => e.target))]
  const into = [...new Set(edges.filter((e) => e.target === focus).map((e) => e.source))].filter(
    (id) => !out.includes(id),
  )
  if (!out.length && !into.length) return null

  // Neighbours that also relate to each other are seated adjacently, so the
  // link between them draws as a short arc beside the column rather than a
  // chord through it. Depth-first over that adjacency keeps runs contiguous;
  // unrelated neighbours keep their encounter order.
  const cast = new Set([...into, ...out])
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.source === focus || e.target === focus) continue
    if (!cast.has(e.source) || !cast.has(e.target)) continue
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target])
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source])
  }
  const seat = (ids: string[]) => {
    const here = new Set(ids)
    const seen = new Set<string>()
    const ordered: string[] = []
    const visit = (id: string) => {
      if (seen.has(id)) return
      seen.add(id)
      ordered.push(id)
      for (const nb of adj.get(id) ?? []) if (here.has(nb)) visit(nb)
    }
    ids.forEach(visit)
    return ordered
  }

  const positions = new Map<string, { x: number; y: number }>([[focus, { x: 0, y: 0 }]])

  // Stacked edge to edge with a constant gap between them, then the whole run
  // is centred on the focus card's middle. A card that renders taller pushes
  // the rest of its column apart rather than sitting under the one above it.
  // Positions are top-left corners, which is what the canvas places on.
  const middle = heightOf(heights, focus) / 2
  const column = (ids: string[], x: number) => {
    const hs = ids.map((id) => heightOf(heights, id))
    const total = hs.reduce((a, b) => a + b, 0) + GAP_Y * Math.max(0, ids.length - 1)
    let y = middle - total / 2
    ids.forEach((id, i) => {
      positions.set(id, { x, y })
      y += hs[i] + GAP_Y
    })
  }
  const GAP = NODE_W + 190
  column(seat(into), -GAP)
  column(seat(out), GAP)

  // Deeper rings walk one direction only and sit in the next column out.
  // Children are gathered parent by parent, so a ring clusters around the
  // order of the ring it grew from.
  const placed = new Set([focus, ...into, ...out])
  const grow = (prev: string[], key: 'source' | 'target') => {
    const other = key === 'source' ? 'target' : 'source'
    const next: string[] = []
    for (const id of prev)
      for (const e of edges)
        if (e[key] === id && !placed.has(e[other])) {
          placed.add(e[other])
          next.push(e[other])
        }
    return next
  }
  let ring = out
  for (let k = 2; k <= Math.min(3, show.out || 1); k++)
    column((ring = grow(ring, 'source')), GAP * k)
  ring = into
  for (let k = 2; k <= Math.min(3, show.in || 1); k++)
    column((ring = grow(ring, 'target')), -GAP * k)
  return positions
}

/**
 * How many rings each side of a node's ego network actually has, capped at the
 * three the dial offers. The dial hides the stops this says are empty, so it
 * has to walk the graph exactly as `egoLayout` does: the two sides share one
 * `placed` set and outbound is grown first, so a node claimed by an outbound
 * ring is not available to an inbound one. Probing both to full depth reports
 * the rings the layout would seat at its widest.
 */
export function ringDepths(focus: string, edges: { source: string; target: string }[]) {
  const out = [...new Set(edges.filter((e) => e.source === focus).map((e) => e.target))]
  const into = [...new Set(edges.filter((e) => e.target === focus).map((e) => e.source))].filter(
    (id) => !out.includes(id),
  )

  const placed = new Set([focus, ...into, ...out])
  const grow = (prev: string[], key: 'source' | 'target') => {
    const other = key === 'source' ? 'target' : 'source'
    const next: string[] = []
    for (const id of prev)
      for (const e of edges)
        if (e[key] === id && !placed.has(e[other])) {
          placed.add(e[other])
          next.push(e[other])
        }
    return next
  }

  const depth = (first: string[], key: 'source' | 'target') => {
    let ring = first
    let deepest = first.length ? 1 : 0
    for (let k = 2; k <= 3; k++) {
      ring = grow(ring, key)
      if (!ring.length) break
      deepest = k
    }
    return deepest
  }

  return { out: depth(out, 'source'), in: depth(into, 'target') }
}

/** Hop distance from a set of roots, ignoring edge direction. Used for focus falloff. */
export function hops(
  roots: string[],
  edges: { source: string; target: string }[],
  max = 2,
): Map<string, number> {
  const adj = new Map<string, string[]>()
  const link = (a: string, b: string) => adj.set(a, [...(adj.get(a) ?? []), b])
  for (const e of edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  const dist = new Map(roots.map((r) => [r, 0]))
  let frontier = roots
  for (let d = 1; d <= max; d++) {
    const next: string[] = []
    for (const id of frontier)
      for (const nb of adj.get(id) ?? []) {
        if (dist.has(nb)) continue
        dist.set(nb, d)
        next.push(nb)
      }
    frontier = next
  }
  return dist
}
