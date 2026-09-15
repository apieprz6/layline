/**
 * Which sails a picker may offer, which is a question about a date.
 *
 * The archive is hand-entered, so most races annotated in this app are older than the locker is. A
 * picker that offered only what is in the locker today would make an honest answer unavailable — and
 * one that offered everything would let a sailor name a sail that had already gone.
 */

import { sailsAvailableOn } from '@/services/boat/sails'
import type { SailChoice } from '@/types'

const LOCKER: SailChoice[] = [
  { id: 'id-main', key: 'main', label: 'Mainsail', retired_on: null },
  { id: 'id-jib-1', key: 'j1', label: 'Jib 1', retired_on: '2026-03-31' },
  { id: 'id-jib-2', key: 'j2', label: 'Jib 2', retired_on: null },
]

const ids = (sails: readonly SailChoice[]): string[] => sails.map((sail) => sail.id)

describe('the locker as it was on a day', () => {
  it('offers every sail that has not been retired', () => {
    expect(ids(sailsAvailableOn(LOCKER, '2026-06-03'))).toEqual(['id-main', 'id-jib-2'])
  })

  it('offers a retired sail for a race before it was retired', () => {
    expect(ids(sailsAvailableOn(LOCKER, '2026-02-14'))).toEqual([
      'id-main',
      'id-jib-1',
      'id-jib-2',
    ])
  })

  it('offers a sail on the day it was retired', () => {
    // A sail retired on the 31st was flown on the 31st. The date is when it came out of the rotation,
    // not the last day it could have been up.
    expect(ids(sailsAvailableOn(LOCKER, '2026-03-31'))).toContain('id-jib-1')
  })

  it('keeps a sail that is already named, whatever its date says', () => {
    // A set that has been stated is Testimony. A chip that vanished from under it would leave the
    // sailor unable to read or unpick what they said.
    expect(ids(sailsAvailableOn(LOCKER, '2026-06-03', ['id-jib-1']))).toContain('id-jib-1')
  })

  it('keeps the inventory’s own order', () => {
    // The same order has to hold on the chips, in a stored Sail Configuration and on a race's page,
    // or one sail plan reads as two.
    expect(ids(sailsAvailableOn(LOCKER, '2026-02-14'))).toEqual(ids(LOCKER))
  })

  it('answers an empty locker with an empty list', () => {
    expect(sailsAvailableOn([], '2026-06-03')).toEqual([])
  })
})
