'use client'

/**
 * PROTOTYPE — LAY-191, variant B: "Integrations rows, each opens a sheet". Throwaway.
 *
 * Settings gets an Integrations section of three rows: Claude, ChatGPT, and any other app. Each
 * row says whether it is connected; tapping it opens a bottom sheet that walks that app's three
 * steps one at a time, with a single primary action per step.
 */

import { useState } from 'react'
import { EXAMPLE_QUESTIONS, MOBILE_NOTE, PRIVACY_LINE, STUB_GRANTS, claudeCodeCommand } from './fixture'
import { body, formatGranted, mono, sectionHeading, stubSignIn, useCopy, useMcpUrl } from './shared'

type AppKey = 'claude' | 'chatgpt' | 'other'

const APPS: { key: AppKey; title: string; glyph: string; pitch: string; opener: string }[] = [
  { key: 'claude', title: 'Connect Claude', glyph: '✳', pitch: 'Web, desktop and phone', opener: 'Claude' },
  { key: 'chatgpt', title: 'Connect ChatGPT', glyph: '◎', pitch: 'Plus, Pro or Business, on the web', opener: 'ChatGPT' },
  { key: 'other', title: 'Using another app?', glyph: '⋯', pitch: 'Claude Code, Cursor, VS Code…', opener: 'Your app' },
]

/**
 * Which stub grant belongs to which row. In the real build this is an open question: a client's
 * name comes from dynamic registration, so it is whatever the client called itself.
 */
function grantsFor(key: AppKey) {
  const named = (n: string) => STUB_GRANTS.filter((g) => g.client.toLowerCase().includes(n))
  if (key === 'claude') return named('claude')
  if (key === 'chatgpt') return named('chatgpt')
  return STUB_GRANTS.filter((g) => !/claude|chatgpt/i.test(g.client))
}

export default function VariantB({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState<AppKey | null>(null)

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={sectionHeading}>Integrations</h2>
      <p style={{ ...body, margin: '-4px 0 12px' }}>
        Ask an AI assistant about the wind, your races and the boat. It gets the figures these
        screens show.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {APPS.map((app) => {
          const grants = signedIn ? grantsFor(app.key) : []
          return (
            <button
              key={app.key}
              type="button"
              onClick={() => (signedIn ? setOpen(app.key) : stubSignIn())}
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
                {app.glyph}
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
                  {app.title}
                </span>
                <span
                  style={{
                    ...body,
                    display: 'block',
                    fontSize: 'var(--text-sm)',
                    color: grants.length > 0 ? 'var(--text-accent)' : 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  {!signedIn
                    ? 'Sign in to connect'
                    : grants.length > 0
                      ? `Connected since ${formatGranted(grants[0].grantedAt)}`
                      : app.pitch}
                </span>
              </span>
              <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 18 }}>
                {signedIn ? '›' : '🔒'}
              </span>
            </button>
          )
        })}
      </div>

      {open && <Sheet appKey={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

function Sheet({ appKey, onClose }: { appKey: AppKey; onClose: () => void }) {
  const url = useMcpUrl()
  const { copied, copy } = useCopy()
  const [step, setStep] = useState(0)
  const app = APPS.find((a) => a.key === appKey)!
  const grants = grantsFor(appKey)

  const addStep = {
    claude: {
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
    chatgpt: {
      title: 'Add it in ChatGPT',
      content: (
        <>
          <ol style={{ ...body, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>
              On chatgpt.com, open <b>Settings → Apps &amp; Connectors → Advanced settings</b> and
              turn on <b>Developer mode</b>.
            </li>
            <li>
              Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>. Name it Layline, paste the
              address, and pick <b>OAuth</b> for authentication.
            </li>
            <li>In a chat, turn Layline on from the + menu before you ask.</li>
          </ol>
          <BigButton onPress={() => window.open('https://chatgpt.com', '_blank')}>Open ChatGPT ↗</BigButton>
        </>
      ),
    },
    other: {
      title: 'Add it to your app',
      content: (
        <>
          <p style={body}>
            Any app that supports remote MCP servers: add a server with the address from step 1 and
            sign in when it asks. No key or token is needed.
          </p>
          <p style={{ ...body, marginTop: 14, color: 'var(--text-primary)' }}>Claude Code:</p>
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
              background: 'var(--surface-raised)',
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
        </>
      ),
    },
  }[appKey]

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
    addStep,
    {
      title: 'Sign in and approve',
      content: (
        <>
          <p style={body}>
            {app.opener} opens Layline’s sign-in. Sign in with Google and approve. {PRIVACY_LINE}
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
      aria-label={app.title}
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
          {app.title} · Step {step + 1} of {steps.length}
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

        {grants.length > 0 && (
          <div style={{ borderTop: '1px solid var(--surface-divider)', marginTop: 20, paddingTop: 14 }}>
            <p style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
              Connected (LAY-192, stub)
            </p>
            {grants.map((g) => (
              <div key={g.client} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ ...body, flex: 1, color: 'var(--text-primary)' }}>
                  {g.client} · since {formatGranted(g.grantedAt)}
                </span>
                <TextButton onPress={() => undefined}>Revoke</TextButton>
              </div>
            ))}
          </div>
        )}
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
