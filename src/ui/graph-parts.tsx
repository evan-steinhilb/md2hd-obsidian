import { Fragment, createContext, memo, useContext } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react'
import type { MdNode } from '../lib/parse'

export type CardData = {
  node: MdNode
  color: string
  typeLabel: string
  degree: number
}

export const CardNode = memo(({ data, selected }: NodeProps) => {
  const { node, color, typeLabel, degree } = data as unknown as CardData
  return (
    <div
      className={`card w${node.weight}${selected ? ' selected' : ''}${node.ghost ? ' ghost' : ''}`}
      style={{ '--type-color': color } as React.CSSProperties}
    >
      {/* Every side carries both roles so an edge can always take the short way
          round; Canvas picks the pair from the laid-out geometry. Ports are
          never dragged here, so they stay invisible. */}
      {SIDES.map(([name, position]) => (
        <Fragment key={name}>
          <Handle type="target" id={`t-${name}`} position={position} />
          <Handle type="source" id={`s-${name}`} position={position} />
        </Fragment>
      ))}
      <div className="card-head">
        <span className="card-type">{node.ghost ? 'unresolved' : typeLabel}</span>
        {degree > 0 && <span className="card-degree">{degree}</span>}
      </div>
      <div className="card-title">{node.title}</div>
      {node.subtitle && <div className="card-sub">{node.subtitle}</div>}
      {node.tags.length > 0 && (
        <div className="card-tags">
          {node.tags.slice(0, 3).map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

const SIDES = [
  ['left', Position.Left],
  ['right', Position.Right],
  ['top', Position.Top],
  ['bottom', Position.Bottom],
] as const

/** Every card's box in flow coordinates, so a label can dodge them. */
export type Box = { x: number; y: number; w: number; h: number }

/** Fed by the layout, not read from the store — this must not wake on every pan. */
export const CardBoxes = createContext<Box[]>([])

/** Roughly what the chip occupies: 9px mono, uppercase, 6px padding each side. */
const chipHalfWidth = (label: string) => 10 + label.length * 3.4
const CHIP_HALF_HEIGHT = 9

function pickSlide(
  want: number,
  run: number,
  lx: number,
  ly: number,
  ux: number,
  uy: number,
  cards: Box[],
  label: string,
): number {
  const hw = chipHalfWidth(label)
  const clear = (d: number) => {
    const x = lx + ux * d
    const y = ly + uy * d
    return !cards.some(
      (c) =>
        x + hw > c.x - 2 &&
        x - hw < c.x + c.w + 2 &&
        y + CHIP_HALF_HEIGHT > c.y - 2 &&
        y - CHIP_HALF_HEIGHT < c.y + c.h + 2,
    )
  }
  if (clear(want)) return want
  const limit = run / 2 - 8
  for (let push = 12; push <= limit; push += 12) {
    if (clear(want + push)) return want + push
    if (clear(want - push)) return want - push
  }
  // Nowhere to go — cards this close leave no gap. The label draws over the card
  // instead of vanishing behind it; see the edge label z-index in theme.css.
  return want
}

const OUTWARD: Record<Position, [number, number]> = {
  [Position.Left]: [-1, 0],
  [Position.Right]: [1, 0],
  [Position.Top]: [0, -1],
  [Position.Bottom]: [0, 1],
}

/**
 * Two relations between the same two cards leave and land on the same handles,
 * so raising the curvature does nothing — both curves still run straight down
 * the same axis. Push the control points sideways instead and they separate
 * into distinct arcs, taking their labels and badges with them.
 */
function bowedPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sPos: Position,
  tPos: Position,
  bow: number,
): [string, number, number] {
  const span = Math.hypot(tx - sx, ty - sy) || 1
  const arm = 0.32 * span
  const [ox, oy] = OUTWARD[sPos]
  const [ix, iy] = OUTWARD[tPos]
  const off = bow * Math.min(80, Math.max(38, span * 0.22))
  const nx = -((ty - sy) / span)
  const ny = (tx - sx) / span

  const c1x = sx + ox * arm + nx * off
  const c1y = sy + oy * arm + ny * off
  const c2x = tx + ix * arm + nx * off
  const c2y = ty + iy * arm + ny * off
  return [
    `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`,
    (sx + 3 * c1x + 3 * c2x + tx) / 8,
    (sy + 3 * c1y + 3 * c2y + ty) / 8,
  ]
}

/**
 * A chevron sitting just outside the chip, aimed along the true bearing of the
 * node it refers to — not snapped to an axis, so it reads as a compass needle.
 */
function Chevron({
  from,
  to,
  clearance,
  color,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  clearance: number
  color?: string
}) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const run = Math.hypot(dx, dy) || 1
  const ux = dx / run
  const uy = dy / run

  // Where the chip's own box ends along this bearing, plus room for the badge.
  const reachX = Math.abs(ux) < 1e-4 ? Infinity : clearance / Math.abs(ux)
  const reachY = Math.abs(uy) < 1e-4 ? Infinity : CHIP_HALF_HEIGHT / Math.abs(uy)
  const d = Math.min(reachX, reachY) + 12

  return (
    <svg
      className="edge-chevron"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      style={{
        color,
        transform: `translate(-50%,-50%) translate(${from.x + ux * d}px,${from.y + uy * d}px) rotate(${(Math.atan2(uy, ux) * 180) / Math.PI}deg)`,
      }}
    >
      <circle cx="8" cy="8" r="6.6" />
      <path d="M6.7 5.1 9.7 8 6.7 10.9" />
    </svg>
  )
}

export const RelEdge = memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    data,
  }: EdgeProps) => {
    const cards = useContext(CardBoxes)
    const bow = (data?.bow as number) ?? 0
    const [path, lx, ly] = bow
      ? bowedPath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, bow)
      : getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          curvature: 0.32,
        })
    // Crowded labels slide ALONG their own path, never off to the side of it —
    // a chip floating beside a line reads as unattached to anything — and then
    // keep sliding until they are off any card they would otherwise hide under.
    const lane = (data?.lane as number) ?? 0
    const lanes = (data?.lanes as number) ?? 1
    const run = Math.hypot(targetX - sourceX, targetY - sourceY) || 1
    const ux = (targetX - sourceX) / run
    const uy = (targetY - sourceY) / run
    const step = Math.min(40, run / (lanes + 1))
    // A relationship runs one way but has two voices. Whichever node you are
    // looking at states it in its own — "employs" from the org, "works at" from
    // the person — and the arrow always points at the node on the other end.
    const tone = data?.tone as string | undefined
    const reverse = data?.reverse as string | undefined
    const symmetric = data?.symmetric as boolean | undefined
    const fromColor = data?.from as string | undefined
    const live = tone === 'out' || tone === 'in'

    // The chevron points where the relationship, as worded, runs: at the far
    // node when this node is the one doing it, back at this one when it is not.
    // A symmetric relation has no direction, so it gets a chevron at each end.
    const text = fmt(tone === 'in' && reverse ? reverse : label)
    const toward: ('source' | 'target')[] = !live
      ? []
      : symmetric
        ? ['source', 'target']
        : tone === 'in' && reverse
          ? ['source']
          : ['target']
    const slide = pickSlide((lane - (lanes - 1) / 2) * step, run, lx, ly, ux, uy, cards, text)
    const labelX = lx + ux * slide
    const labelY = ly + uy * slide

    return (
      <>
        {/* Casing first: a dark halo under the stroke so where a link crosses a
            card or another link it reads as passing in front, not stopping. */}
        <path className="edge-casing" d={path} />
        <BaseEdge
          path={path}
          interactionWidth={0}
          style={{ '--from': fromColor } as React.CSSProperties}
        />
        {label && (
          <EdgeLabelRenderer>
            {toward.map((end) => (
              <Chevron
                key={end}
                from={{ x: labelX, y: labelY }}
                to={end === 'target' ? { x: targetX, y: targetY } : { x: sourceX, y: sourceY }}
                clearance={chipHalfWidth(text)}
                color={fromColor}
              />
            ))}
            {/* Portalled out of the edge's <g>, so tone rides on the label. */}
            <div
              className={`edge-label ${tone ?? ''}${label === 'mentions' ? ' quiet' : ''}`}
              title={text}
              style={
                {
                  transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
                  '--from': fromColor,
                } as React.CSSProperties
              }
            >
              {text}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    )
  },
)

const fmt = (s: unknown) => String(s ?? '').replace(/_/g, ' ')
