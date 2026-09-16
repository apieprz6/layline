import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * The placeholders a screen wears while its own content is still on the wire, and
 * the wrapper that says so out loud.
 *
 * A skeleton is only ever honest about content that is **actually arriving**. It is
 * the opposite of `NotRecorded`, which exists because a skeleton over an absence
 * would promise something in a moment when nothing is coming — so these belong to a
 * Suspense boundary and nowhere else: a `loading.tsx`, or the boundary a page puts
 * around its own read once it has decided to serve the screen at all. Nothing here
 * ever stands in for a *value*: a
 * placeholder is a grey box, never a plausible number, and the static chrome around
 * it (a section's title, its tab labels, a sources line) is rendered as the real
 * string it already is, because that is what keeps the shape from moving when the
 * data lands.
 */

interface SkeletonProps {
  /** Any CSS width. A percentage keeps the bar in proportion at 390px. */
  width?: string
  /** The box's height, for a placeholder standing in for something other than text. */
  height?: string
  /** Overrides the hairline rounding — `var(--radius-full)` for a dot. */
  radius?: string
  /** Anything else the surrounding layout needs: an aspect ratio, a margin. */
  style?: CSSProperties
}

/** A placeholder box of a stated size: a status dot, a wind arrow, a chart. */
export default function Skeleton({
  width = '100%',
  height,
  radius,
  style,
}: SkeletonProps): ReactElement {
  return (
    <span
      data-testid="skeleton"
      aria-hidden="true"
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

interface SkeletonTextProps {
  /**
   * The font-size of the text this bar stands in for. It is the *height* of the
   * bar, by way of the line box — pass the same value the real element uses and the
   * two are the same height without either one stating a pixel height.
   */
  fontSize: string
  /** How much of the line the text fills. */
  width?: string
  /**
   * Only for text that does not inherit the body's 1.5 — a heading, which
   * `globals.css` gives `--leading-tight`.
   */
  lineHeight?: string
  style?: CSSProperties
}

/**
 * A placeholder for a line of text, as tall as that line and no taller.
 *
 * The trick is the `&nbsp;`: the bar lays out one character at the given font-size,
 * so its height is the real line box rather than a guess at it, and `color:
 * transparent` in the stylesheet keeps the character invisible.
 */
export function SkeletonText({
  fontSize,
  width = '100%',
  lineHeight,
  style,
}: SkeletonTextProps): ReactElement {
  return (
    <span
      data-testid="skeleton"
      aria-hidden="true"
      className="skeleton"
      style={{ fontSize, width, lineHeight, ...style }}
    >
      &nbsp;
    </span>
  )
}

/**
 * Off-screen but readable: the standard clip, since the project has no `sr-only`
 * utility and one hidden string does not earn a new one.
 *
 * `position: absolute` also keeps the announcement out of the layout it sits in —
 * an in-flow 1px span would become a grid or flex item of the page root and shift
 * everything below it.
 */
const ANNOUNCEMENT_STYLE: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

interface SkeletonScreenProps {
  /** What is being waited for, as a screen reader should hear it. */
  label: string
  children: ReactNode
  /** The class the real page's root carries, so the skeleton is laid out identically. */
  className?: string
  style?: CSSProperties
}

/**
 * The root of a `loading.tsx`: the real page's own root box, plus one live region
 * saying what is on its way.
 *
 * `role="status"` sits on the hidden label alone rather than the whole screen. A
 * live region wrapping the skeleton would announce the section title and every tab
 * label as freshly changed content, twice — once now and once when the real page
 * replaces it.
 *
 * The label sits *outside* the `aria-busy` box, not inside it: `aria-busy` asks a
 * screen reader to hold updates from its subtree until it clears, and this one never
 * clears — it is replaced. A region it was withholding would be announced never.
 *
 * What this reaches is a client navigation, where the region is inserted into a live
 * document and read out. On a hard load the fallback is in the document at parse time,
 * which no screen reader treats as a change, so the announcement is silent and
 * `aria-busy` is all the sailor gets. Nothing a server-rendered fallback can do changes
 * that.
 */
export function SkeletonScreen({
  label,
  children,
  className,
  style,
}: SkeletonScreenProps): ReactElement {
  return (
    <>
      <span role="status" style={ANNOUNCEMENT_STYLE}>
        {label}
      </span>
      <div data-testid="skeleton-screen" aria-busy="true" className={className} style={style}>
        {children}
      </div>
    </>
  )
}
