/**
 * PROTOTYPE (LAY-165) — VARIANT C: **the certificate's own grid**, filled in.
 *
 * The position: ADR 0026 called this screen's aggregate a "binned efficiency grid", and LAY-155
 * shipped that as a list of four wind bands. This variant takes the phrase literally — the boat is
 * scored against a 16 × 9 table, so the picture is that table with the boat's own figures in it,
 * one cell at a time, the way the Sail Selection Screen draws the Crossover Chart (ADR 0030).
 *
 * What it costs: it is not a *shape*. It cannot show that the boat's downwind lobe falls away, and
 * a row's cell here is the cell it is *drawn* in rather than the pair of cells its own bilinear
 * target came from (`gridCells`). What it buys: it is the only one of the three that is honest
 * about **coverage without being asked** — 86 of this certificate's 144 cells have ever been
 * sailed, and a picture that draws all 144 says so without a sentence underneath.
 *
 * Every reached cell prints its number, which is ADR 0030's rule on the neighbouring screen and for
 * its reason: after dark the whole ramp collapses to one red depth, so colour can only find the
 * shape and the number is what identifies the figure.
 */

'use client'

import { useState, type ReactElement } from 'react'
import { overlayBand, overlayColour } from '@/services/analysis/track-overlays'
import { describeDuration } from '@/services/recordings/coverage'
import {
  anchorable,
  gridCells,
  type GridCell,
  type PrototypeArchive,
  type PrototypeRow,
} from './data'

interface VariantProps {
  archive: PrototypeArchive
  rows: readonly PrototypeRow[]
  reference: readonly PrototypeRow[] | null
  mode: 'season' | 'race' | 'teaser'
}

/** Hatching for a cell nobody has sailed: the same 45° weave `NotRecorded` uses (ADR 0012). */
const UNREACHED =
  'repeating-linear-gradient(45deg, transparent, transparent 3px, var(--surface-elevated) 3px, var(--surface-elevated) 6px)'

