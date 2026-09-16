'use client'

/**
 * File → Window → Sails → Sea state → Review, over a chart stack that never leaves the screen.
 *
 * The wizard is the steps and the state; the charts are one component mounted once and handed a
 * `mode` (ADR 0014). Nothing about the stack is conditional on the step, which is what makes the
 * channel choice survive a step change and the track stay put instead of blinking away and coming
 * back re-projected. Every annotation placed on an earlier step stays drawn for the rest of the flow,
 * dimmed and with nothing to tap, so the sailor answers each question against the same picture.
 *
 * The two annotation steps are **Testimony** (ADR 0010), and everything about how they behave follows
 * from that. Nothing is pre-selected — a default would be a guess presented as a memory, so a new sail
 * entry inherits nothing from the one before it either. Both steps are skippable and two empty lists
 * are a legal race whose page will say the sails and the water were not recorded. Entry times are not
 * bounded by the window: the sails were set before the start.
 *
 * A sail is named by naming a Sail Definition of **one** Crossover Chart Version (ADR 0023), and which
 * Version that is belongs to the Race. The step defaults it to the Version in force when the recording
 * started, shows it, and lets the sailor change it — a change clears the entries already placed and
 * says so, because the numbers they hold are only meaningful inside the Version they were chosen from.
 * With no Version there is nothing to name a sail in, so the step is closed and says which of the two
 * reasons it is.
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
 * A clean race costs five actions: pick the file, three Nexts, Save race. The archive's worst case —
 * seven sail changes — costs 24 by ADR 0014's own count, and both figures are pinned by test, so a
 * change that costs the sailor more taps fails rather than passing quietly.
 */

import { useRouter } from 'next/navigation'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { formatBandRange } from '@/lib/boat/rigTune'
import { spacing } from '@/lib/utils/design'
import { chartInForceOn } from '@/services/boat/crossoverCharts'
import { versionInForceOn } from '@/services/boat/versionInForce'
import { bandKeptFor, loggedTwsMean, windBandFinding } from '@/services/races/boat-setup'
import {
  SEA_STATES,
  byTime,
  newSailEntry,
  newSeaStateEntry,
  noteText,
  placeAnnotationTime,
  refuseEntryTimes,
  refuseSailEntry,
  refuseSeaStateEntry,
  sailEntriesToSubmit,
  sailWithNote,
  seaStateEntriesToSubmit,
  seaStateLabel,
} from '@/services/races/annotations'
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
  wallClockTime,
} from '@/services/recordings/wall-clock'
import type {
  BoatSetupVersionRef,
  CrossoverChartChoice,
  CrossoverSailDefinition,
  RaceBoatSetupChoices,
  RaceChannelKey,
  RaceFinding,
  RigTuneChoice,
  SailEntryDraft,
  SeaStateEntryDraft,
  StagedRecording,
  StageRecordingResult,
  SubmitRaceInput,
  SubmitRaceResult,
} from '@/types'

import ChartStack, { type StackMode } from './ChartStack'
import type { StackMarker } from './chart-geometry'
import RaceFindings from '../race/RaceFindings'
import CoverageReadout from '../race/CoverageReadout'

/** ADR 0014's five. */
const STEPS = ['File', 'Window', 'Sails', 'Sea state', 'Review'] as const

type Step = 0 | 1 | 2 | 3 | 4

const REVIEW: Step = 4

/**
 * What the sailor is told when every row already carries an entry of this kind.
 *
 * Reachable only on a very short recording, and refused rather than fudged: an entry at a time the
 * file does not have would be a time nobody tapped.
 */
const NO_ROW_LEFT =
  'Every row in this recording already has an entry on it, so there is no time left to place another. ' +
  'Move or take off one of the entries below.'

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
  /**
   * Every Crossover Chart Version the boat has, newest first, each with the sails it names — or null
   * where they could not be read.
   *
   * All of them, not only the one in force: the archive is hand-entered, so a race being annotated
   * here was probably sailed under a chart the boat has since replaced, and it has to be able to name
   * that chart's sails in that chart's own words (ADR 0012).
   *
   * Null is not "the boat has no chart" and is not treated as one. Either way the Sails step says
   * which it is and offers nothing, rather than presenting an empty chip row as an answer, and the
   * rest of the upload still saves — a race with no sail plan recorded is a legal race (ADR 0010).
   */
  charts: CrossoverChartChoice[] | null
  /**
   * The Polar, Rig Tune and Instrument Calibration Versions the boat has, each newest first, and each
   * Rig Tune Version's own Wind Bands — or null where they could not be read.
   *
   * The chart is not among them: it is `charts` above, read with its sail vocabulary because the Sails
   * step needs that too, and reading it twice would give the Review step a second list that could
   * disagree with the one the sails were named in.
   *
   * Same reading of null as `charts`, for the same reason. Every list may also be legitimately empty —
   * a boat with no Polar yet — and a Race with all five answers unrecorded is a legal Race (ADR 0008):
   * nine races in this archive predate every Boat Setup artifact.
   */
  boatSetup: RaceBoatSetupChoices | null
}

