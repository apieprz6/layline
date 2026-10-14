import type { CSSProperties } from 'react'
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
 * The rail beside the races, stacked above them below `lg`.
 *
 * A grid with a breakpoint rather than the LAY-174 prototype's `flexWrap`. A wrapped flex row
 * stacks wherever its two bases stop fitting, and kept the rail's `max-width` once it had — so on a
 * 390px phone the season sat 340px wide over a table 358px wide. Here a phone gets one column the
 * full width of the screen, and the rail only stands beside the races from 1024px, which is the
 * first width that leaves the races' four columns room beside it.
 *
 * 360px, and no narrower: the teasers in the rail were designed for a 390px phone's 358px column,
 * and the Instrument tuning row's three channel tiles each hold a mono figure that spills out of a
 * third of anything less (LAY-178 measured 3px at 320).
 */
export const BODY_CLASS =
  'grid gap-4 p-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start'

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
  minHeight: '34px',
}

export const TABLE_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
}

/**
 * One row's columns: Race · Window · Duration · File from `sm` up, which the header row shares.
 *
 * Below `sm` four columns do not fit — the window alone is ~180px of mono — so a row falls back to
 * the card it used to be: the title, then the window, then the duration and the file side by side.
 * The title and the window span both columns there; the duration and the file take one each.
 */
const ROW_COLUMNS =
  'grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 ' +
  'sm:grid-cols-[minmax(0,2fr)_176px_88px_minmax(0,1fr)]'

export const ROW_CLASS = `grid ${ROW_COLUMNS}`

export const ROW_STYLE: CSSProperties = {
  padding: `${spacing(2)} ${spacing(3)}`,
}

/** Between two rows, and under the header row; never above the first. */
export const ROW_RULE = '1px solid var(--surface-border)'

/** The header row, which a phone does not draw: there, the columns it names do not exist. */
export const HEADER_ROW_CLASS = `hidden sm:grid ${ROW_COLUMNS}`

export const HEADER_CELL_STYLE: CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export const COLUMNS = ['Race', 'Window', 'Duration', 'File'] as const

/** The cells that span the whole row on a phone and take a column of their own from `sm`. */
export const WIDE_CELL_CLASS = 'col-span-2 sm:col-span-1'
