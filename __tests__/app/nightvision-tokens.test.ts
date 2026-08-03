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