export default function RaceUploadWizard({
  stageRecording,
  submitRace,
  charts,
  boatSetup,
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

  // Two lists of Testimony, and which entry is open. Both start empty and stay empty unless the
  // sailor says something: there is no initial value beside a list of changes (ADR 0010).
  const [sailEntries, setSailEntries] = useState<SailEntryDraft[]>([])
  const [seaEntries, setSeaEntries] = useState<SeaStateEntryDraft[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  /**
   * Which Crossover Chart Version this Race's sails are named in, and what a change to it cost.
   *
   * Defaulted from the recording's own start time when the file is picked, and null until then — and
   * still null afterwards if the boat had no chart yet when this was sailed, which is an ordinary state
   * for an archive being entered backwards. Whatever it ends as is written on the Race and never
   * resolved again (ADR 0012).
   */
  const [chartVersionId, setChartVersionId] = useState<string | null>(null)
  const [chartNote, setChartNote] = useState<string | null>(null)

  /**
   * The other three Version pointers and the Wind Band the rig was set to.
   *
   * Defaulted the same way as the chart — the Version in force at the recording's own start — and null
   * until a file is picked, or afterwards where nothing was in force yet. Each is written onto the Race
   * as a pointer and never resolved again (ADR 0012), and each stays changeable here and on the race
   * page afterwards.
   *
   * The band is the Rig Tune Version's answer in a second column, so it is only ever one of *that*
   * Version's bands and moving the Version lets go of a band that no longer belongs to it. The
   * composite key `races (rig_tune_version_id, rig_tune_band_id)` is what enforces that; this only
   * keeps the form from offering a pair the database would refuse.
   */
  const [polarVersionId, setPolarVersionId] = useState<string | null>(null)
  const [rigTuneVersionId, setRigTuneVersionId] = useState<string | null>(null)
  const [calibrationVersionId, setCalibrationVersionId] = useState<string | null>(null)
  const [bandId, setBandId] = useState<string | null>(null)

  // A counter rather than a uuid: these keys exist so React and the charts can tell two drafts apart,
  // they are never sent, and the database's own key is `(race_id, at)`.
  const minted = useRef(0)
  const mintKey = useCallback((): string => {
    minted.current += 1
    return `entry-${minted.current}`
  }, [])

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

  /** The Version the sails will be named in, as an object, or null while there is none. */
  const chosenChart = useMemo(
    () => (charts ?? []).find((chart) => chart.version_id === chartVersionId) ?? null,
    [charts, chartVersionId]
  )

  /** The chosen Rig Tune Version, which is also the only source of bands the picker may offer. */
  const chosenRigTune = useMemo(
    () => (boatSetup?.rig_tune ?? []).find((tune) => tune.version_id === rigTuneVersionId) ?? null,
    [boatSetup, rigTuneVersionId]
  )

  /** The chosen band, as an object, for the sentence that compares it against the logged wind. */
  const chosenBand = useMemo(
    () => (chosenRigTune?.bands ?? []).find((band) => band.band_id === bandId) ?? null,
    [chosenRigTune, bandId]
  )

  /**
   * Mean TWS over the Race Window, in knots, or null where the file logged none.
   *
   * Derived and never stored — the race page derives the same figure the same way from the same
   * Transcription, so what the sailor is shown here is what the page will say (ADR 0008).
   */
  const loggedWind = useMemo(() => {
    if (!staged || !raceWindow) return null
    return loggedTwsMean(
      staged.series.row_seconds.map((at, index) => ({
        at,
        tws: staged.series.channels.tws[index],
      })),
      raceWindow
    )
  }, [staged, raceWindow])

  /**
   * The band disagreeing with the logged wind, as a note.
   *
   * A finding and never a refusal: the band is what the rig was actually set to, and a race sailed on a
   * band that turned out to be wrong for the day is a thing that happens and is worth recording exactly
   * as it happened (ADR 0009 keeps refusals to two, and this is neither of them).
   */
  const bandNote = useMemo(
    () => windBandFinding(chosenBand, loggedWind),
    [chosenBand, loggedWind]
  )

  /**
   * Whether there is anything to name a sail with.
   *
   * A boat with no Crossover Chart, a read that failed, and a recording older than the boat's first
   * chart are three different sentences, and all three mean the same thing for the chart stack: no tap
   * on this step could produce an entry that is ever finishable, so the step does not offer one.
   */
  const canNameSails = chosenChart !== null

  /** The step, as the one thing that changes about the stack. */
  const mode: StackMode =
    step === 1
      ? 'window'
      : step === 2
        ? canNameSails
          ? 'sail'
          : 'readonly'
        : step === 3
          ? 'sea'
          : 'readonly'

  /** The chosen Version's own words, by the number an entry holds. */
  const sailLabels = useMemo(
    () =>
      new Map(
        (chosenChart?.definitions ?? []).map((definition) => [definition.number, definition.label])
      ),
    [chosenChart]
  )

  /**
   * Every annotation, of both kinds, on every step.
   *
   * `locked` is what the step decides — not whether a marker is drawn. An answer given on an earlier
   * step stays visible for the rest of the flow so the sailor can place a sea state against the sail
   * change it went with (ADR 0014).
   */
  const markers: StackMarker[] = useMemo(
    () => [
      ...sailEntries.map((entry) => ({
        key: entry.key,
        at: entry.at,
        lane: 'sail' as const,
        // The Definition's number rather than its words: a marker is a few pixels wide, and the
        // number is the one thing about a Definition that is short and the sailor's own.
        label: markerLabel(entry),
        selected: selected === entry.key,
        incomplete: refuseSailEntry(entry) !== null,
        locked: mode !== 'sail',
      })),
      ...seaEntries.map((entry) => ({
        key: entry.key,
        at: entry.at,
        lane: 'sea' as const,
        label: entry.sea_state ? seaStateLabel(entry.sea_state) : '?',
        selected: selected === entry.key,
        incomplete: refuseSeaStateEntry(entry) !== null,
        locked: mode !== 'sea',
      })),
    ],
    [sailEntries, seaEntries, selected, mode]
  )

  /**
   * Why an annotation step will not advance yet.
   *
   * A collision first, because it is about the list, then the first half-finished entry. Both are also
   * database constraints, and both are re-asked by the Server Action — this is the copy that answers
   * before anything has been written at all.
   */
  const sailStepRefusal = useMemo(
    () =>
      refuseEntryTimes(sailEntries) ??
      sailEntries.map(refuseSailEntry).find((each): each is string => each !== null) ??
      null,
    [sailEntries]
  )

  const seaStepRefusal = useMemo(
    () =>
      refuseEntryTimes(seaEntries) ??
      seaEntries.map(refuseSeaStateEntry).find((each): each is string => each !== null) ??
      null,
    [seaEntries]
  )

  /**
   * A tap places an entry of the step's own kind, at the nearest free recorded row.
   *
   * The new entry is selected, because placing one and then having to find it is two gestures for one
   * intention. It arrives naming nothing: one Sail Configuration is now one sail, so inheriting the
   * previous entry's Definition would pre-select the very sail the sailor came here to replace.
   */
  const placeAnnotation = useCallback(
    (seconds: number): void => {
      if (!staged) return

      const rows = staged.series.row_seconds

      if (mode === 'sail') {
        const at = placeAnnotationTime(rows, seconds, sailEntries.map((entry) => entry.at))
        if (at === null) {
          setMessage(NO_ROW_LEFT)
          return
        }

        const entry = newSailEntry(at, mintKey())
        setSailEntries([...sailEntries, entry])
        setSelected(entry.key)
        setMessage(null)
        return
      }

      if (mode === 'sea') {
        const at = placeAnnotationTime(rows, seconds, seaEntries.map((entry) => entry.at))
        if (at === null) {
          setMessage(NO_ROW_LEFT)
          return
        }

        const entry = newSeaStateEntry(at, mintKey())
        setSeaEntries([...seaEntries, entry])
        setSelected(entry.key)
        setMessage(null)
      }
    },
    [staged, mode, sailEntries, seaEntries, mintKey]
  )

  /**
   * Naming the Version these sails are in, which clears the ones already named.
   *
   * A Definition number means something only inside one Version — v1's 3 and v2's 3 are different
   * sails — so carrying the entries across would silently rename what the sailor said. They are
   * cleared, and the count is stated, which is the same bargain `repoint_race_crossover_chart` strikes
   * for a Race that has already been saved.
   */
  const chooseChart = useCallback(
    (versionId: string): void => {
      if (versionId === chartVersionId) return

      const cleared = sailEntries.length

      setChartVersionId(versionId)
      setSailEntries([])
      setSelected(null)
      setChartNote(
        cleared === 0
          ? null
          : `A sail is named in one Crossover Chart Version’s own words, so switching Versions took ` +
              `off ${cleared} sail ${cleared === 1 ? 'entry' : 'entries'}. Place them again.`
      )
    },
    [chartVersionId, sailEntries]
  )

  /**
   * Choosing a Rig Tune Version, which the Wind Band answer hangs off.
   *
   * A band belongs to one Version and never travels to another — a re-tune means new bands (ADR 0007) —
   * so moving the Version lets go of a band that the new one does not have. `bandKeptFor` keeps it when
   * the new Version happens to have the same band row and drops it otherwise; the pair is checked by the
   * composite key either way, and this is only about not offering the form a state it would refuse.
   */
  const chooseRigTune = useCallback(
    (versionId: string | null): void => {
      const next = (boatSetup?.rig_tune ?? []).find((tune) => tune.version_id === versionId) ?? null
      setRigTuneVersionId(versionId)
      setBandId((current) => bandKeptFor(next, current))
    },
    [boatSetup]
  )

  const patchSail = useCallback((key: string, change: Partial<SailEntryDraft>): void => {
    setSailEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...change } : entry))
    )
  }, [])

  const patchSea = useCallback((key: string, change: Partial<SeaStateEntryDraft>): void => {
    setSeaEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...change } : entry))
    )
  }, [])

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
      // The Version in force when the recording started — the boat's chart *then*, which for a
      // hand-entered archive is usually not the chart now. Null when the recording predates the first
      // Version, and offered rather than guessed at from there.
      setChartVersionId(chartInForceOn(charts ?? [], wallClockStamp(start))?.version_id ?? null)
      setChartNote(null)
      // The other four, defaulted by the same rule off the same stamp: what the boat's Boat Setup was
      // *then*. Null where nothing was in force yet, which is the honest answer for the nine races that
      // predate every artifact, and offered rather than backdated from there (ADR 0008).
      const then = wallClockStamp(start)
      const rigTune = versionInForceOn(boatSetup?.rig_tune ?? [], then)
      setPolarVersionId(versionInForceOn(boatSetup?.polar ?? [], then)?.version_id ?? null)
      setCalibrationVersionId(
        versionInForceOn(boatSetup?.instrument_calibration ?? [], then)?.version_id ?? null
      )
      setRigTuneVersionId(rigTune?.version_id ?? null)
      // No default band. Which band the rig was set to is something only the sailor knows — the logged
      // wind is evidence about the day, not testimony about the turnbuckles (ADR 0010).
      setBandId(null)
      setStep(1)
    },
    [stageRecording, charts, boatSetup]
  )

  /**
   * A tap moves the nearer bound onto the nearest recorded row.
   *
   * The nearer bound because that is what a sailor means by pointing at the place they crossed the
   * line, and snapped because a pixel is a range of seconds and the window they see selected has to
   * be the window that gets stored. Dragging is deliberately *not* snapped: a finish past the last
   * row is legal, and snapping the drag would make it unreachable.
   */
  const moveNearerBound = useCallback(
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

  /**
   * A tap on either chart, dispatched by the step: it moves a window bound, or it places an entry.
   *
   * One gesture with one meaning per step is the whole of ADR 0014's "only the permissions change".
   * The sailor points at the same place on the same track and the wizard knows which question is
   * being answered, because the step already said.
   */
  const onTapTime = useCallback(
    (seconds: number): void => {
      if (mode === 'window') {
        moveNearerBound(seconds)
        return
      }

      placeAnnotation(seconds)
    },
    [mode, moveNearerBound, placeAnnotation]
  )

  /**
   * The other way in: place an entry without tapping, at the first free row from the window's start.
   *
   * For a change the sailor knows the time of and cannot find on a 390px track — a headsail change
   * logged at 19:07 on paper. It places a real recorded row like a tap does, and the entry's own
   * datetime field is what moves it to the minute.
   */
  const addByTime = useCallback((): void => {
    if (raceWindow) onTapTime(raceWindow.start)
  }, [raceWindow, onTapTime])

  const moveBound = useCallback(
    (which: 'start' | 'finish', seconds: number): void => {
      setRaceWindow((current) => (current ? { ...current, [which]: seconds } : current))
    },
    []
  )

  /**
   * A step change, with nothing open.
   *
   * The selection is which entry's editor is expanded, and an editor belonging to the step just left
   * would be an open form the sailor can no longer see the markers for.
   */
  const goToStep = useCallback((next: Step): void => {
    setSelected(null)
    setMessage(null)
    setStep(next)
  }, [])

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
      // The five Boat Setup answers, frozen onto the Race here as pointers and never resolved again
      // (ADR 0012). Null is a real answer for every one of them: a race with no Polar recorded reads
      // "not recorded" forever rather than acquiring one the next time the page is opened.
      crossover_chart_version_id: chartVersionId,
      polar_version_id: polarVersionId,
      rig_tune_version_id: rigTuneVersionId,
      instrument_calibration_version_id: calibrationVersionId,
      rig_tune_band_id: bandId,
      // Two lists, either of which may be empty — a race whose sails and water were not recorded is
      // an ordinary race, and an empty list is how it says so (ADR 0010).
      sails: sailEntriesToSubmit(sailEntries),
      sea_state: seaStateEntriesToSubmit(seaEntries),
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
        // The annotations go for the same reason the window does: every one of them is anchored to a
        // row of *that* recording, and carrying them onto a different file would be testimony about
        // times the new file may not have.
        setSailEntries([])
        setSeaEntries([])
        setSelected(null)
        // The defaults were read off *that* recording's start time, so they go with the recording.
        setChartVersionId(null)
        setChartNote(null)
        setPolarVersionId(null)
        setRigTuneVersionId(null)
        setCalibrationVersionId(null)
        setBandId(null)
        setStep(0)
      }
      return
    }

    // Straight to the race, which is what the sailor came to make. `busy` stays true through the
    // navigation so the button cannot be pressed twice into a second race.
    router.push(`/boat-performance/races/${result.race_id}`)
  }, [
    staged,
    raceWindow,
    title,
    chartVersionId,
    polarVersionId,
    rigTuneVersionId,
    calibrationVersionId,
    bandId,
    sailEntries,
    seaEntries,
    duplicateAccepted,
    submitRace,
    router,
  ])

  /**
   * Why the step will not go forward, or null.
   *
   * The annotation steps are skippable — an empty list has nothing to refuse — so what blocks them is
   * only ever an entry the sailor started and did not finish. Save asks all three at once, because
   * Review's button is reachable by the Back arrow from anywhere.
   */
  const stepRefusal: string | null =
    step === 1 ? (refusal?.message ?? null) : step === 2 ? sailStepRefusal : step === 3 ? seaStepRefusal : null

  const canAdvance = step === 0 ? staged !== null : stepRefusal === null

  const canSave =
    step === REVIEW &&
    refusal === null &&
    sailStepRefusal === null &&
    seaStepRefusal === null &&
    (!needsDuplicateConfirmation || duplicateAccepted) &&
    !busy

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
          mode={mode}
          hint={step === 2 && !canNameSails ? 'No chart to name a sail in' : undefined}
          onWindowChange={setRaceWindow}
          onTapTime={onTapTime}
          markers={markers}
          onSelectMarker={setSelected}
          compact={step === REVIEW}
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

      {step === 2 && staged && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <StepIntro
            heading="What was up, and when?"
            prose={
              canNameSails
                ? 'Tap the track where it happened — the time comes from the recording, not from a keypad. Every sail is one the chart names; anything else goes under “Something else” with a note. Leave it empty if nobody wrote it down.'
                : charts === null
                  ? 'The boat’s Crossover Charts could not be read just now, and a sail is named in a chart Version’s own words — so there is nothing here to name one with. The race still saves; its page will say the sail plan was not recorded.'
                  : charts.length === 0
                    ? 'The boat has no Crossover Chart yet, and a sail is named in a chart Version’s own words — there is no separate list of sails. Upload a Crossover Chart under Boat, or save the race without a sail plan; its page will say it was not recorded.'
                    : 'This recording is older than every Crossover Chart the boat has, so no Version was in force when it was sailed. Pick the Version whose words these sails should be named in, or save the race without a sail plan.'
            }
          />

          {charts !== null && charts.length > 0 && (
            <ChartVersionPicker charts={charts} chosen={chartVersionId} onChoose={chooseChart} />
          )}

          {chartNote !== null && <RaceFindings findings={[{ severity: 'note', message: chartNote }]} />}

          {canNameSails && chosenChart && (
            <>
              {sailEntries.length === 0 && (
                <EmptyNote>
                  No sail changes recorded. The race is still savable; its page will say the sail plan
                  was not recorded.
                </EmptyNote>
              )}

              <AddByTimeButton onPress={addByTime} />

              {byTime(sailEntries).map((entry) =>
                entry.key === selected ? (
                  <SailEntryEditor
                    key={entry.key}
                    entry={entry}
                    definitions={chosenChart.definitions}
                    onChange={(change) => patchSail(entry.key, change)}
                    onRemove={() => {
                      setSailEntries((current) => current.filter((each) => each.key !== entry.key))
                      setSelected(null)
                    }}
                    onDone={() => setSelected(null)}
                  />
                ) : (
                  <EntryRow
                    key={entry.key}
                    at={entry.at}
                    text={sailEntryText(entry, sailLabels)}
                    incomplete={refuseSailEntry(entry) !== null}
                    onPress={() => setSelected(entry.key)}
                  />
                )
              )}
            </>
          )}

          {sailStepRefusal && (
            <RaceFindings findings={[{ severity: 'refusal', message: sailStepRefusal }]} />
          )}
        </section>
      )}

      {step === 3 && staged && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <StepIntro
            heading="What was the water doing?"
            prose="Same gesture. The sail changes stay on the chart so you can place sea state against them, but they are locked here."
          />

          {seaEntries.length === 0 && (
            <EmptyNote>
              No sea state recorded. The race is still savable; its page will say the sea state was not
              recorded.
            </EmptyNote>
          )}

          <AddByTimeButton onPress={addByTime} />

          {byTime(seaEntries).map((entry) =>
            entry.key === selected ? (
              <SeaStateEntryEditor
                key={entry.key}
                entry={entry}
                onChange={(change) => patchSea(entry.key, change)}
                onRemove={() => {
                  setSeaEntries((current) => current.filter((each) => each.key !== entry.key))
                  setSelected(null)
                }}
                onDone={() => setSelected(null)}
              />
            ) : (
              <EntryRow
                key={entry.key}
                at={entry.at}
                text={entry.sea_state ? seaStateLabel(entry.sea_state) : 'nothing stated yet'}
                incomplete={refuseSeaStateEntry(entry) !== null}
                onPress={() => setSelected(entry.key)}
              />
            )
          )}

          {seaStepRefusal && (
            <RaceFindings findings={[{ severity: 'refusal', message: seaStepRefusal }]} />
          )}
        </section>
      )}

      {step === REVIEW && staged && coverage && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <TitleField value={title} onChange={setTitle} />

          <AnnotationSummary
            sails={byTime(sailEntries).map((entry) => ({
              at: entry.at,
              text: sailEntryText(entry, sailLabels),
            }))}
            seaState={byTime(seaEntries).map((entry) => ({
              at: entry.at,
              text: entry.sea_state ? seaStateLabel(entry.sea_state) : 'nothing stated yet',
            }))}
          />

          <BoatSetupReview
            choices={boatSetup}
            chart={chosenChart}
            polarVersionId={polarVersionId}
            rigTuneVersionId={rigTuneVersionId}
            calibrationVersionId={calibrationVersionId}
            bandId={bandId}
            rigTune={chosenRigTune}
            loggedWind={loggedWind}
            bandNote={bandNote}
            onChoosePolar={setPolarVersionId}
            onChooseRigTune={chooseRigTune}
            onChooseCalibration={setCalibrationVersionId}
            onChooseBand={setBandId}
          />

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
        onBack={() => goToStep(step === 0 ? 0 : ((step - 1) as Step))}
        primary={
          step === REVIEW
            ? { label: busy ? 'Saving' : 'Save race', enabled: canSave, onPress: onSubmit }
            : {
                label: 'Next',
                enabled: canAdvance && !busy,
                onPress: () => goToStep((step + 1) as Step),
              }
        }
      />
    </div>
  )
}

