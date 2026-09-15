'use client'

/**
 * File → Window → Review, over a chart stack that never leaves the screen.
 *
 * The wizard is the steps and the state; the charts are one component mounted once and handed a
 * `mode` (ADR 0014). Nothing about the stack is conditional on the step, which is what makes the
 * channel choice survive a step change and the track stay put instead of blinking away and coming
 * back re-projected. Sails and Sea state are two more steps and two more modes, later.
 *
 * **Nothing is written to the database until Save race.** Picking a file parks its bytes under
 * `tmp/{user_id}/{upload_id}/` and returns a projection to draw; every step after that is state in
 * this component. Closing the tab at any point leaves one `tmp/` object and no row (ADR 0013).
 *
 * Every time is absolute seconds in the recording's own naive frame, converted only at the edges —
 * `wallClockStamp` on the way to the server, `wallClockInputValue` on the way to a `datetime-local`.
 * Nothing here builds a `Date`, because a `Date` would put the reader's offset between the sailor and
 * the clock their own instruments showed.
 *
 * A clean race costs three actions here: pick the file, one Next, Save race. The two annotation steps
 * add one Next each, which is the five ADR 0014 measured the old flow's twenty-four against.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import type { RaceChartAxis } from '@/services/recordings/chart-series'
import { raceChartAxis } from '@/services/recordings/chart-series'
import { raceCoverage, windowFindings, type CoverageRow } from '@/services/recordings/coverage'
import {
  insideRaceWindow,
  RACE_WINDOW_NUDGE_MINUTES,
  raceWindowStamps,
  refuseRaceWindow,
  snapToRow,
  type RaceWindowSeconds,
} from '@/services/recordings/race-window'
import { LOW_SPEED_SOG_KNOTS } from '@/services/recordings/row-quality'
import {
  wallClockInputValue,
  wallClockSecondsFromInput,
  wallClockStamp,
} from '@/services/recordings/wall-clock'
import type {
  RaceChannelKey,
  RaceFinding,
  StagedRecording,
  StageRecordingResult,
  SubmitRaceInput,
  SubmitRaceResult,
} from '@/types'

import ChartStack from './ChartStack'
import RaceFindings from '../race/RaceFindings'
import CoverageReadout from '../race/CoverageReadout'

/** This ticket's three. Sails and Sea state slot between Window and Review (ADR 0014). */
const STEPS = ['File', 'Window', 'Review'] as const

type Step = 0 | 1 | 2

/**
 * The two Server Actions, as props.
 *
 * Passed in from the page rather than imported, which is what lets a jsdom test drive the whole
 * wizard against stubs and keeps the `'use server'` module out of the client import graph. Both
 * signatures are the shared ones from `@/types`, so a change to either action's contract is a type
 * error here rather than a structural copy that drifts.
 */
interface RaceUploadWizardProps {
  stageRecording: (formData: FormData) => Promise<StageRecordingResult>
  submitRace: (input: SubmitRaceInput) => Promise<SubmitRaceResult>
}

