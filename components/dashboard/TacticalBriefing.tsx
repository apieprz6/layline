'use client'

interface TacticalBriefingProps {
  briefing: string
  generatedAt?: Date
}

export default function TacticalBriefing({ briefing, generatedAt }: TacticalBriefingProps) {
  return (
    <div className="layline-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="h4">Race briefing</h3>
        {generatedAt && (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {generatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      <div
        className="text-sm leading-relaxed whitespace-pre-line"
        style={{
          color: 'var(--text-secondary)',
          lineHeight: 'var(--leading-loose)'
        }}
      >
        {briefing}
      </div>

      <div
        className="mt-4 pt-4"
        style={{ borderTop: '1px solid var(--surface-divider)' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M2 12h20" />
          </svg>
          <span>AI-generated tactical analysis</span>
        </div>
      </div>
    </div>
  )
}
