/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * A dashed placeholder reserving shell space for the gust/wave content
 * modules LAY-169 will design. Deliberately empty — this ticket leaves room
 * for that module, it does not draw it.
 */

interface ModuleSlotProps {
  label: string
  hint: string
  className?: string
}

export default function ModuleSlot({ label, hint, className }: ModuleSlotProps) {
  return (
    <div
      className={className}
      style={{
        border: '1.5px dashed var(--surface-border)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        minHeight: '96px',
        color: 'var(--text-muted)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        className="data-mono"
        style={{ fontSize: '9.5px', opacity: 0.7 }}
      >
        {hint}
      </span>
    </div>
  )
}
