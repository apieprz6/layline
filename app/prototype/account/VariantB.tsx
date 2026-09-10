'use client'

/**
 * VARIANT B — "Who you are on top, what you can do below" (throwaway, see ./README.md)
 *
 * Position: identity is not a footnote. The account sits directly under the app
 * header as a labelled band, above the nav, and the footer goes back to holding
 * only `v1.0 · May 2026`. Two consequences follow, and both are the point:
 *
 *  - Signed out, the band states the fact and offers nothing. The padlocked rows
 *    are the *only* sign-in affordance in the drawer, which is B's answer to the
 *    redundancy: what gives is the account block's button, because the offer
 *    belongs to the thing being offered (ADR 0016).
 *  - Signed out there is no Sign out either, so signed in it becomes a sixth
 *    row below a divider, in the list where every other action lives.
 *
 * Sheet: ADR 0004's 82% viewport height, kept and made to earn itself — the
 * sheet says what an account is for before it offers the one button, and the
 * button sits in the thumb zone rather than under the fold.
 */

import React from 'react'
import {
  NAV_ENTRIES,
  LockIcon,
  PersonMark,
  SignOutIcon,
  GoogleButton,
  Dim,
  truncate,
  DrawerLabel,
  VersionLine,
} from './shared'
import { initialsOf, type PrototypeAccount } from './fixture'
import type { VariantProps } from './VariantA'

export const VARIANT_B_NAME = 'Identity band on top'

function IdentityBand({ account }: { account: PrototypeAccount | null }): React.ReactElement {
  if (!account) {
    return (
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--surface-border)',
          background: 'var(--surface-elevated)',
        }}
      >
        <DrawerLabel>Guest</DrawerLabel>
        <div
          style={{
            marginTop: '4px',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          Browsing as guest. Weather is open; the boat is not.
        </div>
      </div>
    )
  }

  const initials = initialsOf(account.displayName)
  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--surface-border)',
        background: 'var(--surface-elevated)',
      }}
    >
      <DrawerLabel>Signed in</DrawerLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            flexShrink: 0,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--blue-500)',
            color: 'var(--text-inverse)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '13px',
          }}
        >
          {initials ?? <PersonMark size={19} />}
        </div>
        <div style={{ minWidth: 0 }}>
          {account.displayName ? (
            <>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--text-base)',
                  color: 'var(--text-primary)',
                  ...truncate,
                }}
              >
                {account.displayName}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  ...truncate,
                }}
              >
                {account.email}
              </div>
            </>
          ) : (
            <>
              {/* Nothing named this account, so the address is the identity and
                  the line under it says so rather than inventing a name. */}
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  ...truncate,
                }}
              >
                {account.email}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  ...truncate,
                }}
              >
                No name from Google
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  isActive,
  locked,
  muted,
  onClick,
  trailing,
}: {
  icon: React.ReactElement
  label: string
  isActive?: boolean
  locked?: boolean
  muted?: boolean
  onClick?: () => void
  trailing?: React.ReactNode
}): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        margin: '2px 0',
        borderRadius: '6px',
        cursor: onClick ? 'pointer' : 'default',
        background: isActive ? 'var(--blue-muted)' : 'transparent',
        border: isActive ? '1px solid var(--surface-border-hover)' : '1px solid transparent',
        color: isActive
          ? 'var(--text-accent)'
          : locked || muted
            ? 'var(--text-muted)'
            : 'var(--text-secondary)',
      }}
    >
      {icon}
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          fontWeight: isActive ? 600 : 500,
          ...truncate,
        }}
      >
        {label}
      </span>
      {trailing}
    </div>
  )
}

export default function VariantB({
  account,
  drawerOpen,
  onCloseDrawer,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onSignOut,
}: VariantProps): React.ReactElement {
  return (
    <>
      <div
        onClick={onCloseDrawer}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
          zIndex: 90,
        }}
      />

      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'var(--drawer-width)',
          background: 'var(--surface-raised)',
          borderRight: '1px solid var(--surface-border)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease-out',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        <div
          style={{
            padding: '18px 16px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '16px',
                color: 'var(--text-primary)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              layline
            </div>
            <div
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
              }}
            >
              Race Circle · Lake Michigan
            </div>
          </div>
          <button
            onClick={onCloseDrawer}
            aria-label="Close menu"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <IdentityBand account={account} />

        <div style={{ padding: '10px 8px', flex: 1 }}>
          {NAV_ENTRIES.map((entry) => {
            const locked = Boolean(entry.locked) && !account
            return (
              <React.Fragment key={entry.href}>
                {entry.dividerAbove && (
                  <div style={{ height: '1px', background: 'var(--surface-divider)', margin: '8px 4px' }} />
                )}
                <Row
                  icon={entry.icon}
                  label={entry.label}
                  isActive={entry.href === '/'}
                  locked={locked}
                  trailing={
                    locked ? (
                      <>
                        <LockIcon />
                        <button
                          onClick={onOpenSheet}
                          style={{
                            marginLeft: 'auto',
                            background: 'transparent',
                            border: 'none',
                            padding: '4px 0 4px 8px',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-accent)',
                          }}
                        >
                          Sign in
                        </button>
                      </>
                    ) : null
                  }
                />
              </React.Fragment>
            )
          })}

          {account && (
            <>
              <div style={{ height: '1px', background: 'var(--surface-divider)', margin: '8px 4px' }} />
              <Row icon={<SignOutIcon />} label="Sign out" muted onClick={onSignOut} />
            </>
          )}
        </div>

        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--surface-border)' }}>
          <VersionLine />
        </div>
      </nav>

      {/* Sheet B — ADR 0004's 82%, made to earn it */}
      {sheetOpen && (
        <>
          <Dim onClick={onCloseSheet} />
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              height: '82vh',
              zIndex: 200,
              background: 'var(--surface-raised)',
              borderTop: '1px solid var(--surface-border)',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
              padding: '10px 20px calc(28px + env(safe-area-inset-bottom))',
              maxWidth: '430px',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '4px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--surface-border)',
                margin: '0 auto 22px',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'var(--text-2xl)',
                color: 'var(--text-primary)',
                letterSpacing: 'var(--tracking-tight)',
                lineHeight: 1.15,
              }}
            >
              Sign in to open
              <br />
              the boat
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                {
                  title: 'Boat management',
                  body: 'The polar, the crossover chart, rig tune and instrument calibration — what the boat is set to now.',
                },
                {
                  title: 'Boat performance',
                  body: 'Every race in the archive, with the track, the traces and what the file actually recorded.',
                },
              ].map((item) => (
                <div key={item.title} style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ color: 'var(--text-accent)', marginTop: '2px', flexShrink: 0 }}>
                    <LockIcon size={14} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-base)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                        marginTop: '2px',
                      }}
                    >
                      {item.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Everything above is why; the button sits in the thumb zone. */}
            <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
              <GoogleButton onClick={onCloseSheet} />
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  lineHeight: 1.6,
                  marginTop: '12px',
                }}
              >
                There is no sign-up. The boat&apos;s owner makes the account,
                <br />
                and your Google address is the key to it.
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
