import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROWS, RACES, VOCABULARY } from '@/components/analysis/__tests__/fixture'
import AnalysisFilterRail from '@/components/analysis/AnalysisFilterRail'
import {
  EMPTY_FILTER,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { AnalysisFilter } from '@/types'

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

function renderRail(filter: AnalysisFilter = EMPTY_FILTER) {
  const onChange = jest.fn()
  render(
    <AnalysisFilterRail
      dimensions={DIMENSIONS}
      filter={filter}
      rows={ROWS}
      races={RACES}
      onChange={onChange}
    />
  )
  return { onChange, user: userEvent.setup({ delay: null }) }
}

const chip = (dimension: string) => screen.getByTestId(`filter-chip-${dimension}`)
const bucket = (id: string) =>
  screen.getByTestId('filter-popover').querySelector(`[data-bucket="${CSS.escape(id)}"]`) as
    | HTMLButtonElement
    | null

describe('the rail itself', () => {
  it('shows one chip per dimension and never hides them', () => {
    renderRail()

    for (const dimension of DIMENSIONS) {
      expect(chip(dimension.id)).toBeInTheDocument()
    }
    // No disclosure control: there is nothing to open, because nothing is closed (ADR 0029).
    expect(screen.queryByRole('button', { name: /filters/i })).not.toBeInTheDocument()
  })

  it('each chip reads its own narrowing without anything being opened', () => {
    renderRail({ buckets: { wind: ['heavy'], sea: ['calm', 'slight'] }, range: null })

    expect(chip('wind')).toHaveTextContent('Heavy (16–22 kt)')
    expect(chip('sea')).toHaveTextContent('Calm (0–1 ft), Slight (1–2 ft)')
    expect(chip('sail')).toHaveTextContent('Any')
  })

  it('opens one dimension at a time, and closes the one it had open', async () => {
    const { user } = renderRail()

    await user.click(chip('wind'))
    expect(chip('wind')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('filter-popover')).toHaveAccessibleName('Wind speed')

    await user.click(chip('sea'))
    expect(chip('wind')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('filter-popover')).toHaveAccessibleName('Sea state')
  })
})

describe('the buckets inside one dimension', () => {
  it('renders every bucket in the vocabulary, with a Not recorded in each', async () => {
    const { user } = renderRail()

    await user.click(chip('sail'))
    const popover = screen.getByTestId('filter-popover')
    expect(within(popover).getAllByTestId('bucket-chip')).toHaveLength(5)
    expect(bucket('not-recorded')).toBeInTheDocument()
    expect(bucket('note-only')).toBeInTheDocument()
  })

  it('carries each bucket’s own count, Not recorded included', async () => {
    const { user } = renderRail()

    await user.click(chip('sea'))
    // Two July rows carry no Sea State; two June rows are Calm.
    expect(bucket('not-recorded')).toHaveTextContent('2')
    expect(bucket('calm')).toHaveTextContent('2')
  })

  it('disables a bucket with no rows rather than leaving it out', async () => {
    const { user } = renderRail()

    await user.click(chip('sail'))
    // A sail the chart defines and the boat has never raced.
    expect(bucket('Reef + Jib 2')).toBeDisabled()
    expect(bucket('Reef + Jib 2')).toHaveTextContent('0')
    expect(bucket('Main + Jib 1')).toBeEnabled()
  })

  it('tells a bucket the boat never raced from one this narrowing emptied', async () => {
    // ADR 0029's own reason for drawing an empty bucket at all: a sailor has to be able to tell
    // "this boat has a sail it has never raced" from "the other chips you tapped emptied this
    // one", and a bare `0` says neither.
    const { user } = renderRail({ buckets: { sea: ['calm'] }, range: null })

    await user.click(chip('wind'))
    // Storm: no row in the archive is in it, and none ever was.
    expect(bucket('storm')).toHaveAccessibleName(/no matches anywhere in the archive/)
    // Heavy: two rows in the archive, both of them in the unannotated July race.
    expect(bucket('heavy')).toHaveAccessibleName(
      /no matches under this narrowing, 2 in the archive/
    )
  })

  it('says how much a bucket holds when it holds any, without naming a database row', async () => {
    const { user } = renderRail()

    await user.click(chip('sea'))
    expect(bucket('calm')).toHaveAccessibleName('Calm (0–1 ft) — 2 matches')
  })

  it('keeps a selected bucket operable even once its count has fallen to nothing', async () => {
    const { user } = renderRail({ buckets: { sail: ['Reef + Jib 2'] }, range: null })

    await user.click(chip('sail'))
    // Otherwise the chip that made a narrowing could not undo it.
    expect(bucket('Reef + Jib 2')).toBeEnabled()
    expect(bucket('Reef + Jib 2')).toHaveAttribute('aria-pressed', 'true')
  })

  it('is multi-select: a second tap adds rather than replaces', async () => {
    const { user, onChange } = renderRail({ buckets: { wind: ['medium'] }, range: null })

    await user.click(chip('wind'))
    await user.click(bucket('heavy') as HTMLButtonElement)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ buckets: { wind: ['medium', 'heavy'] } })
    )
  })

  it('counts each bucket with every other dimension applied but not its own', async () => {
    const { user } = renderRail({ buckets: { sea: ['calm'] }, range: null })

    await user.click(chip('wind'))
    // Narrowed to Calm, which only the two June rows are: Light and Medium hold one each and
    // Heavy, which the two unannotated July rows are, holds none.
    expect(bucket('medium')).toHaveTextContent('1')
    expect(bucket('heavy')).toHaveTextContent('0')
  })

  it('says out loud that an untouched dimension already includes the unrecorded rows', async () => {
    const { user } = renderRail()

    await user.click(chip('sea'))
    expect(screen.getByTestId('filter-popover')).toHaveTextContent(
      /every bucket, including the rows with nothing recorded/i
    )
  })

  it('keeps saying so on every other dimension while a day range is set on when', async () => {
    // The note used to read the filter's single `range` field, which belongs to one dimension —
    // so a range on `when` silently removed the note from all six popovers.
    const { user } = renderRail({ buckets: {}, range: { from: '2026-06-01', to: '2026-07-31' } })

    await user.click(chip('sea'))
    expect(screen.getByTestId('filter-popover')).toHaveTextContent(/every bucket, including/i)

    await user.click(chip('when'))
    expect(screen.getByTestId('filter-popover')).not.toHaveTextContent(/every bucket, including/i)
  })

  it('prints the footnote that says time of day is a clock and not sunrise', async () => {
    const { user } = renderRail()

    await user.click(chip('time'))
    expect(screen.getByTestId('filter-popover')).toHaveTextContent(/06:00 to 20:00/)
    expect(screen.getByTestId('filter-popover')).toHaveTextContent(/not sunrise and sunset/)
  })

  it('hands a dimension back to Any', async () => {
    const { user, onChange } = renderRail({ buckets: { wind: ['medium'] }, range: null })

    await user.click(chip('wind'))
    await user.click(within(screen.getByTestId('filter-popover')).getByRole('button', { name: 'Any' }))

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTER)
  })
})

