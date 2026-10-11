import { test as setup, expect } from '@playwright/test'

import {
  FIXTURE_EVENT_HDG_ID,
  FIXTURE_EVENT_STW_ID,
  FIXTURE_HDG_ACT_DATE,
  FIXTURE_RACE_ID,
  FIXTURE_RACE_TITLE,
  FIXTURE_RECORDING_ID,
  FIXTURE_STW_ACT_DATE,
  archiveWriter,
  fixtureRaceWindow,
  fixtureRecording,
  fixtureRows,
  removeFixture,
} from './fixtures/synthetic-race'

/**
 * Writes the one synthetic Race the Instrument Tuning charts are driven over in a browser.
 *
 * Not an importer and not a migration — see `e2e/fixtures/synthetic-race.ts` on why this exists at
 * all and what the real archive is measured by instead. It runs through the service-role client
 * because the rows are written with no browser in the loop, and it refuses to run against anything
 * but a local Supabase for the same reason `e2e/auth.setup.ts` does: it writes to the archive.
 *
 * Idempotent, and destructive about its own fixture only. Every row it writes carries one of the
 * four fixed ids in `synthetic-race.ts`, it deletes those before inserting, and
 * `e2e/archive.teardown.ts` deletes them again afterwards — so a developer's own local archive is
 * never touched, and a crashed run leaves at most one obviously-titled race behind.
 */


setup('write the synthetic Instrument Tuning race', async () => {
  const writer = archiveWriter()

  // The fixture's `uploaded_by` and `created_by` have to be a real account, and the admin fixture
  // `auth.setup.ts` just made is the honest one: this Race is written by the same identity that
  // would have uploaded it.
  const { data: admin, error: adminError } = await writer
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (adminError) throw adminError
  expect(
    admin,
    'no admin profile exists to attribute the fixture Race to — e2e/auth.setup.ts should have made one'
  ).not.toBeNull()

  const { data: boat, error: boatError } = await writer
    .from('boats')
    .select('id')
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (boatError) throw boatError
  expect(boat, 'there is no boat row; the migrations have not run').not.toBeNull()

  const uploadedBy = admin!.id
  const boatId = boat!.id

  await removeFixture(writer)

  const { error: recordingError } = await writer
    .from('recordings')
    .insert(fixtureRecording(uploadedBy))
  if (recordingError) throw recordingError

  // One statement for sixty rows. A Transcription is written whole or not at all (ADR 0010's
  // consequence, verified in docs/testing/race-upload-transaction.md), and a fixture that wrote
  // half of one would produce a Race whose coverage figure described part of itself.
  const { error: rowsError } = await writer.from('recording_rows').insert(fixtureRows())
  if (rowsError) throw rowsError

  const { error: raceError } = await writer.from('races').insert({
    id: FIXTURE_RACE_ID,
    boat_id: boatId,
    recording_id: FIXTURE_RECORDING_ID,
    title: FIXTURE_RACE_TITLE,
    ...fixtureRaceWindow(),
    created_by: uploadedBy,
  })
  if (raceError) throw raceError

  // Two acts on the boat, so every chart's rail has a dashed rule to draw and the Asymmetry chart
  // has an `HDG` one to borrow. Both dated before the Race, so the Race sits in the Era they open.
  const { data: artifact, error: artifactError } = await writer
    .from('boat_setup_artifacts')
    .select('id')
    .eq('kind', 'instrument_calibration')
    .maybeSingle<{ id: string }>()
  if (artifactError) throw artifactError
  expect(artifact, 'there is no Instrument Calibration artifact row').not.toBeNull()

  const { error: eventError } = await writer.from('calibration_events').insert([
    {
      id: FIXTURE_EVENT_HDG_ID,
      artifact_id: artifact!.id,
      kind: 'instrument_calibration',
      occurred_on: FIXTURE_HDG_ACT_DATE,
      type: 'autocompensation',
      channels: ['HDG'],
      note: 'E2E fixture: the compass rebuilt its own deviation table.',
      created_by: uploadedBy,
    },
    {
      id: FIXTURE_EVENT_STW_ID,
      artifact_id: artifact!.id,
      kind: 'instrument_calibration',
      occurred_on: FIXTURE_STW_ACT_DATE,
      type: 'other',
      channels: ['STW'],
      note: 'E2E fixture: paddlewheel cleaned.',
      created_by: uploadedBy,
    },
  ])
  if (eventError) throw eventError
})