export default function RaceUploadWizard({
  stageRecording,
  submitRace,
}: RaceUploadWizardProps): ReactElement {
  const router = useRouter()

  const [staged, setStaged] = useState<StagedRecording | null>(null)
  const [step, setStep] = useState<Step>(0)
  // Held here rather than in the stack, which is the whole reason it survives a step change.
  const [channel, setChannel] = useState<RaceChannelKey>('sog')
  // Named for what it is, and not `window`: this is a client component, and a state variable that
  // shadows the DOM global would make the next line that reached for the real one read as if it had.
  const [raceWindow, setRaceWindow] = useState<RaceWindowSeconds | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [duplicateAccepted, setDuplicateAccepted] = useState(false)

  const axis: RaceChartAxis | null = useMemo(
    () => (staged ? raceChartAxis(staged.series) : null),
    [staged]
  )

  const coverageRows: CoverageRow[] = useMemo(
    () =>
      staged
        ? staged.series.row_seconds.map((seconds, at) => ({
            seconds,
            frozen: staged.series.frozen[at],
          }))
        : [],
    [staged]
  )

  const coverage = useMemo(
    () => (staged && raceWindow ? raceCoverage(coverageRows, raceWindow) : null),
    [staged, raceWindow, coverageRows]
  )

  /**
   * The window's own notes, from the arrays the browser already has.
   *
   * The same `windowFindings` the race page calls, over the same two Row Quality flags — so Review
   * states what the page will state rather than a shorter list that would read as a cleaner race.
   */
  const windowNotes: RaceFinding[] = useMemo(() => {
    if (!staged || !raceWindow || !coverage) return []

    const rows = staged.series.row_seconds
      .map((seconds, at) => ({ seconds, at }))
      .filter(({ seconds }) => insideRaceWindow(seconds, raceWindow))
      .map(({ at }) => ({
        not_water_referenced: staged.series.not_water_referenced[at],
        low_speed: staged.series.low_speed[at],
      }))

    return windowFindings(coverage, { low_speed_sog_knots: LOW_SPEED_SOG_KNOTS, rows })
  }, [staged, raceWindow, coverage])

  const refusal = useMemo(
    () => (staged && raceWindow ? refuseRaceWindow(raceWindow, staged.series.row_seconds) : null),
    [staged, raceWindow]
  )

  const needsDuplicateConfirmation = useMemo(
    () => (staged?.findings ?? []).some((finding) => finding.severity === 'confirmation'),
    [staged]
  )

  /**
   * Picking the file is one gesture and it advances the step.
   *
   * The auto-advance is not a flourish — it is where two of the five actions ADR 0014 counted went.
   * A "Next" after choosing a file asks the sailor to confirm a thing they have just done.
   */
  const onPickFile = useCallback(
    async (file: File | null): Promise<void> => {
      if (!file) return

      setBusy(true)
      setMessage(null)

      const formData = new FormData()
      formData.set('file', file)
      const result = await stageRecording(formData)

      setBusy(false)

      if (!result.ok) {
        setMessage(result.message)
        return
      }

      setStaged(result.staged)
      // The whole recording, which is the sailor's own most likely answer and always a legal window.
      const start = Math.min(...result.staged.series.row_seconds)
      const finish = Math.max(...result.staged.series.row_seconds)
      setRaceWindow({ start, finish })
      setDuplicateAccepted(false)
      setStep(1)
    },
    [stageRecording]
  )

  /**
   * A tap moves the nearer bound onto the nearest recorded row.
   *
   * The nearer bound because that is what a sailor means by pointing at the place they crossed the
   * line, and snapped because a pixel is a range of seconds and the window they see selected has to
   * be the window that gets stored. Dragging is deliberately *not* snapped: a finish past the last
   * row is legal, and snapping the drag would make it unreachable.
   */
  const onTapTime = useCallback(
    (seconds: number): void => {
      if (!staged || !raceWindow) return

      const snapped = snapToRow(staged.series.row_seconds, seconds)
      const toStart = Math.abs(seconds - raceWindow.start)
      const toFinish = Math.abs(seconds - raceWindow.finish)

      setRaceWindow(
        toStart <= toFinish
          ? { start: Math.min(snapped, raceWindow.finish), finish: raceWindow.finish }
          : { start: raceWindow.start, finish: Math.max(snapped, raceWindow.start) }
      )
    },
    [staged, raceWindow]
  )

  const moveBound = useCallback(
    (which: 'start' | 'finish', seconds: number): void => {
      setRaceWindow((current) => (current ? { ...current, [which]: seconds } : current))
    },
    []
  )

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!staged || !raceWindow) return

    setBusy(true)
    setMessage(null)

    const stamps = raceWindowStamps(raceWindow)
    const result = await submitRace({
      upload_id: staged.upload_id,
      recording_id: staged.recording_id,
      filename: staged.filename,
      content_sha256: staged.content_sha256,
      window_start: stamps.window_start,
      window_finish: stamps.window_finish,
      title,
      // Carried so the server can ask the same question again, since it cannot see the checkbox.
      duplicate_acknowledged: duplicateAccepted,
    })

    if (!result.ok) {
      setBusy(false)
      setMessage(result.message)

      // Some failures take the staged bytes with them — anything past the move to the permanent path
      // (ADR 0013). Leaving the sailor on Review with a live Save button offers a retry that can only
      // come back "the staged bytes are gone", which is what happened the first time this shipped. So
      // the wizard goes back to the file picker and says why, which is what the message already asks
      // them to do.
      if (result.start_over) {
        setStaged(null)
        setRaceWindow(null)
        // The acknowledgement was about one set of bytes, so it does not carry to the next upload.
        // The title does: the sailor wrote it, it is about the race and not about the file, and
        // making them type it twice would be this failure charging them for it.
        setDuplicateAccepted(false)
        setStep(0)
      }
      return
    }

    // Straight to the race, which is what the sailor came to make. `busy` stays true through the
    // navigation so the button cannot be pressed twice into a second race.
    router.push(`/boat-performance/races/${result.race_id}`)
  }, [staged, raceWindow, title, duplicateAccepted, submitRace, router])

  // Step 0 needs a staged file; every step after it needs a window that could be a race.
  const canAdvance = step === 0 ? staged !== null : refusal === null

  const canSave =
    step === 2 && refusal === null && (!needsDuplicateConfirmation || duplicateAccepted) && !busy

  return (
    <div
      className="lg:max-w-[1480px] lg:mx-auto"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(3),
        padding: spacing(4),
        // Room for the fixed footer, which is the only thing between the last chart and the nav bar.
        paddingBottom: 112,
      }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          Upload a race
        </h1>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          A qtVlm CSV export, and which stretch of it was the race.
        </p>
      </header>

      <Stepper step={step} />

      {step === 0 && (
        <FilePicker busy={busy} onPick={onPickFile} />
      )}

      {/* Mounted once, from the moment there is a file, and never remounted between steps. */}
      {staged && axis && raceWindow && (
        <ChartStack
          series={staged.series}
          axis={axis}
          window={raceWindow}
          channel={channel}
          onChannelChange={setChannel}
          mode={step === 1 ? 'window' : 'readonly'}
          onWindowChange={setRaceWindow}
          onTapTime={onTapTime}
          compact={step === 2}
        />
      )}

      {message !== null && (
        <RaceFindings findings={[{ severity: 'refusal', message }]} />
      )}

      {step === 1 && staged && raceWindow && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <BoundField
            label="Start"
            seconds={raceWindow.start}
            rowSeconds={staged.series.row_seconds}
            onChange={(seconds) => moveBound('start', seconds)}
          />
          <BoundField
            label="Finish"
            seconds={raceWindow.finish}
            rowSeconds={staged.series.row_seconds}
            onChange={(seconds) => moveBound('finish', seconds)}
          />
          {refusal && <RaceFindings findings={[{ severity: 'refusal', message: refusal.message }]} />}
        </section>
      )}

      {step === 2 && staged && coverage && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <TitleField value={title} onChange={setTitle} />

          <CoverageReadout coverage={coverage} />

          <RaceFindings
            findings={[...staged.findings, ...windowNotes]}
            heading="What this recording says about itself"
          />

          {needsDuplicateConfirmation && (
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing(2),
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={duplicateAccepted}
                onChange={(event) => setDuplicateAccepted(event.target.checked)}
              />
              Yes — this really is a second race from the same log.
            </label>
          )}
        </section>
      )}

      <FooterNav
        canBack={step > 0 && !busy}
        onBack={() => setStep((current) => (current === 0 ? 0 : ((current - 1) as Step)))}
        primary={
          step === 2
            ? { label: busy ? 'Saving' : 'Save race', enabled: canSave, onPress: onSubmit }
            : {
                label: 'Next',
                enabled: canAdvance && !busy,
                onPress: () => setStep((current) => ((current + 1) as Step)),
              }
        }
      />
    </div>
  )
}