export default function VariantC({ archive, rows, reference, mode }: VariantProps): ReactElement {
  const [selected, setSelected] = useState<string | null>(null)

  const cells = gridCells(rows, archive.polar)
  const reached = new Map(cells.map((cell) => [key(cell), cell]))
  const seasonReached = new Set(
    reference === null ? [] : gridCells(reference, archive.polar).map(key)
  )

  const { twa_axis, tws_axis, origins } = archive.polar
  const teaser = mode === 'teaser'
  const chosen = selected === null ? null : reached.get(selected) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ overflowX: 'auto' }}>
        <table
          data-testid="grid"
          style={{
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-mono)',
            fontSize: teaser ? 0 : 9,
          }}
        >
          <thead>
            <tr>
              <th style={{ ...HEAD, textAlign: 'left' }}>{teaser ? '' : 'TWA'}</th>
              {tws_axis.map((tws) => (
                <th key={tws} style={HEAD}>
                  {teaser ? '' : tws}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {twa_axis.map((twa, row) => (
              <tr key={twa}>
                <th style={{ ...HEAD, textAlign: 'left' }}>{teaser ? '' : `${twa}°`}</th>
                {tws_axis.map((tws, column) => {
                  const cell = reached.get(`${row}|${column}`) ?? null
                  const origin = origins[row][column]
                  const inSeason = seasonReached.has(`${row}|${column}`)

                  return (
                    <Cell
                      key={tws}
                      cell={cell}
                      origin={origin}
                      size={teaser ? 7 : 26}
                      teaser={teaser}
                      /* On the per-Race grid, a cell the *season* has reached and this race has not
                         is outlined rather than left blank: the difference between "the boat has
                         never sailed here" and "not in this race" is the whole point of looking at
                         one race's grid. */
                      outlined={inSeason && cell === null}
                      selected={selected === `${row}|${column}`}
                      onSelect={() => setSelected(selected === `${row}|${column}` ? null : `${row}|${column}`)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!teaser && (
        <>
          <Coverage cells={cells} archive={archive} mode={mode} />
          {chosen !== null && <Detail cell={chosen} archive={archive} rows={rows} />}
        </>
      )}
    </div>
  )
}

function key(cell: GridCell): string {
  return `${cell.twa_index}|${cell.tws_index}`
}

function Cell({
  cell,
  origin,
  size,
  teaser,
  outlined,
  selected,
  onSelect,
}: {
  cell: GridCell | null
  origin: string
  size: number
  teaser: boolean
  outlined: boolean
  selected: boolean
  onSelect: () => void
}): ReactElement {
  const filler = !anchorable(origin as GridCell['origin'])
  const pct = cell?.pct ?? null

  return (
    <td style={{ padding: 0 }}>
      <button
        type="button"
        data-testid="grid-cell"
        data-pct={pct === null ? '' : Math.round(pct * 100)}
        data-filler={filler ? 'yes' : 'no'}
        disabled={cell === null || teaser}
        onClick={onSelect}
        aria-label={
          pct === null
            ? 'never sailed here'
            : `${Math.round(pct * 100)}% of target over ${describeDuration(cell?.seconds ?? 0)}`
        }
        style={{
          width: size,
          height: size,
          padding: 0,
          border: selected
            ? '2px solid var(--text-accent)'
            : outlined
              ? '1px dashed var(--text-muted)'
              : '1px solid var(--surface-border)',
          background:
            pct === null ? UNREACHED : overlayColour(overlayBand('target_speed', pct)),
          color: 'var(--surface-raised)',
          fontFamily: 'var(--font-mono)',
          fontSize: 8.5,
          fontWeight: 700,
          lineHeight: 1,
          /* The certificate's own filler, marked on the *grid* rather than on the figure: these
             cells are weak wherever they are read from, so the mark belongs to the cell. A stitched
             outline, the same language the track uses for a filler-anchored stretch. */
          outline: filler ? '1.5px dashed var(--state-warning)' : undefined,
          outlineOffset: -3,
          cursor: cell === null || teaser ? 'default' : 'pointer',
        }}
      >
        {teaser || pct === null ? '' : Math.round(pct * 100)}
      </button>
    </td>
  )
}

/** What the grid says about itself: how much of it has ever been sailed, and how thinly. */
function Coverage({
  cells,
  archive,
  mode,
}: {
  cells: GridCell[]
  archive: PrototypeArchive
  mode: 'season' | 'race' | 'teaser'
}): ReactElement {
  const total = archive.polar.twa_axis.length * archive.polar.tws_axis.length
  const figured = cells.filter((cell) => cell.pct !== null)
  const thin = figured.filter((cell) => cell.seconds < 300)
  const filler = figured.filter((cell) => !anchorable(cell.origin))
  const fillerCells = archive.polar.origins.flat().filter((origin) => !anchorable(origin)).length
  const flattering = filler.filter((cell) => (cell.pct ?? 0) > 1.02)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={NOTE}>
        <strong>
          {figured.length} of {total} cells
        </strong>{' '}
        carry a figure{mode === 'race' ? ' in this race' : ''}
        {cells.length > figured.length && (
          <>
            {' '}
            — {cells.length} have been sailed at all, so {cells.length - figured.length} hold rows
            that were sailed and could not be scored
          </>
        )}
        {thin.length > 0 && <> · {thin.length} rest on under five minutes</>}. The hatched cells are
        not failures: most of them are angles and wind speeds this boat has no reason to sail.
      </p>
      <p style={NOTE}>
        {fillerCells} cells are the certificate’s own <strong>ramp filler</strong>, outlined in
        warning: a figure read against one of them is weak however many hours sit behind it, which is
        why the mark is on the cell and not on the number.
        {filler.length > 0 && ` ${filler.length} of them have been sailed.`}
      </p>
      {flattering.length > 0 && (
        <p style={{ ...NOTE, color: 'var(--state-warning)' }}>
          This variant lets <strong>ADR 0036 colour itself</strong>: a filler-anchored figure is
          computed, shown and flagged, and here that means {flattering.length} of those cells are
          painted at the <em>good</em> end of the ramp — up to{' '}
          {Math.round(Math.max(...flattering.map((cell) => cell.pct ?? 0)) * 100)}% of “target”,
          because the thing they are divided by is a ramp towards zero rather than a measurement.
          Variants A and B refuse the colour and keep the flag. That disagreement is the decision to
          make.
        </p>
      )}
      {mode === 'race' && (
        <p style={NOTE}>
          Dashed, empty cells are cells the <em>archive</em> has reached and this race did not.
        </p>
      )}
    </div>
  )
}

/** One cell, tapped: the slices under it, each over its own rows (ADR 0030's breakdown rule). */
function Detail({
  cell,
  archive,
  rows,
}: {
  cell: GridCell
  archive: PrototypeArchive
  rows: readonly PrototypeRow[]
}): ReactElement {
  const twa = archive.polar.twa_axis[cell.twa_index]
  const tws = archive.polar.tws_axis[cell.tws_index]
  const own = rows.filter(
    (row) =>
      row.twa !== null &&
      row.tws !== null &&
      Math.abs(row.twa) >= twa &&
      (archive.polar.twa_axis[cell.twa_index + 1] === undefined ||
        Math.abs(row.twa) < archive.polar.twa_axis[cell.twa_index + 1]) &&
      row.tws >= tws &&
      (archive.polar.tws_axis[cell.tws_index + 1] === undefined ||
        row.tws < archive.polar.tws_axis[cell.tws_index + 1])
  )

  const races = [...new Set(own.map((row) => row.race_id))]

  return (
    <div
      data-testid="cell-detail"
      style={{
        padding: 10,
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-raised)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <strong style={{ fontSize: 'var(--text-sm)' }}>
        {twa}° in {tws} kt — {cell.pct === null ? 'no figure' : `${Math.round(cell.pct * 100)}%`} of
        target
      </strong>
      <span style={NOTE}>
        {describeDuration(cell.seconds)} over {races.length} race{races.length === 1 ? '' : 's'} ·
        certificate says {cell.certificate_knots.toFixed(2)} kt here
        {cell.observed_knots !== null && <> · the boat held {cell.observed_knots.toFixed(2)} kt</>}
      </span>
      <span style={NOTE}>
        This cell is <strong>{cell.origin.replace('-', ' ')}</strong>
        {anchorable(cell.origin)
          ? '.'
          : ' — the file ramped it up from zero rather than measuring it, so every figure here is filler-anchored.'}
      </span>
      <span style={{ ...NOTE, fontStyle: 'italic' }}>
        {races.join(', ')}
      </span>
    </div>
  )
}

const HEAD = {
  padding: '1px 3px',
  fontSize: 8,
  fontWeight: 400,
  color: 'var(--text-muted)',
  textAlign: 'center' as const,
}

const NOTE = { margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }

export const VARIANT_C_NAME = 'Grid — the certificate’s own cells, filled in'
