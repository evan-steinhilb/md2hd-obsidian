type P = { size?: number }

const svg = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const More = ({ size = 13 }: P) => (
  <svg {...svg(size)}>
    <circle cx="3.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)

export const Plus = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
)

export const FolderUp = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M1.8 12.8V3.6a.8.8 0 0 1 .8-.8h3l1.4 1.6h6.2a.8.8 0 0 1 .8.8v7.6a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8Z" />
    <path d="M8 11.4V7.6M6.4 9.1 8 7.5l1.6 1.6" />
  </svg>
)

export const FileUp = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M9 1.8H4.2a.8.8 0 0 0-.8.8v10.8a.8.8 0 0 0 .8.8h7.6a.8.8 0 0 0 .8-.8V5.2Z" />
    <path d="M9 1.8v3.4h3.6" />
  </svg>
)

export const Close = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

export const Search = ({ size = 13 }: P) => (
  <svg {...svg(size)}>
    <circle cx="7.2" cy="7.2" r="4.2" />
    <path d="m10.4 10.4 2.6 2.6" />
  </svg>
)

export const Chevron = ({ size = 12 }: P) => (
  <svg {...svg(size)}>
    <path d="m4 9.8 4-3.6 4 3.6" />
  </svg>
)

export const Ranks = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <rect x="1.8" y="6" width="4" height="4" rx="1" />
    <rect x="10.2" y="2.4" width="4" height="3.6" rx="1" />
    <rect x="10.2" y="10" width="4" height="3.6" rx="1" />
    <path d="M5.8 8h2.2v-3.8h2.2M8 8v4.2h2.2" />
  </svg>
)

/* The same ranks, read top to bottom. */
export const RanksDown = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <g transform="rotate(90 8 8)">
      <rect x="1.8" y="6" width="4" height="4" rx="1" />
      <rect x="10.2" y="2.4" width="4" height="3.6" rx="1" />
      <rect x="10.2" y="10" width="4" height="3.6" rx="1" />
      <path d="M5.8 8h2.2v-3.8h2.2M8 8v4.2h2.2" />
    </g>
  </svg>
)

/* Fullscreen, in its two states. The brackets point outward at the screen
   rather than inward at the map: this takes over the display, it does not frame
   the content. Fitting the map is React Flow's own control, by the minimap. */
export const Expand = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M9.8 2.4h3.8v3.8M6.2 13.6H2.4V9.8" />
    <path d="M13.6 2.4 9.6 6.4M2.4 13.6l4-4" />
  </svg>
)

export const Shrink = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <path d="M13.6 6.4H9.8V2.6M2.4 9.6h3.8v3.8" />
    <path d="M9.8 6.2l3.8-3.8M2.4 13.6l3.8-3.8" />
  </svg>
)

export const Help = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.3 6.2A1.75 1.75 0 0 1 9.7 6.8c0 1.2-1.7 1.5-1.7 2.6" />
    <path d="M8 11.6h.01" strokeWidth={1.7} />
  </svg>
)

export const Collapse = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <rect x="2" y="2.8" width="12" height="10.4" rx="1.2" />
    <path d="M6.4 2.8v10.4" />
  </svg>
)

export const Trash = ({ size = 13 }: P) => (
  <svg {...svg(size)}>
    <path d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 8.4a.8.8 0 0 0 .8.7h4.8a.8.8 0 0 0 .8-.7l.6-8.4" />
  </svg>
)

export const Target = ({ size = 14 }: P) => (
  <svg {...svg(size)}>
    <circle cx="8" cy="8" r="2.1" />
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 .9v1.8M8 13.3v1.8M.9 8h1.8M13.3 8h1.8" />
  </svg>
)

export const Link = ({ size = 12 }: P) => (
  <svg {...svg(size)}>
    <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
    <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3L3.6 8.2a2.6 2.6 0 0 0 3.7 3.7l1-1" />
  </svg>
)

export const ChevRight = ({ size = 11 }: P) => (
  <svg {...svg(size)}>
    <path d="m6 3.6 4.4 4.4L6 12.4" />
  </svg>
)

export const Code = ({ size = 13 }: P) => (
  <svg {...svg(size)}>
    <path d="M5.4 4.8 2.2 8l3.2 3.2M10.6 4.8 13.8 8l-3.2 3.2" />
  </svg>
)

export const TextLines = ({ size = 13 }: P) => (
  <svg {...svg(size)}>
    <path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h6.6" />
  </svg>
)

export const Out = ({ size = 12 }: P) => (
  <svg {...svg(size)}>
    <path d="M3.2 8h9.2M9 4.6 12.4 8 9 11.4" />
  </svg>
)

export const In = ({ size = 12 }: P) => (
  <svg {...svg(size)}>
    <path d="M12.8 8H3.6M7 4.6 3.6 8 7 11.4" />
  </svg>
)
