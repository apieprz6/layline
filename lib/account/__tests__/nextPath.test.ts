import { relativePathOrHome } from '../nextPath'

// Both ends of the Google round trip pass a `?next=` through this: the browser on
// the way out, and `/auth/callback` on the way back, where the value is whatever
// arrived in a URL. So it is the app's only open-redirect guard, and it is tested
// on its own rather than only through its two callers.
describe('relativePathOrHome', () => {
  it.each([
    ['the dashboard', '/'],
    ['a screen', '/wind-data'],
    ['a screen with query state', '/wind-data?target=2026-09-11T18:00'],
    ['a nested route', '/station/45198'],
    ['a fragment', '/settings#theme'],
  ])('keeps %s as it is', (_name, path) => {
    expect(relativePathOrHome(path)).toBe(path)
  })

  it.each([
    ['an absolute URL', 'https://evil.example.com/phish'],
    ['an absolute URL on this scheme', 'http://evil.example.com'],
    ['a protocol-relative host', '//evil.example.com'],
    ['a backslash the browser normalises to //', '/\\evil.example.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a bare word', 'wind-data'],
    ['nothing at all', ''],
  ])('sends %s home instead', (_name, path) => {
    expect(relativePathOrHome(path)).toBe('/')
  })

  it.each([
    ['no parameter', undefined],
    ['a missing parameter', null],
  ])('treats %s as no destination', (_name, path) => {
    expect(relativePathOrHome(path)).toBe('/')
  })

  it('discards rather than sanitises', () => {
    // Not `/evil.example.com`, not the host's own path: a value that tried to name
    // another origin is not repaired into a destination on this one.
    expect(relativePathOrHome('//evil.example.com/wind-data')).toBe('/')
  })
})
