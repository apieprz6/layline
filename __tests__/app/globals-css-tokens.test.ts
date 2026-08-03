import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('globals.css base color tokens', () => {
  const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8')

  function extractRuleDeclarations(selector: string): string {
    const regex = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g')
    const matches: string[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(css)) !== null) {
      matches.push(match[1])
    }
    return matches.join('\n')
  }

  function getPropertyValue(declarations: string, property: string): string | null {
    const regex = new RegExp(`${property}\\s*:\\s*([^;]+);`)
    const match = declarations.match(regex)
    return match ? match[1].trim() : null
  }

  describe('html element', () => {
    const htmlDeclarations = extractRuleDeclarations('html')

    it('uses a CSS variable for background', () => {
      const bg = getPropertyValue(htmlDeclarations, 'background')
      expect(bg).not.toBeNull()
      expect(bg).toMatch(/var\(--/)
    })

    it('uses a CSS variable for color', () => {
      const color = getPropertyValue(htmlDeclarations, 'color')
      expect(color).not.toBeNull()
      expect(color).toMatch(/var\(--/)
    })
  })

  describe('body element', () => {
    const bodyDeclarations = extractRuleDeclarations('body')

    it('uses a CSS variable for background', () => {
      const bg = getPropertyValue(bodyDeclarations, 'background')
      expect(bg).not.toBeNull()
      expect(bg).toMatch(/var\(--/)
    })

    it('uses a CSS variable for color', () => {
      const color = getPropertyValue(bodyDeclarations, 'color')
      expect(color).not.toBeNull()
      expect(color).toMatch(/var\(--/)
    })
  })
})
