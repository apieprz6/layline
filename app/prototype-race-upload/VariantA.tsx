'use client'

/**
 * VARIANT A — the wizard, corrected, and now built around a persistent chart
 * stack rather than a single speed trace.
 *
 * Two changes from the first pass, both from review:
 *
 * 1. The charts are a GPS track map plus one swappable channel (SOG / TWS / TWA
 *    / AWA), cropped by a single shared window. Scrubbing the map's rail and
 *    dragging the chart's handles are the same state, so they cannot disagree.
 *    The map earns the top slot because a window is a *place* before it is a pair
 *    of times: the moment the boat stops racing and motors home is obvious on a
 *    track and nearly invisible on a speed line.
 *
 * 2. The stack stays mounted for the whole wizard, and the annotations placed on
 *    earlier steps stay drawn on it. Only the permissions change per step — on
 *    the sails step you place sail changes and the window is fixed; on the sea
 *    step the sail markers go read-only. So the sailor answers each question
 *    against the same picture, and can see what they have already said without
 *    going back.
 *
 * Everything the mockup got wrong is still corrected: no Venue field, qtVlm CSV
 * only in the copy, nothing pre-selected in the sail and sea-state steps, four
 * Version pickers rather than five (ADR 0012), the Wind Band gated behind a Rig
 * Tune choice (ADR 0007), and a duplicate content hash as a confirmation rather
 * than a refusal (ADR 0009 + ADR 0010).
 */

import { useState } from 'react'
import ChartStack, { type StackMode } from './ChartStack'
import {
  BoatSetupPickers,
  Button,
  Card,
  Label,
  Note,
  QualityReadout,
  RecordingPicker,
  ReefPicker,
  SailPicker,
  SeaStatePicker,
  StateDump,
  TimeInput,
  TitleInput,
} from './atoms'
import {
  ALREADY_LOGGED,
  costMeter,
  draftFromFixture,
  emptyDraft,
  fmtClock,
  fmtWindow,
  isSubmittable,
  mintId,
  msToInput,
  naiveMs,
  nearestIndex,
  rowMs,
  sailEntryRefusals,
  seaStateRefusals,
  windowRefusals,
  type ChannelKey,
  type ChartMarker,
  type Draft,
  type Fixture,
} from './shared'

const STEPS = ['File', 'Window', 'Sails', 'Sea state', 'Review'] as const

