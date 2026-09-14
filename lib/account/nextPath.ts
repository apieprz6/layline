/**
 * A path on this origin, or the dashboard.
 *
 * The guard is not cosmetic: whatever comes back on `?next=` is somewhere the app
 * will send a sailor, so anything that could name another origin — an absolute
 * URL, a protocol-relative `//host`, a backslash the browser normalises to one —
 * is discarded rather than sanitised. Nothing is offered in its place: `/` is
 * where a sailor with no destination belongs.
 *
 * It lives in a module of its own because both ends need it: the browser writes
 * `?next=` on the way out to Google, and `/auth/callback` — a Server Component —
 * reads it on the way back.
 */
export function relativePathOrHome(path: string | null | undefined): string {
  if (!path || !path.startsWith('/')) return '/'
  if (path.startsWith('//') || path.startsWith('/\\')) return '/'
  return path
}
