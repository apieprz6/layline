/**
 * Storage path derivation.
 *
 * These paths are the invariant fixed by 20260909190000_create_boat_storage_bucket.sql and
 * relied on by the race archive schema. `lib/storage/paths.ts` is the only implementation —
 * there is deliberately no SQL equivalent, because two implementations of a derivation is
 * what "derive, don't store" exists to avoid.
 */

import {
  BOAT_BUCKET,
  boatSetupObjectPath,
  recordingObjectPath,
  storageSafeFilename,
  tmpUploadObjectPath,
} from '@/lib/storage/paths'

const RECORDING_ID = '3f1a4c58-9b2e-4d7a-8f10-6c5b2e9d4a71'
const VERSION_ID = 'b47d2e91-05c3-4a68-9d1f-7e3a5c8b0d24'
const USER_ID = '9c8b7a65-4321-4f0e-8d9c-1a2b3c4d5e6f'
const UPLOAD_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

describe('BOAT_BUCKET', () => {
  it('is the bucket the storage migration created', () => {
    expect(BOAT_BUCKET).toBe('boat')
  })
})

describe('recordingObjectPath', () => {
  it('derives recordings/{recording_id}/{filename}', () => {
    expect(recordingObjectPath(RECORDING_ID, '07-22-26-beer-can.csv')).toBe(
      `recordings/${RECORDING_ID}/07-22-26-beer-can.csv`
    )
  })

  it('refuses an empty id, because a path with a hole in it would still upload', () => {
    expect(() => recordingObjectPath('', 'x.csv')).toThrow(/recording id/i)
  })

  it('refuses an id carrying a path separator', () => {
    expect(() => recordingObjectPath('../..', 'x.csv')).toThrow(/recording id/i)
  })

  it('refuses a bare .. , which carries no separator and still climbs the prefix', () => {
    // `recordings/../x.csv` would land an object outside the prefix the storage policies are
    // written against, and no separator check catches it.
    expect(() => recordingObjectPath('..', 'x.csv')).toThrow(/relative path segment/i)
    expect(() => recordingObjectPath('.', 'x.csv')).toThrow(/relative path segment/i)
  })
})

describe('boatSetupObjectPath', () => {
  it('derives boat-setup/{kind}/{version_id}/{filename} with the enum label verbatim', () => {
    expect(boatSetupObjectPath('crossover_chart', VERSION_ID, 'Beneteau10R.sailselect')).toBe(
      `boat-setup/crossover_chart/${VERSION_ID}/Beneteau10R.sailselect`
    )
    expect(boatSetupObjectPath('polar', VERSION_ID, 'Beneteau10R.pol')).toBe(
      `boat-setup/polar/${VERSION_ID}/Beneteau10R.pol`
    )
  })

  it('refuses the two kinds that never reach Storage', () => {
    // A Rig Tune and an Instrument Calibration are entered by hand, which is why
    // boat_setup_versions.file_backed_kinds_only refuses a filename on either.
    expect(() =>
      // @ts-expect-error a kind outside FileBackedBoatSetupKind is a compile error too
      boatSetupObjectPath('rig_tune', VERSION_ID, 'Wayward_Wind.rig')
    ).toThrow(/rig_tune/)
    expect(() =>
      // @ts-expect-error see above
      boatSetupObjectPath('instrument_calibration', VERSION_ID, 'cal.txt')
    ).toThrow(/instrument_calibration/)
  })
})

describe('tmpUploadObjectPath', () => {
  it('derives tmp/{user_id}/{upload_id}/{filename}', () => {
    expect(tmpUploadObjectPath(USER_ID, UPLOAD_ID, '08-22-26-glr.csv')).toBe(
      `tmp/${USER_ID}/${UPLOAD_ID}/08-22-26-glr.csv`
    )
  })
})

describe('storageSafeFilename', () => {
  it('leaves a Storage-legal filename exactly as the sailor named it', () => {
    // The permitted set is storage-api's own key charset, which is wider than it looks.
    const asNamed = "07-22-26 beer can (final)! v2+3,4=5;6:7?8&9$10@11'12*13.csv"
    expect(storageSafeFilename(asNamed)).toBe(asNamed)
  })

  it('replaces characters a Storage key cannot carry', () => {
    expect(storageSafeFilename('50%_#1 <race>.csv')).toBe('50___1 _race_.csv')
  })

  it('replaces accented letters, which storage-api\u2019s \\w does not admit', () => {
    expect(storageSafeFilename('régate.csv')).toBe('r_gate.csv')
  })

  it('keeps only the basename, so a traversal attempt cannot climb a prefix', () => {
    expect(storageSafeFilename('../../etc/passwd')).toBe('passwd')
    expect(storageSafeFilename('C:\\boats\\pete.pol')).toBe('pete.pol')
  })

  it('refuses a filename with nothing left to name', () => {
    expect(() => storageSafeFilename('')).toThrow(/filename/i)
    expect(() => storageSafeFilename('   ')).toThrow(/filename/i)
    expect(() => storageSafeFilename('..')).toThrow(/filename/i)
    expect(() => storageSafeFilename('foo/')).toThrow(/filename/i)
  })

  it('is applied by every path helper, so no caller has to remember it', () => {
    expect(recordingObjectPath(RECORDING_ID, 'a#b.csv')).toBe(
      `recordings/${RECORDING_ID}/a_b.csv`
    )
    expect(boatSetupObjectPath('polar', VERSION_ID, 'a#b.pol')).toBe(
      `boat-setup/polar/${VERSION_ID}/a_b.pol`
    )
    expect(tmpUploadObjectPath(USER_ID, UPLOAD_ID, 'a#b.csv')).toBe(
      `tmp/${USER_ID}/${UPLOAD_ID}/a_b.csv`
    )
  })
})
