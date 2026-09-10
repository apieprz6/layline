/**
 * PROTOTYPE FIXTURE — throwaway. See ./README.md.
 *
 * Four account states the drawer's account block has to render, and the one
 * pure derivation the variants share. Nothing here is real; no name below
 * belongs to anyone.
 */

export type AccountStateKey = 'guest' | 'owner' | 'crew' | 'nameless'

/** What ADR 0018's Account resolution hands the drawer: email + one Profile. */
export interface PrototypeAccount {
  email: string
  /** Google's `name` claim. Null when the account granted no `profile` scope. */
  displayName: string | null
  role: 'admin' | 'viewer'
}

export const ACCOUNT_STATES: { key: AccountStateKey; label: string; account: PrototypeAccount | null }[] = [
  { key: 'guest', label: 'Guest', account: null },
  {
    key: 'owner',
    label: 'Owner',
    account: { email: 'alex@example.com', displayName: 'Alex Pieprzycki', role: 'admin' },
  },
  {
    // Long on both lines on purpose: 268px minus padding, avatar and gap is the
    // whole question for a name the owner does not control.
    key: 'crew',
    label: 'Long name',
    account: {
      email: 'bartholomew.vanderstraaten@example.com',
      displayName: 'Bartholomew Vanderstraaten',
      role: 'viewer',
    },
  },
  {
    // The case nothing has designed: a Google account that granted no profile
    // scope. There are no initials to draw and none may be invented.
    key: 'nameless',
    label: 'No name',
    account: { email: 'jt.crew@example.com', displayName: null, role: 'viewer' },
  },
]

export function accountFor(key: AccountStateKey): PrototypeAccount | null {
  return (ACCOUNT_STATES.find((s) => s.key === key) ?? ACCOUNT_STATES[0]).account
}

/**
 * Initials from a Display Name, or null when there is no name.
 *
 * Deliberately never falls back to the email address: per AGENTS.md and
 * ADR 0020 a missing name is stored and shown as missing, never synthesised.
 * This is the one bit of logic worth lifting out of the prototype.
 */
export function initialsOf(displayName: string | null): string | null {
  if (!displayName) return null
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