/**
 * The step bars.
 *
 * Bars rather than numbered circles: the wizard is five steps of one job, not a form in chapters,
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

/** What this step is asking, in the sailor's words rather than the schema's. */
function StepIntro({ heading, prose }: { heading: string; prose: string }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-primary)',
        }}
      >
        {heading}
      </h2>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {prose}
      </p>
    </div>
  )
}

/**
 * What an empty step means, said before the sailor wonders whether they are stuck.
 *
 * Not a warning and not styled as one: an empty list is a legal answer and the commonest one in the
 * archive (ADR 0010). What it must not be is silent, because "not recorded" on the race's page ought
 * not to be a surprise.
 */
function EmptyNote({ children }: { children: ReactNode }): ReactElement {
  return (
    <p
      style={{
        margin: 0,
        padding: spacing(3),
        border: '1px dashed var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-elevated)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  )
}

/** The way in for a change the sailor knows the time of but cannot find on the track. */
function AddByTimeButton({ onPress }: { onPress: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        alignSelf: 'flex-start',
        padding: '7px 10px',
        borderRadius: 6,
        border: '1px solid var(--surface-border)',
        background: 'var(--surface-raised)',
        color: 'var(--text-accent)',
        fontSize: 'var(--text-sm)',
        cursor: 'pointer',
      }}
    >
      + Add one by time instead
    </button>
  )
}

/**
 * One entry, closed: its clock and what it says.
 *
 * The clock is the heading because that is what distinguishes two entries from each other — a race
 * with two "Main + jib 2" entries has two of them for a reason, and the reason is the time.
 */
function EntryRow({
  at,
  text,
  incomplete,
  onPress,
}: {
  at: number
  text: string
  incomplete: boolean
  onPress: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: spacing(2),
        width: '100%',
        textAlign: 'left',
        padding: '9px 11px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${incomplete ? 'var(--state-warning)' : 'var(--surface-border)'}`,
        background: 'var(--surface-raised)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-accent)',
        }}
      >
        {wallClockTime(wallClockStamp(at))}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{text}</span>
    </button>
  )
}

