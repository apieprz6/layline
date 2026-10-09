/**
 * PROTOTYPE (LAY-165) — THROWAWAY. What the archive looks like, so the variants argue over numbers.
 *
 *     node components/analysis/prototype-lay165/survey.mjs
 */

import { readFileSync } from 'node:fs'

const archive = JSON.parse(readFileSync(new URL('./archive.json', import.meta.url), 'utf8'))
const { polar, races, rows } = archive

const countable = rows.filter((row) => row.countable)
const scored = countable.filter((row) => row.pct !== null)

console.log('## The certificate')
console.log('twa_axis', polar.twa_axis.join(' '))
console.log('tws_axis', polar.tws_axis.join(' '))

// The ragged boundary: per TWS column, the lowest TWA row that is anchorable (measured or
// interpolated). LAY-150's finding is that this moves column to column.
const anchorable = (origin) => origin === 'measured' || origin === 'interpolated'
const floors = polar.tws_axis.map((tws, column) => {
  const row = polar.origins.findIndex((cells) => anchorable(cells[column]))
  return `${tws}kt→${polar.twa_axis[row]}°`
})
console.log('first anchorable TWA per column:', floors.join(' '))

const originCounts = {}
for (const cells of polar.origins) for (const origin of cells) originCounts[origin] = (originCounts[origin] ?? 0) + 1
console.log('cell origins', originCounts)

console.log('\n## Races, and how much each weighs')
const perRace = races
  .map((race) => {
    const own = rows.filter((row) => row.race === race.id)
    const ownScored = own.filter((row) => row.countable && row.pct !== null)
    const seconds = ownScored.reduce((total, row) => total + (row.seconds ?? 0), 0)
    return {
      id: race.id,
      rows: own.length,
      scored: ownScored.length,
      pointShare: ownScored.length / scored.length,
      timeShare: seconds,
      filler: ownScored.filter((row) => row.filler).length,
    }
  })
  .sort((a, b) => b.scored - a.scored)

const totalTime = perRace.reduce((total, race) => total + race.timeShare, 0)
for (const race of perRace) {
  console.log(
    [
      race.id.padEnd(22),
      `rows ${String(race.rows).padStart(4)}`,
      `scored ${String(race.scored).padStart(4)}`,
      `points ${(race.pointShare * 100).toFixed(1).padStart(5)}%`,
      `time ${((race.timeShare / totalTime) * 100).toFixed(1).padStart(5)}%`,
      `filler ${String(race.filler).padStart(3)}`,
    ].join(' · ')
  )
}

console.log('\n## Coverage of the certificate grid, by the rows')
// Which (TWA row, TWS column) cells any scored row's bracket actually sat in.
const cellOf = (axis, value) => {
  let index = null
  for (const [at, entry] of axis.entries()) if (value >= entry) index = at
  return index
}
const reached = new Map()
for (const row of scored) {
  const twaAt = cellOf(polar.twa_axis, Math.abs(row.twa))
  const twsAt = cellOf(polar.tws_axis, row.tws)
  if (twaAt === null || twsAt === null) continue
  const key = `${polar.twa_axis[twaAt]}/${polar.tws_axis[twsAt]}`
  reached.set(key, (reached.get(key) ?? 0) + 1)
}
const cells = polar.twa_axis.length * polar.tws_axis.length
console.log(`cells reached ${reached.size} of ${cells}`)
console.log(
  'reached cells with under 10 rows:',
  [...reached.values()].filter((count) => count < 10).length
)

console.log('\n## Where the boat actually sailed')
const twaBuckets = {}
for (const row of scored) {
  const at = Math.round(Math.abs(row.twa) / 10) * 10
  twaBuckets[at] = (twaBuckets[at] ?? 0) + 1
}
console.log(
  Object.entries(twaBuckets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([twa, count]) => `${twa}°:${count}`)
    .join(' ')
)

const twsBuckets = {}
for (const row of scored) {
  const at = Math.floor(row.tws)
  twsBuckets[at] = (twsBuckets[at] ?? 0) + 1
}
console.log(
  Object.entries(twsBuckets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([tws, count]) => `${tws}kt:${count}`)
    .join(' ')
)

console.log('\n## The figures')
const ratio = (list, pick) => {
  let actual = 0
  let target = 0
  for (const row of list) {
    if (row.seconds === null || row.pct === null) continue
    const value = pick(row)
    if (value === null) continue
    actual += (row.sog * row.seconds) / 3600
    target += (row.sog / value) * (row.seconds / 3600)
  }
  return actual / target
}
console.log('season polar efficiency (ratio of sums):', (ratio(scored, (row) => row.pct) * 100).toFixed(1) + '%')
console.log(
  'season, as a plain mean of per-row percents:',
  ((scored.reduce((total, row) => total + row.pct, 0) / scored.length) * 100).toFixed(1) + '%'
)
const pcts = scored.map((row) => row.pct).sort((a, b) => a - b)
const at = (q) => (pcts[Math.floor(pcts.length * q)] * 100).toFixed(0)
console.log(`per-row spread: p5 ${at(0.05)}% p25 ${at(0.25)}% median ${at(0.5)}% p75 ${at(0.75)}% p95 ${at(0.95)}%`)
console.log('rows above 100%:', scored.filter((row) => row.pct > 1).length, 'of', scored.length)

console.log('\n## Filler-anchored, and where it lands')
const fillerRows = scored.filter((row) => row.filler)
const fillerTwa = {}
for (const row of fillerRows) {
  const at = Math.round(Math.abs(row.twa) / 5) * 5
  fillerTwa[at] = (fillerTwa[at] ?? 0) + 1
}
console.log('filler rows by |TWA|:', Object.entries(fillerTwa).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}°:${v}`).join(' '))
console.log(
  'filler rows by TWS:',
  Object.entries(
    fillerRows.reduce((into, row) => {
      const at = Math.floor(row.tws)
      into[at] = (into[at] ?? 0) + 1
      return into
    }, {})
  )
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}kt:${v}`)
    .join(' ')
)

console.log('\n## VMG')
const vmgRows = countable.filter((row) => row.vmg_pct !== null)
console.log('rows with a VMG figure:', vmgRows.length, 'filler-anchored:', vmgRows.filter((row) => row.vmg_filler).length)
console.log('upwind', vmgRows.filter((row) => row.zone === 'upwind').length, 'downwind', vmgRows.filter((row) => row.zone === 'downwind').length)

console.log('\n## Excluded, and why')
const reasons = {}
for (const row of rows) if (!row.countable) reasons[row.excluded] = (reasons[row.excluded] ?? 0) + 1
console.log(reasons)
console.log('countable but unscoreable:', countable.filter((row) => row.pct === null).length)

console.log('\n## Annotations')
const seaStates = {}
const sails = {}
for (const row of scored) {
  seaStates[row.sea_state ?? 'not-recorded'] = (seaStates[row.sea_state ?? 'not-recorded'] ?? 0) + 1
  sails[row.sail] = (sails[row.sail] ?? 0) + 1
}
console.log('sea state', seaStates)
console.log('sail', sails)
