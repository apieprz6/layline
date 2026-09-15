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
