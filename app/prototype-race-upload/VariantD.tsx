'use client'

/**
 * VARIANT D — log it now, remember it later.
 *
 * The claim, and the reason this variant exists at all: thirteen races have to be
 * backfilled, and nobody remembers what time the A2 went up in a June beer can.
 * If the flow demands annotations up front, either the archive stays empty or the
 * times get invented — and inventing them is the one thing the project refuses to
 * do. So phase one asks for a file and a window and nothing else, and saves.
 *
 * Everything after that is amendment, which ADR 0010 already allows: window,
 * annotations, versions and title are all editable in place, forever, because a
 * Race is testimony over an immutable Transcription. The same refusals bind on
 * amendment as on upload, which is why the refusal logic lives in shared.ts and
 * is called from here unchanged.
 *
 * The cost it pays: two visits per race, and an archive that is legitimately
 * half-finished — so the list has to show what is missing without nagging, since
 * "not recorded" is a permanent, honest answer and not a to-do item.
 */

import { useState } from 'react'
import SogTrace, { TraceLegend } from './SogTrace'
import {
  BoatSetupPickers,
  Button,
  Card,
  Label,
  Note,
  NotRecorded,
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
  fmtDay,
  fmtWindow,
  isSubmittable,
  mintId,
  naiveMs,
  sailEntryRefusals,
  windowRefusals,
  type Draft,
  type Fixture,
} from './shared'

type Screen = { name: 'list' } | { name: 'new' } | { name: 'amend'; id: string } | { name: 'dump'; id: string }

interface Saved extends Draft {
  id: string
  /** True once the sailor has explicitly said the annotations are as good as they get. */
  settled: boolean
}

