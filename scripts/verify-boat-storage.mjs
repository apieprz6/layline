/**
 * The `boat` bucket's 17 checks, from LAY-92.
 *
 * LAY-92 verified the bucket against a local stack and wrote the results into its resolution
 * comment, but the suite itself was never committed, so "re-run it" was not a thing anyone
 * could do. This is that suite, in the same order and with the same claims, so the schema
 * work has something to re-run and so the next person is not reconstructing it from prose.
 *
 *   node scripts/verify-boat-storage.mjs          # via scripts/verify-boat-storage.sh
 *
 * Needs the anon (publishable) key and the service role key, because two of the checks are
 * about who *cannot* do a thing and one has to create the users:
 *
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Everything it creates is namespaced by a run id and removed at the end, including the two
 * throwaway users. It is safe against a project holding real objects, but note that unlike
 * the SQL suite it genuinely writes: there is no ROLLBACK for object storage.
 *
 * The paths come from lib/storage/paths.ts, deliberately. That module is the single
 * implementation of the convention, and a verification script that hardcoded the same
 * strings would prove the strings agreed with themselves.
 */

import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import {
  BOAT_BUCKET,
  recordingObjectPath,
  tmpUploadObjectPath,
} from '../lib/storage/paths.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')

// The real 07-22-26-beer-can.csv LAY-92 used is the owner's and is not in the repo. This is
// the vendored fixture: a genuine qtVlm VDR export, French locale, 20,257 bytes.
const FIXTURE = path.join(REPO, 'docs/research/fixtures/qtvlm-vdr-french-locale.csv')

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.API_URL
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.PUBLISHABLE_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    'need SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'For the local stack, run scripts/verify-boat-storage.sh instead.'
  )
  process.exit(2)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).replace(/\s+/g, ' ').slice(0, 88) })
}

const RUN = randomUUID()
const password = `pw-${randomUUID()}`

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** A throwaway user, with the profile row that decides its tier. */
async function makeUser(label, role) {
  const email = `layline-storage-check-${label}-${RUN.slice(0, 8)}@example.com`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`could not create the ${label} user: ${error.message}`)

  const { error: profileError } = await service
    .from('profiles')
    .insert({ id: data.user.id, user_id: data.user.id, role })
  if (profileError) {
    throw new Error(`could not give the ${label} user a profile: ${profileError.message}`)
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`could not sign the ${label} user in: ${signInError.message}`)

  return { id: data.user.id, client }
}

const guest = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let admin
let crew
let objectPath

