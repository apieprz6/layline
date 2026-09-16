/**
 * What a Storage `move` does to an object's timestamps.
 *
 * The sweeper's `recordings/` grace window rests on one fact about storage-api: submit does not
 * upload the file a second time, it moves it out of `tmp/`, and a move keeps the `objects` row the
 * object already had. If it keeps `created_at` too, then an object's `created_at` under
 * `recordings/` is the moment the *wizard staged it* — which can be hours before the race was
 * written — and a window measured from it expires while the sailor is still filling the form in.
 *
 * So: upload one object to `tmp/`, list it, wait, move it to `recordings/`, list it again, and print
 * both stamps. Four checks, then it deletes what it made.
 *
 *   scripts/verify-storage-move-timestamps.sh
 *
 * Needs a URL and either a service role key or the project's JWT secret (which it mints one from):
 *
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  |  SUPABASE_URL, SUPABASE_JWT_SECRET
 *
 * Service role, because the point is the behaviour of `move` and not who may call it — who may is
 * `scripts/verify-boat-storage.mjs`, checks 14–17. Like that suite this one really writes: there is
 * no ROLLBACK for bytes, so everything it touches is namespaced by a fresh uuid and removed at the
 * end.
 *
 * Paths come from lib/storage/paths.ts, deliberately: a script that hardcoded the prefixes would
 * prove the strings agreed with themselves.
 */

import { createHmac, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { recordingObjectPath, tmpUploadObjectPath, BOAT_BUCKET } from '../lib/storage/paths.ts'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.API_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET

if (!SUPABASE_URL || !(SERVICE_KEY || JWT_SECRET)) {
  console.error(
    'need SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_JWT_SECRET.\n' +
      'For the local stack, run scripts/verify-storage-move-timestamps.sh instead.'
  )
  process.exit(2)
}

/** A service-role token, when only the secret is to hand. Both halves are the project's own. */
function mintServiceToken(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const issued = Math.floor(Date.now() / 1000)
  const head = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode({ role: 'service_role', iss: 'supabase', iat: issued, exp: issued + 600 })

  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

const token = SERVICE_KEY ?? mintServiceToken(JWT_SECRET)
const headers = { Authorization: `Bearer ${token}`, apikey: token }

async function storage(route, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1${route}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  })
  const text = await response.text()

  try {
    return { status: response.status, body: JSON.parse(text) }
  } catch {
    return { status: response.status, body: text }
  }
}

/** One entry, by the prefix it sits in and its own name — the same call the sweeper's adapter makes. */
async function listOne(prefix, name) {
  const { body } = await storage(`/object/list/${BOAT_BUCKET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })

  return Array.isArray(body) ? body.find((entry) => entry.name === name) : undefined
}

const results = []
const check = (name, ok, detail = '') =>
  results.push({ name, ok, detail: String(detail).replace(/\s+/g, ' ').slice(0, 88) })

const RUN = randomUUID()
const FILENAME = 'move-probe.csv'
const staged = tmpUploadObjectPath(RUN, RUN, FILENAME)
const landed = recordingObjectPath(RUN, FILENAME)

const upload = await storage(`/object/${BOAT_BUCKET}/${staged}`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/csv' },
  body: 'Date;Latitude\n',
})
check('1. an object can be staged under tmp/', upload.status === 200, JSON.stringify(upload.body))

const before = await listOne(path.posix.dirname(staged), FILENAME)
check('2. Storage dates it', Boolean(before?.created_at), before?.created_at ?? 'no entry listed')

// Long enough that a stamp taken at the move cannot be confused with one taken at the upload.
await new Promise((resolve) => setTimeout(resolve, 2000))

const move = await storage('/object/move', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bucketId: BOAT_BUCKET, sourceKey: staged, destinationKey: landed }),
})
check('3. it moves to recordings/', move.status === 200, JSON.stringify(move.body))

const after = await listOne(path.posix.dirname(landed), FILENAME)

check(
  '4. the move keeps created_at and bumps updated_at',
  Boolean(after) &&
    after.id === before?.id &&
    after.created_at === before?.created_at &&
    Date.parse(after.updated_at) > Date.parse(after.created_at),
  `created_at ${after?.created_at} updated_at ${after?.updated_at}`
)

await storage(`/object/${BOAT_BUCKET}`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefixes: [landed, staged] }),
})

console.log(`\n${path.basename(fileURLToPath(import.meta.url))} against ${SUPABASE_URL}\n`)

for (const { name, ok, detail } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const failed = results.filter((result) => !result.ok).length

console.log(`\n${results.length - failed} of ${results.length} checks passed`)

// The whole point of the script is check 4. A failure means the sweeper is ageing objects under
// `recordings/` from the wrong stamp, so it exits loudly rather than informatively.
process.exit(failed === 0 ? 0 : 1)
