/**
 * The geometry the two charts share, so the one window reads as one window.
 *
 * The map and the channel chart are cropped by a single window through a single time axis (ADR 0014),
 * and a sailor only believes that if the map's rail handle sits directly above the chart's handle for
 * the same second. That is a property of the *insets*, not of the axis: two components with their own
 * left padding draw the same second at two different pixels and the stack stops looking like one
 * instrument. So the insets live here and neither chart owns them.
 *
 * The viewBox is fixed and the elements are fluid. That is what keeps the map's projection true at any
 * pane width and lets both charts be laid out in the same coordinates as each other.
 */

/** The viewBox width both charts are drawn in. */
export const CHART_WIDTH = 360

/** Room for the channel chart's value labels, which the map has no use for but has to match. */
export const AXIS_INSET_LEFT = 26

export const AXIS_INSET_RIGHT = 8

/** The pixels one axis spans, and therefore what a second is worth on either chart. */
export const AXIS_INNER_WIDTH = CHART_WIDTH - AXIS_INSET_LEFT - AXIS_INSET_RIGHT

/**
 * The strip the channel chart grows under its plot to hold markers, when there are any.
 *
 * Grown rather than taken out of the plot: an annotation appearing must not rescale the trace the
 * sailor is reading it against.
 */
export const MARKER_LANE_HEIGHT = 16

/**
 * One annotation as the stack draws it — on the water on the map, on the time axis on the chart.
 *
 * Here rather than in either chart because all three components read it and none of them owns it, for
 * the same reason the insets are here. It carries no annotation *data*: a marker is a place, a label
 * and four states, so nothing about a Sail Configuration or a Sea State reaches a chart.
 *
 * `locked` is ADR 0014's rule that an annotation placed on an earlier step **stays drawn** for the
 * rest of the flow, dimmed and without a hit target. Locked is not hidden: the sailor can always see
 * what they have already said, and cannot edit it from a step that is asking something else.
 */
/**
 * What a marker is drawn in, and what it is drawn as.
 *
 * Both charts read these rather than each carrying its own cascade: a sail change that is blue on the
 * map and green on the chart is two annotations to a sailor glancing between them, and the warning
 * colour for an entry that is not testimony yet has to be the same warning in both places.
 */
export function markerColour(marker: Pick<StackMarker, 'incomplete' | 'lane'>): string {
  if (marker.incomplete) return 'var(--state-warning)'
  return marker.lane === 'sail' ? 'var(--wind-medium)' : 'var(--wind-light)'
}

/** One character, because a marker is 10 pixels across on a 390px phone. */
export function markerGlyph(lane: StackMarker['lane']): string {
  return lane === 'sail' ? 'S' : '~'
}

export interface StackMarker {
  /** The draft's own key, handed back by a tap. Never a database id — nothing is written yet. */
  key: string
  /** Absolute seconds in the recording's own naive frame. May sit outside the window. */
  at: number
  lane: 'sail' | 'sea'
  /** What it is, short enough for a chart: a set of sail keys, or a Sea State's name. */
  label: string
  selected: boolean
  /** Placed but not yet stated. Drawn as a warning, because it is not testimony yet. */
  incomplete: boolean
  /** Placed on another step: drawn, dimmed, and with nothing to tap. */
  locked: boolean
}