/**
 * One Sail Configuration, open: its time, the sail the chart names, and a note.
 *
 * One chip row, and it is the whole vocabulary — every Definition the chosen Version has, including
 * the ones no cell of the grid recommends, because what the boat flew is not limited to what the chart
 * would have advised. "Something else" is the way out of the vocabulary rather than a hole in it: it
 * names no Definition, so the note is the only record of what was up and is required.
 *
 * A note is offered alongside a named sail too, and is the reason `note` is a column rather than a
 * fallback — "jib was blown out" belongs on the entry that says the A2 went up.
 */
function SailEntryEditor({
  entry,
  definitions,
  onChange,
  onRemove,
  onDone,
}: {
  entry: SailEntryDraft
  definitions: readonly CrossoverSailDefinition[]
  onChange: (change: Partial<SailEntryDraft>) => void
  onRemove: () => void
  onDone: () => void
}): ReactElement {
  /**
   * Whether the sailor has said "not one of these".
   *
   * A number and no number are the two states of the entry itself; this third one exists because a
   * *fresh* entry also has no number, and drawing "Something else" as pressed on it would be the
   * wizard answering the question (ADR 0010). Reopened later, a note with no Definition is that answer.
   */
  const [somethingElse, setSomethingElse] = useState(
    entry.definition_number === null && noteText(entry.note) !== ''
  )

  /**
   * Whether the entry is out of the vocabulary *now*, which is the question the chip, the label and
   * the placeholder each ask. The `useState` above cannot answer it alone: tapping a Definition
   * clears it in the same act, and a stale `true` would leave the note field demanding words for a
   * sail the chart has just named.
   */
  const outOfVocabulary = somethingElse && entry.definition_number === null
  const refused = refuseSailEntry(entry)
  const noteId = `race-entry-note-${entry.key}`

  return (
    <EntryCard at={entry.at} onChangeTime={(seconds) => onChange({ at: seconds })}>
      <ChipRow label="Sail up">
        {definitions.map((definition) => (
          <Chip
            key={definition.number}
            on={entry.definition_number === definition.number}
            onPress={() => {
              setSomethingElse(false)
              onChange({ definition_number: definition.number })
            }}
          >
            {definition.label}
          </Chip>
        ))}
        <Chip
          on={outOfVocabulary}
          onPress={() => {
            setSomethingElse(true)
            onChange({ definition_number: null })
          }}
        >
          Something else
        </Chip>
      </ChipRow>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
        <label
          htmlFor={noteId}
          style={{
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {outOfVocabulary
            ? 'What was up, in your own words'
            : 'Note, if there is anything to add'}
        </label>
        <input
          id={noteId}
          type="text"
          value={entry.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder={outOfVocabulary ? 'delivery main' : 'jib was blown out'}
          style={{
            fontSize: 'var(--text-sm)',
            padding: '7px 9px',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {refused && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--state-warning)' }}>
          {refused}
        </p>
      )}

      <EntryActions onRemove={onRemove} onDone={onDone} />
    </EntryCard>
  )
}

/**
 * Which Crossover Chart Version this Race's sails are named in.
 *
 * Every Version is offered, newest first, and each says the day it came into force — because the one
 * the sailor wants is chosen by *when the race was*, and for a hand-entered archive that is usually
 * not the newest. The chosen one is stated even when there is nothing to change it to, since it is
 * about to be written onto the Race and read back as the source of every sail name on its page.
 */
function ChartVersionPicker({
  charts,
  chosen,
  onChoose,
}: {
  charts: readonly CrossoverChartChoice[]
  chosen: string | null
  onChoose: (versionId: string) => void
}): ReactElement {
  return (
    <ChipRow label="Named in Crossover Chart">
      {charts.map((chart) => (
        <Chip
          key={chart.version_id}
          on={chart.version_id === chosen}
          onPress={() => onChoose(chart.version_id)}
        >
          {`v${chart.version_number}`}
          <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>
            {`from ${chart.effective_from}`}
          </span>
        </Chip>
      ))}
    </ChipRow>
  )
}

/**
 * The Boat Setup the race was sailed under: four Version pointers and the Wind Band the rig was set to.
 *
 * On Review rather than on a step of its own, because none of it is testimony about a moment — it is
 * what the boat *was* for the whole race, and the sailor is best placed to confirm it once they can see
 * which race they have made (ADR 0014).
 *
 * Every one of the five is a pointer, defaulted to the Version in force at the recording's start and
 * changeable here and forever afterwards on the race page. Null is a real answer everywhere: this
 * archive's oldest races predate every Boat Setup artifact the boat has, and a Polar backdated onto one
 * of them would assert a document that did not exist (ADR 0008).
 *
 * The Crossover Chart is shown here but chosen on the Sails step, because the sails were named in its
 * words and changing it there is what clears them. It is stated rather than repeated as a picker so
 * Review shows the whole answer in one place without offering two ways to change one thing.
 */
function BoatSetupReview({
  choices,
  chart,
  polarVersionId,
  rigTuneVersionId,
  calibrationVersionId,
  bandId,
  rigTune,
  loggedWind,
  bandNote,
  onChoosePolar,
  onChooseRigTune,
  onChooseCalibration,
  onChooseBand,
}: {
  choices: RaceBoatSetupChoices | null
  chart: CrossoverChartChoice | null
  polarVersionId: string | null
  rigTuneVersionId: string | null
  calibrationVersionId: string | null
  bandId: string | null
  rigTune: RigTuneChoice | null
  loggedWind: number | null
  bandNote: RaceFinding | null
  onChoosePolar: (versionId: string | null) => void
  onChooseRigTune: (versionId: string | null) => void
  onChooseCalibration: (versionId: string | null) => void
  onChooseBand: (bandId: string | null) => void
}): ReactElement {
  return (
    <section
      style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}
      data-testid="boat-setup-review"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
        <span
          style={{
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          Boat Setup
        </span>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {choices === null
            ? 'The boat’s Boat Setup Versions could not be read just now, so none of them can be named here. ' +
              'The race still saves, and every one of these can be filled in on its page afterwards.'
            : 'Which Versions the boat was on. Defaulted to whatever was in force when the recording started — ' +
              'change any of them, and leave one unset if nobody knows.'}
        </p>
      </div>

      <ChipRow label="Named in Crossover Chart">
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {chart === null ? (
            <em style={{ color: 'var(--text-muted)' }}>Not recorded</em>
          ) : (
            `v${chart.version_number} — chosen on the Sails step, where the sails are named in it`
          )}
        </span>
      </ChipRow>

      <VersionPicker
        label="Polar"
        versions={choices?.polar ?? []}
        chosen={polarVersionId}
        onChoose={onChoosePolar}
      />

      <VersionPicker
        label="Rig Tune"
        versions={choices?.rig_tune ?? []}
        chosen={rigTuneVersionId}
        onChoose={onChooseRigTune}
      />

      <WindBandPicker rigTune={rigTune} chosen={bandId} onChoose={onChooseBand} />

      <VersionPicker
        label="Instrument Calibration"
        versions={choices?.instrument_calibration ?? []}
        chosen={calibrationVersionId}
        onChoose={onChooseCalibration}
      />

      {loggedWind !== null && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {`Logged wind averaged ${loggedWind} kt over this window.`}
        </p>
      )}

      {bandNote !== null && <RaceFindings findings={[bandNote]} />}
    </section>
  )
}

/**
 * One Version pointer, with every Version offered and "Not recorded" beside them.
 *
 * Newest first, each stating the day it came into force, because the one the sailor wants is chosen by
 * *when the race was* and for an archive entered backwards that is usually not the newest — the same
 * reasoning as `ChartVersionPicker`, which this deliberately reads like.
 *
 * "Not recorded" is a chip rather than an absence, because it is a real and common answer and the
 * sailor has to be able to get back to it after pressing a Version by mistake.
 */
function VersionPicker({
  label,
  versions,
  chosen,
  onChoose,
}: {
  label: string
  versions: readonly BoatSetupVersionRef[]
  chosen: string | null
  onChoose: (versionId: string | null) => void
}): ReactElement {
  if (versions.length === 0) {
    return (
      <ChipRow label={label}>
        <span style={{ fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
          None to name
        </span>
      </ChipRow>
    )
  }

  return (
    <ChipRow label={label}>
      {versions.map((version) => (
        <Chip
          key={version.version_id}
          on={version.version_id === chosen}
          onPress={() => onChoose(version.version_id)}
        >
          {`v${version.version_number}`}
          <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>
            {`from ${version.effective_from}`}
          </span>
        </Chip>
      ))}
      <Chip on={chosen === null} onPress={() => onChoose(null)}>
        Not recorded
      </Chip>
    </ChipRow>
  )
}

/**
 * Which Wind Band the rig was set to, offering that Rig Tune Version's bands and nothing else.
 *
 * Gated behind the Version, and disabled rather than hidden while there is none: a band is one row of
 * one Version's band table, and bands do not travel between Versions (ADR 0007). The composite key
 * `races (rig_tune_version_id, rig_tune_band_id)` is what actually refuses a foreign band — this only
 * keeps the form from offering one.
 *
 * Nothing is pre-selected. Which band the turnbuckles were on is testimony only the sailor holds; the
 * logged wind is evidence about the day, and guessing the band from it would be Layline putting words
 * in their mouth (ADR 0010).
 */
function WindBandPicker({
  rigTune,
  chosen,
  onChoose,
}: {
  rigTune: RigTuneChoice | null
  chosen: string | null
  onChoose: (bandId: string | null) => void
}): ReactElement {
  if (rigTune === null) {
    return (
      <ChipRow label="Wind Band">
        <Chip on={false} disabled onPress={() => undefined}>
          Pick a Rig Tune Version first
        </Chip>
      </ChipRow>
    )
  }

  return (
    <ChipRow label="Wind Band">
      {rigTune.bands.map((band) => (
        <Chip
          key={band.band_id}
          on={band.band_id === chosen}
          onPress={() => onChoose(band.band_id)}
        >
          {formatBandRange(band.low_kt, band.high_kt)}
          {band.label !== null && (
            <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>{band.label}</span>
          )}
        </Chip>
      ))}
      <Chip on={chosen === null} onPress={() => onChoose(null)}>
        Not recorded
      </Chip>
    </ChipRow>
  )
}

/**
 * What one entry says, in the chosen Version's own words.
 *
 * A note-only entry reads as what was written and nothing else: the nearest Definition's words would
 * be the wizard naming a sail the sailor deliberately did not name (ADR 0023).
 */
function sailEntryText(entry: SailEntryDraft, labels: ReadonlyMap<number, string>): string {
  const note = noteText(entry.note)

  if (entry.definition_number === null) return note === '' ? 'nothing named yet' : note

  return sailWithNote(labels.get(entry.definition_number) ?? `sail ${entry.definition_number}`, note)
}

/** The same entry, in the few characters a chart marker has. */
function markerLabel(entry: SailEntryDraft): string {
  if (entry.definition_number !== null) return `#${entry.definition_number}`
  return noteText(entry.note) === '' ? '?' : 'note'
}

/** One Sea State reading, open. Four chips, nothing pre-selected. */
function SeaStateEntryEditor({
  entry,
  onChange,
  onRemove,
  onDone,
}: {
  entry: SeaStateEntryDraft
  onChange: (change: Partial<SeaStateEntryDraft>) => void
  onRemove: () => void
  onDone: () => void
}): ReactElement {
  const refused = refuseSeaStateEntry(entry)

  return (
    <EntryCard at={entry.at} onChangeTime={(seconds) => onChange({ at: seconds })}>
      <ChipRow label="Sea state">
        {SEA_STATES.map((sea) => (
          <Chip
            key={sea.value}
            on={entry.sea_state === sea.value}
            onPress={() => onChange({ sea_state: sea.value })}
          >
            {sea.label}
            <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>{sea.height}</span>
          </Chip>
        ))}
      </ChipRow>

      {refused && (
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--state-warning)' }}>
          {refused}
        </p>
      )}

      <EntryActions onRemove={onRemove} onDone={onDone} />
    </EntryCard>
  )
}

/**
 * The frame an open entry sits in, and the time controls both kinds share.
 *
 * The nudges and the field are here for the reason the window's are: a tap lands on a recorded row,
 * and the rows are half a minute apart at best, so an entry the sailor knows to the minute would
 * otherwise be unreachable. An entry's time is *not* clamped to the window — the sails were set
 * before the start (ADR 0010).
 */
function EntryCard({
  at,
  onChangeTime,
  children,
}: {
  at: number
  onChangeTime: (seconds: number) => void
  children: ReactNode
}): ReactElement {
  const inputId = `race-entry-${at}`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        padding: spacing(3),
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--text-accent)',
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-accent)',
          }}
        >
          {wallClockTime(wallClockStamp(at))}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {RACE_WINDOW_NUDGE_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onChangeTime(at + minutes * 60)}
              aria-label={`${minutes > 0 ? 'Later' : 'Earlier'} by ${Math.abs(minutes)} minutes`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                padding: '5px 7px',
                borderRadius: 4,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-elevated)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {minutes > 0 ? `+${minutes}` : minutes}
            </button>
          ))}
          <span style={{ fontSize: 8.5, color: 'var(--text-muted)', alignSelf: 'center' }}>min</span>
        </div>
      </div>

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
          Exact time, if you know it
        </label>
        <input
          id={inputId}
          type="datetime-local"
          value={wallClockInputValue(wallClockStamp(at))}
          step={60}
          onChange={(event) => {
            const parsed = wallClockSecondsFromInput(event.target.value)
            if (parsed !== null) onChangeTime(parsed)
          }}
          style={{
            alignSelf: 'flex-start',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            padding: '6px 8px',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {children}
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <span
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

function Chip({
  on,
  onPress,
  disabled = false,
  children,
}: {
  on: boolean
  onPress: () => void
  /**
   * The choice exists but cannot be made yet, which the Wind Band picker needs: a band is one of a
   * *Version's* bands, so with no Rig Tune Version chosen there is nothing it could name. Disabled and
   * still there, because a row that vanished would not say why (ADR 0014).
   */
  disabled?: boolean
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={on}
      style={{
        padding: '7px 10px',
        borderRadius: 999,
        border: `1px solid ${on ? 'var(--blue-500)' : 'var(--surface-border)'}`,
        background: on ? 'var(--blue-500)' : 'var(--surface-elevated)',
        color: on ? '#fff' : 'var(--text-secondary)',
        fontSize: 'var(--text-sm)',
        fontWeight: on ? 600 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Remove, and done.
 *
 * "Done with this one" only closes the editor — nothing is written by it, and nothing is written
 * until Save race (ADR 0013). It is there because a sailor who has finished an entry wants the chart
 * back, not because the entry needed committing.
 */
function EntryActions({
  onRemove,
  onDone,
}: {
  onRemove: () => void
  onDone: () => void
}): ReactElement {
  return (
    <div style={{ display: 'flex', gap: spacing(2) }}>
      <button
        type="button"
        onClick={onRemove}
        style={{
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid var(--surface-border)',
          background: 'var(--surface-elevated)',
          color: 'var(--wind-storm)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
        }}
      >
        Remove
      </button>
      <button
        type="button"
        onClick={onDone}
        style={{
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid var(--surface-border)',
          background: 'var(--surface-elevated)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
        }}
      >
        Done with this one
      </button>
    </div>
  )
}

/**
 * What Review says the sailor said, including when they said nothing.
 *
 * "Not recorded" is stated here in the same words the race's page will use, so Save is not the moment
 * a sailor discovers that a step they skipped was a step that mattered.
 */
function AnnotationSummary({
  sails,
  seaState,
}: {
  sails: readonly { at: number; text: string }[]
  seaState: readonly { at: number; text: string }[]
}): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      <SummaryList heading="Sails" entries={sails} missing="Sail plan not recorded" />
      <SummaryList heading="Sea state" entries={seaState} missing="Sea state not recorded" />
    </div>
  )
}

function SummaryList({
  heading,
  entries,
  missing,
}: {
  heading: string
  entries: readonly { at: number; text: string }[]
  missing: string
}): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <span
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {heading}
      </span>
      {entries.length === 0 ? (
        <span style={{ fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
          {missing}
        </span>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {entries.map((entry) => (
            <li
              key={entry.at}
              style={{ display: 'flex', gap: spacing(2), fontSize: 'var(--text-sm)' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                {wallClockTime(wallClockStamp(entry.at))}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{entry.text}</span>
            </li>
          ))}
        </ul>
      )}
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
