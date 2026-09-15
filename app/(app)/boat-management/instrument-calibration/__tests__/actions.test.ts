import {
  addCalibrationEvent,
  correctCalibrationVersion,
  recordCalibrationVersion,
} from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'
import { multiplierField, offsetField } from '@/lib/boat/calibration'

const artifactMaybeSingle = jest.fn()
const latestMaybeSingle = jest.fn()
const insertMaybeSingle = jest.fn()
const updateMaybeSingle = jest.fn()
const eventInsert = jest.fn()
const pointerEq = jest.fn()

const versionInsert = jest.fn(() => ({
  select: () => ({ maybeSingle: insertMaybeSingle }),
}))

/** `.update(...).eq('id', …).eq('kind', …).select('id').maybeSingle()` */
const versionUpdate = jest.fn(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: updateMaybeSingle }) }) }),
}))

const from = jest.fn((table: string) => {
  if (table === 'boat_setup_artifacts') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: artifactMaybeSingle }) }),
      update: () => ({ eq: pointerEq }),
    }
  }
  if (table === 'boat_setup_versions') {
    return {
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: latestMaybeSingle }) }) }),
      }),
      insert: versionInsert,
      update: versionUpdate,
    }
  }
  if (table === 'calibration_events') {
    return { insert: eventInsert }
  }
  throw new Error(`a calibration action touched ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
const { revalidatePath } = jest.requireMock('next/cache')

const ADMIN = { ...CREW, role: 'admin' as const }

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(key, one)
  }
  return data
}

/** The four channels as programmed, in the display's own encoding. */
const AS_PROGRAMMED = {
  [offsetField('AWA')]: '2',
  [multiplierField('AWS')]: '1.02',
  [offsetField('AWS')]: '0',
  [multiplierField('STW')]: '1.02',
  [offsetField('STW')]: '0',
  [offsetField('HDG')]: '0',
}

const PAYLOAD = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

const A_VERSION = { ...AS_PROGRAMMED, effective_from: '2026-07-04' }

const AN_EVENT = {
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: 'HDG',
  note: 'Swung the compass off Navy Pier.',
}

function expectNoWrite() {
  expect(versionInsert).not.toHaveBeenCalled()
  expect(versionUpdate).not.toHaveBeenCalled()
  expect(eventInsert).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
}

describe('the Instrument Calibration writes', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    artifactMaybeSingle.mockResolvedValue({ data: { id: 'artifact-1' }, error: null })
    latestMaybeSingle.mockResolvedValue({ data: null, error: null })
    insertMaybeSingle.mockResolvedValue({ data: { id: 'version-1' }, error: null })
    updateMaybeSingle.mockResolvedValue({ data: { id: 'version-1' }, error: null })
    eventInsert.mockResolvedValue({ error: null })
    pointerEq.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  describe('recordCalibrationVersion', () => {
    it('mints v1 on an empty artifact, with the four channels as typed', async () => {
      await expect(recordCalibrationVersion(form(A_VERSION))).resolves.toEqual({ ok: true })

      expect(versionInsert).toHaveBeenCalledWith({
        artifact_id: 'artifact-1',
        kind: 'instrument_calibration',
        version_number: 1,
        effective_from: '2026-07-04',
        note: null,
        created_by: ADMIN.userId,
        payload: PAYLOAD,
      })
    })

    it('sends no filename and no content hash — this kind has no file behind it', async () => {
      await recordCalibrationVersion(form(A_VERSION))

      const [row] = versionInsert.mock.calls[0] as unknown as [Record<string, unknown>]
      expect(row).not.toHaveProperty('filename')
      expect(row).not.toHaveProperty('content_sha256')
      // `recorded_at` is the database's to set: it means when Layline first recorded
      // this Version, and a client clock is not that.
      expect(row).not.toHaveProperty('recorded_at')
    })

    it('numbers the next Version one past the highest, and makes it current', async () => {
      latestMaybeSingle.mockResolvedValue({ data: { version_number: 3 }, error: null })

      await recordCalibrationVersion(form(A_VERSION))

      const [row] = versionInsert.mock.calls[0] as unknown as [{ version_number: number }]
      expect(row.version_number).toBe(4)
      expect(pointerEq).toHaveBeenCalledWith('id', 'artifact-1')
    })

    it('stores a note when one is given, and null when it is blank', async () => {
      await recordCalibrationVersion(form({ ...A_VERSION, note: '  After bottom paint.  ' }))
      expect(
        (versionInsert.mock.calls[0] as unknown as [{ note: string | null }])[0].note
      ).toBe('After bottom paint.')

      versionInsert.mockClear()
      await recordCalibrationVersion(form({ ...A_VERSION, note: '   ' }))
      expect(
        (versionInsert.mock.calls[0] as unknown as [{ note: string | null }])[0].note
      ).toBeNull()
    })

    it('saves an implausible figure rather than refusing it', async () => {
      // Warns, never blocks. A hard refusal would be Layline telling the boat its own
      // display is wrong, and the display is the authority on what is programmed.
      const result = await recordCalibrationVersion(
        form({ ...A_VERSION, [multiplierField('STW')]: '2.5', [offsetField('HDG')]: '175' })
      )

      expect(result).toEqual({ ok: true })
      const [row] = versionInsert.mock.calls[0] as unknown as [{ payload: typeof PAYLOAD }]
      expect(row.payload.STW).toEqual({ multiplier: 2.5, offset: 0 })
      expect(row.payload.HDG).toEqual({ offset: 175 })
    })

    it('refuses a blank figure rather than storing a zero in its place', async () => {
      const result = await recordCalibrationVersion(
        form({ ...A_VERSION, [offsetField('AWA')]: '' })
      )

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('refuses a date that is not a calendar date, and an absent one', async () => {
      for (const effective_from of ['', 'yesterday', '2026-02-30', '2026-7-4']) {
        jest.clearAllMocks()
        const result = await recordCalibrationVersion(form({ ...A_VERSION, effective_from }))
        expect(result.ok).toBe(false)
        expectNoWrite()
      }
    })

    it('refuses a viewer and a Guest, and writes nothing', async () => {
      for (const account of [{ ...CREW, role: 'viewer' }, null]) {
        jest.clearAllMocks()
        resolveAccount.mockResolvedValue(account)

        const result = await recordCalibrationVersion(form(A_VERSION))

        expect(result).toEqual({ ok: false, message: expect.stringMatching(/admin/i) })
        expectNoWrite()
      }
    })

    it('says the Version landed when only the current pointer failed', async () => {
      // The transcription is recorded. Re-entering the same figures would mint a
      // duplicate, so the sailor is told what actually happened.
      pointerEq.mockResolvedValue({ error: { message: 'deadlock detected' } })

      const result = await recordCalibrationVersion(form(A_VERSION))

      expect(result).toEqual({ ok: false, message: expect.stringMatching(/v1/) })
      expect(result.ok === false && result.message).toMatch(/could not be made the current/i)
      expect(consoleError).toHaveBeenCalled()
    })

    it('reports a refused insert rather than claiming it landed', async () => {
      insertMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'new row violates row-level security policy' },
      })

      const result = await recordCalibrationVersion(form(A_VERSION))

      expect(result.ok).toBe(false)
      expect(revalidatePath).not.toHaveBeenCalled()
      expect(pointerEq).not.toHaveBeenCalled()
    })

    it('refetches both screens that state the Version in force', async () => {
      await recordCalibrationVersion(form(A_VERSION))

      expect(revalidatePath).toHaveBeenCalledWith('/boat-management/instrument-calibration')
      expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
    })
  })

  describe('correctCalibrationVersion', () => {
    const A_CORRECTION = { ...A_VERSION, version_id: 'version-1' }

    it('sends exactly the three fields the database allows to change', async () => {
      await expect(correctCalibrationVersion(form(A_CORRECTION))).resolves.toEqual({ ok: true })

      const [patch] = versionUpdate.mock.calls[0] as unknown as [Record<string, unknown>]
      expect(Object.keys(patch).sort()).toEqual(['effective_from', 'note', 'payload'])
      expect(patch.payload).toEqual(PAYLOAD)
    })

    it('never sends the version number, the author, recorded_at or the kind', async () => {
      // `enforce_version_immutability()` refuses all four. Not sending them means the
      // correction is not relying on the trigger to strip a field it meant to change.
      await correctCalibrationVersion(form(A_CORRECTION))

      const [patch] = versionUpdate.mock.calls[0] as unknown as [Record<string, unknown>]
      for (const forbidden of ['version_number', 'created_by', 'recorded_at', 'kind', 'id']) {
        expect(patch).not.toHaveProperty(forbidden)
      }
    })

    it('does not move the current pointer — a correction mints nothing', async () => {
      await correctCalibrationVersion(form(A_CORRECTION))

      expect(pointerEq).not.toHaveBeenCalled()
      expect(versionInsert).not.toHaveBeenCalled()
    })

    it('refuses a correction with no Version to correct', async () => {
      const result = await correctCalibrationVersion(form({ ...A_VERSION, version_id: '' }))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('reports a correction that matched no row rather than claiming it landed', async () => {
      updateMaybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await correctCalibrationVersion(form(A_CORRECTION))

      expect(result.ok).toBe(false)
      expect(revalidatePath).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
    })

    it('refuses a viewer, and writes nothing', async () => {
      resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

      const result = await correctCalibrationVersion(form(A_CORRECTION))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })
  })

  describe('addCalibrationEvent', () => {
    it('records the act, its date, its channels and its note', async () => {
      await expect(addCalibrationEvent(form(AN_EVENT))).resolves.toEqual({ ok: true })

      expect(eventInsert).toHaveBeenCalledWith({
        artifact_id: 'artifact-1',
        kind: 'instrument_calibration',
        occurred_on: '2026-07-04',
        type: 'autocompensation',
        channels: ['HDG'],
        note: 'Swung the compass off Navy Pier.',
        created_by: ADMIN.userId,
      })
    })

    it('records no value of any kind, because an Event has none', async () => {
      // Numbers live in Instrument Calibration; a Measured Offset is derived from a
      // Race and is never written back into the Log (ADR 0005, ADR 0006).
      await addCalibrationEvent(
        form({ ...AN_EVENT, [offsetField('HDG')]: '3', multiplier: '1.02', value: '3' })
      )

      const [row] = eventInsert.mock.calls[0] as unknown as [Record<string, unknown>]
      expect(Object.keys(row).sort()).toEqual([
        'artifact_id',
        'channels',
        'created_by',
        'kind',
        'note',
        'occurred_on',
        'type',
      ])
    })

    it('refuses an autocompensation on anything but HDG', async () => {
      for (const channels of [['AWS'], ['HDG', 'STW'], []]) {
        jest.clearAllMocks()
        const result = await addCalibrationEvent(form({ ...AN_EVENT, channels }))

        expect(result.ok).toBe(false)
        expectNoWrite()
      }
    })

    it('catches a channel named twice in one set', async () => {
      // The database cannot: a CHECK may not hold the subquery that would find it.
      const result = await addCalibrationEvent(
        form({ ...AN_EVENT, type: 'other', channels: ['STW', 'STW'] })
      )

      expect(result).toEqual({ ok: false, message: expect.stringMatching(/once/i) })
      expectNoWrite()
    })

    it('refuses an empty channel set', async () => {
      const result = await addCalibrationEvent(form({ ...AN_EVENT, type: 'other', channels: [] }))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('refuses a channel that is not one of the four', async () => {
      const result = await addCalibrationEvent(
        form({ ...AN_EVENT, type: 'other', channels: ['TWS'] })
      )

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('refuses a type that is neither an autocompensation nor other', async () => {
      const result = await addCalibrationEvent(form({ ...AN_EVENT, type: 'recalibration' }))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('requires a note — an event with no account of itself records nothing', async () => {
      const result = await addCalibrationEvent(form({ ...AN_EVENT, note: '   ' }))

      expect(result).toEqual({ ok: false, message: expect.stringMatching(/note|what was done/i) })
      expectNoWrite()
    })

    it('stores a multi-channel set in the vocabulary’s own order', async () => {
      await addCalibrationEvent(
        form({ ...AN_EVENT, type: 'other', channels: ['STW', 'AWA', 'HDG'] })
      )

      const [row] = eventInsert.mock.calls[0] as unknown as [{ channels: string[] }]
      expect(row.channels).toEqual(['AWA', 'STW', 'HDG'])
    })

    it('refuses a date that is not a calendar date', async () => {
      const result = await addCalibrationEvent(form({ ...AN_EVENT, occurred_on: 'July 4th' }))

      expect(result.ok).toBe(false)
      expectNoWrite()
    })

    it('refuses a viewer and a Guest, and writes nothing', async () => {
      for (const account of [{ ...CREW, role: 'viewer' }, null]) {
        jest.clearAllMocks()
        resolveAccount.mockResolvedValue(account)

        const result = await addCalibrationEvent(form(AN_EVENT))

        expect(result.ok).toBe(false)
        expectNoWrite()
      }
    })

    it('reports a refused insert rather than claiming it landed', async () => {
      eventInsert.mockResolvedValue({
        error: { message: 'new row violates row-level security policy' },
      })

      const result = await addCalibrationEvent(form(AN_EVENT))

      expect(result.ok).toBe(false)
      expect(revalidatePath).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
    })

    it('refuses when there is no Supabase environment to write to', async () => {
      createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

      const result = await addCalibrationEvent(form(AN_EVENT))

      expect(result.ok).toBe(false)
      expectNoWrite()
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
