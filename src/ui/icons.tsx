/**
 * Inline icons shared by the panel, the workspace cards, and the compact
 * sidebar entry.
 *
 * They are hand-written paths instead of an icon dependency: the plugin ships
 * as a single client bundle, React comes from the Host, and every icon here
 * inherits `currentColor` so light/dark themes need no second asset.
 */
import React from 'react'

/** Common icon sizing: one square edge in pixels. */
export interface IconProps {
  /** Square edge in pixels; defaults to 16. */
  readonly size?: number
}

function Svg({ size = 16, children }: IconProps & { readonly children: React.ReactNode }): React.JSX.Element {
  return <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >{children}</svg>
}

/** Sidebar glyph: four panes, mirroring the workspace grid. */
export function PanelIcon({ size = 18 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
  </Svg>
}

/** Pushpin; filled when the workspace is pinned to the top. */
export function PinIcon({ size = 16, filled = false }: IconProps & { readonly filled?: boolean }): React.JSX.Element {
  return <Svg size={size}>
    <path
      d="M9 4h6l-1.2 5.2 3.2 3.2V14H7v-1.6l3.2-3.2L9 4Z"
      fill={filled ? 'currentColor' : 'none'}
    />
    <path d="M12 14v6" />
  </Svg>
}

export function PlusIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}><path d="M12 5v14M5 12h14" /></Svg>
}

/** Horizontal ellipsis for the per-card overflow menu. */
export function MoreIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
}

export function EyeOffIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.4 3.5" />
    <path d="M6.3 6.9C4.2 8.4 3 10.3 3 12c0 2.5 4 7 9 7a10 10 0 0 0 4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
}

export function PencilIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z" />
    <path d="M13 7l4 4" />
  </Svg>
}

export function ArrowUpIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
}

export function ArrowDownIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
}

export function TrashIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
}

export function FolderIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
}

export function ChevronLeftIcon({ size = 16 }: IconProps): React.JSX.Element {
  return <Svg size={size}><path d="M15 6l-6 6 6 6" /></Svg>
}
