import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import { isFillerFlagged } from '@/services/analysis/polar-performance'

interface EfficiencyFigureProps {
  label: string
  ratio: number | null
  /** How much of *this* figure's own rows rest on the Polar's filler. Null where none was summed. */
  filler: number | null
  testId: string
  /** What stands where the number would be, where nothing could be scored — always words. */
  instead: string
}

/**
 * One figure, with what it rests on under it.
 *
 * A **Filler-Anchored** share is printed *beside the number*, never in place of it. ADR 0036 is
 * explicit: a row the boat actually sailed is real however weak the grid cell it is compared
 * against, so the doubt belongs on the figure and never instead of it — no dash, no blank, no
 * hairline.
 *
 * Null is the one case with no number, and it says why in words rather than showing a dash: no row
 * could be scored, which is a different fact from a boat that went nowhere.
 *
 * Shared by the Polar performance screen and a Race's own page, so the same figure reads the same
 * way in both — one treatment of the flag, not two that drift.
 */
export default function EfficiencyFigure({
  label,
  ratio,
  filler,
  testId,
  instead,
}: EfficiencyFigureProps): ReactElement {
  const percent = efficiencyPercent(ratio)

  return (
    <div
      data-testid={testId}
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: `${spacing(2)} ${spacing(3)}`,
      }}
    >
      <div style={{ ...EYEBROW_STYLE, marginBottom: 2 }}>{label}</div>

      {percent === null ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {instead}
        </div>
      ) : (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--text-accent)',
          }}
        >
          {percent}
        </div>
      )}

      {filler !== null && isFillerFlagged(filler) && (
        <div
          data-testid={`${testId}-filler-anchored`}
          style={{
            marginTop: 4,
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: radius('sm'),
            border: '1px dashed var(--state-warning)',
            fontSize: 'var(--text-xs)',
            fontStyle: 'italic',
            color: 'var(--state-warning)',
          }}
        >
          Filler-anchored: {sharePercent(filler)} of this is compared against a cell the Polar
          manufactured rather than measured
        </div>
      )}
    </div>
  )
}
