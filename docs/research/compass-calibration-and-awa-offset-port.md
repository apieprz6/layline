
# LAY-145 — TypeScript port spec: compass deviation and AWA tack-asymmetry diagnostics

**Purpose.** LAY-145 is a child of the LAY-138 map ("Instrument Tuning" screen). This document specs — but
does **not** implement — the port of two Handsome-Pete Python scripts into a new `services/analysis/`
directory:

- `scripts/compass_calibration.py` (353 lines) — compares `CTW` against `COG` to find heading-dependent
  compass deviation.
- `scripts/awa_offset.py` (317 lines) — pairs opposite-tack segments at a matched point of sail to find an
  apparent-wind-angle asymmetry.

Both scripts today run **by hand, once per recording**, against a CSV in `cleaned-recordings/`, and write
PNGs to `analysis-output/`. LAY-138 wants one **season-wide trend per channel**, computed over the **full
archive** by default (decision 9), read-only/diagnostic (decision 7 — never drafts a value into a new
Instrument Calibration Version), as a new standalone screen (decision 5).

**This is a spec, not a module.** Interfaces and pseudocode below illustrate intent; nothing here is a
working implementation, and no file under `services/analysis/` is created by this ticket.

**Confidence markers**, matching `docs/research/qtvlm-csv-columns.md` and `docs/research/orc-polar-file-formats.md`:
`[DOCUMENTED]` (cites a source), `[INFERRED FROM DATA]` (cites the measurement), `[UNRESOLVED]` (names what
was tried), plus one addition proper to a spec rather than a research doc: **`[DECISION]`** — a design choice
made in this document, with its reasoning, not an empirical claim.

---

## Summary

| # | Question | Answer | Confidence |
|---|---|---|---|
| 1 | Does `SOG_MIN = 3.5` duplicate `LOW_SPEED_SOG_KNOTS = 2`? | No — compose them. Keep `SOG_MIN` as its own, stricter, analysis-only gate; Row Quality's `low_speed` (`SOG < 2`) is a broader "was the boat sailing at all" test the whole archive uses, this is a narrower "is a heading/angle reading trustworthy" test only these two analyses need. | `[DECISION]` |
| 2 | Is `STATUS == "valid"` translatable? | No — it is superseded outright by Row Quality (`!frozen && !not_water_referenced`) plus the two scripts' own residual gates (`CTW`/`COG` non-null; `AWA (calc)` non-null). Porting also **adds** a filter the Python never had: `awa_offset.py` never excluded not-water-referenced rows, and per `docs/research/qtvlm-csv-columns.md` §Q5 it should have. | `[DOCUMENTED]` + `[DECISION]` |
| 3 | JS `%` on the angle-wrap formula — does it bite? | Yes, for real inputs. `CTW − COG` legitimately swings outside ±180 (both channels are 0–360°), and JS's `%` (remainder, sign of dividend) gives a different, wrong answer from Python's `%` (modulo, sign of divisor) on those inputs. The port needs an explicit double-mod, not a transliteration. | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| 4 | Per-recording point vs. season aggregate — pool rows or average per-Race bins? | Average per-**Race** bin means, weighting every qualifying Race equally. Matches the Python script's own cross-recording behaviour and stops one 13-hour distance race from swamping a season built mostly of 90-minute beer-cans. | `[DECISION]` |
| 5 | What does a data-poor Race contribute to the trend? | Nothing — no point, no null placeholder. Surfaced as an explicit "excluded, insufficient data" line, never a zero or a gap a chart silently interpolates through. | `[DECISION]`, per AGENTS.md's no-fabricated-nulls principle |
| 6 | Is the per-Race point also the per-Race summary tile LAY-138 already stubs? | Yes — it's the same number, already computed as an aggregate ingredient. No second computation needed. | `[DECISION]` |
| 7 | How should `compass-calibrations.yaml`'s hand-maintained "eras" map onto Layline? | Derive them from real data: partition the timeline at every `Calibration Event` of type `autocompensation` (channel is always exactly `['HDG']`) **and** every `HDG` field change in an `Instrument Calibration` Version — i.e., filter `buildCalibrationLog()`'s own merged output to channel `HDG`. In scope for a first cut; costs a filter, not a schema change. | `[DECISION]` |
| 8 | Is `compass_calibration.py`'s output a `HDG` **Measured Offset**? | Yes, with one caveat stated plainly: it is measured against `CTW` (= `HDG + leeway`), and leeway is ≈0 on this boat only because there is no heel sensor to feed it. Call it "Measured Offset for `HDG`, via `CTW`" rather than a bare `HDG` Measured Offset. | `[DOCUMENTED]` + `[DECISION]` |
| 9 | Is `awa_offset.py`'s output an `AWA` **Measured Offset**? | No. Its input, `AWA (calc)`, is not the masthead's raw reading — it's algebra on `TWS`/`TWA`/`STW`, which is itself entangled with `CTW`. The asymmetry it measures cannot be attributed to the `AWA` channel alone. Needs its own, narrower term: proposed here as **Apparent Wind Asymmetry**. | `[DOCUMENTED]` + `[DECISION]` |

---

## 0. Ground truth and sources

**Scripts ported** (read in full for this spec):
- `/home/ubuntu/git/Handsome-Pete/scripts/compass_calibration.py`
- `/home/ubuntu/git/Handsome-Pete/scripts/awa_offset.py`

