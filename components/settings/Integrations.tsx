'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { askToSignIn } from '@/lib/account/askToSignIn'
import {
  CHATGPT_URL,
  CLAUDE_CONNECTORS_URL,
  EXAMPLE_QUESTIONS,
  INTEGRATIONS,
  claudeCodeCommand,
  type Integration,
  type IntegrationKey,
} from './integrations'

interface IntegrationsProps {
  /** The **MCP Server**'s address, or `null` for a **Guest**, whose rows open the Auth Sheet. */
  mcpServerUrl: string | null
}

const sectionHeading: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const body: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
  margin: 0,
}

// `anywhere`, so a long preview hostname wraps inside a 390px screen instead of pushing it wide.
const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
}

/**
 * Settings' **Integrations** section: how a crew member connects Claude, ChatGPT or any other
 * app to the **MCP Server**. Three rows styled like Theme's options, each opening a bottom sheet
 * that walks its three steps (LAY-191, the prototype's variant B).
 *
 * The rows say nothing about whether an app is connected: that needs the grants API, which is
 * LAY-192's.
 */
export default function Integrations({ mcpServerUrl }: IntegrationsProps): ReactElement {
  const [open, setOpen] = useState<Integration | null>(null)
  const signedIn = mcpServerUrl !== null

  return (
    <section style={{ marginTop: '32px' }}>
      <h2 style={sectionHeading}>Integrations</h2>
      <p style={{ ...body, margin: '-4px 0 12px' }}>
        Ask an AI assistant about the wind, your races and the boat. It gets the figures these
        screens show.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {INTEGRATIONS.map((integration) => (
          <button
            key={integration.key}
            type="button"
            onClick={() => (signedIn ? setOpen(integration) : askToSignIn())}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '8px',
              border: '1px solid var(--surface-border)',
              background: 'var(--surface-raised)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span
              aria-hidden
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--blue-muted)',
                color: 'var(--text-accent)',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 'var(--weight-bold)',
                flexShrink: 0,
              }}
            >
              {integration.glyph}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 'var(--weight-medium)',
                  color: 'var(--text-primary)',
                }}
              >
                {integration.title}
              </span>
              <span
                style={{
                  ...body,
                  display: 'block',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                {signedIn ? integration.subtitle : 'Sign in to connect'}
              </span>
            </span>
            {signedIn ? (
              <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: '18px', flexShrink: 0 }}>
                ›
              </span>
            ) : (
              // The drawer's Locked Entry padlock, drawn rather than an emoji.
              <svg
                data-testid="padlock"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth="2"
                aria-hidden
                style={{ flexShrink: 0 }}
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {open && mcpServerUrl && (
        // Keyed, so each sheet opens at step 1 rather than wherever the last one was left.
        <StepsSheet
          key={open.key}
          integration={open}
          url={mcpServerUrl}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

type CopyResult = 'copied' | 'failed'

const COPY_LABEL: Record<CopyResult, string> = {
  copied: 'Copied ✓',
  failed: 'Couldn’t copy. Select it instead.',
}

/**
 * A copy action per thing to copy. "Copied ✓" only once the clipboard took it: a browser may
 * refuse (no permission, an insecure origin), and then the sailor is told to select it instead.
 */
function useCopy(): { label: (key: string, idle: string) => string; copy: (key: string, text: string) => void } {
  const [result, setResult] = useState<{ key: string; result: CopyResult } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const settle = (key: string, outcome: CopyResult): void => {
    setResult({ key, result: outcome })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setResult(null), 2000)
  }

  return {
    label: (key, idle) => (result?.key === key ? COPY_LABEL[result.result] : idle),
    copy: (key, text) => {
      if (!navigator.clipboard) return settle(key, 'failed')
      navigator.clipboard.writeText(text).then(
        () => settle(key, 'copied'),
        () => settle(key, 'failed')
      )
    },
  }
}

function StepsSheet({
  integration,
  url,
  onClose,
}: {
  integration: Integration
  url: string
  onClose: () => void
}): ReactElement {
  const [step, setStep] = useState(0)
  const { label, copy } = useCopy()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const command = claudeCodeCommand(url)

  const secondStep: Record<IntegrationKey, { title: string; content: ReactNode }> = {
    claude: {
      title: 'Add it in Claude',
      content: (
        <>
          <p style={body}>
            On claude.ai, open <b>Settings → Connectors → Add custom connector</b>. Name it Layline
            and paste the address.
          </p>
          <p style={{ ...body, marginTop: '10px', color: 'var(--text-muted)' }}>
            Add it once on a computer at claude.ai. It then shows up in the Claude app on your phone.
          </p>
          <PrimaryLink href={CLAUDE_CONNECTORS_URL}>Open Claude settings ↗</PrimaryLink>
        </>
      ),
    },
    // Checked against OpenAI's "Connect to ChatGPT" guide on 2026-10-19. OpenAI renames these
    // often: check them again whenever this copy is touched.
    chatgpt: {
      title: 'Add it in ChatGPT',
      content: (
        <>
          <ol style={{ ...body, paddingLeft: '18px', display: 'grid', gap: '6px' }}>
            <li>
              On chatgpt.com, open <b>Plugins</b>, choose <b>+</b>, then <b>Add custom MCP server</b>.
            </li>
            <li>
              Name it Layline, paste the address, and pick <b>OAuth</b> for authentication. Accept the
              warning, then choose <b>Create as a plugin</b>.
            </li>
            <li>In a chat, type <b>@</b> and pick Layline before you ask.</li>
          </ol>
          <PrimaryLink href={`${CHATGPT_URL}/plugins`}>Open ChatGPT ↗</PrimaryLink>
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
          <p style={{ ...body, marginTop: '14px', color: 'var(--text-primary)' }}>Claude Code:</p>
          <button
            type="button"
            onClick={() => copy('command', command)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '44px',
              marginTop: '6px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--surface-border)',
              background: 'var(--surface-raised)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <code style={{ ...mono, fontSize: 'var(--text-xs)' }}>{command}</code>
            <span
              style={{
                ...body,
                display: 'block',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-accent)',
                marginTop: '4px',
              }}
            >
              {label('command', 'Tap to copy')}
            </span>
          </button>
          <p style={{ ...body, marginTop: '6px', fontSize: 'var(--text-xs)' }}>
            Then <code style={mono}>/mcp</code> to sign in.
          </p>
        </>
      ),
    },
  }

  const steps: { title: string; content: ReactNode }[] = [
    {
      title: 'Copy Layline’s address',
      content: (
        <>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              userSelect: 'all',
            }}
          >
            <span style={mono}>{url}</span>
          </div>
          <PrimaryButton onClick={() => copy('address', url)}>{label('address', 'Copy address')}</PrimaryButton>
        </>
      ),
    },
    secondStep[integration.key],
    {
      title: 'Sign in and approve',
      content: (
        <>
          <p style={body}>
            {integration.opener} opens Layline’s sign-in. Sign in with Google and approve. Read-only.
            It sees what your account sees on Layline, and nothing else.
          </p>
          <p style={{ ...body, marginTop: '14px', color: 'var(--text-primary)' }}>Then try:</p>
          <ul style={{ ...body, margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-primary)' }}>
            {EXAMPLE_QUESTIONS.map(({ question }) => (
              <li key={question} style={{ marginTop: '4px' }}>
                “{question}”
              </li>
            ))}
          </ul>
        </>
      ),
    },
  ]

  const last = step === steps.length - 1

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 190 }}
      />
      <div
        data-testid="integration-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={integration.title}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 200,
          maxWidth: '480px',
          maxHeight: '88vh',
          margin: '0 auto',
          overflowY: 'auto',
          background: 'var(--surface-base)',
          borderTop: '1px solid var(--surface-border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
          padding: '10px 20px calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <div
          aria-hidden
          style={{
            width: '40px',
            height: '4px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--surface-border)',
            margin: '0 auto 16px',
          }}
        />
        <div aria-hidden style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {steps.map((s, i) => (
            <span
              key={s.title}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                background: i <= step ? 'var(--accent)' : 'var(--surface-border)',
              }}
            />
          ))}
        </div>
        <p style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {integration.title} · Step {step + 1} of {steps.length}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <TextButton onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? 'Close' : 'Back'}
          </TextButton>
          <TextButton onClick={() => (last ? onClose() : setStep(step + 1))}>{last ? 'Done' : 'Next'}</TextButton>
        </div>
      </div>
    </>
  )
}

const primary: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  marginTop: '14px',
  minHeight: '48px',
  borderRadius: '10px',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--text-inverse)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  textDecoration: 'none',
  cursor: 'pointer',
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }): ReactElement {
  return (
    <button type="button" onClick={onClick} style={primary}>
      {children}
    </button>
  )
}

/** Opens the app in a new tab, so the sheet is still here with the address when the sailor returns. */
function PrimaryLink({ href, children }: { href: string; children: ReactNode }): ReactElement {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={primary}>
      {children}
    </a>
  )
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: '44px',
        minWidth: '64px',
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
