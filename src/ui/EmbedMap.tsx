import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, type Positions } from './Canvas'
import type { Focus, LinkShow } from './Detail'
import { parseGraph, type SourceFile } from '../lib/parse'

/**
 * One beat of the tour: what the map should be showing, and for how long.
 *
 * `focus` is the surface — null is the whole map, `{kind:'type'}` opens a
 * type's list, `{kind:'node'}` opens a card. `glow` lights a row in whatever
 * list is open, the way a pointer resting on it would. `linkShow` is how far
 * the open card's neighbourhood runs. `ms` is the beat's own length: a glow
 * wants a moment, a freshly seated ego view wants longer.
 */
export type TourStep = {
  focus: Focus | null
  glow?: string | null
  linkShow?: LinkShow
  ms?: number
}

/** A step with nothing said about its length rests for this long. */
const BEAT = 3000

/**
 * The embedded map: `SharedMap` playing a visit back.
 *
 * Same real canvas, same read-only footing, and the tour drives it through the
 * same props a hand would — focus, the pane's row glow, the degree dials. The
 * frame opens on the whole map, then a scripted visit walks it: a type's list,
 * a row lighting up, a card, its second and third rings, and home again.
 *
 * The tour never runs for a reader who asked for reduced motion, never advances
 * while the frame is out of view or the tab is hidden, and ends for good the
 * moment the visitor touches the map — at which point the stage takes its own
 * glow and dials back and the map is theirs.
 */
export default function EmbedMap({
  files,
  name,
  funnel = [],
  tour,
  dwellMs = 3200,
}: {
  files: SourceFile[]
  name: string
  /** Node ids to visit, in order. Synthesised into a tour when none is given. */
  funnel?: string[]
  /** The scripted visit. Beats play in order and then start over. */
  tour?: TourStep[]
  /** Fallback beat length for a synthesised tour. */
  dwellMs?: number
}) {
  const graph = useMemo(() => parseGraph(files), [files])
  const [positions, setPositions] = useState<Positions>({})
  const [focus, setFocus] = useState<Focus | null>(null)
  const [query, setQuery] = useState('')
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [dirOverride, setDir] = useState<'LR' | 'TB' | null>(null)
  const [ego, setEgo] = useState(true)
  const [nonce, setNonce] = useState(0)

  // Non-null only while the tour is running: what it is driving on the stage.
  const [driven, setDriven] = useState<Pick<TourStep, 'glow' | 'linkShow'> | null>(null)

  const shell = useRef<HTMLDivElement>(null)

  // A funnel is the old shape of the same request — a list of cards to visit.
  // It opens on the whole map like every tour does, then walks them.
  const steps = useMemo<TourStep[]>(
    () =>
      tour ?? [
        { focus: null, ms: dwellMs },
        ...funnel.map((id): TourStep => ({ focus: { kind: 'node', id }, ms: dwellMs })),
      ],
    [tour, funnel, dwellMs],
  )

  useEffect(() => {
    if (steps.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = shell.current
    let visible = true
    let at = 0
    let timer = 0

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      threshold: 0.3,
    })
    if (el) io.observe(el)

    // Out of view or in a hidden tab the tour holds its place and asks again
    // shortly: a beat that played to nobody is a beat of the visit lost.
    const tick = () => {
      if (!visible || document.hidden) {
        timer = window.setTimeout(tick, 500)
        return
      }
      at = (at + 1) % steps.length
      const step = steps[at]
      setFocus(step.focus)
      setDriven({ glow: step.glow ?? null, linkShow: step.linkShow })
      timer = window.setTimeout(tick, step.ms ?? BEAT)
    }
    timer = window.setTimeout(tick, steps[0].ms ?? BEAT)

    // Any real interaction ends the tour for good — a map that keeps snatching
    // the selection back is worse than no tour at all. Handing `driven` back to
    // null is part of stopping: the stage's own glow and dials answer the hand.
    const stop = () => {
      clearTimeout(timer)
      io.disconnect()
      setDriven(null)
      el?.removeEventListener('pointerdown', stop, true)
      el?.removeEventListener('keydown', stop, true)
      el?.removeEventListener('wheel', stop, true)
    }
    el?.addEventListener('pointerdown', stop, true)
    el?.addEventListener('keydown', stop, true)
    el?.addEventListener('wheel', stop, true)

    return stop
  }, [steps])

  const title = graph.config.title || name
  const dir = dirOverride ?? graph.config.layout
  const node = focus?.kind === 'node' ? (graph.nodes.find((n) => n.id === focus.id) ?? null) : null
  const source = node ? (files.find((f) => f.path === node.file)?.text ?? '') : ''

  const relayout = (next: 'LR' | 'TB') => {
    setDir(next)
    setPositions({})
    setNonce((n) => n + 1)
  }

  const toggleType = (t: string) =>
    setHiddenTypes((s) => {
      const next = new Set(s)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  return (
    <div className="shell" data-share="" ref={shell}>
      <main className="stage">
        <Stage
          graph={graph}
          title={title}
          positions={positions}
          onPositions={setPositions}
          focus={focus}
          onFocus={setFocus}
          query={query}
          onQuery={setQuery}
          hiddenTypes={hiddenTypes}
          onToggleType={toggleType}
          dir={dir}
          onRelayout={relayout}
          layoutNonce={nonce}
          ego={ego}
          onEgo={setEgo}
          source={source}
          onEditSource={() => {}}
          glow={driven?.glow}
          linkShow={driven?.linkShow}
          readOnly
        />
      </main>
    </div>
  )
}
