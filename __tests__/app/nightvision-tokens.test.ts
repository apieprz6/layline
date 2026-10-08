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