**Layline context** (read in full or in the relevant sections):
- `/home/ubuntu/git/layline/CONTEXT.md` — the Calibration Channel / Programmed Offset / Measured Offset /
  Calibration Event / Row Quality vocabulary this spec must apply, not redefine.
- `/home/ubuntu/git/layline/docs/adr/0009-upload-quality-gates-and-row-quality-as-a-computed-view.md`
- `/home/ubuntu/git/layline/docs/adr/0010-a-race-is-testimony-over-an-immutable-transcription.md`
- `/home/ubuntu/git/layline/docs/research/qtvlm-csv-columns.md` — cited throughout, especially §Q4 (`CTW`),
  §Q5 (`AWA (calc)`/`TWA (calc)` provenance), §Q6 (angle sign conventions).
- `/home/ubuntu/git/layline/services/recordings/row-quality.ts`, `race-window.ts`, `coverage.ts`,
  `wall-clock.ts`; `/home/ubuntu/git/layline/services/races/recording-rows.ts`, `readRace.ts`,
  `readRaces.ts`; `/home/ubuntu/git/layline/types/index.ts`; `/home/ubuntu/git/layline/lib/boat/calibration.ts`.

**Instrument documentation** (`/home/ubuntu/git/Handsome-Pete/instrument-documentation/`), page numbers as
printed on the page (physical PDF page = printed + 1 for the qtVlm manual only; the two device manuals below
have no such offset — verified by extracting all three PDFs to text and checking the printed footer against
the physical page index):
- `qtVlm_documentation_en_5.12.27` (qtVlm manual, 300 pp.) — pp. 183, 212–214.
- `fluxgate-compass-UK.pdf` (nke Fluxgate Compass user/installation guide, 12 pp.) — pp. 6–7, §2.1–2.2.
- `38_Aluwind_HR_um_UK_28-1.pdf` (nke Aluwind HR masthead unit user guide, 10 pp.) — pp. 6–7, §2.1–2.2.

No existing Layline code, type, or route references "Instrument Tuning", "AWA symmetry", "compass
deviation", or point-of-sail/tack classification of any kind — confirmed by repo-wide grep. `services/analysis/`
does not exist. This is a green field.

---

## 1. Algorithm and constants, translated for TypeScript

### 1.1 What supersedes `STATUS == "valid"`

Both scripts gate every computation behind one filter:

```python
mask = (df["STATUS"] == "valid") & (df["SOG"] >= SOG_MIN)
mask &= df["CTW"].notna() & df["COG"].notna()          # compass_calibration.py
mask &= df["AWA (calc)"].notna()                        # awa_offset.py
```

`STATUS` does not exist in Layline and is not translated — it is **superseded**, per
`CONTEXT.md`'s **Row Quality** entry ("the prior art's single `STATUS` column is what this replaces") and
ADR 0009. The port's row filter is:

```ts
const usable = !quality.frozen && !quality.not_water_referenced && sog !== null && sog >= SOG_MIN
```

Two things happen here that are not a 1:1 translation:

1. **`not_water_referenced` already implies the `CTW`/`STW` half of the Python filter.** Row Quality defines
   it as `stw === null || ctw === null` (`services/recordings/row-quality.ts:192`). So
   `compass_calibration.py`'s explicit `CTW.notna()` check is now redundant with `!not_water_referenced` — keep
   the explicit `ctw !== null` check anyway in the compass module for clarity and because it is cheap, but do
   not treat it as adding a filter Row Quality lacks. `COG.notna()` is **not** covered by Row Quality (`COG` is
   Position-Derived and not one of the four Dropout channels' *comparison* subjects in the relevant sense — it
   *is* one of the four, `services/recordings/row-quality.ts:51`, but a null `COG` on a non-frozen row is a
   distinct, uncovered case) and must stay an explicit check.
2. **`awa_offset.py` never checked `STW`/`CTW` at all** — its filter is `AWA (calc).notna()` alone
   (`awa_offset.py:27-30`). This is a real gap: `docs/research/qtvlm-csv-columns.md` §Q5 measured that
   `AWA (calc)` is non-empty in 4,283 rows while `STW` is non-empty in only 4,047, so "in ~236 rows qtVlm
   evidently substituted something (likely 0 or last-known) for the missing `STW`," and the doc's explicit
   recommendation is "Treat `(calc)` apparent wind as unreliable wherever `STW` is blank." **The port must add
   `!not_water_referenced` to the AWA module's filter — this is a correctness fix inherited from porting to a
   codebase that has the concept, not an optional extra.** `[DOCUMENTED]` (qtvlm-csv-columns.md §Q5) +
   `[DECISION]`.

`Frozen` has no Python-side analogue at all (the prior art's cleaning pipeline that fed these scripts already
dropped or blanked rows some other way; see ADR 0009's finding that the prior art's `STATUS` never reliably
caught a Dropout). The port must add `!quality.frozen` explicitly — omitting it would let a two-hour dead-feed
tail, which repeats the last live `CTW`/`COG`/`SOG` verbatim, contribute a run of identical, fabricated
"measurements" to both a compass-error time series and a segment/tack-pair search.

### 1.2 `compass_calibration.py`

**Constants**