describe('the when dimension’s Race range', () => {
  it('offers the Races themselves below the month chips', async () => {
    const { user } = renderRail()

    await user.click(chip('when'))
    const listed = screen.getAllByTestId('race-range-row')
    expect(listed).toHaveLength(2)
    expect(listed[0]).toHaveTextContent('Beer can — 1 Jul')
    // An untitled race is normal (ADR 0010) and is not named for the sailor.
    expect(listed[1]).toHaveTextContent('Untitled race')
    // And each race states a duration rather than a row count.
    expect(listed[0]).toHaveTextContent('2m')
  })

  it('offers no Race range on a dimension that is not continuous', async () => {
    const { user } = renderRail()

    await user.click(chip('wind'))
    expect(screen.queryByTestId('race-range-row')).not.toBeInTheDocument()
  })

  it('takes the first tap as both ends, then the second as the other end', async () => {
    const { user, onChange } = renderRail()

    await user.click(chip('when'))
    await user.click(screen.getAllByTestId('race-range-row')[0])
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: { from: '2026-07-01', to: '2026-07-01' } })
    )
  })

  it('orders the range whichever way the sailor tapped it', async () => {
    // Opened with July already anchored, so the second tap is the older race.
    const { user, onChange } = renderRail({
      buckets: {},
      range: { from: '2026-07-01', to: '2026-07-01' },
    })

    await user.click(chip('when'))
    await user.click(screen.getAllByTestId('race-range-row')[0])
    await user.click(screen.getAllByTestId('race-range-row')[1])

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: { from: '2026-06-03', to: '2026-07-01' } })
    )
  })
})
