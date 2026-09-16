import type { ReactElement } from 'react'
import {
  SECTION_TABS_HEADER_STYLE,
  SECTION_TABS_LIST_STYLE,
  SECTION_TABS_TITLE_STYLE,
  sectionTabStyle,
} from './sectionTabsStyle'

interface SectionTabsChromeProps {
  /** The section's name — the same string its `SectionTabs` is given. */
  title: string
  /** The tab labels in order. The first is drawn selected, as the section will open. */
  tabs: readonly string[]
}

/**
 * A section's header with nothing behind it yet: the same title and the same tab
 * strip `SectionTabs` draws, sharing its geometry, minus everything interactive.
 *
 * The title and the labels are the real strings, not placeholders — they are known
 * before the fetch and are not data, so a bar in their place would be a bar that
 * moves. What the sailor is waiting for is beneath this header, and that is where
 * the skeleton starts.
 *
 * Plain `<span>`s and no `role="tablist"`: nothing here selects anything, and a
 * tablist a sailor can reach but cannot operate is worse than no tablist. The real
 * tabs arrive, focusable, with the panel they control.
 */
export default function SectionTabsChrome({ title, tabs }: SectionTabsChromeProps): ReactElement {
  return (
    <div data-testid="section-header" style={SECTION_TABS_HEADER_STYLE}>
      <h1 style={SECTION_TABS_TITLE_STYLE}>{title}</h1>

      <div style={SECTION_TABS_LIST_STYLE}>
        {tabs.map((label, index) => (
          <span key={label} style={sectionTabStyle(index === 0)}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
