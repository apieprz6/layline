/**
 * No colour literal in the dashboard, the race flow or the race page
 *
 * A hex or `rgba()` is the daylight value written out, so it ignores `.theme-nightvision` and
 * paints blue, green or cyan onto a dark boat (LAY-194). Colours come from tokens — `var(--…)`,
 * or `tint()` of one for a translucent wash — and an SVG takes them through `style`, not a
 * presentation attribute.
 *
 * Comment lines are skipped: a comment that names the hex a token holds isn't painting anything.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..')
// The dashboard and the race flow, plus the race page's components and the wind-band source, which
// LAY-194 cleaned too.
const SCANNED = ['components/dashboard', 'components/race-flow', 'components/race', 'lib/utils/wind.ts']

/**
 * Intentional exceptions, as `path: reason`. Empty: every colour on these screens has a token.
 */
const ALLOWED: Record<string, string> = {}

// The last alternative is hex-alpha concatenation (`${color}33`): on a `var()` it is invalid CSS,
// so it paints nothing at all.
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|['"](?:white|black)['"]|\$\{[^}]+\}[0-9a-fA-F]{2}\b/

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.(tsx?|css)$/.test(path) ? [path] : []
  return readdirSync(path).flatMap((name) => (name === '__tests__' ? [] : sourceFiles(join(path, name))))
}

function isComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')
}

describe('colour literals', () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)))

  it('finds the components it guards', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('appear nowhere in the scanned components', () => {
    const found = files.flatMap((path) => {
      const file = relative(ROOT, path)
      if (file in ALLOWED) return []
      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (!isComment(line) && LITERAL.test(line) ? [`${file}:${i + 1}  ${line.trim()}`] : []))
    })
    expect(found).toEqual([])
  })
})
