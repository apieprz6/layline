/**
 * THROWAWAY PROTOTYPE — LAY-94, "Prototype the race upload and annotation flow".
 *
 * Not production. Not linked from the app. Delete the whole directory once the
 * flow shape is decided; nothing else imports from it.
 *
 * Question: how does an admin get a race from a qtVlm CSV into Layline on a 390px
 * screen, and what does typing one cost?
 *
 * Four variants, switchable with ?variant=A|B|C|D or the arrow keys:
 *   A  the mockup's five-step wizard, with every defect LAY-94 found repaired
 *   B  one scrolling sheet, trace pinned above the annotations
 *   C  timeline first — no datetime field anywhere, times come from tapping
 *   D  log the file now, annotate later as an in-place amendment
 *
 * Mounted inside the real AppLayout on purpose: an empty route flatters a layout
 * by giving it no header, no drawer and no 390px column to fight.
 *
 * Fixtures are six real recordings out of ~/git/Handsome-Pete, regenerated with
 *   python3 app/prototype-race-upload/generate-fixtures.py
 */

import { Suspense } from 'react'
import AppLayout from '@/components/dashboard/AppLayout'
import PrototypeSwitcher from './PrototypeSwitcher'

export const dynamic = 'force-dynamic'

export default function PrototypeRaceUploadPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}>
        <PrototypeSwitcher />
      </Suspense>
    </AppLayout>
  )
}
