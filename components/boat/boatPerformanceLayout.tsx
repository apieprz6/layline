import type { CSSProperties, ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'

/**
 * The geometry of Boat performance, held apart from the two things that draw it.
 *
 * `BoatPerformanceContent` and `BoatPerformanceSkeleton` are the same screen before and after the
 * archive is read, and the skeleton's whole job is that nothing moves when the real one replaces
 * it — so the rail's width, the breakpoint it stacks at and the table's columns are written once,
 * here, rather than once in each. The same arrangement as `sectionTabsStyle`.
 */

export const HEADER_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  borderBottom: '1px solid var(--surface-border)',
  padding: spacing(4),
}

export const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: '16px',
  fontWeight: 'var(--weight-bold)',
  color: 'var(--text-primary)',
}

/**
 * The screen's root: at least a screen tall on a phone, and **exactly** what the app's top bar
 * leaves of one from `lg`.
 *
 * On a desktop the page itself never scrolls. The rail and the race list each scroll inside their
 * own box instead, so an archive of fifty races is a list that scrolls under its own column
 * headers rather than a page that carries the season, the toolbar and the headers away with it.
 * That needs the root to know its height, which is why `RaceHeader` holds itself to
 * `--app-header-height` rather than to its content. A phone keeps the ordinary page scroll: there
 * the rail is above the races, and a box that scrolls inside a page that scrolls is a trap.
 */
export const ROOT_CLASS =
  'min-h-screen lg:min-h-0 lg:h-[calc(100dvh-var(--app-header-height))] ' +
  'lg:flex lg:flex-col lg:overflow-hidden'

/**
 * The rail beside the races, stacked above them below `lg`.
 *
 * A grid with a breakpoint rather than the LAY-174 prototype's `flexWrap`. A wrapped flex row
 * stacks wherever its two bases stop fitting, and kept the rail's `max-width` once it had — so on a
 * 390px phone the season sat 340px wide over a table 358px wide. Here a phone gets one column the
 * full width of the screen, and the rail only stands beside the races from 1024px.
 *
 * 38% of the viewport, between 440px and 760px, by the owner's calls on LAY-178: 360px read too
 * small on a desktop and an ultrawide, and fixed steps still left the season's cards scrolling on a
 * 14" MacBook (1512px) while the race table beside them sat mostly empty. A share of the screen
 * gives the cards the room the table was not using, so they wrap less and stand shorter: 575px at
 * 1512, 760px from 2000. Never under 360px whatever happens to these: the teasers were designed for
 * a 390px phone's 358px column, and the Instrument tuning row's three channel tiles each hold a
 * mono figure that spills out of a third of anything less (3px at 320).
 *
 * From `lg` the one row is the full height left under the section header (`minmax(0,1fr)`), so
 * each column can scroll inside it — see `ROOT_CLASS`.
 */
export const BODY_CLASS =
  'grid gap-4 p-4 lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] ' +
  'lg:grid-cols-[minmax(0,clamp(440px,38vw,760px))_minmax(0,1fr)]'

/**
 * The rail, which scrolls in its own column from `lg` when the season is taller than the screen.
 * `relative` for the reason `LIST_CLASS` gives: the teasers' own absolute pieces must be clipped by
 * this scroller rather than spill past it into the page.
 */
export const RAIL_CLASS = 'relative lg:min-h-0 lg:overflow-y-auto'

/** The races' section, which hands its height on to the table rather than growing past it. */
export const RACES_CLASS = 'lg:min-h-0'

export const SECTION_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(3),
  minWidth: 0,
}

/** "This season" and "Races": a section's own name, at the size the rail and the table share. */
export const SECTION_HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

/**
 * A section's toolbar row: its heading, and for the races "Upload a race" at the other end for an
 * admin. The rail's heading sits in one too, empty but for itself, so the two headings share a line.
 *
 * A fixed height, because the button is only drawn for an admin and the skeleton draws it for
 * nobody (see `BoatPerformanceSkeleton`): without one, an admin's table would sit lower than its
 * placeholder did by however much taller the button is than the heading.
 */
export const TOOLBAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing(3),
  // The button below: 8px padding twice, and 12px type at the body's 1.5.
  minHeight: '34px',
}

/** "Upload a race", whose height `TOOLBAR_STYLE` holds — so the two are written side by side. */
export const UPLOAD_BUTTON_STYLE: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 7,
  background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
  fontSize: 12,
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

/**
 * The table's box: as tall as its rows, until there are more than the screen holds. From `lg` it
 * then stops at the bottom of the screen, its header row stays put and the rows scroll beneath it
 * (`LIST_CLASS`).
 */
export const TABLE_CLASS = 'lg:flex lg:flex-col lg:min-h-0'

/**
 * `relative` is not decoration. Each row's screen-reader labels are `sr-only`, which is
 * `position: absolute`, and an absolute box is clipped by a scroller only if the scroller is its
 * containing block — without this, the labels of the rows scrolled out of sight stayed where they
 * were and made the page itself scroll by their height (126px on a 360px-tall screen).
 */
export const LIST_CLASS = 'relative lg:min-h-0 lg:overflow-y-auto'

export const TABLE_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
}

/**
 * One row's columns: Race · Window · Duration from `sm` up, which the header row shares.
 *
 * Below `sm` three columns do not fit — the window alone is ~180px of mono — so a row falls back to
 * the card it used to be: the title, then the window, then the duration.
 *
 * No File column, by the owner's call on LAY-178: a filename is not what a sailor picks a race by,
 * and it is on the race's own page.
 */
const ROW_COLUMNS =
  'grid-cols-1 items-baseline gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_176px_88px]'

export const ROW_CLASS = `grid ${ROW_COLUMNS}`

export const ROW_STYLE: CSSProperties = {
  padding: `${spacing(2)} ${spacing(3)}`,
}

/** Between two rows, and under the header row; never above the first. */
const ROW_RULE = '1px solid var(--surface-border)'

const HEADER_CELL_STYLE: CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

/**
 * The table's column names, which a phone does not draw: there, the columns they name do not
 * exist.
 *
 * Hidden from a screen reader on both screens, the real one and the skeleton. Each row carries its
 * own labels instead (see `RaceRow`), because a row is one link and a header row a list of
 * links cannot point at would be three words read once and never again.
 */
export function ColumnHeaderRow(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={`hidden sm:grid ${ROW_COLUMNS}`}
      style={{ ...ROW_STYLE, borderBottom: ROW_RULE }}
    >
      {['Race', 'Window', 'Duration'].map((column) => (
        <span key={column} style={HEADER_CELL_STYLE}>
          {column}
        </span>
      ))}
    </div>
  )
}

/** A row's rule: none above the first, `ROW_RULE` above every other. */
export function rowRule(index: number): CSSProperties {
  return { borderTop: index === 0 ? 'none' : ROW_RULE }
}
