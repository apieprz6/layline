# ADR 0043: Night Vision Is Long-Wavelength, with Dim Green and Blue Only on Marks That Carry Meaning

## Status

Accepted. Resolves LAY-195. Replaces the rule `app/globals.css` stated as "monochromatic
red-on-black" since the theme was introduced (ADR 0024's store applies it).

**Amends ADR 0033** (the diverging ramp no longer collapses after dark, and the theme-aware legend it
required is gone), **ADR 0038** (the tack pair no longer merges, and no overlay owes an after-dark
sentence) and **ADR 0030** (the sail bands are two hues after dark rather than one, and the state
colours are distinct again; a cell still prints its number).

Decided on a throwaway branch, `prototype/night-vision-palettes`, which built four variants and two
optional hue layers on the real fixture screens. The owner chose **variant C (red and amber), plus
the green layer, plus the blue layer**, with a heat ramp for boat speed (2026-10-19). That branch is
the artifact and is not merged.

## Context

Night vision existed to protect dark adaptation on a boat after dusk. Its rule was one hue, red, and
it cost more than it protected. Measured against the card (`--surface-raised`, `#120000`):

| | before | after |
| -- | -- | -- |
| `--text-primary` | 6.0:1 | 9.5:1 |
| `--text-secondary` | **2.9:1** | 5.8:1 |
| `--text-muted` | **1.6:1** | 3.7:1 |

Secondary and muted text together appear 342 times in components, against 133 for primary. So most
labels, units and captions on every screen sat below the 3:1 floor for non-text contrast, never mind
text.

The wind bands were 1.33, 1.34 and **1.03:1** apart from each other, so heavy air and storm were the
same colour. The Race Track Heatmap gave up information after dark: port and starboard were one
colour, 85% and 115% of target were one colour, and each legend carried a second sentence apologising
for it (ADRs 0033 and 0038).

The single-hue rule was stricter than the physiology. Rods barely respond to long wavelengths, so red
and amber are nearly free. What dark adaptation pays for is **brightness × area**, not whether a hue
appears at all. A small, dim green mark costs less than a bright red panel.

## Decision

### Red and amber are the theme

Text, surfaces, the accent and every piece of chrome are red or amber. The text ramp is lifted so
that primary and secondary hold 4.5:1 and muted holds 3:1 against the card.

The **UI accent stays red** (`#FF5A40`), despite living in tokens named `--blue-*`. The accent is
interface, not meaning, and green or blue on a button would spend the theme's scarce hues on chrome.

### Green and blue appear only on marks that carry meaning

A green or blue mark is allowed where that hue already means the same thing by day: starboard,
faster than target, agreement with the chart, light air, success, a building breeze (green); and
medium air and a veering shift (blue). It never appears on a text token or a surface, and it is
**never brighter than the brightest red or amber on its own scale**. Starboard is held under port,
the above-target arm under the below-target arm, veering under backing, light and medium air under
heavy air and storm.

The cap is per scale, not one global ceiling. The ticket proposed capping every cool mark at
`--tack-port`, and the owner-chosen values broke that: `#7B9CF0` (veering) and `#48A673` (the first
starboard and above-target steps) are brighter than port, and dimmer than the red beside them. What
dark adaptation notices is the brightest thing in the patch of screen being looked at, so the scale
is the unit that matters.

### Blue is a periwinkle, not daylight's blue

Medium air is `#5A7ED8`, not daylight's `#0055BB`. On black, `#0055BB` is 2.98:1. It is also the
hue that blurs worst: short wavelengths focus in front of the retina and scatter most in the eye. A
lighter, less saturated blue reads as a mark at 5.3:1 and is still held under the amber and red
beside it.

### Every scale keeps its daylight meaning, so legends have one sentence

- **Percent of target** diverges again: daylight's amber below and green above, which is also the
  colour-blind-safe pairing, balanced in luminance step for step (within 25%) around a dim warm
  neutral.
- **Wind angle**: port red, starboard green, as everywhere else.
- **Wind speed**: green, blue, amber, red. Four distinct hues, matching daylight's meanings.
- **Sail vs chart**: a dim green for agreement and amber for a difference. Not red, because
  `--wind-storm` is red and is the Dropout ring's. A disagreeing stretch must not look like a dead
  feed, which is the collision ADR 0038 already forbids by day.
- **Boat speed**: one amber ramp, brighter for faster.

Because each overlay means the same thing in both themes, `TrackScale` carries one sentence
(`wording`), not a day and a night one, and that sentence names no hue. The legend is no longer a
Client Component on the theme's account.

### By day, boat speed is a heat ramp

Daylight's boat-speed ramp was the accent's blue, so the data read as interface. It is now gold to
dark brown, `#CC9628` to `#521C08`: monotone OKLab lightness, adjacent ΔL ≥ 0.09, light end 2.26:1
against the sand surface. It stops at brown because red is the Dropout ring's. Nothing else in
daylight changes.

## Consequences

- **The theme is held by invariants, not hex pins.** `__tests__/app/nightvision-tokens.test.ts`
  checks text contrast, that no chrome token is green- or blue-dominant, the per-scale luminance
  cap, the ratio ramp's divergence and balance, both speed ramps' monotonicity, that the
  difference and every port step are at least 0.05 apart in OKLab from the Dropout ring, and that
  the four wind bands are at least 25° apart in hue. A hex can be retuned by eye without rewriting
  a test.
- **The closest call is port's middle step.** `--track-port-2` `#E0402F` is 0.059 from the ring's
  `#FF3A2A` in OKLab. The prototype's own difference red, `#FF5A40`, was 0.043 and was rejected as
  the same colour. The ring is also a ring and the bridge a dash, so shape separates them too.
- **The number in a Crossover Chart cell still prints, whatever its colour** (ADR 0030). The reason
  has changed: after dark the eight sail bands are two hues, red and amber deepening in pairs,
  rather than eight tints of one red. Some sailors cannot separate hues at all.
- **Night vision now costs some rod sensitivity it didn't before.** Green and blue marks are small
  and dim by rule, but they are not free. If a crew on an overnight race finds them too bright, the
  first lever is their luminance, not their hue.

## Rejected alternatives

- **Red only, contrast fixed** (variant B). It fixed the text but could not diverge, so every
  collapse ADRs 0033 and 0038 accepted stayed.
- **Amber type, red ink** (variant D). Text in amber, as on marine instruments, with surfaces tinted
  brown. It moves the theme off red, which is what sailing at night looks like, and the owner chose
  C over it.
- **Daylight's `#0055BB` for medium air.** 2.98:1 on black, and the blurriest hue there is.
- **A violet speed ramp by day.** It also avoids the accent and the ring, and the owner preferred
  heat. Either way the ramp becomes amber after dark, since violet is the shortest wavelength and
  costs the most night vision.