export default function VariantA() {
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [step, setStep] = useState(0)
  const [channel, setChannel] = useState<ChannelKey>('sog')
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [confirmDuplicate, setConfirmDuplicate] = useState<Fixture | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const f = draft.fixture

  const pick = (fixture: Fixture) => {
    // ADR 0009: a second Race from the same file is normal (ADR 0010), so a
    // duplicate content hash confirms and never refuses.
    if (ALREADY_LOGGED[fixture.filename]) {
      setConfirmDuplicate(fixture)
      return
    }
    // RecordingPicker already counts the tap; counting it here too inflated the
    // measurement by one.
    setDraft(draftFromFixture(fixture))
    setStep(1)
  }

  const restart = () => {
    costMeter.reset()
    setDraft(emptyDraft())
    setStep(0)
    setSelected(null)
    setSubmitted(false)
  }

  if (submitted) {
    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <StateDump draft={draft} onAgain={restart} />
      </div>
    )
  }

  const windowBlocked = windowRefusals(f, draft.windowStart, draft.windowFinish).length > 0
  const sailErrors = sailEntryRefusals(draft.sails)
  const seaErrors = seaStateRefusals(draft.seaState)
  const canAdvance =
    step === 0
      ? f !== null
      : step === 1
        ? !windowBlocked
        : step === 2
          ? Object.keys(sailErrors).length === 0
          : step === 3
            ? Object.keys(seaErrors).length === 0
            : true

  const mode: StackMode = step === 1 ? 'window' : step === 2 ? 'sail' : step === 3 ? 'sea' : 'readonly'

  /**
   * Every annotation stays on the chart for the rest of the flow. `locked` is
   * what the step decides, not visibility — you can always see what you said.
   */
  const markers: ChartMarker[] = f
    ? [
        ...draft.sails.map((e) => ({
          id: e.id,
          at: e.at,
          lane: 'sail' as const,
          label: e.sails.length > 0 ? e.sails.join('+') : '?',
          selected: selected === e.id,
          incomplete: e.sails.length === 0 || e.reef === null,
          locked: mode !== 'sail',
        })),
        ...draft.seaState.map((e) => ({
          id: e.id,
          at: e.at,
          lane: 'sea' as const,
          label: e.state,
          selected: selected === e.id,
          locked: mode !== 'sea',
        })),
      ]
    : []

  /**
   * Taps land on a row that actually exists rather than between two of them, and
   * step off a time already taken so two entries never collide by accident.
   */
  const snap = (at: string, taken: string[]): string => {
    if (!f) return at
    let i = nearestIndex(f, naiveMs(at))
    if (i < 0) return at
    const last = f.series.sec.length - 1
    while (i <= last && taken.includes(msToInput(rowMs(f, i)))) i += 1
    return msToInput(rowMs(f, Math.min(i, last)))
  }

  const placeMarker = (at: string) => {
    if (!f) return
    costMeter.bump()
    const lane = mode === 'sail' ? draft.sails : mode === 'sea' ? draft.seaState : []
    const snapped = snap(at, lane.map((e) => e.at))
    const id = mintId()
    if (mode === 'sail') {
      // Carry the previous plan forward: a change alters one sail, not all of
      // them, so seven changes is not seven full sail plans.
      const prev = [...draft.sails]
        .sort((a, b) => naiveMs(a.at) - naiveMs(b.at))
        .filter((e) => naiveMs(e.at) <= naiveMs(snapped))
        .pop()
      patch({ sails: [...draft.sails, { id, at: snapped, reef: prev?.reef ?? null, sails: prev ? [...prev.sails] : [] }] })
    } else if (mode === 'sea') {
      patch({ seaState: [...draft.seaState, { id, at: snapped, state: 'slight' }] })
    } else {
      return
    }
    setSelected(id)
  }

  const nudge = (minutes: number) => {
    if (!selected) return
    costMeter.bump()
    patch({
      sails: draft.sails.map((e) => (e.id === selected ? { ...e, at: msToInput(naiveMs(e.at) + minutes * 60_000) } : e)),
      seaState: draft.seaState.map((e) => (e.id === selected ? { ...e, at: msToInput(naiveMs(e.at) + minutes * 60_000) } : e)),
    })
  }

  const selSail = draft.sails.find((e) => e.id === selected) ?? null
  const selSea = draft.seaState.find((e) => e.id === selected) ?? null
  const cursorAt = selSail?.at ?? selSea?.at ?? null

  return (
    <div
      // Capped so an ultrawide gives the charts room without stretching the form
      // to the width of a desk.
      className="lg:max-w-[1480px] lg:mx-auto"
      style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 98 }}
    >
      <Stepper step={step} />

      {/* One stack, every step from Window onward. Nothing is remounted, so the
          channel choice and the scroll position survive the step change. */}
      {f && step >= 1 && (
        <ChartStack
          fixture={f}
          channel={channel}
          onChannelChange={setChannel}
          windowStart={draft.windowStart}
          windowFinish={draft.windowFinish}
          onWindowChange={(s, fi) => {
            costMeter.bump()
            patch({ windowStart: s, windowFinish: fi })
          }}
          mode={mode}
          markers={markers}
          onTapTime={placeMarker}
          onMarkerTap={(id) => {
            costMeter.bump()
            setSelected(id)
          }}
          cursorAt={cursorAt}
          compact={step === 4}
        />
      )}

      {step === 0 && (
        <>
          <Header title="Which recording?" sub="A qtVlm VDR export. Nothing else is read — GPX and raw NMEA are not accepted." />
          {confirmDuplicate ? (
            <Note tone="warn" title="This file is already in the archive">
              <div style={{ marginBottom: 8 }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{confirmDuplicate.filename}</code> was
                uploaded before and is logged as “{ALREADY_LOGGED[confirmDuplicate.filename]}”. One recording can hold
                more than one race, so this is allowed — you will get a second race over the same transcription.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  onClick={() => {
                    costMeter.bump()
                    setDraft(draftFromFixture(confirmDuplicate))
                    setConfirmDuplicate(null)
                    setStep(1)
                  }}
                >
                  Log a second race from it
                </Button>
                <Button kind="ghost" onClick={() => setConfirmDuplicate(null)}>
                  Pick another
                </Button>
              </div>
            </Note>
          ) : (
            <RecordingPicker onPick={pick} />
          )}
        </>
      )}

      {step === 1 && f && (
        <>
          <Header
            title="When did the race run?"
            sub="Drag either scrubber — they are the same window. Prefilled from the file's own extent; the race is almost never the whole recording."
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <TimeInput label="Start" value={draft.windowStart} onChange={(v) => patch({ windowStart: v })} />
            <TimeInput label="Finish" value={draft.windowFinish} onChange={(v) => patch({ windowFinish: v })} />
          </div>
          <QualityReadout fixture={f} start={draft.windowStart} finish={draft.windowFinish} />
        </>
      )}

      {step === 2 && f && (
        <>
          <Header
            title="What was up, and when?"
            sub="Tap the track where it happened — the time comes from the recording, not from a keypad. Leave it empty if nobody wrote it down."
          />
          {draft.sails.length === 0 && (
            <Note tone="quiet">
              No sail changes recorded. The race is still savable; its page will say the sail plan was not recorded.
            </Note>
          )}
          {/* The chart is the fast path, not the only one — a tap on a phone in a
              car park is not always available. */}
          <Button kind="quiet" onClick={() => placeMarker(draft.windowStart)}>
            + Add one by time instead
          </Button>

          {selSail && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
                  {fmtClock(selSail.at)}
                </span>
                <Nudge onNudge={nudge} />
              </div>
              <Label>Sails up</Label>
              <SailPicker
                selected={selSail.sails}
                onToggle={(k) =>
                  patch({
                    sails: draft.sails.map((x) =>
                      x.id === selSail.id
                        ? { ...x, sails: x.sails.includes(k) ? x.sails.filter((s) => s !== k) : [...x.sails, k] }
                        : x,
                    ),
                  })
                }
              />
              <div style={{ height: 9 }} />
              <Label>Mainsail</Label>
              <ReefPicker
                value={selSail.reef}
                onChange={(v) => patch({ sails: draft.sails.map((x) => (x.id === selSail.id ? { ...x, reef: v } : x)) })}
              />
              <div style={{ height: 9 }} />
              <TimeInput
                label="Exact time, if you know it"
                value={selSail.at}
                onChange={(v) => patch({ sails: draft.sails.map((x) => (x.id === selSail.id ? { ...x, at: v } : x)) })}
              />
              {sailErrors[selSail.id] && (
                <div style={{ marginTop: 8 }}>
                  <Note tone="stop">{sailErrors[selSail.id]}</Note>
                </div>
              )}
              <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patch({ sails: draft.sails.filter((x) => x.id !== selSail.id) })
                    setSelected(null)
                  }}
                >
                  Remove
                </Button>
                <Button kind="ghost" onClick={() => setSelected(null)}>
                  Done with this one
                </Button>
              </div>
            </Card>
          )}

          <EntryList
            rows={[...draft.sails]
              .sort((a, b) => naiveMs(a.at) - naiveMs(b.at))
              .map((e) => ({
                id: e.id,
                at: e.at,
                text:
                  e.sails.length === 0
                    ? 'no sails named'
                    : e.sails.join(' + ') + (e.reef === 'reef-1' ? ' · reefed' : e.reef === null ? ' · main not stated' : ''),
                bad: Boolean(sailErrors[e.id]),
              }))}
            selected={selected}
            onSelect={(id) => {
              costMeter.bump()
              setSelected(id)
            }}
          />
        </>
      )}

      {step === 3 && f && (
        <>
          <Header
            title="What was the water doing?"
            sub="Same gesture. The sail changes stay on the chart so you can place sea state against them, but they are locked here."
          />
          <Button kind="quiet" onClick={() => placeMarker(draft.windowStart)}>
            + Add one by time instead
          </Button>
          {selSea && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
                  {fmtClock(selSea.at)}
                </span>
                <Nudge onNudge={nudge} />
              </div>
              <SeaStatePicker
                value={selSea.state}
                onChange={(v) =>
                  patch({ seaState: draft.seaState.map((x) => (x.id === selSea.id ? { ...x, state: v } : x)) })
                }
              />
              <div style={{ height: 9 }} />
              <TimeInput
                label="Exact time, if you know it"
                value={selSea.at}
                onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === selSea.id ? { ...x, at: v } : x)) })}
              />
              {seaErrors[selSea.id] && (
                <div style={{ marginTop: 8 }}>
                  <Note tone="stop">{seaErrors[selSea.id]}</Note>
                </div>
              )}
              <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patch({ seaState: draft.seaState.filter((x) => x.id !== selSea.id) })
                    setSelected(null)
                  }}
                >
                  Remove
                </Button>
                <Button kind="ghost" onClick={() => setSelected(null)}>
                  Done with this one
                </Button>
              </div>
            </Card>
          )}

          <EntryList
            rows={[...draft.seaState]
              .sort((a, b) => naiveMs(a.at) - naiveMs(b.at))
              .map((e) => ({ id: e.id, at: e.at, text: e.state, bad: Boolean(seaErrors[e.id]) }))}
            selected={selected}
            onSelect={(id) => {
              costMeter.bump()
              setSelected(id)
            }}
          />
        </>
      )}

      {step === 4 && f && (
        <>
          <Header title="Anything else you know?" sub="All optional. Nothing here is guessed for you." />
          <Card>
            <TitleInput value={draft.title} onChange={(v) => patch({ title: v })} />
          </Card>
          <Card>
            <Label>How the boat was set up</Label>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 9, lineHeight: 1.4 }}>
              Not defaulted to the current version — a wrong pointer is worse than none.
            </div>
            <BoatSetupPickers draft={draft} patch={patch} />
          </Card>
          <Card>
            <Label>Summary</Label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {fmtWindow(draft.windowStart, draft.windowFinish)}
              <br />
              {draft.sails.length} sail {draft.sails.length === 1 ? 'entry' : 'entries'}
              {draft.sails.length > 0 && ` (first at ${fmtClock(draft.sails[0].at)})`}, {draft.seaState.length} sea state{' '}
              {draft.seaState.length === 1 ? 'entry' : 'entries'}
            </div>
          </Card>
          <QualityReadout fixture={f} start={draft.windowStart} finish={draft.windowFinish} terse />
        </>
      )}

      <FooterNav
        step={step}
        canAdvance={canAdvance}
        onBack={() => {
          setSelected(null)
          setStep((s) => Math.max(0, s - 1))
        }}
        onNext={() => {
          costMeter.bump()
          setSelected(null)
          setStep((s) => Math.min(STEPS.length - 1, s + 1))
        }}
        onSubmit={() => {
          costMeter.bump()
          setSubmitted(true)
        }}
        submittable={isSubmittable(draft)}
      />
    </div>
  )
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>{sub}</p>
    </div>
  )
}

