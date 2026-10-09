/**
 * A short question the reader can open, with the long answer inside it.
 *
 * This screen owes a lot of explanations — why a figure is missing, why a stretch is grey, why the
 * recording cannot be edited — and ADR after ADR requires those to be *stated* rather than left to
 * be inferred. Stated is not the same as stated at full length in front of everybody: a paragraph
 * every reader has to scroll past, every visit, is a paragraph they stop reading, which loses the
 * explanation just as thoroughly as not writing it.
 *
 * So the obligation is kept in two parts: a line that says the fact, and this, holding the
 * reasoning one tap away. Native `<details>`, so it needs no JavaScript, works inside a Server
 * Component, opens from the keyboard, and is announced as a disclosure rather than as a mystery.
 *
 * It is for *reasoning*. A count, a caveat that travels with a figure, or the name of a thing stays
 * on the page: hiding those would be hiding the claim rather than the argument behind it.
 */

import type { ReactElement, ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'

export default function Explainer({
  summary,
  children,
  testId,
}: {
  /** The question, in the reader's words. Short enough to skip. */
  summary: string
  children: ReactNode
  testId?: string
}): ReactElement {
  return (
    <details data-testid={testId} style={{ marginTop: spacing(1) }}>
      <summary
        style={{
          cursor: 'pointer',
          display: 'list-item',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-accent)',
          // A tap target on a 390px phone without pushing the lines around it apart.
          padding: '4px 0',
        }}
      >
        {summary}
      </summary>
      <div
        style={{
          marginTop: spacing(1),
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        {children}
      </div>
    </details>
  )
}
