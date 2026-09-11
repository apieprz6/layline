/**
 * Initials from a **Display Name**, or `null` when there is no name.
 *
 * Deliberately never falls back to the email address. Google's `name` claim is
 * the only source of a Display Name (ADR 0020), an account that granted no
 * `profile` scope supplies none, and a value a source did not give is not
 * synthesised — not a name, and not one character of one (AGENTS.md, ADR 0021).
 * Where this returns `null` the UI stands a silhouette in place of the initials.
 *
 * Lifted from the LAY-119 prototype, which is the only place the rule was
 * written down: `app/prototype/account/fixture.ts` on
 * `prototype/lay-119-account-block`.
 */
export function initialsOf(displayName: string | null): string | null {
  if (!displayName) return null
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
