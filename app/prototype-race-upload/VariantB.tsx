'use client'

/**
 * VARIANT B — one sheet, no steps.
 *
 * The opposite claim to Variant A: a race is one small thing, and the wizard's
 * five screens are five chances to lose your place. Everything is on one
 * scrolling page with a sticky footer; the trace stays pinned to the top of the
 * viewport so the window is visible while the annotations are typed — which is
 * exactly what the wizard cannot do.
 *
 * The sail table is a *table*, one row per change, so seven changes are seven
 * rows on one screen rather than seven trips through a sub-form. That is the
 * concrete bet on cost.
 */

import { useState } from 'react'
import SogTrace, { TraceLegend } from './SogTrace'
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
  isSubmittable,
  mintId,
  naiveMs,
  sailEntryRefusals,
  seaStateRefusals,
  windowRefusals,
  type Draft,
  type Fixture,
} from './shared'

export default function VariantB() {
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [submitted, setSubmitted] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dupe, setDupe] = useState<Fixture | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const f = draft.fixture

  const restart = () => {
    costMeter.reset()
    setDraft(emptyDraft())
    setSubmitted(false)
    setExpanded(null)
  }

  if (submitted) {
    return (
      <div style={{ padding: 14 }}>
        <StateDump draft={draft} onAgain={restart} />
      </div>
    )
  }

  if (!f) {
    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, margin: 0 }}>Log a race</h2>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
          Pick the qtVlm VDR export. The whole form is one page after this.
        </p>
        {dupe ? (
          <Note tone="warn" title="Already in the archive">
            <div style={{ marginBottom: 8 }}>
              Logged as “{ALREADY_LOGGED[dupe.filename]}”. A recording can carry more than one race, so you can add a
              second one over the same transcription.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                onClick={() => {
                  costMeter.bump()
                  setDraft(draftFromFixture(dupe))
                  setDupe(null)
                }}
              >
                Add a second race
              </Button>
              <Button kind="ghost" onClick={() => setDupe(null)}>
                Back
              </Button>
            </div>
          </Note>
        ) : (
          <RecordingPicker
            onPick={(fx) => (ALREADY_LOGGED[fx.filename] ? setDupe(fx) : setDraft(draftFromFixture(fx)))}
          />
        )}
      </div>
    )
  }

  const sailErrors = sailEntryRefusals(draft.sails)
  const seaErrors = seaStateRefusals(draft.seaState)
  const sorted = [...draft.sails].sort((a, b) => naiveMs(a.at) - naiveMs(b.at))

  return (
    <div style={{ paddingBottom: 104 }}>
      {/* pinned trace: the window stays visible while the annotations are typed */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: '8px 10px 4px',
        }}
      >
        <SogTrace
          fixture={f}
          windowStart={draft.windowStart}
          windowFinish={draft.windowFinish}
          height={92}
          onWindowChange={(s, fi) => {
            costMeter.bump()
            patch({ windowStart: s, windowFinish: fi })
          }}
          markers={sorted.map((e) => ({
            id: e.id,
            at: e.at,
            lane: 'sail' as const,
            label: e.sails.join('+'),
            selected: expanded === e.id,
            incomplete: e.sails.length === 0 || e.reef === null,
          }))}
          laneHeight={14}
        />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-muted)', textAlign: 'center' }}>
          {f.filename}
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section n={1} title="Window">
          <div style={{ display: 'flex', gap: 8 }}>
            <TimeInput label="Start" value={draft.windowStart} onChange={(v) => patch({ windowStart: v })} />
            <TimeInput label="Finish" value={draft.windowFinish} onChange={(v) => patch({ windowFinish: v })} />
          </div>
          <div style={{ height: 9 }} />
          <QualityReadout fixture={f} start={draft.windowStart} finish={draft.windowFinish} />
          <TraceLegend />
        </Section>

        <Section
          n={2}
          title="Sails"
          aside={draft.sails.length > 0 ? `${draft.sails.length} entries` : 'none recorded'}
        >
          {sorted.length === 0 && (
            <Note tone="quiet">Nothing recorded. That is a legitimate answer and does not block saving.</Note>
          )}
          {sorted.map((e) => {
            const open = expanded === e.id
            const bad = sailErrors[e.id]
            return (
              <div
                key={e.id}
                style={{
                  border: `1px solid ${bad ? 'rgba(204,17,0,0.30)' : 'var(--surface-border)'}`,
                  borderRadius: 6,
                  marginBottom: 5,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => {
                    costMeter.bump()
                    setExpanded(open ? null : e.id)
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: open ? 'var(--blue-muted)' : 'var(--surface-raised)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                    {fmtClock(e.at)}
                  </span>
                  <span style={{ flex: 1, fontSize: 11.5, color: bad ? 'var(--state-danger)' : 'var(--text-secondary)' }}>
                    {e.sails.length === 0 ? 'no sails named' : e.sails.join(' + ')}
                    {e.reef === 'reef-1' && ' · reefed'}
                    {e.reef === null && e.sails.length > 0 && ' · main not stated'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div style={{ padding: '10px', borderTop: '1px solid var(--surface-border)' }}>
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
                    {bad && (
                      <div style={{ marginTop: 8 }}>
                        <Note tone="stop">{bad}</Note>
                      </div>
                    )}
                    <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>
                      <Button
                        kind="ghost"
                        onClick={() => {
                          // Duplicating the previous entry is the real gesture: a
                          // sail change usually alters one sail, not the whole plan.
                          costMeter.bump()
                          patch({
                            sails: [
                              ...draft.sails,
                              { id: mintId(), at: e.at, reef: e.reef, sails: [...e.sails] },
                            ],
                          })
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button
                        kind="danger"
                        onClick={() => {
                          costMeter.bump()
                          patch({ sails: draft.sails.filter((x) => x.id !== e.id) })
                          setExpanded(null)
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <Button
            kind="ghost"
            full
            onClick={() => {
              costMeter.bump()
              const prev = sorted[sorted.length - 1]
              const id = mintId()
              patch({
                sails: [
                  ...draft.sails,
                  prev
                    ? { id, at: prev.at, reef: prev.reef, sails: [...prev.sails] }
                    : { id, at: draft.windowStart, reef: null, sails: [] },
                ],
              })
              setExpanded(id)
            }}
          >
            {sorted.length === 0 ? '+ Add a sail change' : '+ Add, carrying the last plan forward'}
          </Button>
        </Section>

        <Section n={3} title="Sea state" aside={draft.seaState.length > 0 ? `${draft.seaState.length} entries` : 'none recorded'}>
          {draft.seaState.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <TimeInput
                  value={e.at}
                  onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === e.id ? { ...x, at: v } : x)) })}
                />
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patch({ seaState: draft.seaState.filter((x) => x.id !== e.id) })
                  }}
                >
                  ✕
                </Button>
              </div>
              <div style={{ height: 6 }} />
              <SeaStatePicker
                value={e.state}
                onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === e.id ? { ...x, state: v } : x)) })}
              />
              {seaErrors[e.id] && (
                <div style={{ marginTop: 6 }}>
                  <Note tone="stop">{seaErrors[e.id]}</Note>
                </div>
              )}
            </div>
          ))}
          <Button
            kind="ghost"
            full
            onClick={() => {
              costMeter.bump()
              patch({ seaState: [...draft.seaState, { id: mintId(), at: draft.windowStart, state: 'slight' }] })
            }}
          >
            + Add a sea state
          </Button>
        </Section>

        <Section n={4} title="Title" aside="optional">
          <TitleInput value={draft.title} onChange={(v) => patch({ title: v })} />
        </Section>

        <Section n={5} title="Boat setup" aside="optional">
          <BoatSetupPickers draft={draft} patch={patch} />
        </Section>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 44,
          padding: '10px 14px',
          background: 'var(--surface-raised)',
          borderTop: '1px solid var(--surface-border)',
          maxWidth: 430,
          margin: '0 auto',
        }}
      >
        {windowRefusals(f, draft.windowStart, draft.windowFinish).length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--state-danger)', marginBottom: 6 }}>
            {windowRefusals(f, draft.windowStart, draft.windowFinish)[0].message}
          </div>
        )}
        <Button full disabled={!isSubmittable(draft)} onClick={() => { costMeter.bump(); setSubmitted(true) }}>
          Save race
        </Button>
      </div>
    </div>
  )
}

function Section({
  n,
  title,
  aside,
  children,
}: {
  n: number
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
            border: '1px solid var(--surface-border)',
            borderRadius: 4,
            padding: '0 4px',
          }}
        >
          {n}
        </span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
        {aside && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{aside}</span>}
      </div>
      <Card>{children}</Card>
    </div>
  )
}
