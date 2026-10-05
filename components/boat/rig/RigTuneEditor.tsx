'use client'

import { useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import {
  correctRigTuneVersion,
  saveRigTuneVersion,
} from '@/app/(app)/boat-management/rig-tune/actions'
import {
  SHROUD_ORDER,
  SHROUD_SIDES,
  SIDE_LABEL,
  buildDraftShrouds,
  draftFromVersion,
  formatBandRange,
  newBandDraft,
} from '@/lib/boat/rigTune'
import { spacing } from '@/lib/utils/design'
import type {
  RigTuneBandDraft,
  RigTuneDraft,
  RigTuneProblem,
  RigTuneSideDraft,
  RigTuneVersionRecord,
  ShroudPosition,
  ShroudSide,
} from '@/types'

/**
 * `record` mints a new Version out of the one in force; `correct` fixes a Version in place
 * (ADR 0031). One component for both, as `CalibrationVersionForm` is, so that a correction can
 * never hold a field a new Version lacks, and the table rules bind both by construction.
 */
type RigTuneEditorProps =
  | {
      mode: 'record'
      /** The Version in force, which a new one is edited out of. Null when nothing is recorded. */
      version: RigTuneVersionRecord | null
    }
  | {
      mode: 'correct'
      /** The Version being corrected, which may be a past one. */
      version: RigTuneVersionRecord
      /** How many Races point at it, which the consequence copy names before the save. */
      raceCount: number
    }

/** Half a turn, the finest a turnbuckle is set to by hand (ADR 0007). */
const TURN_STEP = 0.5

const LABEL_STYLE: CSSProperties = { ...EYEBROW_STYLE, display: 'block' }

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--input-fg)',
  background: 'var(--surface-base)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--input-radius)',
  padding: '8px 10px',
}

const TEXT_INPUT_STYLE: CSSProperties = { ...INPUT_STYLE, fontFamily: 'var(--font-body)' }

const BUTTON_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-medium)',
  padding: '8px 14px',
  cursor: 'pointer',
}

const GHOST_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  background: 'var(--btn-ghost-bg)',
  border: '1px solid var(--btn-ghost-border)',
  borderRadius: 'var(--btn-primary-radius)',
  color: 'var(--btn-ghost-fg)',
}

const STEPPER_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  minWidth: '32px',
  padding: '6px 0',
  background: 'var(--btn-ghost-bg)',
  border: '1px solid var(--btn-ghost-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--btn-ghost-fg)',
  cursor: 'pointer',
}

/** What a band is called in a field's label, so twelve figures a band stay distinguishable. */
function bandName(band: RigTuneBandDraft, index: number): string {
  if (band.label.trim() !== '') return band.label.trim()
  if (band.low_kt.trim() !== '') {
    return formatBandRange(Number(band.low_kt), band.high_kt.trim() === '' ? null : Number(band.high_kt))
  }
  return `Band ${index + 1}`
}

/**
 * The admin's Rig Tune form: the whole band table, typed.
 *
 * A form and not an attachment — a Rig Tune has no file behind it (ADR 0007) — and one form
 * for the whole table, because a **Version is the whole table**: every band, its edges, which
 * band is the Base Tune, and all twelve figures a band. There is no per-band save and nothing
 * is kept as a draft, so the dirty state is table-wide and Save is dead until something
 * actually changed, which is what stops opening the form from minting a Version.
 *
 * There is deliberately no "Match sides": copying port onto starboard asserts port is the
 * truth, and a rig is measured side by side. Both sides are typed.
 *
 * Validation lives in `lib/boat/rigTune.ts` and runs again inside the Server Action, which is
 * where the refusals shown here come from — the client never decides a table is writable.
 *
 * In `correct` mode the same form fixes a Version in place for a recording mistake (ADR 0031):
 * it opens on that Version's own date and reason, every recorded band goes back under its row
 * id so a Race set to it still is, and each non-base band's stale flag becomes the sailor's to
 * state, because a correction does not run the staleness rule.
 */
