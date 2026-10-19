import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Night vision's rules, as invariants rather than hex pins (ADR 0043).
 *
 * Red and amber are the theme: text, surfaces, accent and chrome. Dim green and blue appear only
 * on marks that carry meaning, where that hue already means the same thing by day, and each is no
 * brighter than the red or amber it sits beside. What these tests hold is that rule and the
 * readability it buys, so a hex can be retuned by eye without rewriting them.
 */
describe('.theme-nightvision CSS token overrides', () => {
  const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8')

  function extractBlock(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`)
    const match = css.match(regex)
    return match ? match[1] : ''
  }

  function getPropertyValue(declarations: string, property: string): string | null {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${escaped}\\s*:\\s*([^;]+);`)
    const match = declarations.match(regex)
    return match ? match[1].trim() : null
  }

  const root = extractBlock(':root')
  const nightvision = extractBlock('.theme-nightvision')
  const night = (token: string): string => getPropertyValue(nightvision, token)!
  const day = (token: string): string => getPropertyValue(root, token)!

  type Rgba = [red: number, green: number, blue: number, alpha: number]

  /** A `#RRGGBB` or `rgba(r, g, b, a)` value as channels, or null for anything else. */
  function parse(value: string): Rgba | null {
    const hex = value.match(/^#([0-9a-f]{6})$/i)
    if (hex) {
      const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex[1].substring(at, at + 2), 16))
      return [red, green, blue, 1]
    }
    const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
    if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4] ?? 1)]
    return null
  }

  const linear = (byte: number): number => {
    const value = byte / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }

  /**
   * Relative luminance (WCAG), with a translucent value composited over the card it is drawn on —
   * a 10% wash is not as bright as the colour it is mixed from.
   */
  function luminance(value: string): number {
    const [red, green, blue, alpha] = parse(value)!
    const [baseRed, baseGreen, baseBlue] = parse(night('--surface-raised'))!
    const mix = (channel: number, base: number): number => linear(channel * alpha + base * (1 - alpha))
    return 0.2126 * mix(red, baseRed) + 0.7152 * mix(green, baseGreen) + 0.0722 * mix(blue, baseBlue)
  }

  function contrast(foreground: string, background: string): number {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  }

  /** OKLab, for perceived lightness and hue — the measure the ramps were tuned in. */
  function oklab(hex: string): [lightness: number, a: number, b: number] {
    const [red, green, blue] = parse(hex)!.slice(0, 3).map(linear)
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
  }

  const lightness = (hex: string): number => oklab(hex)[0]

  function hueDegrees(hex: string): number {
    const [, a, b] = oklab(hex)
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  }

  function difference(one: string, other: string): number {
    const [x, y] = [oklab(one), oklab(other)]
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
  }

  /** Green or blue outweighs red: the short-wavelength hues this theme spends sparingly. */
  function coolDominant(value: string): boolean {
    const [red, green, blue] = parse(value)!
    return green > red || blue > red
  }

  /** Every token the theme declares, by name. */
  const declared = [...nightvision.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
    ([, token, value]) => [token, value.trim()] as const
  )

  it('defines a .theme-nightvision block', () => {
    expect(nightvision).not.toBe('')
  })

  it('keeps the near-black surfaces', () => {
    expect(night('--surface-base')).toBe('#0A0000')
    expect(night('--surface-raised')).toBe('#120000')
    expect(night('--surface-elevated')).toBe('#1A0000')
  })

  describe('readability', () => {
    it('holds primary and secondary text to 4.5:1 and muted to 3:1 against the card', () => {
      // On main before ADR 0043, secondary was 2.9:1 and muted 1.6:1 — and between them they are
      // most of the labels, units and captions on every screen.
      const card = night('--surface-raised')
      expect(contrast(night('--text-primary'), card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(night('--text-secondary'), card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(night('--text-muted'), card)).toBeGreaterThanOrEqual(3)
    })
  })

  describe('red and amber are the theme', () => {
    it('makes no text, surface or accent token green- or blue-dominant', () => {
      const chrome = declared.filter(
        ([token, value]) =>
          /^--(text|surface|accent|blue-|skeleton|page-bg|chart-bg|chart-label|chart-grid|chart-center|chart-ink|logo)/.test(
            token
          ) && parse(value) !== null
      )

      expect(chrome.length).toBeGreaterThan(20)
      chrome.forEach(([token, value]) => {
        expect({ token, cool: coolDominant(value) }).toEqual({ token, cool: false })
      })
    })

    it('holds every green or blue mark at or below the brightest red or amber on its own scale', () => {
      // Rods are most sensitive near blue-green, and what dark adaptation pays for is brightness ×
      // area. So a cool mark may carry meaning, but it may never be the brightest thing beside it.
      const scales: string[][] = [
        ['--tack-port', '--tack-starboard'],
        ['--wind-light', '--wind-medium', '--wind-heavy', '--wind-storm'],
        [
          '--trend-building',
          '--trend-easing',
          '--trend-steady',
          '--trend-veering',
          '--trend-backing',
        ],
        ['--state-success', '--state-warning', '--state-danger', '--state-info', '--state-neutral'],
        [1, 2, 3].flatMap((step) => [`--track-port-${step}`, `--track-stbd-${step}`]),
        [
          '--track-below-3',
          '--track-below-2',
          '--track-below-1',
          '--track-at',
          '--track-above-1',
          '--track-above-2',
          '--track-above-3',
        ],
        ['--track-agree', '--track-differ'],
      ]

      const cool = declared.filter(([, value]) => parse(value) !== null && coolDominant(value))
      const covered = new Set(scales.flat())
      // A cool token outside these scales has no warm neighbour to be measured against, which means
      // a hue arrived somewhere this rule has not been asked about.
      cool
        .filter(([token]) => !/-(bg|border)$/.test(token))
        .forEach(([token]) => expect({ token, covered: covered.has(token) }).toEqual({ token, covered: true }))

      scales.forEach((scale) => {
        const warm = scale.filter((token) => !coolDominant(night(token)))
        const ceiling = Math.max(...warm.map((token) => luminance(night(token))))
        scale
          .filter((token) => coolDominant(night(token)))
          .forEach((token) => {
            expect({ token, withinCeiling: luminance(night(token)) <= ceiling }).toEqual({
              token,
              withinCeiling: true,
            })
          })
      })
    })

    it('draws the four wind bands in four distinct hues', () => {
      // Heavy air and storm were 1.03:1 apart on the old all-red ramp: the same colour.
      const hues = ['--wind-light', '--wind-medium', '--wind-heavy', '--wind-storm'].map((token) =>
        hueDegrees(night(token))
      )
      hues.forEach((hue, index) => {
        hues.slice(index + 1).forEach((other) => {
          const apart = Math.min(Math.abs(hue - other), 360 - Math.abs(hue - other))
          expect(apart).toBeGreaterThanOrEqual(25)
        })
      })
    })
  })

  /**
   * The Race Track Heatmap's scales (ADRs 0033, 0038).
   *
   * Every band of every overlay has to be declared in both themes, or that overlay keeps its
   * daylight hues on a near-black screen — a chart escaping the theme, which is the one thing
   * `globals.css` forbids.
   */
  describe('the race track scales', () => {
    const RATIO = [
      '--track-below-3',
      '--track-below-2',
      '--track-below-1',
      '--track-at',
      '--track-above-1',
      '--track-above-2',
      '--track-above-3',
    ]
    const OTHERS = [
      ...[1, 2, 3, 4, 5].map((step) => `--track-speed-${step}`),
      ...[1, 2, 3].map((step) => `--track-port-${step}`),
      ...[1, 2, 3].map((step) => `--track-stbd-${step}`),
      '--track-agree',
      '--track-differ',
    ]

    it('declares every band in both themes, and never as a var()', () => {
      // ADR 0033's refusal is about the *token*, not the hue: the ramp being written as
      // `var(--wind-heavy)` would mean a change to what 16–22 knots looks like silently moved what
      // 85–95% of target looks like.
      ;[...RATIO, ...OTHERS].forEach((token) => {
        expect(getPropertyValue(root, token)).not.toBeNull()
        expect(getPropertyValue(nightvision, token)).not.toBeNull()
        expect(getPropertyValue(root, token)).not.toMatch(/var\(/)
        expect(getPropertyValue(nightvision, token)).not.toMatch(/var\(/)
      })
    })

    it('is a neutral gray at the midpoint by day, never a hue', () => {
      // The diverging rule: a hue in the middle makes on-target look like a side.
      const [red, green, blue] = parse(day('--track-at'))!
      expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(0x20)
    })

    it('still diverges after dark: green above target, amber below, balanced step for step', () => {
      ;[1, 2, 3].forEach((step) => {
        const above = night(`--track-above-${step}`)
        const below = night(`--track-below-${step}`)
        const [red, green, blue] = parse(above)!
        expect(green).toBeGreaterThan(Math.max(red, blue))

        // Amber: red leads, green follows well clear of blue — not a red, not a yellow-green.
        const [belowRed, belowGreen, belowBlue] = parse(below)!
        expect(belowRed).toBeGreaterThan(belowGreen)
        expect(belowGreen).toBeGreaterThan(belowBlue)
        expect(belowGreen / belowRed).toBeGreaterThan(0.45)

        // Neither arm shouts: depth is distance from target, whichever side it is on.
        const [brighter, dimmer] = [luminance(above), luminance(below)].sort((a, b) => b - a)
        expect(brighter / dimmer).toBeLessThanOrEqual(1.25)
      })
    })

    it('keeps port and starboard apart after dark', () => {
      ;[1, 2, 3].forEach((step) => {
        expect(coolDominant(night(`--track-port-${step}`))).toBe(false)
        expect(coolDominant(night(`--track-stbd-${step}`))).toBe(true)
      })
    })

    it('runs the speed ramp darker-is-faster by day and brighter-is-faster after dark', () => {
      // Real lightness, not a channel byte: the steps differ in all three channels at once.
      const steps = [1, 2, 3, 4, 5].map((step) => `--track-speed-${step}`)
      const byDay = steps.map((token) => lightness(day(token)))
      const afterDark = steps.map((token) => lightness(night(token)))

      byDay.slice(1).forEach((value, index) => expect(value).toBeLessThan(byDay[index]))
      afterDark.slice(1).forEach((value, index) => expect(value).toBeGreaterThan(afterDark[index]))
    })

    it('keeps the boat-speed ramp off the UI accent’s blue by day', () => {
      // The ramp used to be the accent's own blue, so the data read as interface.
      ;[1, 2, 3, 4, 5].forEach((step) => {
        expect(coolDominant(day(`--track-speed-${step}`))).toBe(false)
      })
    })

    it('does not paint a difference in the Dropout ring’s own red, in either theme', () => {
      // --wind-storm rings every Frozen row and dashes every bridge. A disagreeing stretch sharing
      // that colour would make a dead feed and a sail decision the same thing on one map.
      expect(day('--track-differ')).not.toBe(day('--wind-storm'))
      expect(difference(night('--track-differ'), night('--wind-storm'))).toBeGreaterThanOrEqual(0.05)
    })

    it('keeps every port step distinguishable from the Dropout ring after dark', () => {
      // 0.05 in OKLab: the prototype's own difference red, #FF5A40, sat at 0.043 from the ring's
      // #FF3A2A and was rejected as the same colour.
      ;[1, 2, 3].forEach((step) => {
        expect(
          difference(night(`--track-port-${step}`), night('--wind-storm'))
        ).toBeGreaterThanOrEqual(0.05)
      })
    })

    it('spends the wind-speed tokens on no scale of its own', () => {
      // `TWS` reads `--wind-*` directly, which is why there is no `--track-wind-*` family: two
      // copies of what medium air looks like would be two chances to disagree about it.
      expect(getPropertyValue(root, '--track-wind-1')).toBeNull()
    })
  })

  describe('html transition for smooth theme switch', () => {
    it('applies a 300ms background-color and color transition to html', () => {
      const htmlBlock = extractBlock('html')
      const transition = getPropertyValue(htmlBlock, 'transition')
      expect(transition).toContain('background-color')
      expect(transition).toContain('color')
      expect(transition).toContain('300ms')
    })
  })
})
