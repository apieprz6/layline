'use client'

/**
 * PROTOTYPE — LAY-191, variant B: "One row, opens a sheet with steps". Throwaway.
 *
 * Settings stays short: one row says what it is and whether anything is connected. Tapping it
 * opens a bottom sheet that walks one step at a time, with a single primary action per step.
 * Claude Code is a footnote inside the sheet, not a peer of the Claude app.
 */

import { useState } from 'react'
import { EXAMPLE_QUESTIONS, MOBILE_NOTE, PRIVACY_LINE, STUB_GRANTS, claudeCodeCommand } from './fixture'
import { body, formatGranted, mono, sectionHeading, stubSignIn, useCopy, useMcpUrl } from './shared'

export default function VariantB({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const connected = signedIn ? STUB_GRANTS.length : 0

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={sectionHeading}>Integrations</h2>
      <button
        type="button"
        onClick={() => (signedIn ? setOpen(true) : stubSignIn())}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '14px 16px',
          borderRadius: 8,
          border: '1px solid var(--surface-border)',
          background: 'var(--surface-raised)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--blue-muted)',
            color: 'var(--text-accent)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--weight-bold)',
            flexShrink: 0,
          }}
        >
          ✳
        </span>
        <span style={{ flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-primary)',
            }}
          >
            Connect Claude
          </span>
          <span style={{ ...body, display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
            {!signedIn
              ? 'Sign in to ask Claude about the wind and your races'
              : connected > 0
                ? `${connected} app connected`
                : 'Ask Claude about the wind and your races'}
          </span>
        </span>
        <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 18 }}>
          {signedIn ? '›' : '🔒'}
        </span>
      </button>

      {open && <Sheet onClose={() => setOpen(false)} />}
    </section>
  )
}

function Sheet({ onClose }: { onClose: () => void }) {
  const url = useMcpUrl()
  const { copied, copy } = useCopy()
  const [step, setStep] = useState(0)
  const [showCode, setShowCode] = useState(false)

  const steps = [
    {
      title: 'Copy Layline’s address',
      content: (
        <>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
            }}
          >
            <span style={mono}>{url}</span>
          </div>
          <BigButton onPress={() => copy('url', url)}>{copied === 'url' ? 'Copied ✓' : 'Copy address'}</BigButton>
        </>
      ),
    },
    {
      title: 'Add it in Claude',
      content: (
        <>
          <p style={body}>
            On claude.ai, open <b>Settings → Connectors → Add custom connector</b>. Name it Layline
            and paste the address.
          </p>
          <p style={{ ...body, marginTop: 10, color: 'var(--text-muted)' }}>{MOBILE_NOTE}</p>
          <BigButton onPress={() => window.open('https://claude.ai/settings/connectors', '_blank')}>
            Open Claude settings ↗
          </BigButton>
        </>
      ),
    },
    {
      title: 'Sign in and approve',
      content: (
        <>
          <p style={body}>
            Claude opens Layline’s sign-in. Sign in with Google and approve. {PRIVACY_LINE}
          </p>
          <p style={{ ...body, marginTop: 14, color: 'var(--text-primary)' }}>Then try:</p>
          <ul style={{ ...body, margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-primary)' }}>
            {EXAMPLE_QUESTIONS.slice(0, 3).map((q) => (
              <li key={q.tool} style={{ marginTop: 4 }}>
                “{q.question}”
              </li>
            ))}
          </ul>
        </>
      ),
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Connect Claude"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'var(--surface-overlay, rgba(0,0,0,0.4))',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface-base)',
          borderRadius: '16px 16px 0 0',
          padding: '12px 20px 72px',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.2)',
        }}
      >
        <div
          aria-hidden
          style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--surface-border)', margin: '0 auto 16px' }}
        />
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Step ${i + 1}`}
              onClick={() => setStep(i)}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: i <= step ? 'var(--accent, var(--blue-500))' : 'var(--surface-border)',
              }}
            />
          ))}
        </div>
        <p style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Step {step + 1} of {steps.length}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            margin: '4px 0 12px',
          }}
        >
          {steps[step].title}
        </h2>
        {steps[step].content}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <TextButton onPress={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? 'Close' : 'Back'}
          </TextButton>
          <TextButton onPress={() => (step === steps.length - 1 ? onClose() : setStep(step + 1))}>
            {step === steps.length - 1 ? 'Done' : 'Next'}
          </TextButton>
        </div>

        <div style={{ borderTop: '1px solid var(--surface-divider)', marginTop: 20, paddingTop: 14 }}>
          <TextButton onPress={() => setShowCode(!showCode)}>
            {showCode ? '▾' : '▸'} Using Claude Code instead?
          </TextButton>
          {showCode && (
            <div style={{ marginTop: 8 }}>
              <code style={{ ...mono, fontSize: 'var(--text-xs)', display: 'block' }}>{claudeCodeCommand(url)}</code>
              <p style={{ ...body, marginTop: 6, fontSize: 'var(--text-xs)' }}>
                Then <code style={mono}>/mcp</code> to sign in.
              </p>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--surface-divider)', marginTop: 14, paddingTop: 14 }}>
          <p style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
            Connected (LAY-192, stub)
          </p>
          {STUB_GRANTS.map((g) => (
            <div key={g.client} style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ ...body, flex: 1, color: 'var(--text-primary)' }}>
                {g.client} · since {formatGranted(g.grantedAt)}
              </span>
              <TextButton onPress={() => undefined}>Revoke</TextButton>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BigButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        display: 'block',
        width: '100%',
        marginTop: 14,
        minHeight: 48,
        borderRadius: 10,
        border: 'none',
        background: 'var(--accent, var(--blue-500))',
        color: 'var(--text-inverse)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--weight-semibold)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function TextButton({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        minHeight: 36,
        padding: '0 4px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-accent)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--weight-medium)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
