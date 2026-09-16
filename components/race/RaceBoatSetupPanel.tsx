'use client'

import { useRouter } from 'next/navigation'
import { useState, type CSSProperties, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { formatBandRange } from '@/lib/boat/rigTune'
import { spacing } from '@/lib/utils/design'
import { bandKeptFor, windBandFinding } from '@/services/races/boat-setup'
import type {
  BoatSetupVersionRef,
  CrossoverChartChoice,
  RaceBoatSetup,
  RaceBoatSetupChoices,
  RaceBoatSetupPointers,
  RigTuneChoice,
  UpdateRaceBoatSetupResult,
} from '@/types'

/**
 * Amending which Boat Setup Versions a race was sailed under, in place, on the race's own page.
 *
 * In place and with no change reason, which is the whole design. A pointer is the sailor's own answer
 * about their own boat, and this archive is being entered backwards — most of these will be filled in
 * long after the race was filed, by the one person who was aboard. ADR 0010 reserves a reason for a new
 * Version of an artifact; correcting which Version a race names is not that (ADR 0012).
 *
 * All five travel together on every save, because two of them are coupled. The Rig Tune Version and its
 * Wind Band are one answer in two columns — the composite key `races (rig_tune_version_id,
 * rig_tune_band_id)` checks the pair, so moving the Version has to let go of a band that belonged to the
 * old one in the same statement. And moving the Crossover Chart Version clears the Sail Configurations
 * named in the old vocabulary (ADR 0023), which is why that one asks first and says what it will cost.
 *
 * Only the count is confirmed, and it is confirmed *by number*: `amend_race_boat_setup` refuses unless
 * the number agreed to is the number actually standing, so a Configuration added between the reading and
 * the press cannot be swept away by an agreement made before it existed.
 *
 * A Client Component, because a Rig Tune change has to be able to drop the band before anything is sent,
 * and because the chart's confirmation is one screen in two states.
 *
 * The action arrives as a prop, matching `RaceDeletePanel` and the upload wizard: it keeps this an
 * injectable seam a Jest test can drive, and keeps the `'use server'` module out of this component's
 * import graph.
 */

interface RaceBoatSetupPanelProps {
  raceId: string
  /** What the Race holds now, as the page read it — the starting state of every field here. */
  setup: RaceBoatSetup
  /** Every Polar, Rig Tune and Instrument Calibration Version, or null where they could not be read. */
  choices: RaceBoatSetupChoices | null
  /** The Crossover Chart Versions, read with their vocabularies, or null. */
  charts: CrossoverChartChoice[] | null
  /** How many Sail Configurations this Race holds, which is what moving the chart Version costs. */
  sailEntryCount: number
  amendBoatSetup: (
    raceId: string,
    setup: RaceBoatSetupPointers,
    clearing: number
  ) => Promise<UpdateRaceBoatSetupResult>
}

export default function RaceBoatSetupPanel({
  raceId,
  setup,
  choices,
  charts,
  sailEntryCount,
  amendBoatSetup,
}: RaceBoatSetupPanelProps): ReactElement {
  const router = useRouter()

  const [polarId, setPolarId] = useState<string | null>(setup.polar?.version_id ?? null)
  const [chartId, setChartId] = useState<string | null>(setup.crossover_chart?.version_id ?? null)
  const [rigTuneId, setRigTuneId] = useState<string | null>(setup.rig_tune?.version_id ?? null)
  const [calibrationId, setCalibrationId] = useState<string | null>(
    setup.instrument_calibration?.version_id ?? null
  )
  const [bandId, setBandId] = useState<string | null>(setup.band?.band_id ?? null)

  /**
   * What the *Race* holds on the two coupled facts, as against what the sailor has chosen above.
   *
   * Held here rather than read off the props each render because `router.refresh()` is not instant. A
   * second press before the server's answer paints would otherwise re-offer the clearing the first press
   * already spent — and `amend_race_boat_setup` refuses a count that is no longer standing, so the sailor
   * would be told the save failed for a reason that is really the panel's own stale arithmetic.
   */
  const [heldChartId, setHeldChartId] = useState<string | null>(
    setup.crossover_chart?.version_id ?? null
  )
  const [heldSailEntries, setHeldSailEntries] = useState(sailEntryCount)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const rigTunes = choices?.rig_tune ?? []
  const chosenRigTune: RigTuneChoice | null =
    rigTunes.find((tune) => tune.version_id === rigTuneId) ?? null
  const chosenBand = chosenRigTune?.bands.find((band) => band.band_id === bandId) ?? null

  /** The chart pointer is moving, so the Configurations named in the old vocabulary have to go. */
  const chartMoving = chartId !== heldChartId
  const clearing = chartMoving ? heldSailEntries : 0

  /**
   * Moving the Rig Tune Version lets go of a band the new Version does not have.
   *
   * `bandKeptFor` keeps it where the new Version happens to hold the same band row and drops it
   * otherwise. The composite key refuses the pair either way; this is about not sending one.
   */
  function chooseRigTune(versionId: string | null): void {
    const next = rigTunes.find((tune) => tune.version_id === versionId) ?? null
    setRigTuneId(versionId)
    setBandId((current) => bandKeptFor(next, current))
  }

  /**
   * The band against the wind the recording logged, as a note and never a block.
   *
   * The same sentence the page states above, from the same figure, so pressing Save cannot make it
   * disagree with itself. It is a finding: the band is what the rig *was* set to (ADR 0009).
   */
  const bandNote = windBandFinding(chosenBand, setup.logged_tws_mean)

  async function onSave(): Promise<void> {
    setBusy(true)
    setMessage(null)
    setSaved(null)

    const result = await amendBoatSetup(
      raceId,
      {
        polar_version_id: polarId,
        crossover_chart_version_id: chartId,
        rig_tune_version_id: rigTuneId,
        instrument_calibration_version_id: calibrationId,
        rig_tune_band_id: bandId,
      },
      clearing
    )

    setBusy(false)

    if (!result.ok) {
      setMessage(result.message)
      return
    }

    // What the Race holds now, so a second press is measured against the amendment just made rather
    // than against the page as it was read.
    setHeldChartId(chartId)
    setHeldSailEntries(heldSailEntries - result.cleared_sail_entries)

    setSaved(
      result.cleared_sail_entries === 0
        ? 'Saved.'
        : `Saved. The Crossover Chart Version moved, so ${result.cleared_sail_entries} Sail ` +
            `${result.cleared_sail_entries === 1 ? 'Configuration' : 'Configurations'} named in the ` +
            'old Version’s words were taken off. Place them again from the race’s own page.'
    )
    // The page reads its Boat Setup on the server, so the new pointers arrive by re-rendering it.
    router.refresh()
  }

  return (
    <section style={PANEL_STYLE} data-testid="race-boat-setup-panel">
      <div style={EYEBROW_STYLE}>Boat Setup</div>

      {/*
        Either read failing closes the whole panel, not just the pickers it fed. An empty picker draws
        "None to name", which states that the boat has no Versions of that kind — and offering four
        honest answers beside one invented one is worse than offering none, because Save sends all five
        together and would write the invented one down.
      */}
      {choices === null || charts === null ? (
        <p style={BODY_STYLE}>
          The boat’s Boat Setup Versions could not be read just now, so there is nothing here to name.
          What this race already records is stated above and is unchanged.
        </p>
      ) : (
        <>
          <p style={BODY_STYLE}>
            Which Versions the boat was on for this race. Change any of them, or set one back to not
            recorded — there is no reason to give and nothing is stamped.
          </p>

          <VersionChoice
            label="Polar"
            versions={choices.polar}
            chosen={polarId}
            onChoose={setPolarId}
          />

          <VersionChoice
            label="Crossover Chart"
            versions={charts.map(
              (chart): BoatSetupVersionRef => ({
                version_id: chart.version_id,
                version_number: chart.version_number,
                effective_from: chart.effective_from,
              })
            )}
            chosen={chartId}
            onChoose={setChartId}
          />

          {chartMoving && heldSailEntries > 0 && (
            <p data-testid="race-boat-setup-clearing" style={WARNING_STYLE}>
              {`A sail is named in one Crossover Chart Version’s own words, so saving this takes off ` +
                `${heldSailEntries} Sail ` +
                `${heldSailEntries === 1 ? 'Configuration' : 'Configurations'}. ` +
                'They cannot be moved across — place them again in the new Version’s words.'}
            </p>
          )}

          <VersionChoice
            label="Rig Tune"
            versions={rigTunes}
            chosen={rigTuneId}
            onChoose={chooseRigTune}
          />

          <BandChoice rigTune={chosenRigTune} chosen={bandId} onChoose={setBandId} />

          <VersionChoice
            label="Instrument Calibration"
            versions={choices.instrument_calibration}
            chosen={calibrationId}
            onChoose={setCalibrationId}
          />

          {bandNote !== null && (
            <p data-testid="race-boat-setup-band-note" style={NOTE_STYLE}>
              {bandNote.message}
            </p>
          )}

          <div style={ACTIONS_STYLE}>
            <button
              type="button"
              data-testid="race-boat-setup-save"
              disabled={busy}
              onClick={() => void onSave()}
              style={SAVE_STYLE}
            >
              {busy ? 'Saving…' : 'Save Boat Setup'}
            </button>
          </div>
        </>
      )}

      {saved !== null && (
        <p data-testid="race-boat-setup-saved" role="status" style={BODY_STYLE}>
          {saved}
        </p>
      )}

      {message !== null && (
        <p data-testid="race-boat-setup-error" role="alert" style={ERROR_STYLE}>
          {message}
        </p>
      )}
    </section>
  )
}

/**
 * One pointer, as every Version plus "Not recorded".
 *
 * Newest first, each stating the day it came into force, because which one the sailor wants is decided by
 * *when the race was* — and for an archive entered backwards that is usually not the newest.
 *
 * "Not recorded" is a chip rather than an absence, because it is a real answer, it is the state of the
 * oldest races here, and a sailor who pressed a Version by mistake has to be able to get back to it.
 */
function VersionChoice({
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
  return (
    <fieldset style={FIELD_STYLE}>
      <legend style={LEGEND_STYLE}>{label}</legend>
      {versions.length === 0 ? (
        <span style={{ fontSize: 'var(--text-sm)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
          None to name
        </span>
      ) : (
        <div style={CHIPS_STYLE}>
          {versions.map((version) => (
            <Chip
              key={version.version_id}
              on={version.version_id === chosen}
              onPress={() => onChoose(version.version_id)}
            >
              {`v${version.version_number}`}
            </Chip>
          ))}
          <Chip on={chosen === null} onPress={() => onChoose(null)}>
            Not recorded
          </Chip>
        </div>
      )}
    </fieldset>
  )
}

/**
 * Which Wind Band the rig was set to, offering that Rig Tune Version's bands and nothing else.
 *
 * Disabled rather than hidden while there is no Rig Tune Version: a band is one row of one Version's band
 * table and bands never travel between Versions (ADR 0007), so with no Version there is nothing it could
 * name — and a row that vanished would not say why.
 */
function BandChoice({
  rigTune,
  chosen,
  onChoose,
}: {
  rigTune: RigTuneChoice | null
  chosen: string | null
  onChoose: (bandId: string | null) => void
}): ReactElement {
  return (
    <fieldset style={FIELD_STYLE} data-testid="race-boat-setup-band">
      <legend style={LEGEND_STYLE}>Wind Band</legend>
      {rigTune === null ? (
        <div style={CHIPS_STYLE}>
          <Chip on={false} disabled onPress={() => undefined}>
            Pick a Rig Tune Version first
          </Chip>
        </div>
      ) : (
        <div style={CHIPS_STYLE}>
          {rigTune.bands.map((band) => (
            <Chip
              key={band.band_id}
              on={band.band_id === chosen}
              onPress={() => onChoose(band.band_id)}
            >
              {band.label === null
                ? formatBandRange(band.low_kt, band.high_kt)
                : `${band.label} · ${formatBandRange(band.low_kt, band.high_kt)}`}
            </Chip>
          ))}
          <Chip on={chosen === null} onPress={() => onChoose(null)}>
            Not recorded
          </Chip>
        </div>
      )}
    </fieldset>
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
  disabled?: boolean
  children: string
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
        color: on ? 'var(--text-inverse)' : 'var(--text-secondary)',
        fontSize: 'var(--text-sm)',
        fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

const PANEL_STYLE: CSSProperties = {
  padding: spacing(4),
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
}

const BODY_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const FIELD_STYLE: CSSProperties = {
  margin: `${spacing(3)} 0 0`,
  padding: 0,
  border: 'none',
}

const LEGEND_STYLE: CSSProperties = {
  padding: 0,
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
}

const CHIPS_STYLE: CSSProperties = {
  display: 'flex',
  // Wraps at 390px rather than scrolling a row of chips out of reach.
  flexWrap: 'wrap',
  gap: 6,
  marginTop: spacing(1),
}

const NOTE_STYLE: CSSProperties = {
  margin: `${spacing(3)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
}

/** Amber, not storm: saving this loses Sail Configurations, and that is a cost rather than a refusal. */
const WARNING_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--wind-heavy)',
}

const SAVE_STYLE: CSSProperties = {
  // A thumb's worth of height, like every other action in the app.
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-inverse)',
  background: 'var(--blue-500)',
  border: '1px solid var(--blue-500)',
  borderRadius: 'var(--btn-primary-radius)',
  cursor: 'pointer',
}

const ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing(3),
  marginTop: spacing(4),
}

const ERROR_STYLE: CSSProperties = {
  margin: `${spacing(3)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--wind-storm)',
}