try {
  const bytes = await readFile(FIXTURE)
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  admin = await makeUser('admin', 'admin')
  crew = await makeUser('crew', null)

  // 1-4: the bucket, as the migration configured it -------------------------
  const { data: bucket, error: bucketError } = await service.storage.getBucket(BOAT_BUCKET)

  check('the bucket `boat` exists', Boolean(bucket), bucketError?.message ?? bucket?.name)
  check('it is private', bucket?.public === false, `public = ${bucket?.public}`)
  check(
    'its file size limit is 10 MB',
    bucket?.file_size_limit === 10 * 1024 * 1024,
    `file_size_limit = ${bucket?.file_size_limit}`
  )
  check(
    'it has no MIME allowlist, because parsing is the gate (ADR 0009)',
    bucket?.allowed_mime_types === null,
    `allowed_mime_types = ${JSON.stringify(bucket?.allowed_mime_types)}`
  )

  // 5-9: the upload path ----------------------------------------------------
  const uploadId = randomUUID()
  const recordingId = randomUUID()
  const tmpPath = tmpUploadObjectPath(admin.id, uploadId, path.basename(FIXTURE))
  objectPath = recordingObjectPath(recordingId, path.basename(FIXTURE))

  const guestUpload = await guest.storage
    .from(BOAT_BUCKET)
    .upload(tmpUploadObjectPath(randomUUID(), uploadId, 'guest.csv'), bytes)
  check('a guest cannot upload', Boolean(guestUpload.error), guestUpload.error?.message)

  const crewUpload = await crew.client.storage
    .from(BOAT_BUCKET)
    .upload(tmpUploadObjectPath(crew.id, uploadId, 'crew.csv'), bytes)
  check(
    'a signed-in non-admin cannot upload',
    Boolean(crewUpload.error),
    crewUpload.error?.message
  )

  const adminUpload = await admin.client.storage.from(BOAT_BUCKET).upload(tmpPath, bytes)
  check(
    'an admin can upload to tmp/, where bytes land before submit (ADR 0013)',
    !adminUpload.error,
    adminUpload.error?.message ?? tmpPath
  )

  const moved = await admin.client.storage.from(BOAT_BUCKET).move(tmpPath, objectPath)
  check(
    'an admin can move it to recordings/{recording_id}/, which is why an admin has UPDATE',
    !moved.error,
    moved.error?.message ?? objectPath
  )

  const { data: leftovers, error: listError } = await admin.client.storage
    .from(BOAT_BUCKET)
    .list(path.dirname(tmpPath))
  check(
    'and tmp/ is empty afterwards: a move is not a copy',
    !listError && Array.isArray(leftovers) && leftovers.length === 0,
    listError?.message ?? `${leftovers?.length} object(s) left behind`
  )

  // 10-13: reads ------------------------------------------------------------
  const guestSigned = await guest.storage.from(BOAT_BUCKET).createSignedUrl(objectPath, 60)
  check(
    'a guest cannot mint a signed URL, and is told the object is not found',
    Boolean(guestSigned.error),
    guestSigned.error?.message
  )

  const publicResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/${BOAT_BUCKET}/${objectPath}`
  )
  check(
    'the object is not publicly fetchable',
    publicResponse.status === 400,
    `HTTP ${publicResponse.status}`
  )

  const crewSigned = await crew.client.storage.from(BOAT_BUCKET).createSignedUrl(objectPath, 60)
  check(
    'a signed-in non-admin can mint a signed URL: read is the signed-in tier',
    !crewSigned.error && Boolean(crewSigned.data?.signedUrl),
    crewSigned.error?.message ?? 'minted'
  )

  let roundTrip = 'no URL to fetch'
  let identical = false
  if (crewSigned.data?.signedUrl) {
    const response = await fetch(crewSigned.data.signedUrl)
    const returned = Buffer.from(await response.arrayBuffer())
    const returnedSha = createHash('sha256').update(returned).digest('hex')
    identical = returned.length === bytes.length && returnedSha === sha256
    roundTrip = `HTTP ${response.status}, ${returned.length}/${bytes.length} bytes, sha256 ${returnedSha.slice(0, 8)} vs ${sha256.slice(0, 8)}`
  }
  check(
    'and that URL returns byte-identical bytes (ADR 0008)',
    identical,
    roundTrip
  )

  // 14-17: deletes and the size limit ---------------------------------------
  const crewDelete = await crew.client.storage.from(BOAT_BUCKET).remove([objectPath])
  check(
    'a non-admin cannot delete',
    Boolean(crewDelete.error) || crewDelete.data?.length === 0,
    crewDelete.error?.message ?? `removed ${crewDelete.data?.length} object(s)`
  )

  const survived = await admin.client.storage.from(BOAT_BUCKET).download(objectPath)
  check(
    'and the object survives the denied delete',
    !survived.error && survived.data?.size === bytes.length,
    survived.error?.message ?? `${survived.data?.size} bytes`
  )

  const oversized = await admin.client.storage
    .from(BOAT_BUCKET)
    .upload(tmpUploadObjectPath(admin.id, randomUUID(), 'oversized.csv'), Buffer.alloc(11 * 1024 * 1024))
  check(
    'an 11 MB upload is refused by file_size_limit',
    Boolean(oversized.error),
    oversized.error?.message
  )

  const adminDelete = await admin.client.storage.from(BOAT_BUCKET).remove([objectPath])
  check(
    'an admin can delete',
    !adminDelete.error && adminDelete.data?.length === 1,
    adminDelete.error?.message ?? `removed ${adminDelete.data?.length} object(s)`
  )
  if (!adminDelete.error) objectPath = null
} finally {
  // Leave nothing behind, on a hosted project least of all.
  const stragglers = []
  if (objectPath) stragglers.push(objectPath)
  if (admin) {
    const { data } = await service.storage.from(BOAT_BUCKET).list(`tmp/${admin.id}`)
    for (const entry of data ?? []) stragglers.push(`tmp/${admin.id}/${entry.name}`)
  }
  if (stragglers.length > 0) {
    await service.storage.from(BOAT_BUCKET).remove(stragglers)
  }
  for (const user of [admin, crew]) {
    if (user) await service.auth.admin.deleteUser(user.id)
  }
}

const width = Math.max(...results.map((r) => r.name.length))
console.log('')
console.log('=== the `boat` bucket, LAY-92 =========================================')
results.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.name.padEnd(width)} | ${r.detail}`
  )
})

const failed = results.filter((r) => !r.ok)
console.log('')
console.log(`${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`)

if (results.length !== 17) {
  console.log(`\nexpected LAY-92's 17 checks, ran ${results.length}`)
  process.exit(1)
}
if (failed.length > 0) process.exit(1)
