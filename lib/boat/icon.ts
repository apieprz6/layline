/**
 * The boat's icon: what may be uploaded as one, and where the chrome finds it.
 *
 * The icon is identity, like the name — not a Boat Setup artifact — so there is exactly one
 * current icon and no versions of it. The bytes are stored exactly as uploaded: nothing here
 * resizes, crops or re-encodes, the header's `object-fit: cover` does the fitting.
 */

/** A megabyte. An icon drawn at 24px needs a fraction of it; a photo straight off a phone may not. */
export const MAX_BOAT_ICON_BYTES = 1_048_576

/** The refusal for an icon over the limit, in the editor and from the server alike. */
export function boatIconTooLarge(byteLength: number): string {
  // In whole kilobytes, rounded up: a file just over the limit would otherwise read as "1.0 MB".
  return `An icon can be at most 1 MB (1,024 KB); this one is ${Math.ceil(byteLength / 1024).toLocaleString('en-US')} KB.`
}

/** The only formats an icon may be. SVG is refused: it is a document, and can carry script. */
export type BoatIconType = 'image/png' | 'image/jpeg' | 'image/webp'

/** What the `<input type="file">` offers. A courtesy to the picker, never the check. */
export const BOAT_ICON_ACCEPT = 'image/png,image/jpeg,image/webp'

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const
/** `RIFF`, four bytes of length, then `WEBP`. */
const RIFF = [0x52, 0x49, 0x46, 0x46] as const
const WEBP = [0x57, 0x45, 0x42, 0x50] as const

/**
 * What the bytes say they are, read off their signature — never off the name or the MIME the
 * browser reported, both of which are the caller's to choose. `null` for anything else, an SVG
 * included, since an SVG is text and has no signature to match.
 */
export function sniffBoatIconType(bytes: Uint8Array): BoatIconType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg'
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp'
  return null
}

/** The route that serves the icon to a signed-in sailor (`app/boat/icon/route.ts`). */
export const BOAT_ICON_ROUTE = '/boat/icon'

/**
 * Where the header points its `<img>`. Keyed on `icon_updated_at`, so the URL changes exactly
 * when the icon does and the browser can keep the bytes until then — which a per-request
 * signed URL would never let it do.
 */
export function boatIconUrl(iconUpdatedAt: string): string {
  return `${BOAT_ICON_ROUTE}?v=${encodeURIComponent(iconUpdatedAt)}`
}
