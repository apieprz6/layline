/**
 * The angle wrap, and the transliteration of it that silently gets a subset of headings wrong.
 *
 * `normalizeAngle` is three lines, and it exists as its own named function entirely because of the
 * second test below: the Python it is ported from reads identically in JavaScript and means
 * something else, so the only way to keep the difference visible is to write down what the wrong
 * version returns.
 */

import { awaToSigned, normalizeAngle } from '@/services/analysis/angles'

/**
 * The prior art's own source text, in JavaScript: `(angle + 180) % 360 - 180`.
 *
 * Correct in Python, where `%` is a modulo and takes the sign of its divisor. Here `%` is a
 * remainder and takes the sign of its dividend, so every input below −180 comes back unwrapped.
 */
function transliterated(angleDeg: number): number {
  return ((angleDeg + 180) % 360) - 180
}

describe('wrapping an angle difference', () => {
  it('turns a flip across 0°/360° into the ten degrees it actually is', () => {
    // A compass reading 5° against a GPS course of 355°: the boat is pointing ten degrees right of
    // its track, and the raw subtraction says −350.
    expect(normalizeAngle(5 - 355)).toBe(10)
  })

  it('where a plain `%` says −350, which is the whole reason this function is named', () => {
    // Not a near miss and not a sign error: an unwrapped difference, 35 times the size of the real
    // one, which would enter a mean as a −350° compass error on every row near north.
    expect(transliterated(5 - 355)).toBe(-350)
    expect(transliterated(5 - 355)).not.toBe(normalizeAngle(5 - 355))
  })

  it('and agrees with the plain `%` everywhere at or above −180, which is why it reads as correct', () => {
    for (const difference of [-180, -90, -1, 0, 1, 90, 179]) {
      expect(transliterated(difference)).toBe(normalizeAngle(difference))
    }
  })

  it('wraps both ways round, and more than once round', () => {
    expect(normalizeAngle(350)).toBe(-10)
    expect(normalizeAngle(-350)).toBe(10)
    expect(normalizeAngle(710)).toBe(-10)
    expect(normalizeAngle(-710)).toBe(10)
  })

  it('puts the half turn at −180, as the prior art does', () => {
    // [−180, 180): 180 and −180 are one angle and one of them has to be it. Pinned because a
    // rewrite that chose the other end would move every bin mean at the back of the boat.
    expect(normalizeAngle(180)).toBe(-180)
    expect(normalizeAngle(-180)).toBe(-180)
  })
})

describe('reading an unsigned apparent wind angle as a signed one', () => {
  it('leaves the starboard half alone and folds the port half negative', () => {
    expect(awaToSigned(45)).toBe(45)
    expect(awaToSigned(315)).toBe(-45)
    expect(awaToSigned(179)).toBe(179)
    expect(awaToSigned(181)).toBe(-179)
  })

  it('folds dead ahead and dead astern to starboard, where there is no side to get wrong', () => {
    expect(awaToSigned(0)).toBe(0)
    expect(awaToSigned(180)).toBe(180)
  })

  it('and defends against a range the format never promised', () => {
    // No negative value appears in the archive, which is a measurement rather than a guarantee.
    expect(awaToSigned(-45)).toBe(-45)
    expect(awaToSigned(405)).toBe(45)
  })
})
