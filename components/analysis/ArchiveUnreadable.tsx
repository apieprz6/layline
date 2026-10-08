import type { ReactElement } from 'react'
import EmptyState from '@/components/common/EmptyState'

/**
 * The archive could not be read — which is **not** the same as having no races.
 *
 * One component for both screens that read the archive, because a failed read is one fact and both
 * have to say the same thing about it. "No races uploaded yet" over a failed read would be Layline
 * claiming the sailor has sailed nothing; two separately-worded versions of this would be two
 * chances for one of them to drift into saying that.
 *
 * It says the races are fine on purpose. The read that failed is a read, nothing was written, and a
 * sailor's first thought on seeing an error over their own season is that they have lost it.
 */
export default function ArchiveUnreadable(): ReactElement {
  return (
    <EmptyState
      mark="⚠️"
      title="The archive could not be read"
      detail="Nothing is wrong with the races themselves. Try again in a moment."
    />
  )
}