export default function VariantD() {
  const [races, setRaces] = useState<Saved[]>([])
  const [screen, setScreen] = useState<Screen>({ name: 'list' })
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [dupe, setDupe] = useState<Fixture | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const patchSaved = (id: string, p: Partial<Saved>) =>
    setRaces((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  // ----------------------------------------------------------------- phase 1
  if (screen.name === 'new') {
    const f = draft.fixture
    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 96 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, margin: 0 }}>Get it in the archive</h2>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
            A file and a window. Sails and sea state can wait — or never come, which is also fine.
          </p>
        </div>

        {!f ? (
          dupe ? (
            <Note tone="warn" title="Already in the archive">
              <div style={{ marginBottom: 8 }}>
                Logged as “{ALREADY_LOGGED[dupe.filename]}”. A recording can carry more than one race.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => { costMeter.bump(); setDraft(draftFromFixture(dupe)); setDupe(null) }}>
                  Add a second race
                </Button>
                <Button kind="ghost" onClick={() => setDupe(null)}>Back</Button>
              </div>
            </Note>
          ) : (
            <>
              <RecordingPicker onPick={(fx) => (ALREADY_LOGGED[fx.filename] ? setDupe(fx) : setDraft(draftFromFixture(fx)))} />
              <Button kind="ghost" full onClick={() => setScreen({ name: 'list' })}>Cancel</Button>
            </>
          )
        ) : (
          <>
            <Card pad={8}>
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
                display: 'flex',
                gap: 8,
              }}
            >
              <Button kind="ghost" onClick={() => { setDraft(emptyDraft()); setScreen({ name: 'list' }) }}>Cancel</Button>
              <div style={{ flex: 1 }}>
                <Button
                  full
                  disabled={windowRefusals(f, draft.windowStart, draft.windowFinish).length > 0}
                  onClick={() => {
                    costMeter.bump()
                    const id = mintId()
                    setRaces((rs) => [...rs, { ...draft, id, settled: false }])
                    setDraft(emptyDraft())
                    setScreen({ name: 'list' })
                  }}
                >
                  Save — done for now
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ----------------------------------------------------------------- phase 2
  if (screen.name === 'amend') {
    const race = races.find((r) => r.id === screen.id)
    if (!race || !race.fixture) return null
    const f = race.fixture
    const sailErrors = sailEntryRefusals(race.sails)
    const sorted = [...race.sails].sort((a, b) => naiveMs(a.at) - naiveMs(b.at))
    const blocked = windowRefusals(f, race.windowStart, race.windowFinish).length > 0

    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 96 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>
            Amending
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '2px 0 0' }}>
            {race.title || fmtDay(race.windowStart)}
          </h2>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
            {f.filename} · saved already
          </div>
        </div>

        <Note tone="quiet">
          The recording never changes. Everything on this screen does, as often as you like — this is testimony about an
          immutable file, not a second version of it.
        </Note>

        <Card pad={8}>
          <SogTrace
            fixture={f}
            windowStart={race.windowStart}
            windowFinish={race.windowFinish}
            height={148}
            laneHeight={22}
            onWindowChange={(s, fi) => {
              costMeter.bump()
              patchSaved(race.id, { windowStart: s, windowFinish: fi })
            }}
            markers={[
              ...sorted.map((e) => ({
                id: e.id,
                at: e.at,
                lane: 'sail' as const,
                label: e.sails.join('+'),
                incomplete: e.sails.length === 0 || e.reef === null,
              })),
              ...race.seaState.map((e) => ({ id: e.id, at: e.at, lane: 'sea' as const, label: e.state })),
            ]}
          />
        </Card>
        <QualityReadout fixture={f} start={race.windowStart} finish={race.windowFinish} terse />

        <div>
          <Label>Sails</Label>
          {sorted.length === 0 && (
            <Note tone="quiet">
              Nothing recorded yet. If nobody wrote it down, leave it — <NotRecorded /> is a permanent answer, not an
              unfinished one.
            </Note>
          )}
          {sorted.map((e) => (
            <Card key={e.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmtClock(e.at)}</span>
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patchSaved(race.id, { sails: race.sails.filter((x) => x.id !== e.id) })
                  }}
                >
                  Remove
                </Button>
              </div>
              <TimeInput
                value={e.at}
                onChange={(v) => patchSaved(race.id, { sails: race.sails.map((x) => (x.id === e.id ? { ...x, at: v } : x)) })}
              />
              <div style={{ height: 9 }} />
              <SailPicker
                selected={e.sails}
                onToggle={(k) =>
                  patchSaved(race.id, {
                    sails: race.sails.map((x) =>
                      x.id === e.id
                        ? { ...x, sails: x.sails.includes(k) ? x.sails.filter((s) => s !== k) : [...x.sails, k] }
                        : x,
                    ),
                  })
                }
              />
              <div style={{ height: 9 }} />
              <ReefPicker
                value={e.reef}
                onChange={(v) => patchSaved(race.id, { sails: race.sails.map((x) => (x.id === e.id ? { ...x, reef: v } : x)) })}
              />
              {sailErrors[e.id] && (
                <div style={{ marginTop: 7 }}>
                  <Note tone="stop">{sailErrors[e.id]}</Note>
                </div>
              )}
            </Card>
          ))}
          <div style={{ marginTop: 6 }}>
            <Button
              kind="ghost"
              full
              onClick={() => {
                costMeter.bump()
                const prev = sorted[sorted.length - 1]
                patchSaved(race.id, {
                  sails: [
                    ...race.sails,
                    prev
                      ? { id: mintId(), at: prev.at, reef: prev.reef, sails: [...prev.sails] }
                      : { id: mintId(), at: race.windowStart, reef: null, sails: [] },
                  ],
                })
              }}
            >
              + Add a sail change
            </Button>
          </div>
        </div>

        <div>
          <Label>Sea state</Label>
          {race.seaState.map((e) => (
            <Card key={e.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <TimeInput
                  value={e.at}
                  onChange={(v) => patchSaved(race.id, { seaState: race.seaState.map((x) => (x.id === e.id ? { ...x, at: v } : x)) })}
                />
                <Button
                  kind="danger"
                  onClick={() => {
                    costMeter.bump()
                    patchSaved(race.id, { seaState: race.seaState.filter((x) => x.id !== e.id) })
                  }}
                >
                  ✕
                </Button>
              </div>
              <div style={{ height: 7 }} />
              <SeaStatePicker
                value={e.state}
                onChange={(v) => patchSaved(race.id, { seaState: race.seaState.map((x) => (x.id === e.id ? { ...x, state: v } : x)) })}
              />
            </Card>
          ))}
          <div style={{ marginTop: 6 }}>
            <Button
              kind="ghost"
              full
              onClick={() => {
                costMeter.bump()
                patchSaved(race.id, {
                  seaState: [...race.seaState, { id: mintId(), at: race.windowStart, state: 'slight' }],
                })
              }}
            >
              + Add a sea state
            </Button>
          </div>
        </div>

        <Card>
          <TitleInput value={race.title} onChange={(v) => patchSaved(race.id, { title: v })} />
        </Card>
        <Card>
          <Label>Boat setup</Label>
          <div style={{ height: 7 }} />
          <BoatSetupPickers draft={race} patch={(p) => patchSaved(race.id, p)} />
        </Card>

        <Card>
          <Label>Is this as good as it gets?</Label>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 8 }}>
            Marking it settled stops the archive listing it as still coming. It does not lock anything — you can amend a
            settled race forever.
          </div>
          <Button
            kind={race.settled ? 'ghost' : 'primary'}
            onClick={() => {
              costMeter.bump()
              patchSaved(race.id, { settled: !race.settled })
            }}
          >
            {race.settled ? 'Settled — reopen it' : 'That is everything I remember'}
          </Button>
        </Card>

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
          {blocked && (
            <div style={{ fontSize: 10.5, color: 'var(--state-danger)', marginBottom: 6 }}>
              {windowRefusals(f, race.windowStart, race.windowFinish)[0].message} — the amendment will not save.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Button full kind="ghost" disabled={blocked || !isSubmittable(race)} onClick={() => setScreen({ name: 'list' })}>
                Done
              </Button>
            </div>
            <Button onClick={() => setScreen({ name: 'dump', id: race.id })}>What was written</Button>
          </div>
        </div>
      </div>
    )
  }

  if (screen.name === 'dump') {
    const race = races.find((r) => r.id === screen.id)
    if (!race) return null
    return (
      <div style={{ padding: 14 }}>
        <StateDump draft={race} onAgain={() => setScreen({ name: 'list' })} />
      </div>
    )
  }

  // ------------------------------------------------------------- the archive
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 96 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, margin: 0 }}>Race archive</h2>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
          Log the file now; fill in what you remember whenever. Thirteen races is a lot of typing to do in one sitting.
        </p>
      </div>

      {races.length === 0 && (
        <Note tone="quiet">Nothing logged yet in this session. Start with a recording below.</Note>
      )}

      {races.map((r) => {
        const missing: string[] = []
        if (r.sails.length === 0) missing.push('sails')
        if (r.seaState.length === 0) missing.push('sea state')
        if (!r.rigTuneVersionId) missing.push('rig tune')
        return (
          <button
            key={r.id}
            onClick={() => {
              costMeter.bump()
              setScreen({ name: 'amend', id: r.id })
            }}
            style={{
              textAlign: 'left',
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              borderLeft: `3px solid ${r.settled ? 'var(--wind-light)' : 'var(--surface-border)'}`,
              borderRadius: 8,
              padding: '11px 12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-primary)' }}>
                {r.title || fmtDay(r.windowStart)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-muted)' }}>
                {r.sails.length}·{r.seaState.length}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {fmtWindow(r.windowStart, r.windowFinish)}
            </span>
            {/* Missing is stated, never scolded: it may be the final answer. */}
            <span style={{ fontSize: 10, color: r.settled ? 'var(--wind-light)' : 'var(--text-muted)' }}>
              {r.settled
                ? missing.length > 0
                  ? `settled · ${missing.join(', ')} not recorded`
                  : 'settled · complete'
                : missing.length > 0
                  ? `${missing.join(', ')} still blank`
                  : 'not yet settled'}
            </span>
          </button>
        )
      })}

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
        <Button
          full
          onClick={() => {
            costMeter.reset()
            costMeter.bump()
            setDraft(emptyDraft())
            setScreen({ name: 'new' })
          }}
        >
          + Log a recording
        </Button>
      </div>
    </div>
  )
}
