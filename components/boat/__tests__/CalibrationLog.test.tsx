import { render, screen } from '@testing-library/react'
import CalibrationLog from '../CalibrationLog'
import type {
  CalibrationEvent,
  InstrumentCalibrationPayload,
  InstrumentCalibrationVersion,
} from '@/types'

/** The archive's figures, in the display's own encoding. */
const AS_PROGRAMMED: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

function version(
  version_number: number,
  effective_from: string,
  payload: InstrumentCalibrationPayload,
  extra: Partial<InstrumentCalibrationVersion> = {}
): InstrumentCalibrationVersion {
  return {
    id: `version-${version_number}`,
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    version_number,
    effective_from,
    recorded_at: `2026-0${version_number}-01T12:00:00Z`,
    note: null,
    created_by: 'owner-1',
    filename: null,
    content_sha256: null,
    payload,
    ...extra,
  }
}

const AUTOCOMPENSATION: CalibrationEvent = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Swung the compass off Navy Pier; deviation rebuilt.',
  created_by: 'owner-1',
  created_at: '2026-07-04T18:00:00Z',
  updated_at: '2026-07-04T18:00:00Z',
}

describe('the Calibration Log', () => {
  it('says so plainly when nothing has been recorded against the instrument', () => {
    render(<CalibrationLog versions={[]} events={[]} />)

    expect(screen.getByTestId('calibration-log-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('calibration-log')).not.toBeInTheDocument()
  })

  it('reads the first Version as first recorded, every figure set rather than changed', () => {
    render(<CalibrationLog versions={[version(1, '2026-05-30', AS_PROGRAMMED)]} events={[]} />)

    expect(screen.getByText(/First recorded · v1/)).toBeInTheDocument()
    expect(screen.getByText('AWA offset set to 2°')).toBeInTheDocument()
    expect(screen.getByText('AWS multiplier set to 1.02')).toBeInTheDocument()
    // No figure is described as having moved from zero, because there was no figure.
    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
  })

  it('renders a later Version as a diff against the one before it, and only that', () => {
    render(
      <CalibrationLog
        versions={[
          version(1, '2026-05-30', AS_PROGRAMMED),
          version(2, '2026-06-14', { ...AS_PROGRAMMED, AWA: { offset: 1 } }),
        ]}
        events={[]}
      />
    )

    expect(screen.getByText(/Values changed · v2/)).toBeInTheDocument()
    expect(screen.getByText('AWA offset 2° → 1°')).toBeInTheDocument()
    // The five figures v2 restated unchanged are not lines on its entry.
    expect(screen.queryByText(/AWS multiplier 1\.02 →/)).not.toBeInTheDocument()
  })

  it('says a Version moved nothing rather than rendering an entry with no lines', () => {
    render(
      <CalibrationLog
        versions={[version(1, '2026-05-30', AS_PROGRAMMED), version(2, '2026-06-14', AS_PROGRAMMED)]}
        events={[]}
      />
    )

    expect(screen.getByText('No figure moved.')).toBeInTheDocument()
  })

  it('carries an Event on the same timeline, with its channels and its note', () => {
    render(<CalibrationLog versions={[]} events={[AUTOCOMPENSATION]} />)

    expect(screen.getByText('Autocompensation · HDG')).toBeInTheDocument()
    expect(screen.getByText(AUTOCOMPENSATION.note)).toBeInTheDocument()
    expect(screen.getByText(/rebuilt its own deviation table/)).toBeInTheDocument()
  })

  it('orders Events and Version mints together, newest first', () => {
    const { container } = render(
      <CalibrationLog
        versions={[
          version(1, '2026-05-30', AS_PROGRAMMED),
          version(2, '2026-08-01', { ...AS_PROGRAMMED, HDG: { offset: 1 } }),
        ]}
        events={[AUTOCOMPENSATION]}
      />
    )

    const dates = Array.from(container.querySelectorAll('[data-testid="calibration-log"] > div')).map(
      (row) => row.firstElementChild?.textContent
    )

    expect(dates).toEqual(['1 Aug 2026', '4 Jul 2026', '30 May 2026'])
  })

  it('is the Version history too — there is no uploader, and nothing to download', () => {
    const { container } = render(
      <CalibrationLog versions={[version(1, '2026-05-30', AS_PROGRAMMED)]} events={[]} />
    )

    expect(container.textContent).not.toMatch(/uploaded|download|\.cal\b/i)
  })

  it('shows a Version note where there is one, and invents nothing where there is not', () => {
    render(
      <CalibrationLog
        versions={[
          version(1, '2026-05-30', AS_PROGRAMMED, { note: 'Off the display after the delivery.' }),
        ]}
        events={[]}
      />
    )

    expect(screen.getByText('Off the display after the delivery.')).toBeInTheDocument()
  })

  it('marks no current Version, because that question is answered above it', () => {
    // The Log is chronology. Reading "what is the boat set to now" back down through
    // it is the mistake ADR 0005 forbids, so it offers no pointer to read.
    const { container } = render(
      <CalibrationLog
        versions={[version(1, '2026-05-30', AS_PROGRAMMED), version(2, '2026-06-14', AS_PROGRAMMED)]}
        events={[]}
      />
    )

    expect(container.textContent).not.toMatch(/current/i)
  })
})