| Constant | Value | TS treatment |
|---|---|---|
| `SOG_MIN` | `3.5` kt | Named export, own module. See §1.4 below on why this does not collapse into `LOW_SPEED_SOG_KNOTS`. |
| `BIN_SIZE` | `10`° | Named export. Not arbitrary — see the fluxgate corroboration below. |
| `MIN_POINTS_PER_BIN` | `3` | Named export. |
| *(unnamed)* minimum valid points to analyse a Race at all | `5` (`compass_calibration.py:263`) | Give it a name on the way in, e.g. `MIN_VALID_POINTS`, even though the Python left it a bare literal. |

**`SOG_MIN` vs. `LOW_SPEED_SOG_KNOTS` — compose, do not collapse.** `[DECISION]`

`LOW_SPEED_SOG_KNOTS = 2` (`services/recordings/row-quality.ts:26`) answers "was the boat meaningfully
sailing at all" — Row Quality's own doc comment: "Gated on GPS speed rather than `STW` because GPS speed is
verifiable while paddlewheel calibration varies between sessions." `SOG_MIN = 3.5` answers a narrower,
analysis-specific question: "is a heading/angle reading from this row trustworthy enough to feed a deviation
curve" — at low speed, leeway, steering noise and a slow-responding fluxgate all inflate `CTW`'s error
independently of any real deviation, so the *residual signal* the script is trying to isolate gets swamped by
noise well before the boat stops "sailing" in Row Quality's sense. These are genuinely different tests: one
gates inclusion in the archive's notion of a moving boat, the other gates inclusion in a specific statistical
estimate. Since `3.5 > 2`, applying `SOG_MIN` after Row Quality's `low_speed` filter is a strict narrowing, not
a conflict — but the port should still apply both explicitly (`!low_speed` from Row Quality, then `SOG >=
SOG_MIN`) rather than relying on `3.5 > 2` implicitly, because Row Quality's threshold is a constant that "will
move" by its own doc comment (`services/recordings/row-quality.ts:11`), and a hard-coded assumption that
`SOG_MIN` will always exceed it would silently break if `LOW_SPEED_SOG_KNOTS` were ever raised past `3.5`.
**Recommendation:** export `SOG_MIN` from a shared `services/analysis/constants.ts` (both scripts use the same
value) with a doc comment cross-referencing `LOW_SPEED_SOG_KNOTS` and stating explicitly that it composes with,
and does not replace, Row Quality's `low_speed`.

**Angle normalisation — the JS `%` trap is real here, not hypothetical.** `[DOCUMENTED]` + `[INFERRED FROM DATA]`

```python
def normalize_angle(angle):
    """Normalize angle difference to [-180, 180]."""
    return (angle + 180) % 360 - 180
```

Python's `%` is a true modulo: for a negative dividend and positive divisor it returns a non-negative result
(`-178 % 360 == 182` in Python). JS's `%` is a remainder: it preserves the sign of the dividend
(`-178 % 360 === -178` in JS, since `|-178| < 360`). A line-for-line port —

```ts
// WRONG — matches Python's operator name, not its behaviour
function normalizeAngle(angle: number): number {
  return ((angle + 180) % 360) - 180
}
```

— gives the right answer only when `angle + 180 >= 0`, i.e. `angle >= -180`. `CTW − COG` legitimately falls
below `-180`: both `CTW` and `COG` range 0–360° (`docs/research/qtvlm-csv-columns.md`'s parser-implications
table lists both as "Degrees ... 0..360"), so a `CTW` of 5° against a `COG` of 355° gives a raw difference of
`-350`, and `angle + 180 = -170`, which is negative and triggers the bug: the WRONG version returns `-170 - 180
= -350` (unwrapped, nonsense) instead of the correct `+10`. This is not an edge case that never occurs in this
data — a boat holding a steady course near 0°/360° with an average compass deviation will produce it on every
row near that heading. The correct TS translation needs an explicit double-modulo:

```ts
// CORRECT
function normalizeAngle(angleDeg: number): number {
  const wrapped = (((angleDeg + 180) % 360) + 360) % 360
  return wrapped - 180
}
```

This is the single highest-value catch in this whole spec's §1: a literal line-for-line port of this one
function silently produces wrong compass-error values for a subset of headings, and the failure is silent
because both languages call the operator `%` and the code looks identical.

**Binning — half-open edges, and what happens at exactly 360.** `[INFERRED FROM DATA]`

```python
for bin_start in range(0, 360, BIN_SIZE):          # bin_start ∈ {0, 10, ..., 350}
    bin_mask = (headings >= bin_start) & (headings < bin_start + BIN_SIZE)
```

The last bin is `[350, 360)` — a heading of exactly `360.0` (possible from floating-point wraparound, though
`docs/research/qtvlm-csv-columns.md` records `CTW` as ranging 0–360 without settling whether `360.0` itself
ever appears verbatim) falls into **no** bin: `350 <= 360` is true but `360 < 360` is false, and `0 <= 360` is
false too. This must be preserved faithfully rather than "fixed" by wrapping `360.0` to `0.0` before binning —
the Python does not do that normalisation, and doing it in the port would silently change which rows count
toward `heading_coverage_pct` relative to what the original tool measured. The TS translation is a direct,
un-clever loop:

