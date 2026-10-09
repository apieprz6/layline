/**
 * Which colour band a **Sail Definition** is drawn in, and the one rule for choosing it.
 *
 * Two grids now draw the same chart — the Boat Setup one (`CrossoverChartGrid`) and the **Sail
 * Selection Screen**'s Chart layer — and a sail that is amber on one and teal on the other is a
 * sail a sailor cannot carry between them. So the banding lives here, once.
 *
 * **Banded by position in this Version's own definitions list, never by sail number.** The numbers
 * are qtVlm's: they need not start at 1 or be contiguous, so indexing a palette by them would
 * leave gaps in the palette and give two charts of the same boat different colours.
 *
 * Colour is never the carrier. Every cell of both grids prints its sail number anyway — the
 * night-vision theme collapses all eight `--sail-band-*` tokens to red tints, so the colour is how
 * the shape is seen and the number is how the sail is identified (ADR 0030).
 *
 * Isomorphic and dependency-free, like `crossoverDefinitionUsage` next door: both grids are
 * `'use client'`, and the chart's write gate and its zod schema stay on the server.
 */

import type { CrossoverChartPayload } from '@/types'

/** How many sail bands the stylesheet defines. Beyond it the tints repeat. */
export const SAIL_BANDS = 8

/**
 * A cell whose sail no definition defines — which the payload schema refuses, so nothing that
 * reached the database can show it. Drawn rather than hidden all the same: a payload written before
 * a rule tightened must still render, and an unnamed sail is better shown as unnamed than dropped.
 */
export const UNKNOWN_SAIL_BAND = 'var(--surface-divider)'

/** The band token for the `index`th definition of a Version. */
export function sailBand(index: number): string {
  return `var(--sail-band-${(index % SAIL_BANDS) + 1})`
}

/** Every definition's band token, keyed by the sail number the chart's cells hold. */
export function sailBands(payload: CrossoverChartPayload): Map<number, string> {
  return new Map(
    payload.sail_definitions.map((definition, index) => [definition.number, sailBand(index)])
  )
}
