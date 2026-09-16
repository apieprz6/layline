import { createHash } from 'node:crypto'
// From `node:util` rather than the global, which jsdom does not define — and this only ever runs on
// the server, where both are the same class.
import { TextDecoder } from 'node:util'

/**
 * Reading a file out of a Server Action's `FormData`: its name, its bytes, its text and its hash.
 *
 * Shared by both file-backed kinds, and by both halves of a Crossover Chart upload. Nothing here is
 * about a format — the parse is what decides whether a file is readable, and it happens after this.
 *
 * `allowed_mime_types` on the bucket is NULL and nothing here reads `file.type`. A browser calls a
 * `.pol` or a `.sailselect` anything or nothing, so a MIME check would refuse good files and admit
 * bad ones; parsing is the gate (ADR 0009).
 */

/**
 * A megabyte, the same ceiling both parsers apply to what they read. The bucket's own limit is 10 MB
 * and would refuse a larger file anyway; refusing it here means the admin is told why instead of
 * being handed a storage error.
 */
export const MAX_UPLOAD_BYTES = 1_048_576

/** The file as dropped: its name, its bytes, and its bytes decoded. */
export interface BoatSetupUpload {
  filename: string
  bytes: Uint8Array
  text: string
  content_sha256: string
}

export interface BoatSetupUploadRefusal {
  message: string
}

/**
 * Read one file out of the form, or the sentence to show the admin instead.
 *
 * `what` names the file in both refusals, because an upload may carry two: "Choose a sail chart to
 * upload" and "Choose a sail definitions file to upload" are different instructions, and one of them
 * is the one the admin has to act on.
 */
export async function readBoatSetupUpload(
  formData: FormData,
  key: string,
  what: { missing: string; tooLarge: string }
): Promise<BoatSetupUpload | BoatSetupUploadRefusal> {
  const file = formData.get(key)

  if (!(file instanceof File) || file.size === 0) return { message: what.missing }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { message: `${what.tooLarge} this file is ${Math.round(file.size / 1024)} KB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  return {
    filename: file.name,
    bytes,
    // `ignoreBOM` so a byte-order mark reaches the parser, which reports it. Decoding it away here
    // would leave the parser silent about a file that carries one.
    text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
    // Over the bytes as dropped, which are the bytes that will be stored — not over the text, which
    // has been through a decoder.
    content_sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
