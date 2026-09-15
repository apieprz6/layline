import type { ReactElement } from 'react'
import InstrumentCalibrationContent from '@/components/boat/InstrumentCalibrationContent'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readInstrumentCalibration } from '@/services/boat/readInstrumentCalibration'

export const dynamic = 'force-dynamic'

/**
 * **Instrument Calibration** — a signed-in screen, and only that.
 *
 * A **Guest** who deep-links here is sent back to the dashboard with the **Auth Sheet**
 * open and this route remembered. There is no signed-out form of the screen: not a
 * locked one, not a placeholder one. ADR 0015's LAY-102 amendment deleted the locked
 * boat screen outright, so nothing about the boat — including that it has instruments —
 * is served to someone who is not signed in.
 *
 * Every signed-in sailor reads the whole screen. `canWrite` decides only whether the
 * admin's write panel is offered; each of the three Server Actions re-checks the Role
 * itself, and RLS refuses the write a third time (ADR 0019).
 */
export default async function InstrumentCalibrationPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-management/instrument-calibration')

  // Read only after the Guest has been turned away, so a signed-out request costs
  // nothing and reveals nothing.
  const record = await readInstrumentCalibration()

  return <InstrumentCalibrationContent record={record} canWrite={canWrite(account)} />
}