export default function RigTuneEditor(props: RigTuneEditorProps): ReactElement {
  const { mode, version } = props
  const correcting = mode === 'correct'
  // Both editors can be open on the Version in force at once, so every id and the Base Tune
  // radio group are namespaced by mode rather than shared.
  const prefix = correcting ? 'rig-correct' : 'rig'

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [problems, setProblems] = useState<RigTuneProblem[]>([])
  const [initial, setInitial] = useState<RigTuneDraft>(() => draftFromVersion(version, mode))
  const [draft, setDraft] = useState<RigTuneDraft>(initial)

  // A whole-object diff, because the unit of change is the table (ADR 0007). The draft holds
  // only strings, booleans and numbers, so comparing its serialisation is the honest test.
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  function reopen(): void {
    const fresh = draftFromVersion(version, mode)
    setInitial(fresh)
    setDraft(fresh)
    setProblems([])
    setMessage(null)
  }

  function editBand(key: string, change: (band: RigTuneBandDraft) => RigTuneBandDraft): void {
    setDraft((was) => ({
      ...was,
      bands: was.bands.map((band) => (band.key === key ? change(band) : band)),
    }))
  }

  function setSide(
    key: string,
    position: ShroudPosition,
    side: ShroudSide,
    change: (typed: RigTuneSideDraft) => RigTuneSideDraft
  ): void {
    editBand(key, (band) => ({
      ...band,
      shrouds: {
        ...band.shrouds,
        [position]: { ...band.shrouds[position], [side]: change(band.shrouds[position][side]) },
      },
    }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    setSaving(true)
    setMessage(null)
    setProblems([])
    const result = props.mode === 'correct'
      ? await correctRigTuneVersion(props.version.id, draft)
      : await saveRigTuneVersion(draft)
    setSaving(false)

    if (result.ok) {
      // The screen is revalidated on the server, so the new Version arrives as the one in
      // force — or the corrected one arrives as itself — and the form closes onto it.
      setOpen(false)
      reopen()
      return
    }

    // Refusals sit beside the bands that caused them, and everything typed stays.
    setMessage(result.message)
    setProblems(result.problems)
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            reopen()
            setOpen(true)
          }}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-primary-bg)',
            border: '1px solid var(--btn-primary-bg)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-primary-fg)',
          }}
        >
          {correcting ? `Correct v${version?.version_number} in place` : 'Record a new Version'}
        </button>
      </div>
    )
  }

  const tableProblems = problems.filter((problem) => problem.band_key === null)

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing(4) }}
    >
      {dirty && (
        <p
          data-testid="rig-tune-dirty-banner"
          role="status"
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--wind-medium)',
            borderRadius: 'var(--radius-md)',
            padding: spacing(3),
          }}
        >
          {correcting
            ? `Unsaved corrections to v${version?.version_number}. Saving changes this Version itself.`
            : 'Unsaved changes to this Rig Tune. Saving records the whole table as one new Version.'}
        </p>
      )}

      {props.mode === 'correct' && (
        <p
          data-testid="correction-consequence"
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--wind-heavy)',
          }}
        >
          {correctionConsequence(props.version.version_number, props.raceCount)}
        </p>
      )}

      <div>
        <label htmlFor={`${prefix}-effective-from`} style={LABEL_STYLE}>
          Took effect
        </label>
        <input
          id={`${prefix}-effective-from`}
          type="date"
          value={draft.effective_from}
          onChange={(event) => setDraft({ ...draft, effective_from: event.target.value })}
          style={INPUT_STYLE}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-change-reason`} style={LABEL_STYLE}>
          Why this Version exists
        </label>
        <textarea
          id={`${prefix}-change-reason`}
          rows={2}
          value={draft.change_reason}
          onChange={(event) => setDraft({ ...draft, change_reason: event.target.value })}
          style={{ ...TEXT_INPUT_STYLE, resize: 'vertical' }}
        />
      </div>

      {draft.bands.map((band, index) => {
        const name = bandName(band, index)
        const bandProblems = problems.filter((problem) => problem.band_key === band.key)

        return (
          <div
            key={band.key}
            data-testid="rig-tune-band-fields"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing(3),
              background: 'var(--surface-elevated)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-md)',
              padding: spacing(3),
            }}
          >
            <div style={{ display: 'flex', gap: spacing(2) }}>
              <div style={{ flex: 1 }}>
                <label htmlFor={`${prefix}-${band.key}-low`} style={LABEL_STYLE}>
                  Starts at (kt)
                </label>
                <input
                  id={`${prefix}-${band.key}-low`}
                  inputMode="decimal"
                  value={band.low_kt}
                  onChange={(event) =>
                    editBand(band.key, (was) => ({ ...was, low_kt: event.target.value }))
                  }
                  style={INPUT_STYLE}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor={`${prefix}-${band.key}-high`} style={LABEL_STYLE}>
                  Up to (kt)
                </label>
                <input
                  id={`${prefix}-${band.key}-high`}
                  inputMode="decimal"
                  placeholder="open"
                  value={band.high_kt}
                  onChange={(event) =>
                    editBand(band.key, (was) => ({ ...was, high_kt: event.target.value }))
                  }
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${prefix}-${band.key}-label`} style={LABEL_STYLE}>
                What the guide calls it
              </label>
              <input
                id={`${prefix}-${band.key}-label`}
                value={band.label}
                onChange={(event) =>
                  editBand(band.key, (was) => ({ ...was, label: event.target.value }))
                }
                style={TEXT_INPUT_STYLE}
              />
            </div>

            {/* A radio and not a checkbox: exactly one band is the Base Tune, and choosing
                one has to clear the last rather than leave two (ADR 0007). */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing(2),
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
              }}
            >
              <input
                type="radio"
                name={`${prefix}-base-band`}
                checked={band.is_base}
                onChange={() => setDraft((was) => rebaseOnto(was, band.key))}
              />
              Base Tune — the band the Turns are counted from
            </label>

            {SHROUD_ORDER.map((position) => (
              <div key={position}>
                <div style={EYEBROW_STYLE}>{position}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
                  {SHROUD_SIDES.map((side) => {
                    const where = `${name} ${position} ${side}`
                    const typed = band.shrouds[position][side]

                    return (
                      <div
                        key={side}
                        style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                            minWidth: '32px',
                          }}
                        >
                          {SIDE_LABEL[side]}
                        </span>
                        <input
                          aria-label={`${where} Turnbuckle Gap in mm`}
                          inputMode="decimal"
                          placeholder="mm"
                          value={typed.gap_mm}
                          onChange={(event) =>
                            setSide(band.key, position, side, (was) => ({
                              ...was,
                              gap_mm: event.target.value,
                            }))
                          }
                          style={{ ...INPUT_STYLE, flex: 1 }}
                        />
                        <button
                          type="button"
                          aria-label={`${where} half a turn slacker`}
                          onClick={() =>
                            setSide(band.key, position, side, (was) => ({
                              ...was,
                              turns_from_base: stepTurns(was.turns_from_base, -TURN_STEP),
                            }))
                          }
                          style={STEPPER_STYLE}
                        >
                          −½
                        </button>
                        <input
                          aria-label={`${where} Turns From Base`}
                          inputMode="decimal"
                          value={typed.turns_from_base}
                          onChange={(event) =>
                            setSide(band.key, position, side, (was) => ({
                              ...was,
                              turns_from_base: event.target.value,
                            }))
                          }
                          style={{ ...INPUT_STYLE, width: '64px', flex: 'none' }}
                        />
                        <button
                          type="button"
                          aria-label={`${where} half a turn tighter`}
                          onClick={() =>
                            setSide(band.key, position, side, (was) => ({
                              ...was,
                              turns_from_base: stepTurns(was.turns_from_base, TURN_STEP),
                            }))
                          }
                          style={STEPPER_STYLE}
                        >
                          +½
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div>
              <label htmlFor={`${prefix}-${band.key}-note`} style={LABEL_STYLE}>
                Note for this band
              </label>
              <input
                id={`${prefix}-${band.key}-note`}
                value={band.note}
                onChange={(event) =>
                  editBand(band.key, (was) => ({ ...was, note: event.target.value }))
                }
                style={TEXT_INPUT_STYLE}
              />
            </div>

            {/* The sailor's own statement, and only in a correction: a new Version's flags
                are decided by the mint rule, and a correction never recomputes them (ADR
                0031). Never on the Base Tune, which the others are stale against. */}
            {correcting && !band.is_base && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing(2),
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={band.gaps_stale}
                  onChange={(event) =>
                    editBand(band.key, (was) => ({ ...was, gaps_stale: event.target.checked }))
                  }
                />
                These Gaps are stale — measured against a Base Tune that has since been
                re-measured
              </label>
            )}

            {bandProblems.map((problem) => (
              <p key={problem.message} role="alert" style={PROBLEM_STYLE}>
                {problem.message}
              </p>
            ))}

            {draft.bands.length > 1 && (
              <button
                type="button"
                aria-label={`Remove this band, ${name}`}
                onClick={() =>
                  setDraft((was) => ({
                    ...was,
                    bands: was.bands.filter((other) => other.key !== band.key),
                  }))
                }
                style={{ ...GHOST_BUTTON_STYLE, alignSelf: 'flex-start' }}
              >
                Remove this band
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => setDraft((was) => ({ ...was, bands: [...was.bands, newBandDraft()] }))}
        style={{ ...GHOST_BUTTON_STYLE, alignSelf: 'flex-start' }}
      >
        Add a band
      </button>

      {message !== null && (
        <p role="alert" style={PROBLEM_STYLE}>
          {message}
        </p>
      )}

      {tableProblems.map((problem) => (
        <p key={problem.message} role="alert" style={PROBLEM_STYLE}>
          {problem.message}
        </p>
      ))}

      <div style={{ display: 'flex', gap: spacing(2), justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reopen()
          }}
          style={GHOST_BUTTON_STYLE}
        >
          Revert
        </button>
        <button
          type="submit"
          // Dead until the table differs from what is recorded, so opening the form cannot
          // mint a Version that says nothing (ADR 0007).
          disabled={saving || !dirty}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-primary-bg)',
            border: '1px solid var(--btn-primary-bg)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-primary-fg)',
            opacity: saving || !dirty ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving' : correcting ? 'Save the correction' : 'Save this Version'}
        </button>
      </div>
    </form>
  )
}

/**
 * What a correction costs, said before the save: the Races already sailed under this Version
 * keep pointing at it, so they will read the corrected table, and nothing records that the
 * table was ever otherwise (ADR 0031).
 */
function correctionConsequence(versionNumber: number, raceCount: number): string {
  const sailed =
    raceCount === 0
      ? 'No Race has been sailed under it yet'
      : `The ${raceCount} ${raceCount === 1 ? 'Race' : 'Races'} sailed under it will report against the corrected table`

  return `This changes v${versionNumber} itself rather than adding a Version. ${sailed} — so correct a recording mistake here, and record a new Version instead when the rig actually changed.`
}

const PROBLEM_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--wind-storm)',
}

