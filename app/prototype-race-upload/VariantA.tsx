'use client'

/**
 * VARIANT A — the wizard, corrected.
 *
 * This is the Boat Management mockup's five-step flow with every defect LAY-94
 * found in it repaired: no Venue field, qtVlm CSV only in the copy, nothing
 * pre-selected in the sail and sea-state steps, four Version pickers rather than
 * five, the Wind Band present, and the duplicate-hash case a confirmation rather
 * than a refusal.
 *
 * The claim it makes: a race is a sequence of separate questions, so ask them one
 * at a time and never show the sailor a screen they cannot answer. The cost it
 * pays: seven sail changes means seven trips through the same sub-form, and the
 * window can only be judged against the trace on step 2.
 */

import { useState } from 'react'
import SogTrace, { TraceLegend } from './SogTrace'
import {
  Button,
  BoatSetupPickers,
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
  sailEntryRefusals,
  seaStateRefusals,
  windowRefusals,
  type Draft,
  type Fixture,
  type SailEntry,
  type SeaStateEntry,
} from './shared'

const STEPS = ['File', 'Window', 'Sails', 'Sea state', 'Review'] as const

export default function VariantA() {
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [step, setStep] = useState(0)
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
    setDraft(draftFromFixture(fixture))
    setStep(1)
  }

  const restart = () => {
    costMeter.reset()
    setDraft(emptyDraft())
    setStep(0)
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
    step === 0 ? f !== null : step === 1 ? !windowBlocked : step === 2 ? Object.keys(sailErrors).length === 0 : step === 3 ? Object.keys(seaErrors).length === 0 : true

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 88 }}>
      <Stepper step={step} />

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
            sub="Prefilled from the file's own extent. The race is almost never the whole recording."
          />
          <Card>
            <SogTrace
              fixture={f}
              windowStart={draft.windowStart}
              windowFinish={draft.windowFinish}
              onWindowChange={(s, fi) => {
                costMeter.bump()
                patch({ windowStart: s, windowFinish: fi })
              }}
            />
            <TraceLegend />
          </Card>
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
            sub="One entry per change. Leave it empty if nobody wrote it down — an empty list is an honest answer."
          />
          {draft.sails.length === 0 && (
            <Note tone="quiet">
              No sail changes recorded. The race is still savable; its page will say the sail plan was not recorded.
            </Note>
          )}
          {draft.sails.map((e, i) => (
            <Card key={e.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Change {i + 1}
                </span>
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patch({ sails: draft.sails.filter((x) => x.id !== e.id) })
                  }}
                >
                  Remove
                </Button>
              </div>
              <TimeInput
                label="At"
                value={e.at}
                onChange={(v) => patch({ sails: draft.sails.map((x) => (x.id === e.id ? { ...x, at: v } : x)) })}
              />
              <div style={{ height: 9 }} />
              <Label>Sails up</Label>
              <SailPicker
                selected={e.sails}
                onToggle={(k) =>
                  patch({
                    sails: draft.sails.map((x) =>
                      x.id === e.id
                        ? { ...x, sails: x.sails.includes(k) ? x.sails.filter((s) => s !== k) : [...x.sails, k] }
                        : x,
                    ),
                  })
                }
              />
              <div style={{ height: 9 }} />
              <Label>Main</Label>
              <ReefPicker
                value={e.reef}
                onChange={(v) => patch({ sails: draft.sails.map((x) => (x.id === e.id ? { ...x, reef: v } : x)) })}
              />
              {sailErrors[e.id] && (
                <div style={{ marginTop: 8 }}>
                  <Note tone="stop">{sailErrors[e.id]}</Note>
                </div>
              )}
            </Card>
          ))}
          <Button
            kind="ghost"
            full
            onClick={() => {
              costMeter.bump()
              const at =
                draft.sails.length === 0
                  ? draft.windowStart
                  : draft.sails[draft.sails.length - 1].at
              patch({ sails: [...draft.sails, { id: mintId(), at, reef: null, sails: [] } as SailEntry] })
            }}
          >
            + Add a sail change
          </Button>
        </>
      )}

      {step === 3 && f && (
        <>
          <Header title="What was the water doing?" sub="Same idea: one entry per change, and none is fine." />
          {draft.seaState.map((e, i) => (
            <Card key={e.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Entry {i + 1}
                </span>
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patch({ seaState: draft.seaState.filter((x) => x.id !== e.id) })
                  }}
                >
                  Remove
                </Button>
              </div>
              <TimeInput
                label="At"
                value={e.at}
                onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === e.id ? { ...x, at: v } : x)) })}
              />
              <div style={{ height: 9 }} />
              <SeaStatePicker
                value={e.state}
                onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === e.id ? { ...x, state: v } : x)) })}
              />
              {seaErrors[e.id] && (
                <div style={{ marginTop: 8 }}>
                  <Note tone="stop">{seaErrors[e.id]}</Note>
                </div>
              )}
            </Card>
          ))}
          <Button
            kind="ghost"
            full
            onClick={() => {
              costMeter.bump()
              patch({
                seaState: [
                  ...draft.seaState,
                  { id: mintId(), at: draft.windowStart, state: 'slight' } as SeaStateEntry,
                ],
              })
            }}
          >
            + Add a sea state
          </Button>
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
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        onNext={() => {
          costMeter.bump()
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

function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: i <= step ? 'var(--blue-500)' : 'var(--surface-border)',
            }}
          />
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
