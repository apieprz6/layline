'use client'

/**
 * PROTOTYPE — LAY-191, variant C: "Questions first, steps folded". Throwaway.
 *
 * Leads with why: the questions Claude can now answer, drawn as chat bubbles. The URL is one bar
 * under them. How-to for each client and "what Claude can see" are disclosures, closed until
 * asked for, so the section is short for anyone who has already connected.
 */

import { EXAMPLE_QUESTIONS, MOBILE_NOTE, PRIVACY_LINE, STUB_GRANTS, claudeCodeCommand } from './fixture'
import { body, formatGranted, mono, stubSignIn, useCopy, useMcpUrl } from './shared'

export default function VariantC({ signedIn }: { signedIn: boolean }) {
  const url = useMcpUrl()
  const { copied, copy } = useCopy()

  return (
    <section
      style={{
        marginTop: 32,
        borderRadius: 12,
        border: '1px solid var(--surface-border)',
        background: 'var(--surface-raised)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 16px 4px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Ask Claude about Layline
        </h2>
        <p style={{ ...body, marginTop: 4 }}>It answers with the same figures these screens show.</p>
      </div>

      <div style={{ padding: '12px 16px 4px', display: 'grid', gap: 8 }}>
        {EXAMPLE_QUESTIONS.map((q, i) => (
          <div
            key={q.tool}
            style={{
              justifySelf: i % 2 === 0 ? 'end' : 'start',
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: i % 2 === 0 ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: i % 2 === 0 ? 'var(--blue-muted)' : 'var(--surface-elevated)',
              ...body,
              color: 'var(--text-primary)',
            }}
          >
            {q.question}
          </div>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {signedIn ? (
          <button
            type="button"
            onClick={() => copy('url', url)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px dashed var(--accent, var(--blue-500))',
              background: 'var(--surface-base)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ ...mono, flex: 1, minWidth: 0 }}>{url}</span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-accent)',
                flexShrink: 0,
              }}
            >
              {copied === 'url' ? 'Copied ✓' : 'Tap to copy'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stubSignIn}
            style={{
              width: '100%',
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
            Sign in to connect Claude
          </button>
        )}
      </div>

      {signedIn && (
        <div style={{ borderTop: '1px solid var(--surface-divider)' }}>
          <Fold title="Claude on the web, desktop or phone">
            <ol style={{ ...body, margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>
                On claude.ai: <b>Settings → Connectors → Add custom connector</b>.
              </li>
              <li>Name it Layline, paste the address, and choose Connect.</li>
              <li>Sign in with Google and approve.</li>
            </ol>
            <p style={{ ...body, marginTop: 8, color: 'var(--text-muted)' }}>{MOBILE_NOTE}</p>
          </Fold>
          <Fold title="Claude Code">
            <button
              type="button"
              onClick={() => copy('cmd', claudeCodeCommand(url))}
              style={{
                display: 'block',
                width: '100%',
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
            <p style={{ ...body, marginTop: 8 }}>
              Then <code style={mono}>/mcp</code> → layline → sign in.
            </p>
          </Fold>
          <Fold title="What Claude can see">
            <p style={body}>{PRIVACY_LINE}</p>
            <p style={{ ...body, marginTop: 6 }}>
              It can’t upload, edit or delete anything. Wind from CHII2 comes with its 85 ft
              elevation, as on the dashboard.
            </p>
          </Fold>
          <Fold
            title={`Connected apps · ${STUB_GRANTS.length}`}
            note="LAY-192, stub"
          >
            {STUB_GRANTS.map((g) => (
              <div key={g.client} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ ...body, flex: 1, color: 'var(--text-primary)' }}>
                  {g.client} · since {formatGranted(g.grantedAt)}
                </span>
                <span style={{ ...body, color: 'var(--text-accent)' }}>Revoke</span>
              </div>
            ))}
          </Fold>
        </div>
      )}
    </section>
  )
}

function Fold({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <details style={{ borderBottom: '1px solid var(--surface-divider)' }}>
      <summary
        style={{
          padding: '14px 16px',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-primary)',
        }}
      >
        {title}
        {note && <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-regular)' }}> ({note})</span>}
      </summary>
      <div style={{ padding: '0 16px 14px' }}>{children}</div>
    </details>
  )
}