/**
 * One half turn either way, kept on the half-turn grid.
 *
 * A stepper that started from something unparseable would have to invent a figure, so it
 * leaves the field alone instead and lets the validator refuse what was typed.
 */
function stepTurns(typed: string, by: number): string {
  const from = Number(typed.trim())
  if (typed.trim() === '' || !Number.isFinite(from)) return typed

  return String(Math.round((from + by) * 2) / 2)
}

/**
 * Move the Base Tune flag onto one band, and count every band off it.
 *
 * **Turns From Base** are signed against whichever band carries the flag, so moving it
 * without re-expressing them would leave every other band counted from a band that is no
 * longer the base — the same figures quietly meaning something else. Subtracting the new
 * base's own Turns is arithmetic inside one encoding: it needs no thread pitch, it leaves
 * every band set exactly where it was, and it leaves the **Gaps** alone, which are caliper
 * readings of a turnbuckle and relative to nothing (ADR 0007).
 *
 * A field that does not parse is left exactly as typed — there is nothing to subtract from
 * it, and the validator refuses it by name.
 */
function rebaseOnto(draft: RigTuneDraft, key: string): RigTuneDraft {
  const base = draft.bands.find((band) => band.key === key)
  if (base === undefined) return draft

  return {
    ...draft,
    bands: draft.bands.map((band) => ({
      ...band,
      is_base: band.key === key,
      shrouds: buildDraftShrouds((position, side) => ({
        ...band.shrouds[position][side],
        turns_from_base: turnsFrom(
          band.shrouds[position][side].turns_from_base,
          base.shrouds[position][side].turns_from_base
        ),
      })),
    })),
  }
}

/**
 * One band's Turns re-read against another band's.
 *
 * No rounding onto the half-turn grid: half turns subtract exactly, and a figure that is
 * somehow off the grid is not Layline's to tidy up.
 */
function turnsFrom(typed: string, base: string): string {
  const from = Number(typed.trim())
  const off = Number(base.trim())

  if (typed.trim() === '' || base.trim() === '') return typed
  if (!Number.isFinite(from) || !Number.isFinite(off)) return typed

  return String(from - off)
}
