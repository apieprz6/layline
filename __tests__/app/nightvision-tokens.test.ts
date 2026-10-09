import { readFileSync } from 'fs'
import { resolve } from 'path'

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

  function redChannelBrightness(hex: string): number {
    const clean = hex.replace('#', '')
    return parseInt(clean.substring(0, 2), 16)
  }

  /**
   * Relative luminance, for the ramps whose steps differ in more than the red channel.
   *
   * This theme's lightest reds are washed out rather than saturated — `#FFB3B3` and `#FF6B6B` are
   * two depths and the same red byte — so the proxy above cannot order them.
   */
  function lightness(hex: string): number {
    const clean = hex.replace('#', '')
    const channel = (at: number): number => {
      const value = parseInt(clean.substring(at, at + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }

    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  }

  const nightvision = extractBlock('.theme-nightvision')

  it('defines a .theme-nightvision block', () => {
    expect(nightvision).not.toBe('')
  })

  describe('surface tokens', () => {
    it('overrides --surface-base to near-black', () => {
      expect(getPropertyValue(nightvision, '--surface-base')).toBe('#0A0000')
    })

    it('overrides --surface-raised', () => {
      expect(getPropertyValue(nightvision, '--surface-raised')).toBe('#120000')
    })

    it('overrides --surface-elevated', () => {
      expect(getPropertyValue(nightvision, '--surface-elevated')).toBe('#1A0000')
    })

    it('overrides --surface-border', () => {
      expect(getPropertyValue(nightvision, '--surface-border')).toBe('rgba(180,0,0,0.25)')
    })

    it('overrides --surface-divider', () => {
      expect(getPropertyValue(nightvision, '--surface-divider')).toBe('rgba(180,0,0,0.12)')
    })
  })

  describe('text tokens', () => {
    it('overrides --text-primary to brightest red', () => {
      expect(getPropertyValue(nightvision, '--text-primary')).toBe('#FF4444')
    })

    it('overrides --text-secondary to mid-brightness red', () => {
      expect(getPropertyValue(nightvision, '--text-secondary')).toBe('#AA2222')
    })

    it('overrides --text-muted to dimmest red', () => {
      expect(getPropertyValue(nightvision, '--text-muted')).toBe('#661111')
    })
  })

  describe('accent tokens', () => {
    it('overrides --blue-500 to red', () => {
      expect(getPropertyValue(nightvision, '--blue-500')).toBe('#CC0000')
    })

    it('overrides --accent to red', () => {
      expect(getPropertyValue(nightvision, '--accent')).toBe('#CC0000')
    })
  })

  describe('wind condition colors with ascending brightness', () => {
    it('overrides all four wind tokens', () => {
      expect(getPropertyValue(nightvision, '--wind-light')).toBe('#993333')
      expect(getPropertyValue(nightvision, '--wind-medium')).toBe('#CC2222')
      expect(getPropertyValue(nightvision, '--wind-heavy')).toBe('#EE3300')
      expect(getPropertyValue(nightvision, '--wind-storm')).toBe('#FF0000')
    })

    it('wind colors increase in brightness from light to storm', () => {
      const light = redChannelBrightness('#993333')
      const medium = redChannelBrightness('#CC2222')
      const heavy = redChannelBrightness('#EE3300')
      const storm = redChannelBrightness('#FF0000')

      expect(medium).toBeGreaterThan(light)
      expect(heavy).toBeGreaterThan(medium)
      expect(storm).toBeGreaterThan(heavy)
    })
  })

  describe('trend tokens collapse to red brightness variants', () => {
    it('overrides --trend-building', () => {
      expect(getPropertyValue(nightvision, '--trend-building')).not.toBeNull()
    })

    it('overrides --trend-easing', () => {
      expect(getPropertyValue(nightvision, '--trend-easing')).not.toBeNull()
    })

    it('overrides --trend-veering', () => {
      expect(getPropertyValue(nightvision, '--trend-veering')).not.toBeNull()
    })

    it('overrides --trend-backing', () => {
      expect(getPropertyValue(nightvision, '--trend-backing')).not.toBeNull()
    })

    it('overrides --trend-steady', () => {
      expect(getPropertyValue(nightvision, '--trend-steady')).not.toBeNull()
    })

    it('trend colors are distinguishable by brightness', () => {
      const building = getPropertyValue(nightvision, '--trend-building')!
      const easing = getPropertyValue(nightvision, '--trend-easing')!
      const steady = getPropertyValue(nightvision, '--trend-steady')!
      const veering = getPropertyValue(nightvision, '--trend-veering')!
      const backing = getPropertyValue(nightvision, '--trend-backing')!

      const brightnesses = [building, easing, steady, veering, backing].map(redChannelBrightness)
      const unique = new Set(brightnesses)
      expect(unique.size).toBe(brightnesses.length)
    })
  })

  describe('state tokens', () => {
    it('overrides --state-success', () => {
      expect(getPropertyValue(nightvision, '--state-success')).toBe('#AA2222')
    })
  })

  /**
   * The Race Track Heatmap's percent-of-target ramp (ADR 0033).
   *
   * Every one of the seven has to be declared here, or the map keeps its daylight blue and amber on
   * a near-black screen — a chart escaping the theme, which is the one thing `globals.css` forbids
   * and the exact mistake the prototype made and kept as a finding.
   */
  describe('the race track ramp', () => {
    const root = extractBlock(':root')
    const BANDS = [
      '--track-below-3',
      '--track-below-2',
      '--track-below-1',
      '--track-at',
      '--track-above-1',
      '--track-above-2',
      '--track-above-3',
    ]

    it('declares all seven bands by day and overrides all seven after dark', () => {
      BANDS.forEach((band) => {
        expect(getPropertyValue(root, band)).not.toBeNull()
        expect(getPropertyValue(nightvision, band)).not.toBeNull()
      })
    })

    it('is a neutral gray at the midpoint by day, never a hue', () => {
      // The diverging rule: a hue in the middle makes on-target look like a side.
      const at = getPropertyValue(root, '--track-at')!.replace('#', '')
      const [red, green, blue] = [0, 2, 4].map((at_) => parseInt(at.substring(at_, at_ + 2), 16))
      expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(0x20)
    })

    it('holds its own value for every band rather than aliasing a wind-speed token', () => {
      // ADR 0033's refusal is about the *token*, not the hue: two of these steps are the design
      // system's own amber and blue, and the ramp needs an amber and a blue. What must not happen
      // is the ramp being written as `var(--wind-heavy)`, which would mean a change to what 16–22
      // knots looks like silently moved what 85–95% of target looks like.
      BANDS.forEach((band) => {
        expect(getPropertyValue(root, band)).not.toMatch(/var\(/)
        expect(getPropertyValue(nightvision, band)).not.toMatch(/var\(/)
      })
    })

    /**
     * The three scales ADR 0037 adds beside the ratio ramp.
     *
     * Every band of every overlay has to be declared in both themes, or that overlay keeps its
     * daylight hues on a near-black screen — a chart escaping the theme, which is the one thing
     * `globals.css` forbids.
     */
    it('declares the speed, tack and quadrant scales in both themes too', () => {
      const scales = [
        ...[1, 2, 3, 4, 5].map((step) => `--track-speed-${step}`),
        ...[1, 2, 3].map((step) => `--track-port-${step}`),
        ...[1, 2, 3].map((step) => `--track-stbd-${step}`),
        '--track-agree',
        '--track-differ',
      ]

      scales.forEach((token) => {
        expect(getPropertyValue(root, token)).not.toBeNull()
        expect(getPropertyValue(nightvision, token)).not.toBeNull()
        expect(getPropertyValue(root, token)).not.toMatch(/var\(/)
      })
    })

    it('keeps the speed ramp monotone after dark, since one hue survives one hue', () => {
      // Measured as real lightness rather than by the red byte: this theme's lightest steps are
      // washed-out reds like `#FFB3B3` and `#FF6B6B`, which are the *same* in red and differ in
      // the other two channels — so a red-byte reading would call them one depth.
      const depth = [1, 2, 3, 4, 5].map((step) =>
        lightness(getPropertyValue(nightvision, `--track-speed-${step}`)!)
      )

      expect(depth).toEqual([...depth].sort((a, b) => b - a))
      expect(new Set(depth).size).toBe(depth.length)
    })

    it('collapses the two tacks onto one ramp after dark, and says so in the legend', () => {
      // Accepted, like the diverging ramp: there is one hue to be symmetric in, so port and
      // starboard *are* the same colour and depth becomes the angle. The obligation that comes
      // with it is on the words, which `RaceTrackSection.test.tsx` pins.
      ;[1, 2, 3].forEach((step) => {
        expect(getPropertyValue(nightvision, `--track-port-${step}`)).toBe(
          getPropertyValue(nightvision, `--track-stbd-${step}`)
        )
      })
    })

    it('keeps agreement and difference apart after dark, with the difference brighter', () => {
      // Two steps is the least a ramp can hold, and which way round matters: a difference between
      // the two records is the thing worth noticing on a dark boat.
      const agree = lightness(getPropertyValue(nightvision, '--track-agree')!)
      const differ = lightness(getPropertyValue(nightvision, '--track-differ')!)

      expect(differ).toBeGreaterThan(agree)
    })

    it('does not paint a difference in the Dropout ring’s own red', () => {
      // --wind-storm rings every Frozen row and dashes every bridge. A disagreeing stretch sharing
      // that colour would make a dead feed and a sail decision the same thing on one map.
      expect(getPropertyValue(root, '--track-differ')).not.toBe(
        getPropertyValue(root, '--wind-storm')
      )
    })

    it('spends the wind-speed tokens on no scale of its own', () => {
      // `TWS` reads `--wind-*` directly, which is why there is no `--track-wind-*` family: two
      // copies of what medium air looks like would be two chances to disagree about it.
      expect(getPropertyValue(root, '--track-wind-1')).toBeNull()
    })

    it('collapses after dark to one red ramp, symmetric about the brightest midpoint', () => {
      // Accepted, not worked around: with one hue to be symmetric in, 85% and 115% *are* the same
      // colour. The obligation that comes with it is on the legend's words, which
      // `RaceTrackSection.test.tsx` pins — a legend keeping "slower … faster" here is the defect.
      const value = (band: string): string => getPropertyValue(nightvision, band)!
      expect(value('--track-below-3')).toBe(value('--track-above-3'))
      expect(value('--track-below-2')).toBe(value('--track-above-2'))
      expect(value('--track-below-1')).toBe(value('--track-above-1'))

      const depth = [
        value('--track-at'),
        value('--track-below-1'),
        value('--track-below-2'),
        value('--track-below-3'),
      ].map(redChannelBrightness)
      expect(depth).toEqual([...depth].sort((a, b) => b - a))
      expect(new Set(depth).size).toBe(depth.length)
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
