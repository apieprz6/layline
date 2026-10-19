'use client'

/**
 * PROTOTYPE — LAY-191, variant A: "Inline section, client tabs". Throwaway.
 *
 * A second section on Settings, built like Theme: an uppercase heading, the URL as a field with
 * a copy button, a segmented control for the client, and numbered steps. Everything is visible
 * at once; nothing opens.
 */

import { useState } from 'react'
import {
  EXAMPLE_QUESTIONS,
  MOBILE_NOTE,
  PRIVACY_LINE,
  STUB_GRANTS,
  claudeCodeCommand,
} from './fixture'
import { body, formatGranted, mono, sectionHeading, stubSignIn, useCopy, useMcpUrl } from './shared'

type Client = 'app' | 'code'

export default function VariantA({ signedIn }: { signedIn: boolean }) {
  const url = useMcpUrl()
  const { copied, copy } = useCopy()
  const [client, setClient] = useState<Client>('app')

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={sectionHeading}>Connect Claude</h2>
      <p style={{ ...body, marginBottom: 12 }}>
        Ask Claude about the wind, your races and the boat, and get the figures Layline shows.
      </p>

      {!signedIn ? (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface-raised)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <p style={{ ...body, flex: 1 }}>Claude signs in as you, so sign in to Layline first.</p>
          <button type="button" onClick={stubSignIn} style={primaryButton}>
            Sign in
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 10px 10px 14px',
              borderRadius: 8,
              border: '1px solid var(--surface-border)',
              background: 'var(--surface-raised)',
            }}
          >
            <span style={{ ...mono, flex: 1, minWidth: 0 }}>{url}</span>
            <button type="button" onClick={() => copy('url', url)} style={primaryButton}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div
            role="tablist"
            style={{
              display: 'flex',
              marginTop: 16,
              padding: 3,
              borderRadius: 8,
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
            }}
          >
            {(
              [
                ['app', 'Claude app'],
                ['code', 'Claude Code'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={client === key}
                type="button"
                onClick={() => setClient(key)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: client === key ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                  background: client === key ? 'var(--blue-muted)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <ol style={{ ...body, margin: '14px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
            {client === 'app' ? (
              <>
                <li>
                  On claude.ai, open <b>Settings → Connectors</b> and choose{' '}
                  <b>Add custom connector</b>.
                </li>
                <li>Name it Layline and paste the URL above.</li>
                <li>Choose Connect, then sign in with Google and approve.</li>
              </>
            ) : (
              <>
                <li>
                  Run
                  <CodeLine
                    text={claudeCodeCommand(url)}
                    copied={copied === 'cmd'}
                    onCopy={() => copy('cmd', claudeCodeCommand(url))}
                  />
                </li>
                <li>
                  Type <code style={mono}>/mcp</code>, choose layline, and sign in with Google.
                </li>
              </>
            )}
          </ol>
          {client === 'app' && (
            <p style={{ ...body, marginTop: 10, color: 'var(--text-muted)' }}>{MOBILE_NOTE}</p>
          )}

          <h3 style={{ ...sectionHeading, fontSize: 'var(--text-sm)', margin: '24px 0 8px' }}>
            Try asking
          </h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {EXAMPLE_QUESTIONS.slice(0, 4).map((q) => (
              <li key={q.tool} style={{ ...body, color: 'var(--text-primary)' }}>
                “{q.question}”
              </li>
            ))}
          </ul>

          <p style={{ ...body, marginTop: 16, color: 'var(--text-muted)' }}>{PRIVACY_LINE}</p>

          <h3 style={{ ...sectionHeading, fontSize: 'var(--text-sm)', margin: '24px 0 8px' }}>
            Connected apps <span style={{ textTransform: 'none' }}>(LAY-192, stub)</span>
          </h3>
          {STUB_GRANTS.map((g) => (
            <div
              key={g.client}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-raised)',
              }}
            >
              <span style={{ flex: 1 }}>
                <span style={{ ...body, color: 'var(--text-primary)', display: 'block' }}>
                  {g.client}
                </span>
                <span style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Connected {formatGranted(g.grantedAt)}
                </span>
              </span>
              <button type="button" style={secondaryButton}>
                Revoke
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function CodeLine({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        padding: '8px 8px 8px 10px',
        borderRadius: 6,
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
      }}
    >
      <code style={{ ...mono, fontSize: 'var(--text-xs)', flex: 1, minWidth: 0 }}>{text}</code>
      <button type="button" onClick={onCopy} style={secondaryButton}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

const primaryButton: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 36,
  padding: '0 14px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--accent, var(--blue-500))',
  color: 'var(--text-inverse)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  cursor: 'pointer',
}

const secondaryButton: React.CSSProperties = {
  flexShrink: 0,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--surface-border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
}
