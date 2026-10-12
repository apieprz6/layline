import Link from 'next/link'
import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'

interface ScreenHeadingProps {
  /** The screen's own name, as its row on the Overall tab calls it. */
  title: string
}

/**
 * An analysis screen's heading: the way back to **Boat performance**, and the screen's name.
 *
 * One component because it was written three times. Every screen the Overall tab's rows open is a
 * **detail screen reached from one place** — tap a row, read the figures, go back — and the app's
 * own chrome offers no way back up: the drawer names sections, not the screens inside them, so a
 * sailor who taps through to a chart and wants the tab again has only the browser's own button,
 * which on a phone opened from the dock is not always there.
 *
 * So the link is the screen's, not the chrome's, and it is the same link on all three. It was
 * missing from Instrument Tuning until LAY-160, which is the ticket that put a door to that screen
 * on the tab and so made the room with no handle on the inside worth having.
 *
 * A component rather than a style object — unlike `chrome.ts`'s pill and note, which dress a
 * `<button>` here and a `<p>` there. This is always the same anchor with the same words, and the
 * words are most of what must not drift: an arrow pointing the other way, or a label naming the
 * route instead of the section, would each be a different promise about where the tap goes.
 */
export default function ScreenHeading({ title }: ScreenHeadingProps): ReactElement {
  return (
    <div>
      <Link
        href="/boat-performance"
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-accent)',
          textDecoration: 'none',
        }}
      >
        ← Boat performance
      </Link>
      <h1
        style={{
          margin: `${spacing(1)} 0 0`,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h1>
    </div>
  )
}
