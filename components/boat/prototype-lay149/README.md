# PROTOTYPE — LAY-149, the three charts behind Instrument Tuning

**Throwaway. Do not build on this.** It lives on `prototype/lay-149-diagnostic-charts`, branched
from LAY-147's prototype, and never lands on `main`. **The branch publishes code, never data:**
`charts.json` holds per-row `STW`/`SOG` pairs and per-heading figures from the owner's private
archive, so it is gitignored and never committed. Regenerate it before building with
`python3 components/boat/prototype-lay149/compute-charts.py`, which reads `~/git/Handsome-Pete`.

> Three variants of the sheet each Instrument Tuning card opens — `HDG` deviation curve, `AWA`
> tack-pair split, `STW` speed check — plus each variant's per-Race tile, switchable via
> `?variant=A|B|C` and `?view=screen|tile` on `/boat-performance/instrument-tuning-charts-prototype`.
> `?open=hdg|awa|stw` opens a sheet on load; `?race=<id>` picks the tile's Race.

Run it: **`npm run prototype:lay149`**, open the route. `←`/`→` cycle variants, `↑`/`↓` swap
screen and tile. `node components/boat/prototype-lay149/shots.mjs` (server on 4149) shoots all
nine sheets and three tiles at 390px into `/tmp`.

**Unlike LAY-147, this runs on the real archive.** `compute-charts.py` ports `compass_calibration.py`
and `awa_offset.py` as LAY-145 specs them, plus ADR 0027's regression, over Countable rows reproduced
as LAY-146 did (2,707 rows, 13 Races). The 2026-07-04 era boundary comes from
`compass-calibrations.yaml`, standing in for the Calibration Event the owner has not yet entered.

## What each variant is a position on

| | **A — Rose & overlay** | **B — Strip & evidence** | **C — Races as small multiples** |
|---|---|---|---|
| **Q1 HDG form** | polar rose, like a deviation card | linear 0–360° bars | linear line, both eras overlaid |
| **Q2 absent bins** | hatched sector, line breaks | hatched column, evidence row reads blank | line breaks; per-Race minis hatch |
| **Q3 levels** | overlay: Races as faint dots under the era line; era is a toggle | toggle: era, *or* one Race | era on top, every Race below as its own mini |
| **Q4 trust** | σ band, unchanged from LAY-147 | coverage replaces σ | both; card prints both words |
| **STW form** | SOG-on-STW scatter, pick a Race to lift it | residual (SOG − STW) by 1 kt band, 1:1 lies flat | per-Race mini scatters |
| **AWA form** | two strips of pair offsets | dumbbells: starboard angle vs port angle per pair | one row per Race, autocomp rule across |
| **Q6 tile** | three numbers | numbers + coverage bars | the three miniatures |

**D — Recommended mix**, second round after the owner's review, and fully interactive
(`shots-d.mjs` drives every interaction and asserts the readout changed):

- `HDG` — **Strip | Rose** toggle over one state: overlay chips (pre-4 Jul dashed, or one Race in
  amber) and the selected heading survive the switch. Tap a heading (or ←/→) for its figure now and
  before, and every Race behind it with its row count — including bins under the 3-row gate.
- `AWA` — a new **tack dial**: bow up, starboard right, port left, one dot per tack at the angle it
  held. Port's average is folded onto starboard as a dashed ray, so asymmetry is a labelled amber
  wedge — upwind at the top, downwind at the bottom. Chips: season, either side of the autocomp,
  or one Race over the season's grey rays. Tap a dot or a list row for that pair. The readout says
  which tack reads wider, and whether upwind and downwind lean the same way.
- `STW` — **Scatter | Gap by speed** over one state: Race chips and the selected 1 kt band. The
  fitted line is drawn in both (in the gap view it is a straight line against the flat 1:1). A
  **fit-method toggle** shows how much the line depends on it: slope 0.94 regressing `SOG` on `STW`
  (ADR 0027 as written), 0.98 treating both as noisy, 1.02 the other way round. Coefficients are
  never printed.
- Trust: B's coverage verdict. Tile: B's.

Q5 is already ADR 0031's (a sheet, not a route); every variant keeps it. Q7: ADR 0031 already
dropped `when` for the Era; nothing here reopens that.

## What the real archive showed (the fixture could not)

- **The compass error is a curve, not an offset.** Since 4 Jul: about **+12° heading N, −9° heading
  WSW** — a one-cycle sinusoid. Before 4 Jul: the same shape, ~10° higher. The autocompensation
  moved the mean and left the shape. The card's `+3.3°` hides a ±10° heading-dependent error.
- **So race-to-race σ mostly measures heading mix.** A Race that sailed north reads high, one that
  sailed WSW reads low. LAY-147's band (`+3.3° / 2.6° → WORTH WATCHING`) is σ of something other
  than measurement noise.
- **No single Race covers the compass.** Per-Race coverage is 14–56% of the rose. The era curve
  reaches 33/36 headings, but only 24 rest on 2+ Races; its worst bin (+12.7° at 15°) rests on 2.
- **Downwind `AWA` barely exists:** 18 upwind pairs from 10 Races, **2 downwind** pairs from 2. They
  disagree in sign (−5.8° vs +5.1°); a rotated vane would read the same sign on both.
- **The LAY-145 §2.6 check can now be read:** the Asymmetry went −3.8° → −5.5° across an
  autocompensation that moved the compass ~10°. That does not look compass-driven — on 4 + 6 Races.
- **The `STW` gap is U-shaped**: ~+0.45 kt at 2–3 kt, ~0 at 4–6, +0.3–0.5 at 8–9 (the top end depends
  on binning by `STW` or `SOG`). A straight fit line cannot show that; B's residual bands can.
- **ADR 0027's blank-`STW` stat is 0 on the rows the scatter reads.** All 935 in-window blank-`STW`
  rows are Frozen (845) or Low-Speed (90). The 19.8% is of the whole archive, not of Countable rows.