```ts
for (let binStart = 0; binStart < 360; binStart += BIN_SIZE) {
  const inBin = rows.filter(r => r.ctw !== null && r.ctw >= binStart && r.ctw < binStart + BIN_SIZE)
  ...
}
```

**Bin size is not an arbitrary round number — it matches the fluxgate's own autocompensation sampling.**
`[DOCUMENTED]` The nke fluxgate compass user guide, p. 6, §2.2.1: "the sensor will record the measurement
points of a deviation curve, **every 10°** with an accuracy of 0.25°." `BIN_SIZE = 10` in
`compass_calibration.py` reproduces, at analysis time, the exact angular resolution the compass hardware itself
uses to build its own internal deviation table during an autocompensation. This is worth keeping as-is and
worth stating in the port's doc comment — it is evidence the constant was chosen deliberately, not a round
number of convenience, and a reason not to "simplify" it to e.g. 15° or 30° bins.

**pandas `NaN`-vs-TS-`null` semantics.** `[DECISION]`

`errors.mean()`, `.std()`, `.abs().max()` on an empty or all-`NaN` pandas Series silently return `NaN` (a float
that is still numerically a "number" in pandas' type system). A naive TS port that computes `sum / count` for
an empty array gets `0 / 0 = NaN` too — by coincidence, not by design — and then the caller has to remember
that a TS `NaN` is not `null`, does not survive `JSON.stringify` (`JSON.stringify(NaN) === "null"` but
`typeof NaN === "number"`, so a naively-typed `{ meanOffset: number }` field is a live lie the moment it holds
`NaN`), and does not compare equal to itself. **The port must never let `NaN` reach an interface boundary.**
Every aggregate function should return `number | null` explicitly, with `null` meaning "no data," checked with
an explicit `count === 0` guard rather than relying on IEEE-754 fallthrough:

```ts
function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}
```

In practice this rarely fires inside a single Race's own computation, because `MIN_POINTS_PER_BIN = 3` already
excludes thin bins before a mean is taken, and the `len(df) < 5` skip guard (`compass_calibration.py:263`)
means a Race's own `mean_offset`/`std_dev`/`max_error` are never computed over zero rows. It matters at the
**aggregate** level (§2), where "zero qualifying Races in this era" is a real, expected state and must render as
an explicit "no data" rather than a `NaN` or a `0` that a chart would draw as a real reading of "no deviation."
This is exactly AGENTS.md's "a missing value is stored as missing, never as a plausible number" applied one
level up.

### 1.3 `awa_offset.py`

**Constants**

| Constant | Value | TS treatment |
|---|---|---|
| `SOG_MIN` | `3.5` kt | Same shared constant as §1.2 — both scripts use the identical value. |
| `UPWIND_MAX_AWA` | `50`° | Named export. |
| `DOWNWIND_MIN_AWA` | `110`° | Named export. Boundary note: `abs(awa) == 50` and `== 110` both classify as `reaching` (strict `<`/`>`), and `reaching` segments are discarded entirely — preserve the strict inequalities exactly. |
| `MIN_CONSECUTIVE` | `3` rows | Named export. See caveat below — it is a row count, not a duration, and cadence varies across the archive. |
| `MAX_GAP_SECONDS` | `300` s | Named export. |

**`awa_to_signed` — a straightforward vectorised conditional, no modulo trap.** `[DOCUMENTED]`

```python
def awa_to_signed(awa):
    return np.where(awa > 180, awa - 360, awa)
```

Unlike `normalize_angle`, this is a plain conditional subtraction, not a modulo, so it has no JS-`%`-style
pitfall. Per `docs/research/qtvlm-csv-columns.md` §Q6, `AWA (calc)` is measured as unsigned 0–360° with "zero
negative values" in the archive, so the port's TS version does not need to defend against a negative input in
practice — but should anyway, cheaply, since nothing in the qtVlm documentation *guarantees* the range (the
absence of negative values is `[INFERRED FROM DATA]`, not `[DOCUMENTED]`):

```ts
function awaToSigned(awaUnsigned: number): number {
  const normalized = ((awaUnsigned % 360) + 360) % 360   // defensive; qtVlm's own range is 0–360 in practice
  return normalized > 180 ? normalized - 360 : normalized
}
```

`np.where` applied to a whole column becomes a plain `.map()` over rows in TS — there is no vectorisation
concern to translate, just a per-row conditional.

**The run-detection idiom (`group_key != group_key.shift()` + `cumsum()`) has a direct TS idiom already in
this codebase — reuse it rather than inventing a new one.** `[DECISION]`

```python
group_key = df["tack"] + "|" + df["point_of_sail"]
breaks = group_key != group_key.shift()
group_ids = breaks.cumsum()
for gid, group in df.groupby(group_ids):
    ...
```

This has no one-line pandas-free equivalent, but Layline already has the right *shape* of loop:
`assessRowQuality`'s Dropout-run detector (`services/recordings/row-quality.ts:159-176`) is structurally the
same problem — walk rows in order, track where a run starts, and close it out when the run-defining predicate
changes. The port should follow that existing style (a single forward pass tracking `runStart` and the current
group key) rather than reach for a groupby-shaped abstraction that doesn't otherwise exist in this codebase:

```ts
// Sketch — illustrates the idiom, not a real implementation.
interface Segment {
  startIndex: number
  endIndex: number
  tack: 'starboard' | 'port'
  pointOfSail: 'upwind' | 'downwind'
  avgAwaDeg: number
  pointCount: number
}

function findSegments(rows: readonly ClassifiedRow[]): Segment[] {
  const segments: Segment[] = []
  let runStart = 0
  for (let i = 1; i <= rows.length; i += 1) {
    const brokeRun = i === rows.length || sameGroup(rows[i], rows[runStart]) === false
    if (!brokeRun) continue
    const run = rows.slice(runStart, i)
    if (run.length >= MIN_CONSECUTIVE && run[0].pointOfSail !== 'reaching') {
      segments.push(summarize(run, runStart, i - 1))
    }
    runStart = i
  }
  return segments
}
```

**`MIN_CONSECUTIVE` is a row count, not a duration — a known, inherited limitation, not fixed by this port.**
`[DOCUMENTED]` + `[UNRESOLVED]` Per `docs/research/qtvlm-csv-columns.md`'s format-stability findings, sampling
cadence varies across the archive: "ten of eleven files have a median interval of 30 s" but one file
(`06-20-26-chi-wauk`) runs at a ~74 s median cadence. `MIN_CONSECUTIVE = 3` therefore means anywhere from ~90
seconds to ~225 seconds of sustained heading, depending which Race it's applied to — the Python script never
accounted for this, and this spec does not resolve it either. **Recommendation for a later ticket, not this
one:** consider a duration-based minimum (using Row Quality's `gap_seconds`) instead of a row count, once the
port exists to compare against. Flagging it here so it is not silently inherited as "the constant" rather than
"a constant with a known blind spot."

**`MAX_GAP_SECONDS` as a raw wall-clock difference is fine, and does not need Layline's `gap_seconds`
field.** `[DECISION]` `gap_seconds` (`services/recordings/row-quality.ts:200`) measures elapsed time since the
previous **non-frozen** row specifically to make a Dropout's true duration visible across a gap that looks like
a normal sample. Here, frozen rows have already been excluded from the row population *before* segments are
even found (§1.1), so no segment's start or end time is ever a frozen row's timestamp, and a genuine multi-
minute Dropout between two segments simply produces a large, correctly-computed wall-clock gap between them —
which correctly fails the `<= 300s` test and correctly prevents a pairing across a dead-feed span. No special
handling is needed; a plain `segB.startSeconds - segA.endSeconds` is correct once frozen rows are pre-excluded.

**Greedy pairing (`find_tack_pairs`) — preserve the ordering assumption and the early `break`.**
`[DOCUMENTED]`

```python
for j in range(i + 1, len(segments)):
    ...
    if gap > MAX_GAP_SECONDS:
        break
```

The `break` (not `continue`) on exceeding the gap assumes `segments` is already sorted ascending by
`start_time` — true by construction, since segments are found by a single forward pass over rows already in
file order. The port must preserve both the ordering guarantee (don't re-sort segments by anything else before
pairing) and the early-exit, or it silently becomes O(n²) with no early termination and, worse, could pair a
segment with a much later one across an intervening gap that should have disqualified it. `gap < 0` (`seg_b`
starting before `seg_a` ends) should never occur given non-overlapping runs in time order; keep the
`if (gap < 0) continue` defensively but treat its occurrence as a sign of an ordering bug upstream, not a
normal case to design around.

---

## 2. Season-wide aggregate vs. per-recording, in Layline's terms

### 2.1 The unit is the Race, never the Recording or the file

Both scripts today iterate CSV *files*. Layline's iteration unit must be the **Race** (`CONTEXT.md`: "the unit
sailors talk about and the unit performance is reported for"), for two structural reasons: ADR 0010 rules that
"a multi-race recording is uploaded once per race and annotated differently each time," so a Recording:Race
correspondence is exactly 1:1 by construction, but the *Race's own window* — not the whole Recording — is what
bounds which rows belong to which race; and `readRace.ts`'s existing pattern already assesses Row Quality over
the **whole** Transcription and applies `withinRaceWindow` afterward (ADR 0009's rule, reused rather than
reinvented — see `services/races/readRace.ts`'s sequence: `readRecordingRows` → `assessRowQuality` (whole) →
`withinRaceWindow`). The port's per-Race computation must follow the identical sequence, not assess quality
only over the already-windowed rows, for the same reason ADR 0009 gives: a Dropout beginning before the race
start would otherwise go undetected on the first in-window row.

### 2.2 What is computed once per Race, and what is aggregate-only

**Per-Race point** (exists standalone, is itself a useful answer, and is the natural input to every
aggregate):

```ts
// Sketch only.
interface RaceCompassDeviation {
  race_id: string
  window_start: string          // for chronological ordering and era assignment
  mean_offset_deg: number
  std_dev_deg: number
  max_abs_error_deg: number
  valid_point_count: number
  heading_coverage_pct: number
  bins: { bin_center_deg: number; mean_error_deg: number; point_count: number }[]
}

type RaceCompassDeviationResult =
  | { ok: true; deviation: RaceCompassDeviation }
  | { ok: false; reason: 'too-few-points'; point_count: number }
```

```ts
interface RaceAwaAsymmetry {
  race_id: string
  window_start: string
  upwind_offset_deg: number | null
  downwind_offset_deg: number | null
  overall_offset_deg: number
  std_dev_deg: number
  pair_count: number
  upwind_pair_count: number
  downwind_pair_count: number
}

type RaceAwaAsymmetryResult =
  | { ok: true; asymmetry: RaceAwaAsymmetry }
  | { ok: false; reason: 'too-few-points' | 'too-few-segments' | 'no-pairs' }
```

**Aggregate-only** (exists only as a function of many Races, never persisted, recomputed at read per ADR
0010's "every derived figure is computed from current Testimony at read time"): the binned deviation curve
averaged across Races, and any era partition of it.

### 2.3 Averaging per-Race bins, not pooling raw rows — and why

`compass_calibration.py`'s own cross-recording mode (`plot_summary_deviation_curve`,
`compass_calibration.py:221-253`) already answers this question, by precedent: it accumulates each
recording's own `bin_means` dict and takes `np.mean` per bin center **across recordings**, i.e. it averages
per-recording bins rather than re-binning every raw row from every file together. `[DOCUMENTED]`
(the script's own source)

Two designs are on the table for the port:

- **(a) Average per-Race bin means** (matches the existing script): compute each qualifying Race's own 10°-bin
  means (using `MIN_POINTS_PER_BIN` per Race, as today), then for each bin center, average across every Race
  that had a qualifying value there. Every Race counts equally.
- **(b) Pool all raw rows, bin once**: concatenate every qualifying Race's rows into one set, then bin the
  pooled set. Every *row* counts equally, so a Race contributes in proportion to its row count.

**Decision: (a).** `[DECISION]` Reasons: it is the existing script's own precedent, so the port's aggregate
does not silently redefine what "the season curve" means relative to the tool the archive's owner already
trusts; and it avoids one long recording dominating the season trend the way (b) would — the archive's own St
Joe distance race is 13.68 hours against a typical beer-can's ~90 minutes (ADR 0009), so pooling raw rows would
let one race outweigh nine others in the same season's aggregate curve, which is not the intuition "how has
the compass behaved this season" is asking for. The cost of (a) is lower statistical power in an individual
bin when several Races each had thin data there — accepted, because `MIN_POINTS_PER_BIN` already protects each
Race's own contribution from being noise, and averaging noise-protected values across Races is the right level
to average at.

### 2.4 A data-poor Race contributes nothing — not a null point

Both scripts already refuse to compute anything for a Race with too little data: `compass_calibration.py`
skips below 5 valid points (`:263`); `awa_offset.py` skips below `MIN_CONSECUTIVE * 2` points (`:209`), below 2
qualifying segments (`:216`), or with zero tack pairs (`:222`). **The port must carry this forward as "excluded
from the trend," never as a data point at a default/zero/null value that a chart could render as a real
reading.** This is AGENTS.md's "a missing value is stored as missing, never as a plausible number" applied to
an aggregate rather than a raw channel, and it echoes two precedents already in `CONTEXT.md`: an empty
**Annotation** list "is not a gap to fill... it means the sailor does not remember the race, not that some
default applied," and LAY-138's Sea State note that "unknown" gets its own explicit state rather than a
silently-applied default.

**Recommendation:** the season screen should render two lists side by side — Races with a computed point, and
Races excluded with the reason (`too-few-points` / `too-few-segments` / `no-pairs`) — so "the trend has a gap
here" and "there was no Race here" remain visibly different states, exactly as `withinRaceWindow`'s inclusive
bounds and `windowFindings`'s explicit "not recorded" pattern already keep other kinds of absence visible
rather than silent (`services/recordings/coverage.ts`).

### 2.5 The per-Race point is also the per-Race summary tile

LAY-138 already stubs a per-race "Instrument calibration check" summary tile. **Recommendation: this is
exactly `RaceCompassDeviation`/`RaceAwaAsymmetry` for that one Race, rendered standalone.** `[DECISION]` No
second computation is needed — it is the same aggregate ingredient described in §2.2, just not averaged with
anything else. Where a Race was excluded (§2.4), the tile shows the exclusion reason rather than a blank or a
zero.

### 2.6 Eras: derive them from `Calibration Event`/`Instrument Calibration`, not a YAML file

`compass_calibration.py`'s `partition_into_eras` reads a hand-maintained `compass-calibrations.yaml` (one
entry per calibration event, each with a `date`) and splits the season's recordings at those dates. Layline
already holds the equivalent information as **structured data a person entered through the finished UI**, not
a file someone must remember to update:

- **`CalibrationEvent`** of `type: 'autocompensation'` — per its own type comment in `types/index.ts`
  ("exactly `['HDG']` when type is `'autocompensation'`"), and per `CONTEXT.md` ("its type is either
  `autocompensation` — the compass rebuilding its own deviation table, which can only be performed on `HDG`").
- **`InstrumentCalibrationVersion`** changes to the `HDG` field — a hand-typed `Programmed Offset` change for
  `HDG` also resets the baseline a residual is measured against, even without a full autocompensation.

Both are already merged, by date, into one timeline by the existing **Calibration Log** projection —
`buildCalibrationLog(versions, events)` in `/home/ubuntu/git/layline/lib/boat/calibrationLog.ts`.
**Recommendation:** filter that same merged output to entries touching channel `HDG`, sort by date, and use
each boundary as an era split — this is a filter over data the boat setup screen already collects, not a new
input, and it removes the "somebody must remember to update the YAML" failure mode entirely. `[DECISION]`, in
scope for a first cut: it is a read-only filter over an existing projection, no schema change, no new UI
beyond a vertical reference line on the trend chart.

**A cross-channel wrinkle worth stating rather than resolving here.** `[DECISION]` Because §3 below establishes
that the AWA-tack-asymmetry number is entangled with `CTW`/compass deviation, an `HDG` autocompensation event
plausibly shifts the *AWA* trend too, even though it is not nominally an `AWA` calibration event.
**Recommendation:** the AWA-asymmetry season chart should mark `HDG`-channel calibration events as reference
lines alongside any `AWA`-channel ones, precisely because the two are not independent — this is cheap (same
merged Calibration Log, filtered to the union of two channels instead of one) and directly answers "did this
asymmetry move because someone recalibrated the wind vane, or because the compass did?" by letting a viewer
see both kinds of event on one chart.

This automatic era-marking is additive to, not a replacement for, LAY-138 decision 9's manual season/date-range
filter — a sailor can still pick an arbitrary window; the era markers are a suggested reading of the same
timeline.

---

## 3. The Measured Offset framing question

### 3.1 `compass_calibration.py` → `HDG` Measured Offset, with one caveat

`CONTEXT.md`'s **Measured Offset**: "the instrument error still present in a Race's own data, derived by
Layline — a compass deviation, a wind-angle offset... this is what remains *after* the Programmed Offset."
`compass_error = normalize_angle(CTW - COG)` is squarely this shape: `COG` is Position-Derived (GPS course
made good), `CTW` is what the boat's own compass chain produced after whatever `HDG` Programmed Offset is
currently in force, and the difference between them, averaged over a Race, is exactly "what the data says is
still wrong" — the dialogue in `CONTEXT.md` about the boat's `+2°` programmed AWA offset ("what you measure
afterwards is whatever is *still* wrong — the leftover") describes precisely this relationship for `HDG` too.

**The caveat: `CTW` is not `HDG`.** `[DOCUMENTED]` qtVlm manual p. 212–213: "CTW is calculated from HDG and
LWY [leeway]." There is no `HDG` column in the VDR export at all (`docs/research/qtvlm-csv-columns.md` §Q4),
so the raw fluxgate reading is never directly recoverable from a Recording — `CTW` is the closest available
proxy, and it equals `HDG` only to the extent leeway is zero. On this specific boat leeway is estimated from
heel via a K-factor (qtVlm manual p. 183: "Leeway is calculated with Heel, STW and a K-Factor"), and this boat
has no heel sensor, so leeway ≈ 0 and `CTW ≈ HDG` — but this is a fact about *this boat's instrument suite*,
not a property of the channel. **Recommendation:** the port's doc comments and any UI label should say
"Measured Offset for `HDG`, via `CTW`" rather than a bare `HDG` Measured Offset, and should flag — rather than
silently assume — that this equivalence would stop holding the day a heel sensor is added.

**A second, subtler point worth recording rather than resolving:** the fluxgate compass's own hardware
correction is not one scalar. Per the nke fluxgate manual, there are **two separate, stacked corrections**:
a single **Offset** scalar set by comparing the display against a known heading (p. 6, §2.1 — "deduce the
difference between the steering compass and the magnetic heading displayed: this value is the correction
offset"), and a full **autocompensation** deviation table sampled every 10° across all 360° (p. 6, §2.2.1 —
"your Fluxgate Compass will be accurately corrected between 0 and 359°"). Layline's `InstrumentCalibration`
schema (`ChannelCalibration { offset: number }` per channel, `types/index.ts:742`) captures only the first —
a single scalar per channel, matching `CONTEXT.md`'s "`AWA` and `HDG` carry an offset alone." The
per-heading-bin curve this port computes is diagnostic of the *second*, and of whatever has drifted since:
it is not comparable to, or a substitute for, the single `HDG.offset` figure stored in an Instrument
Calibration Version. Both the scalar `mean_offset_deg` and the full `bins` array are properly called `HDG`
Measured Offset — `CONTEXT.md`'s definition does not restrict the term to a single number — but the port
should not conflate the two representations, or suggest that the binned curve's shape is "what to type into"
the scalar `HDG` offset field. That would repeat the exact mistake `CONTEXT.md`'s own dialogue warns against
for a different channel ("store nothing corrected... it couldn't tell compass error from current").

### 3.2 `awa_offset.py` → not an `AWA` Measured Offset; propose **Apparent Wind Asymmetry**

**The method itself is exactly right — for the input it assumes.** `[DOCUMENTED]` The nke Aluwind HR masthead
unit's own factory calibration procedure for the wind vane (p. 6–7, §2.1) is, almost word for word, the
algorithm `awa_offset.py` implements:

> "Sail and follow several close-hauled tacks: note the values of apparent wind angle displayed. Calculate the
> average of the values displayed on starboard tack and those displayed on port tack. Calculate the offset
> correction: (average starboard angle − average port angle) / 2. Adjust the factory offset with the value of
> offset calculated."

`awa_offset.py`'s `offset = (stbd_avg_awa + port_avg_awa) / 2` (`:114`) is the same arithmetic expressed in the
signed convention (port's *signed* average is negative, so adding it is equivalent to subtracting its
magnitude). This is a direct, near-verbatim automation of the vendor's own documented at-sea AWA calibration
procedure — strong evidence the *shape* of the computation is correct for measuring a wind-vane misalignment,
provided it is fed the masthead's actual apparent wind angle, exactly as the manual's own procedure assumes.

**It is not fed that.** `[DOCUMENTED]` Per `docs/research/qtvlm-csv-columns.md` §Q5, `AWA (calc)` — the only
apparent-wind column the qtVlm VDR export carries at all — is not read from the masthead. It is computed by
qtVlm at export time as `atan2` of a vector built from `TWS`, plain `TWA`, and `STW`, reproducing the logged
value to 99.6% agreement within 1°. And `TWA` is itself downstream of `CTW` (via `TWD − CTW`, or via the
`TWA (calc)` round-trip, depending which is used) and of qtVlm's leeway/true-wind model. The doc's verdict is
unambiguous: *"`AWA (calc)`/`AWS (calc)` contain no independent information... The masthead unit's real
AWA/AWS — the only truly raw wind observation on the boat — is lost by this export format."*
`CONTEXT.md`'s own dialogue on the wind-angle column makes the same point independently: *"that column is
qtVlm working backwards from true wind and boat speed. The masthead reading is the one thing you'd actually
want and the export throws it away."*

**Consequence for what the port's output means.** A starboard/port asymmetry measured on `AWA (calc)` is a
mixture of at least three things the CSV format cannot separate: (a) genuine masthead wind-vane misalignment —
what the Aluwind's own procedure is designed to find; (b) `HDG`/compass deviation leaking in through
`TWA = wrap(TWD − CTW)`; and (c) any systematic error in qtVlm's leeway/true-wind model, which is not a
Calibration Channel at all and is not something an Instrument Calibration Version can correct. `CONTEXT.md`'s
own dialogue about the June compass deviation is the cautionary tale for exactly this failure mode: *"That's
the exact mistake qtVlm made — it couldn't tell compass error from current, so it called the difference
current... Show me the 4° as a Measured Offset and leave the recording alone."* Calling the tack-asymmetry
number an `AWA` Measured Offset would invite the identical mistake in the other direction: a sailor reading it
and typing a correction into the display's `AWA` Programmed Offset would be "fixing" AWA for a problem that
may be entirely, or partly, `HDG`'s.

**Proposed term**, following `CONTEXT.md`'s own glossary convention (definition + an `Avoid:` list):

> **Apparent Wind Asymmetry**
> The systematic difference between average signed apparent wind angle on starboard and port tack, at a
> matched point of sail, derived by Layline from `AWA (calc)`. A candidate cause is the `AWA` Calibration
> Channel's Programmed Offset residual, but because `AWA (calc)` is itself computed by qtVlm from `TWS`,
> `TWA` and `STW` rather than read from the masthead, and `TWA` depends on `CTW`, the Asymmetry may equally
> reflect `HDG` deviation or an error in qtVlm's leeway/true-wind model — the three are not separable from
> this column alone.
> _Avoid_: Measured Offset (that term names a residual isolated to one Calibration Channel, which this number
> cannot claim to be), AWA offset (bare — invites typing it straight into the display's Programmed Offset),
> wind vane calibration (that is the Aluwind's own dock/at-sea procedure, performed against the masthead's
> true raw reading — which this is not).

This keeps **Measured Offset**'s existing promise intact (a channel-isolated residual) and gives the
tack-asymmetry number an honest, narrower name whose own definition carries its caveat — the same pattern
`CONTEXT.md` already uses for **Water-Referenced** and **Row Quality**'s `Avoid:` lists.

**This does not make the number useless — it is still exactly the diagnostic LAY-138 asks for** ("AWA
symmetry" per decision 5), and it remains a legitimate thing for a human to look at before deciding whether,
and which, Calibration Channel to adjust. The recommendation is only about what it is safe to *call* it and
what conclusions it is safe to *draw* from it alone. Concretely: since `qtvlm-csv-columns.md` independently
measured a ~10–12° step in `CTW − COG` across the boat's 2026-07-04 autocompensation, a season-wide Apparent
Wind Asymmetry chart showing a comparable step at the same date is a visible, testable sign that the
asymmetry is compass-driven rather than masthead-driven — which is exactly why §2.6 recommends marking `HDG`
calibration events on this chart too, so a viewer can check that correlation without leaving the screen.

---

## Appendix: constants at a glance

```ts
// Sketch only — not a real module.

// services/analysis/constants.ts
/** Shared by compass deviation and AWA asymmetry. Stricter than, and composes with,
 *  Row Quality's LOW_SPEED_SOG_KNOTS (services/recordings/row-quality.ts) — see §1.2. */
export const SOG_MIN_KNOTS = 3.5

// services/analysis/compass-deviation.ts
export const BIN_SIZE_DEG = 10          // matches the fluxgate's own 10° autocompensation sampling
export const MIN_POINTS_PER_BIN = 3
export const MIN_VALID_POINTS = 5       // named on the way in; was a bare literal in the Python

// services/analysis/awa-asymmetry.ts
export const UPWIND_MAX_AWA_DEG = 50    // strict <
export const DOWNWIND_MIN_AWA_DEG = 110 // strict >
export const MIN_CONSECUTIVE = 3        // row count, not duration — see §1.3 caveat
export const MAX_GAP_SECONDS = 300
```