/**
 * The step bars.
 *
 * Bars rather than numbered circles: the wizard is three steps of one job, not a form in chapters,
 * and what a sailor needs from it is how much is left.
 */
function Stepper({ step }: { step: Step }): ReactElement {
  return (
    <ol
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        gap: spacing(2),
      }}
    >
      {STEPS.map((label, index) => {
        const active = index === step
        return (
          <li key={label} style={{ flex: 1 }} aria-current={active ? 'step' : undefined}>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: index <= step ? 'var(--blue-500)' : 'var(--surface-border)',
              }}
            />
            <span
              style={{
                fontSize: 8.5,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: active ? 'var(--text-accent)' : 'var(--text-muted)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The one gesture that starts everything, and the only one on the File step. */
function FilePicker({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (file: File | null) => void
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        background: 'var(--surface-elevated)',
        border: '1px dashed var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        padding: spacing(4),
      }}
    >
      <label
        htmlFor="race-file"
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        qtVlm CSV export
      </label>
      <input
        id="race-file"
        type="file"
        accept=".csv,text/csv,text/plain"
        disabled={busy}
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
      />
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {busy
          ? 'Reading the file…'
          : 'Choosing a file reads it and draws it. Nothing is saved until the last step.'}
      </p>
    </div>
  )
}

/**
 * One bound of the window: a datetime field, and the nudges that reach between rows.
 *
 * The field exists because a tap snaps to a recorded row and the rows are half a minute apart at
 * best — every instant between two of them would otherwise be unreachable, including a start the
 * sailor knows to the minute from the committee boat's gun. The nudges are for the same gap at
 * thumb speed (ADR 0014).
 */
function BoundField({
  label,
  seconds,
  rowSeconds,
  onChange,
}: {
  label: string
  seconds: number
  rowSeconds: readonly number[]
  onChange: (seconds: number) => void
}): ReactElement {
  const inputId = `race-window-${label.toLowerCase()}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <label
        htmlFor={inputId}
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' }}>
        <input
          id={inputId}
          type="datetime-local"
          // The recording's own digits, with no offset applied in either direction.
          value={wallClockInputValue(wallClockStamp(seconds))}
          step={60}
          onChange={(event) => {
            const parsed = wallClockSecondsFromInput(event.target.value)
            // A half-typed year is an ordinary state of this field, not an error: the window stands
            // until the field is a time again.
            if (parsed !== null) onChange(parsed)
          }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            padding: '6px 8px',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
          }}
        />

        <div style={{ display: 'flex', gap: 4 }}>
          {RACE_WINDOW_NUDGE_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onChange(seconds + minutes * 60)}
              aria-label={`${label} ${minutes > 0 ? 'later' : 'earlier'} by ${Math.abs(minutes)} minutes`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                padding: '5px 7px',
                borderRadius: 4,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-raised)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {minutes > 0 ? `+${minutes}` : minutes}
            </button>
          ))}
          <span style={{ fontSize: 8.5, color: 'var(--text-muted)', alignSelf: 'center' }}>min</span>
        </div>

        <button
          type="button"
          onClick={() => onChange(snapToRow(rowSeconds, seconds))}
          style={{
            fontSize: 10,
            padding: '5px 8px',
            borderRadius: 4,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface-raised)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Snap to a row
        </button>
      </div>
    </div>
  )
}

/** A title, or none. Never generated: a race with no title is shown by its date (ADR 0010). */
function TitleField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <label
        htmlFor="race-title"
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        Title
      </label>
      <input
        id="race-title"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Leave blank if it does not need one"
        autoComplete="off"
        style={{
          fontSize: 'var(--text-sm)',
          padding: '8px 10px',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
        }}
      />
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Never generated — a race with no title is shown by its date.
      </p>
    </div>
  )
}

/**
 * Back and one forward, pinned to the bottom.
 *
 * Fixed above the nav bar because the charts are the screen: a sailor cropping a window at 390px
 * should not have to scroll past a track to find Next.
 */
function FooterNav({
  canBack,
  onBack,
  primary,
}: {
  canBack: boolean
  onBack: () => void
  primary: { label: string; enabled: boolean; onPress: () => void }
}): ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Clear of the app's own bottom navigation.
        bottom: 44,
        display: 'flex',
        gap: spacing(2),
        padding: '10px 14px',
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--surface-border)',
        maxWidth: 430,
        margin: '0 auto',
      }}
    >
      <ActionButton kind="ghost" enabled={canBack} onPress={onBack}>
        Back
      </ActionButton>
      <ActionButton kind="primary" enabled={primary.enabled} onPress={primary.onPress} grow>
        {primary.label}
      </ActionButton>
    </div>
  )
}

function ActionButton({
  kind,
  enabled,
  onPress,
  grow = false,
  children,
}: {
  kind: 'primary' | 'ghost'
  enabled: boolean
  onPress: () => void
  grow?: boolean
  children: ReactNode
}): ReactElement {
  const primary = kind === 'primary'

  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onPress}
      style={{
        flex: grow ? 1 : undefined,
        padding: '10px 14px',
        borderRadius: 7,
        fontSize: 13,
        fontWeight: 600,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.45,
        background: primary ? 'var(--btn-primary-bg)' : 'var(--btn-ghost-bg)',
        border: `1px solid ${primary ? 'var(--btn-primary-bg)' : 'var(--btn-ghost-border)'}`,
        color: primary ? 'var(--btn-primary-fg)' : 'var(--btn-ghost-fg)',
      }}
    >
      {children}
    </button>
  )
}
