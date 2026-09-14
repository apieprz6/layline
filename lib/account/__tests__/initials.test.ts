import { initialsOf } from '../initials'

describe('initialsOf', () => {
  it('takes the first and last initial of a two-part name', () => {
    expect(initialsOf('Alex Pieprzycki')).toBe('AP')
  })

  it('doubles nothing for a single-part name — one letter is the answer', () => {
    expect(initialsOf('Alex')).toBe('A')
  })

  it('skips the middle of a three-part name', () => {
    expect(initialsOf('Bartholomew Q Vanderstraaten')).toBe('BV')
  })

  it('uppercases what it finds', () => {
    expect(initialsOf('alex pieprzycki')).toBe('AP')
  })

  it('tolerates surrounding and repeated whitespace', () => {
    expect(initialsOf('  Alex   Pieprzycki  ')).toBe('AP')
  })

  // The whole point of the helper (AGENTS.md, ADR 0021): a Display Name Google
  // never gave us yields no initials, and never a letter from the address.
  it('returns null for a null Display Name', () => {
    expect(initialsOf(null)).toBeNull()
  })

  it('returns null for an empty or whitespace-only Display Name', () => {
    expect(initialsOf('')).toBeNull()
    expect(initialsOf('   ')).toBeNull()
  })

  it('never falls back to an email address', () => {
    // Nothing in the signature can reach an address, which is the design; this
    // pins the one thing a future edit might be tempted to add.
    expect(initialsOf(null)).not.toBe('J')
    expect(initialsOf(null)).toBeNull()
  })
})