/** The entries as a list, so the chart is not the only way to reach one. */
function EntryList({
  rows,
  selected,
  onSelect,
}: {
  rows: { id: string; at: string; text: string; bad: boolean }[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '7px 10px',
            borderRadius: 6,
            border: `1px solid ${r.bad ? 'rgba(204,17,0,0.30)' : selected === r.id ? 'var(--blue-500)' : 'var(--surface-border)'}`,
            background: selected === r.id ? 'var(--blue-muted)' : 'var(--surface-raised)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{fmtClock(r.at)}</span>
          <span style={{ flex: 1, fontSize: 11.5, color: r.bad ? 'var(--state-danger)' : 'var(--text-secondary)' }}>{r.text}</span>
        </button>
      ))}
    </div>
  )
}

/** Snapping lands on a real row; this is how you get between two of them. */
function Nudge({ onNudge }: { onNudge: (m: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[-5, -1, 1, 5].map((m) => (
        <button
          key={m}
          onClick={() => onNudge(m)}
          style={{
            padding: '4px 7px',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            borderRadius: 4,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface-raised)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {m > 0 ? `+${m}` : m}
        </button>
      ))}
      <span style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>min</span>
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: 3, borderRadius: 2, background: i <= step ? 'var(--blue-500)' : 'var(--surface-border)' }} />
          <div
            style={{
              fontSize: 8.5,
              marginTop: 4,
              color: i === step ? 'var(--text-accent)' : 'var(--text-muted)',
              fontWeight: i === step ? 700 : 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {s}
          </div>
        </div>
      ))}
    </div>
  )
}

function FooterNav({
  step,
  canAdvance,
  onBack,
  onNext,
  onSubmit,
  submittable,
}: {
  step: number
  canAdvance: boolean
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  submittable: boolean
}) {
  const last = step === STEPS.length - 1
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 44,
        padding: '10px 14px',
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--surface-border)',
        display: 'flex',
        gap: 8,
        maxWidth: 430,
        margin: '0 auto',
      }}
    >
      <Button kind="ghost" onClick={onBack} disabled={step === 0}>
        Back
      </Button>
      <div style={{ flex: 1 }}>
        {last ? (
          <Button full onClick={onSubmit} disabled={!submittable}>
            Save race
          </Button>
        ) : (
          <Button full onClick={onNext} disabled={!canAdvance}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
