'use client'

/**
 * VARIANT C — timeline first, no time fields at all.
 *
 * The claim: the expensive part of logging a race is not the sails, it is typing
 * times. A sailor does not know that the jib went up at 19:42:00; they know it
 * went up "just after the first beat, when the boat sped up". So there is no
 * datetime input anywhere in this variant — every time in the draft comes from
 * touching the trace, and the trace is the form.
 *
 * The risk it takes: a 13-hour recording on 360 logical pixels puts roughly two
 * and a half minutes under every pixel, so tapped times are coarse. Whether that
 * matters is precisely what this variant is here to find out — a nudge control
 * is provided so the coarseness is felt rather than argued about.
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
  sailEntryRefusals,
  windowRefusals,
  type Draft,
  type Fixture,
} from './shared'

type Tool = 'window' | 'sail' | 'sea'

export default function VariantC() {
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [tool, setTool] = useState<Tool>('window')
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [dupe, setDupe] = useState<Fixture | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const f = draft.fixture

  const restart = () => {
    costMeter.reset()
    setDraft(emptyDraft())
    setSubmitted(false)
    setSelected(null)
    setTool('window')
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
          A qtVlm VDR export. After this you will not type a single time.
        </p>
        {dupe ? (
          <Note tone="warn" title="Already in the archive">
            <div style={{ marginBottom: 8 }}>Logged as “{ALREADY_LOGGED[dupe.filename]}”. A second race over the same recording is allowed.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => { costMeter.bump(); setDraft(draftFromFixture(dupe)); setDupe(null) }}>
                Add a second race
              </Button>
              <Button kind="ghost" onClick={() => setDupe(null)}>Back</Button>
            </div>
          </Note>
        ) : (
          <RecordingPicker onPick={(fx) => (ALREADY_LOGGED[fx.filename] ? setDupe(fx) : setDraft(draftFromFixture(fx)))} />
        )}
      </div>
    )
  }

  const sailErrors = sailEntryRefusals(draft.sails)
  const sel = draft.sails.find((e) => e.id === selected) ?? null
  const selSea = draft.seaState.find((e) => e.id === selected) ?? null

  const markers = [
    ...draft.sails.map((e) => ({
      id: e.id,
      at: e.at,
      lane: 'sail' as const,
      label: e.sails.join('+'),
      selected: selected === e.id,
      incomplete: e.sails.length === 0 || e.reef === null,
    })),
    ...draft.seaState.map((e) => ({
      id: e.id,
      at: e.at,
      lane: 'sea' as const,
      label: e.state,
      selected: selected === e.id,
    })),
  ]

  const onTapTime = (at: string) => {
    if (tool === 'window') return
    costMeter.bump()
    const id = mintId()
    if (tool === 'sail') {
      // Carry the previous plan forward: a change alters one sail, not all of them.
      const prev = [...draft.sails].sort((a, b) => naiveMs(a.at) - naiveMs(b.at)).filter((e) => naiveMs(e.at) <= naiveMs(at)).pop()
      patch({ sails: [...draft.sails, { id, at, reef: prev?.reef ?? null, sails: prev ? [...prev.sails] : [] }] })
    } else {
      patch({ seaState: [...draft.seaState, { id, at, state: 'slight' }] })
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

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>{f.filename}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-accent)' }}>
            {fmtWindow(draft.windowStart, draft.windowFinish)}
          </span>
        </div>

        <Card pad={6}>
          <SogTrace
            fixture={f}
            windowStart={draft.windowStart}
            windowFinish={draft.windowFinish}
            height={218}
            laneHeight={26}
            onWindowChange={
              tool === 'window'
                ? (s, fi) => {
                    costMeter.bump()
                    patch({ windowStart: s, windowFinish: fi })
                  }
                : undefined
            }
            markers={markers}
            onTapTime={tool === 'window' ? undefined : onTapTime}
            onMarkerTap={(id) => {
              costMeter.bump()
              setSelected(id)
            }}
          />
        </Card>

        {/* the tool, not a step: the timeline never goes away */}
        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
          {(
            [
              { key: 'window' as Tool, label: 'Drag the window' },
              { key: 'sail' as Tool, label: 'Tap: sail change' },
              { key: 'sea' as Tool, label: 'Tap: sea state' },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                costMeter.bump()
                setTool(t.key)
              }}
              style={{
                flex: 1,
                padding: '9px 4px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: tool === t.key ? 700 : 500,
                fontFamily: 'Inter,sans-serif',
                cursor: 'pointer',
                border: `1px solid ${tool === t.key ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                background: tool === t.key ? 'var(--blue-500)' : 'var(--surface-raised)',
                color: tool === t.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 9 }}>
          <QualityReadout fixture={f} start={draft.windowStart} finish={draft.windowFinish} terse />
        </div>
      </div>

      {/* the inspector: whatever is selected on the timeline, edited in place */}
      <div style={{ padding: '12px 12px 0' }}>
        {sel && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>{fmtClock(sel.at)}</span>
              <Nudge onNudge={nudge} />
            </div>
            <Label>Sails up</Label>
            <SailPicker
              selected={sel.sails}
              onToggle={(k) =>
                patch({
                  sails: draft.sails.map((x) =>
                    x.id === sel.id
                      ? { ...x, sails: x.sails.includes(k) ? x.sails.filter((s) => s !== k) : [...x.sails, k] }
                      : x,
                  ),
                })
              }
            />
            <div style={{ height: 9 }} />
            <Label>Main</Label>
            <ReefPicker value={sel.reef} onChange={(v) => patch({ sails: draft.sails.map((x) => (x.id === sel.id ? { ...x, reef: v } : x)) })} />
            {sailErrors[sel.id] && (
              <div style={{ marginTop: 8 }}>
                <Note tone="stop">{sailErrors[sel.id]}</Note>
              </div>
            )}
            <div style={{ marginTop: 9 }}>
              <Button
                kind="danger"
                onClick={() => {
                  costMeter.bump()
                  patch({ sails: draft.sails.filter((x) => x.id !== sel.id) })
                  setSelected(null)
                }}
              >
                Remove this change
              </Button>
            </div>
          </Card>
        )}

        {selSea && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>{fmtClock(selSea.at)}</span>
              <Nudge onNudge={nudge} />
            </div>
            <SeaStatePicker
              value={selSea.state}
              onChange={(v) => patch({ seaState: draft.seaState.map((x) => (x.id === selSea.id ? { ...x, state: v } : x)) })}
            />
            <div style={{ marginTop: 9 }}>
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
            </div>
          </Card>
        )}

        {!sel && !selSea && (
          <Note tone="quiet">
            {tool === 'window'
              ? 'Drag either handle. The axis runs past the last row on purpose — a race can finish after the log dies.'
              : 'Tap the trace where it happened. Nothing to type; the time comes from where you touched.'}
          </Note>
        )}

        <div style={{ marginTop: 12 }}>
          <TraceLegend />
        </div>

        <button
          onClick={() => setShowDetails((s) => !s)}
          style={{
            marginTop: 14,
            width: '100%',
            padding: '9px',
            background: 'transparent',
            border: '1px dashed var(--surface-border)',
            borderRadius: 6,
            color: 'var(--text-accent)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {showDetails ? 'Hide title and boat setup' : 'Title and boat setup (optional)'}
        </button>

        {showDetails && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Card>
              <TitleInput value={draft.title} onChange={(v) => patch({ title: v })} />
            </Card>
            <Card>
              <BoatSetupPickers draft={draft} patch={patch} />
            </Card>
          </div>
        )}
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
          Save race · {draft.sails.length} sail, {draft.seaState.length} sea
        </Button>
      </div>
    </div>
  )
}

/** Coarse taps need a fine adjustment, or the timeline is a lie at 13 hours. */
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
