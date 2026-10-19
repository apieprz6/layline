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
  const [app, setApp] = useState<'claude' | 'chatgpt' | 'other' | null>('claude')

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
      title: 'Add it to your app',
      content: (
        <div style={{ display: 'grid', gap: 8 }}>
          <AppCard
            name="Claude"
            hint="Web, desktop and phone"
            open={app === 'claude'}
            onToggle={() => setApp(app === 'claude' ? null : 'claude')}
          >
            <p style={body}>
              On claude.ai, open <b>Settings → Connectors → Add custom connector</b>. Name it
              Layline and paste the address.
            </p>
            <p style={{ ...body, marginTop: 8, color: 'var(--text-muted)' }}>{MOBILE_NOTE}</p>
            <BigButton onPress={() => window.open('https://claude.ai/settings/connectors', '_blank')}>
              Open Claude settings ↗
            </BigButton>
          </AppCard>

          <AppCard
            name="ChatGPT"
            hint="Plus, Pro or Business, on the web"
            open={app === 'chatgpt'}
            onToggle={() => setApp(app === 'chatgpt' ? null : 'chatgpt')}
          >
            <ol style={{ ...body, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>
                On chatgpt.com, open <b>Settings → Apps &amp; Connectors → Advanced settings</b>{' '}
                and turn on <b>Developer mode</b>.
              </li>
              <li>
                Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>. Name it Layline, paste
                the address, and pick <b>OAuth</b> for authentication.
              </li>
              <li>In a chat, turn Layline on from the + menu before you ask.</li>
            </ol>
            <BigButton onPress={() => window.open('https://chatgpt.com', '_blank')}>
              Open ChatGPT ↗
            </BigButton>
          </AppCard>

          <AppCard
            name="Using another app?"
            hint="Claude Code, Cursor, VS Code…"
            open={app === 'other'}
            onToggle={() => setApp(app === 'other' ? null : 'other')}
          >
            <p style={body}>
              Any app that supports remote MCP servers: add a server with the address from step 1
              and sign in when it asks. No key or token is needed.
            </p>
            <p style={{ ...body, marginTop: 12, color: 'var(--text-primary)' }}>Claude Code:</p>
            <button
              type="button"
              onClick={() => copy('cmd', claudeCodeCommand(url))}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-base)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <code style={{ ...mono, fontSize: 'var(--text-xs)' }}>{claudeCodeCommand(url)}</code>
              <span style={{ ...body, display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-accent)', marginTop: 4 }}>
                {copied === 'cmd' ? 'Copied ✓' : 'Tap to copy'}
              </span>
            </button>
            <p style={{ ...body, marginTop: 6, fontSize: 'var(--text-xs)' }}>
              Then <code style={mono}>/mcp</code> to sign in.
            </p>
          </AppCard>
        </div>
      ),
    },
    {
      title: 'Sign in and approve',
      content: (
        <>
          <p style={body}>
            Your app opens Layline’s sign-in. Sign in with Google and approve. {PRIVACY_LINE}
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

/** One app's instructions. One card open at a time, so step 2 stays a phone's height. */
function AppCard({
  name,
  hint,
  open,
  onToggle,
  children,
}: {
  name: string
  hint: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: open ? '1.5px solid var(--accent, var(--blue-500))' : '1px solid var(--surface-border)',
        background: 'var(--surface-raised)',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minHeight: 52,
          padding: '10px 14px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            {name}
          </span>
          <span style={{ ...body, display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {hint}
          </span>
        </span>
        <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
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
