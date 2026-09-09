/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * There are exactly two viewer states — Guest and signed-in — plus a write
 * capability that only an admin has. LAY-93 settled that every signed-in user
 * reads everything regardless of `role`, including a NULL one, so 'member' here
 * covers "signed in, role irrelevant" and there is deliberately no third
 * reading tier to model.
 */

export type Viewer = 'guest' | 'member' | 'admin'

export const VIEWERS: Viewer[] = ['guest', 'member', 'admin']

export const VIEWER_LABEL: Record<Viewer, string> = {
  guest: 'Guest',
  member: 'Signed in',
  admin: 'Signed in · admin',
}

export function isSignedIn(viewer: Viewer): boolean {
  return viewer !== 'guest'
}

export function canWrite(viewer: Viewer): boolean {
  return viewer === 'admin'
}
