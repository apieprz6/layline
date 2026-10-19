'use client'

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { OAuthGrant } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { formatMoment } from '@/lib/utils/timeFormatting'

const body: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
  margin: 0,
}

const note: CSSProperties = { ...body, marginTop: '8px' }

/** A failed read is its own state, so it can never be drawn as an empty list. */
type GrantsState = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; grants: OAuthGrant[] }

/**
 * Revoking ends the app's refresh, not the access token it already holds: the **MCP Server**
 * checks a token's signature locally (`lib/mcp/auth.ts`), so that token works until it expires,
 * an hour at most. ADR 0042 records the owner's choice of that window over a session lookup on
 * every tool call, and every sentence here says "within the hour" rather than "now".
 */
const ENDS_WITHIN_THE_HOUR = 'Its access stops within the hour.'

/**
 * The **Connected Apps** under Settings' Integrations rows (LAY-192): every app the signed-in
 * **Account** has approved at the consent screen, and a way to take that approval back.
 *
 * One list rather than a status on each row: a grant names its app with whatever the app called
 * itself at dynamic client registration, so telling which grant is "Claude" would be a guess.
 * That name is shown exactly as registered, and labelled as the app's own.
 *
 * Both calls go from the browser as the signed-in user, so Supabase only ever lists and revokes
 * that Account's own grants, and no service role is involved. Only a signed-in Account is shown
 * this at all (`Integrations`).
 */
export default function ConnectedApps(): ReactElement {
  const [state, setState] = useState<GrantsState>({ status: 'loading' })
  const [revoked, setRevoked] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const settle = (next: GrantsState): void => {
      if (live) setState(next)
    }
    createClient()
      .auth.oauth.listGrants()
      .then(
        ({ data, error }) => {
          if (error || !data) {
            if (error) console.error('Connected apps: listGrants failed:', error.message)
            return settle({ status: 'failed' })
          }
          settle({ status: 'loaded', grants: data })
        },
        (error: unknown) => {
          console.error('Connected apps: listGrants threw:', error)
          settle({ status: 'failed' })
        }
      )
    return () => {
      live = false
    }
  }, [])

  // Called only once `revokeGrant` has succeeded, so a row never leaves before its grant does.
  const onRevoked = (grant: OAuthGrant): void => {
    setState((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', grants: current.grants.filter((g) => g.client.id !== grant.client.id) }
        : current
    )
    setRevoked(appName(grant))
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <h3 id="connected-apps" style={{ ...body, color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>
        Connected apps
      </h3>
      <p style={{ ...body, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
        Shown under the name each app gave itself when it connected.
      </p>
      {state.status === 'loading' && <p style={note}>Checking…</p>}
      {state.status === 'failed' && (
        <p role="alert" style={{ ...note, color: 'var(--text-primary)' }}>
          Couldn’t load your connected apps. Reload the page to try again.
        </p>
      )}
      {state.status === 'loaded' && state.grants.length === 0 && <p style={note}>No apps connected yet.</p>}
      {state.status === 'loaded' && state.grants.length > 0 && (
        <ul
          aria-labelledby="connected-apps"
          style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '8px' }}
        >
          {state.grants.map((grant) => (
            <GrantRow key={grant.client.id} grant={grant} onRevoked={() => onRevoked(grant)} />
          ))}
        </ul>
      )}
      {revoked && (
        <p role="status" style={note}>
          {revoked} can no longer sign in as you. {ENDS_WITHIN_THE_HOUR}
        </p>
      )}
    </div>
  )
}

/** The registered name, verbatim; a client may register none, and then that is what is said. */
function appName(grant: OAuthGrant): string {
  return grant.client.name || 'An app with no name'
}

type RowState = 'idle' | 'asking' | 'revoking' | 'failed'

function GrantRow({ grant, onRevoked }: { grant: OAuthGrant; onRevoked: () => void }): ReactElement {
  const [row, setRow] = useState<RowState>('idle')
  const name = appName(grant)

  async function revoke(): Promise<void> {
    setRow('revoking')
    try {
      const { error } = await createClient().auth.oauth.revokeGrant({ clientId: grant.client.id })
      if (error) {
        console.error('Connected apps: revokeGrant failed:', error.message)
        return setRow('failed')
      }
    } catch (error) {
      console.error('Connected apps: revokeGrant threw:', error)
      return setRow('failed')
    }
    onRevoked()
  }

  return (
    <li
      style={{
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid var(--surface-border)',
        background: 'var(--surface-raised)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              ...body,
              display: 'block',
              color: grant.client.name ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 'var(--weight-medium)',
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </span>
          <span style={{ ...body, display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Connected {formatMoment(grant.granted_at)}
          </span>
        </span>
        {row === 'idle' && (
          <button type="button" onClick={() => setRow('asking')} style={secondaryButton}>
            Revoke
          </button>
        )}
      </div>

      {row !== 'idle' && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--surface-divider)' }}>
          <p style={{ ...body, color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>
            Revoke {name}?
          </p>
          <p style={{ ...body, marginTop: '4px' }}>
            It won’t be able to sign in as you again, and its access stops within the hour, when the
            token it holds runs out. To use it again, you’d sign in and approve again.
          </p>
          {row === 'failed' && (
            <p role="alert" style={{ ...body, marginTop: '8px', color: 'var(--text-primary)' }}>
              Couldn’t revoke {name}. It still has access. Try again.
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              disabled={row === 'revoking'}
              onClick={() => void revoke()}
              style={{ ...secondaryButton, flex: 1, borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
            >
              {row === 'revoking' ? 'Revoking…' : 'Revoke access'}
            </button>
            <button
              type="button"
              disabled={row === 'revoking'}
              onClick={() => setRow('idle')}
              style={{ ...secondaryButton, flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

const secondaryButton: CSSProperties = {
  minHeight: '44px',
  padding: '0 14px',
  borderRadius: '8px',
  border: '1px solid var(--surface-border)',
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-medium)',
  cursor: 'pointer',
  flexShrink: 0,
}
