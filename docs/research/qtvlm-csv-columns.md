# qtVlm VDR CSV export — column semantics reference

**Purpose:** definitive reference for the semantics of each column in the regatta recording CSVs, so a
TypeScript parser can be written against it and a Postgres schema designed from it.

**Ground truth:** the 11 exported CSVs in
`/Users/apieprzycki/Documents/git/Handsome-Pete/raw-regatta-recordings/` — **4,319 data rows** across
2026-06-03 to 2026-08-26, plus `metadata.yaml` in the same directory.
(The brief said 4,330; that is the line count *including* the 11 header lines. 4,330 − 11 = 4,319 data rows.)

**Primary documentation:** the local qtVlm manual
`/Users/apieprzycki/Documents/git/Handsome-Pete/instrument-documentation/qtVlm_documentation_en_5.12.27`
(PDF, 300 pages — cited below by its printed page numbers), and the official qtVlm change log at
<https://www.meltemus.com/index.php/en/change-log>.

**Boat instrumentation:** paddlewheel speedo, Aluwind HR masthead wind unit, TL-25, fluxgate compass.
No B&G/NKE integrated processor, no heel sensor, no barometer. Docs in
`/Users/apieprzycki/Documents/git/Handsome-Pete/instrument-documentation/`.

**Related document:** `docs/research/orc-polar-file-formats.md` covers the `.pol` / `.sailselect` /
`.saildesc` file formats and reverse-engineers qtVlm's polar interpolation from the polar side. It was
produced by a separate investigation and **independently reaches the same conclusions** on the two overlapping
questions (qtVlm provenance; `POL` is boat speed, not VMG). Cross-references are noted inline in Q0 and Q2.

**Confidence markers used throughout:** `[DOCUMENTED]` (with source), `[INFERRED FROM DATA]` (with the
evidence), `[UNRESOLVED]` (with what was tried).

---

## Summary: what is settled vs. unsettled

### Settled

| Column | Meaning | Confidence |
|---|---|---|
| `Date` | `MM/DD/YYYY HH:MM:SS`, local wall clock, no timezone marker — **but format and zone are both user settings** | `[INFERRED FROM DATA]` + `[DOCUMENTED]` |
| `Longitude` / `Latitude` | WGS84 decimal degrees, 10 dp | `[INFERRED FROM DATA]` |
| `COG` / `SOG` | Course/Speed Over Ground — GPS-derived | `[DOCUMENTED]` |
| `TWD` / `TWS` | **Sea wind** — wind relative to the *water*. NOT current-corrected | `[DOCUMENTED]` |
| `TWA` | True Wind Angle, **signed −180..180, positive = starboard** | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| `GWD` / `GWS` | **Ground wind** — sea wind minus current, normalised to 10 m. IS current-corrected | `[DOCUMENTED]` |
| `CTW` | Course Through Water = compass heading + leeway. Here ≈ raw fluxgate heading | `[DOCUMENTED]` |
| `STW` | Speed Through Water — paddlewheel | `[DOCUMENTED]` |
| `POL` | Theoretical polar **boat speed** at the current (TWA, TWS). **Not VMG** | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| `PRE` | **Atmospheric pressure.** Not a routing artifact. 100% empty here | `[DOCUMENTED]` |
| `XTE` | Cross Track Error, metres. Needs an active WP/XTE reference. 100% empty here | `[DOCUMENTED]` |
| `TWA (calc)` / `AWA (calc)` / `AWS (calc)` | Computed by qtVlm **at export time**, not read from an instrument | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| `AWA (calc)` range | **Unsigned 0..360** (unlike `TWA`) | `[INFERRED FROM DATA]` |
| `ALARM` | Active alarms; `"None"` when none here, **but the sentinel is UI-localised** (`Aucune` in French) | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| `OBSERVATIONS` | User-typed comment attached to a VDR row. 100% empty here | `[DOCUMENTED]` |
| `RPM` | Engine revolutions per minute. Present in only 4 of 11 files; always `0.0` | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| Column set | **User-configurable — the parser must NOT assume this header** | `[DOCUMENTED]` + `[INFERRED FROM DATA]` |
| Delimiter / decimal separator | `;` appears stable; **the decimal separator does NOT** (comma in a French export) | `[DOCUMENTED]` |

### Unsettled

1. **Why `GWD`/`GWS` are intermittently blank** (23.6% of rows, in many short scattered runs). Not explained
   by `STW` being blank. `[UNRESOLVED]` — see Q3.
2. **Why `POL` splits into two regimes** across the season (files 1–4 match the repo polar to ±0.7%;
   files 5–11 sit at ~0.90–0.95 of it). Almost certainly a different polar file loaded in qtVlm, or a wave-polar
   penalty, but not provable from the CSV. `[UNRESOLVED]` — see Q2. This is the most consequential open item.
3. **Whether qtVlm quotes/escapes a delimiter or newline typed into `OBSERVATIONS`.** Never exercised in
   these 11 files. `[UNRESOLVED]` — see Q7/Q8.
4. **The exact changelog version/date** for the "Calculate TWA, AWA and AWS when exporting in CSV format"
   entry. The entry text is stable across reads; the version attribution was not. See Q5.
5. **The exporter's full column order when `DPH` and `HEEL` are present**, and the exact header of qtVlm's
   *other* (track) CSV export, which also contains a `POL` column. Neither sample obtained. `[UNRESOLVED]` —
   see Q8. Low risk, since the mitigation (parse by name, tolerate unknown columns) covers both.
6. **The `XTE` sign convention** — the manual says only "the distance", implying unsigned, but our column is
   100% empty so it cannot be checked. `[UNRESOLVED]`. Moot unless an XTE reference is ever set.
7. **Whether `POL` applies qtVlm's wave/gust/night efficiency coefficients**, and whether it keys off the
   recorded `TWA` or `TWA (calc)`. The manual consistently calls it "theoretical", and our reconstruction fits
   to ±0.05 kt without any coefficient, so any such penalty was inactive here. `[UNRESOLVED]` in general.

### Second-pass revisions to this document

A follow-up research pass settled two items that were `[UNRESOLVED]` in the first version, and **overturned one
claim** — recorded here rather than quietly edited, because the overturned one is a schema decision:

- **Settled (Q8):** UTC export *does* exist, and the date **format and time zone are both global user
  settings** (manual p. 43). `MM/DD/YYYY` + local is this installation's configuration, not the format's.
- **Overturned (Q8):** the first version claimed decimal points were part of qtVlm's fixed house convention.
  **Wrong** — a real qtVlm VDR export published on the vendor's forum uses **comma decimals** with the same
  semicolon delimiter. Delimiter and decimal separator vary independently. Sniff both.
- **Corrected (Q7):** `ALARM`'s no-alarm value is **UI-localised** (`Aucune` in a French export), and real
  alarm names *do* appear in that field in practice. Do not match the literal string `"None"`.
- **Added (Q4):** per the qtVlm author on the official forum, when `HDG`/`CTW`/`STW` are missing qtVlm computes
  `TWD`/`TWS`/`TWA` from `COG`/`SOG` instead — so the 272 blank-`STW` rows contain *ground*-referenced wind
  with no flag. This is a new reason to exclude them.
- **Added (Q6):** manual p. 226 documents that `TWA` is red for port and green for starboard, and Expedition's
  manual states the industry convention explicitly ("Twa & awa — Positive on starboard, negative on port"),
  both consistent with the empirical finding.

### Correction to an existing repo document

`/Users/apieprzycki/Documents/git/Handsome-Pete/CONTEXT.md` defines a "Recording" as *"A raw **Expedition**
CSV file"*. **This is wrong** — the files are qtVlm VDR exports (Q0). Worth fixing there, since it is the
source of the mistaken framing.

---

## Q0. Does the export actually come from qtVlm, and is the format shared with Expedition?

**It is qtVlm. Specifically, a qtVlm Voyage Data Recorder (VDR) CSV export.** `[DOCUMENTED]`

The qtVlm manual, "Voyage Data Recorder (VDR)", p. 77, says verbatim:

> This recorder will store boat data at regular intervals.
>
> Data recorded is Position, COG, SOG, TWS, TWD, TWA, CTW, STW, PRE, XTE, RPM, GWD, GWS and
> Active Alarms. In addition, qtVlm will insert a POL column which contains the calculated current polar
> speed of your boat, for the couple TWS/TWA.

That is our column set exactly — including the three channels that were the brief's mysteries (`PRE`, `XTE`,
`POL`), the `RPM` channel that appears in only some of our files, and `Active Alarms` = our `ALARM`.

Three further qtVlm-specific tells:

1. **`OBSERVATIONS`** matches the manual's "Adding Observation and/or images to a VDR line" (p. 79):
   *"You can double click on a line to insert a comment or an image."* `[DOCUMENTED]`
2. **`POL` as a literal column name** is documented in the official change log
   (<https://www.meltemus.com/index.php/en/change-log>) under the VDR/Boat module:
   *"Add POL (theoretical polar speed) column."* `[DOCUMENTED]`
3. **The semicolon delimiter with decimal *points*** is qtVlm's documented house convention, not a locale
   artifact — see Q8. `[DOCUMENTED]`

The sibling document `docs/research/orc-polar-file-formats.md` reached the same provenance conclusion from a
different direction (its finding 1: *"The software is qtVlm, and it is confirmed from the data, not just
asserted. The recordings are qtVlm VDR (Voyage Data Recorder) CSV exports."*), including the observation that
the header order matches the manual's documented channel order.

**Is the format shared with Expedition? No — it is distinct.** Expedition's channel vocabulary is mixed-case
and differently named (`Bsp`, `Hdg`, `Pol Bsp`, `Trg TWA`, `Twa`), and Expedition has no `PRE`/`POL`/
`OBSERVATIONS` channel under those names. I did not find any Expedition documentation using this header.
Treat the format as **qtVlm-specific**. `[INFERRED FROM DATA]` (from the exact-match of the qtVlm manual's
channel list against our header, and the absence of any Expedition source using it) — I am not claiming a
documented negative about Expedition's channel list.

Version context, from the change log: VDR was added in **5.11-1**; `POL` and GWS/GWD in the 5.10 series;
`RPM` in **5.8-6**. The local manual is for **5.12.27**; latest listed release is **5.12-24**. `[DOCUMENTED]`

---

## Q1. `PRE` — the headline mystery

### `PRE` is **atmospheric (barometric) pressure**. `[DOCUMENTED]`

qtVlm manual, "PRE: Atmospheric Pressure", **p. 215**:

> This instrument displays pressure as received from NMEA data or internal sensor. This instrument has no
> dial, but historical data can be displayed through its histogram (up to 10 days).
>
> The trend for the last hours (configurable is Instruments settings) is displayed.

Corroborating, from the same manual:
- p. 82: *"Alarm on Atmospheric Pressure is available only if the relative instrument and histogram are
  configured in Instrument's settings."*
- p. 183: *"You also indicate some sensor offset for Pressure, Internal Compass and Depth."*
- Change log, Instruments module, 5.12-19: *"Improve NMEA MDA message management (pressure and air
  temperature)."* → `PRE` is fed by the NMEA `MDA` sentence (or an internal device sensor).
- Change log, Gribs module, 5.12-23: *"In pressure histogram, add an option to compare boat measures to
  grib pressure data."*

**So: it is barometric pressure, which the brief says matters to the project. It is NOT a routing artifact,
NOT "predicted", NOT a percentage.**

Two additions that close this out completely:

- **"Predicted" is positively refuted, not merely unsupported.** The string `predict` occurs once in the entire
  300-page manual, in an unrelated context (a COG predictor line on the chart). qtVlm has no "predicted"
  channel of any kind. `[DOCUMENTED]`
- **A second NMEA source exists:** change log, *"Add MMB message for pressure"* — so `PRE` accepts `MMB`
  (barometric pressure) as well as `MDA`. Neither is emitted by any of this boat's four instruments.
  `[DOCUMENTED]` (official change log; version attribution unreliable, see the note in Q0)
- **Units are almost certainly hPa/millibar** `[INFERRED FROM DATA — weakly]`. The manual does not state the
  export unit for `PRE`. Both `MDA` and `MMB` carry bars/inches-of-mercury natively, and qtVlm's own isobar
  rendering is labelled in hPa. Since our files are 100% empty this is untestable here — a schema should store
  it as a plain numeric and record the unit assumption in a comment rather than silently converting.
- **Not Expedition vocabulary.** Expedition's equivalent channel is *"Barometer"*, logged as `Baro`. `PRE` is
  a qtVlm-specific abbreviation, which is one more nail in the "this is not an Expedition export" coffin (Q0).
  `[DOCUMENTED]` (Expedition manual)

### How often is it actually populated? **Never.** `[INFERRED FROM DATA]`

```
PRE  present_in_rows=4319  non-empty=0 (0.00%)  empty=4319
```

Across all 11 files, every one of the 4,319 rows has an empty `PRE` field. There are no other distinct
values — the only value observed is the empty string.

Command run (Python/pandas over all 11 files, reading every column as a string with
`keep_default_na=False` so that empties are not confused with sentinels):

```python
raw['PRE'].map(repr).value_counts()   # -> {"''": 4319}
```

**Why:** this boat's instrument suite — paddlewheel, Aluwind HR masthead unit, TL-25, fluxgate compass —
contains no barometer, and the recording device evidently exposed no internal pressure sensor either. qtVlm
had nothing to write. `[INFERRED FROM DATA]` (the documented source is NMEA `MDA`/internal sensor; none of
the four documented instruments emits `MDA`.)

**Verdict for the project:** it is the meaningful thing (pressure), so **keep the column in the schema as
nullable**, because it costs nothing and becomes valuable the day a barometer is added. But **no current
feature can depend on it** — there is zero data, so it cannot be backfilled or used for trend analysis today.

---

## Q2. `POL` — polar target *boat speed*, not target VMG

### It is target **boat speed** at the boat's *current* TWA. `[DOCUMENTED]`

qtVlm manual, p. 77 (quoted in full in Q0):

> qtVlm will insert a POL column which contains the calculated current polar
> speed of your boat, **for the couple TWS/TWA**.

Official change log, VDR module: *"Add POL (theoretical polar speed) column."*

"For the couple TWS/TWA" is decisive: the lookup is keyed on the *actual current* TWA. A VMG target would be
keyed on TWS alone (you look up the *optimum* TWA, not the one you happen to be sailing).

### Confirmed empirically, and the VMG hypothesis is refuted. `[INFERRED FROM DATA]`

**Test 1 — does `POL` vary with TWA at constant TWS?** A VMG target cannot; a boat-speed target must.
Holding TWS in the 9.5–10.5 kt band and bucketing by `|TWA|`:

| `\|TWA\|` bucket | n | mean `POL` | min | max |
|---|---|---|---|---|
| 0–40 | 35 | 2.19 | 0.1 | 6.2 |
| 40–60 | 37 | 6.66 | 6.2 | 7.0 |
| 60–80 | 47 | 6.84 | 6.3 | 7.1 |
| 80–100 | 22 | 6.91 | 6.4 | 7.3 |
| 100–120 | 13 | 7.19 | 6.9 | 7.4 |
| 120–140 | 87 | 6.80 | 6.4 | 7.3 |
| 140–160 | 48 | 6.25 | 5.2 | 6.9 |
| 160–180 | 8 | 4.28 | 3.8 | 4.9 |

`POL` traces the polar curve's shape across TWA at fixed TWS. **It is boat speed, not VMG.**

**Test 2 — reconstruct `POL` from the boat's polar file.** Using
`/Users/apieprzycki/Documents/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol`
(TWA grid 30…180 in 16 steps, TWS grid 4,6,8,10,12,14,16,20,24), bilinear interpolation on
`(|TWA|, TWS)`, with the grid augmented by a zero row at TWA=0 and a zero column at TWS=0 so that values
below the grid extrapolate linearly toward the origin:

| hypothesis (all 4,281 rows) | median abs err (kt) | corr |
|---|---|---|
| **bilinear on `(\|TWA\|, TWS)`, extrapolating to origin** | **0.049** | **0.994** |
| bilinear on `(\|TWA\|, TWS)`, clamped at grid edge | 0.379 | 0.974 |
| nearest grid point (snap) | 0.410 | 0.963 |
| bilinear on `(\|TWA (calc)\|, TWS)` | 0.389 | 0.966 |
| **max-VMG target speed (VMG hypothesis)** | **0.630** | **0.692** |

The VMG hypothesis is by far the worst fit (corr 0.69 vs 0.99). **`POL` is boat speed at the current TWA.**

Restricted to the **1,640 rows in the four recordings that actually used this polar file** (see the caveat
below), the winning model is not merely a good fit but an *exact* one:

```
n = 1640   median abs err = 0.023 kt   within 0.05 kt = 100.0%   corr = 0.999925   max abs err = 0.050 kt
```

A maximum error of exactly 0.05 kt on values printed to one decimal place is pure rounding. **The
reconstruction is exact.** This independently reproduces the result in the sibling document
`docs/research/orc-polar-file-formats.md` (Q11), which reverse-engineered the same algorithm from the polar
side and reports the same n=1,640 and the same residual — reached by a separate investigation. Defer to that
document for the precise algorithm, the padded-axis edge cases, and the finding that the polar's 30°/35° rows
are synthetic linear filler (which makes `STW/POL` dishonest below roughly a 43° TWA regardless of anything
in this document).

Worked examples (actual vs. the winning model):

```
TWA=  -45.0 TWS= 2.5  POL=2.2   model=2.19    (polar[45][4]=3.50 x 2.5/4)
TWA=  -94.0 TWS= 1.3  POL=1.4   model=1.41
TWA= -109.0 TWS= 1.9  POL=2.0   model=2.03
TWA= -124.0 TWS= 3.7  POL=3.7   model=3.71
```

### Does it interpolate or snap? **It interpolates (bilinear), and extrapolates below the grid.** `[INFERRED FROM DATA]`

Nearest-neighbour snapping fits far worse (9.9% of rows within 0.05 kt, vs 51.5% for interpolation). And
below the polar's lowest TWS column (4 kt) and lowest TWA row (30°), `POL` does not clamp to the edge value —
it scales linearly toward zero, as the worked examples above show. The manual states interpolation generally
for polar-derived values: *"qtVlm will interpolate any intermediate values"* (p. 39, in the wave-polar
section) and, for the scripting engine, *"it is possible to use a polar file to generate a value based
(interpolated) on couple (TWS, TWA)"* (p. ~255). `[DOCUMENTED]` for the principle,
`[INFERRED FROM DATA]` for the specific bilinear-plus-extrapolate-to-origin behaviour.

**Corroborated against qtVlm's source lineage.** The GPL-licensed qtVlm source (`Polar::myGetSpeed`,
`https://github.com/nohal/qtVlm/blob/master/src/Polar.cpp`) implements exactly two successive linear
interpolations — in TWA, then in TWS — which is bilinear interpolation, never nearest-neighbour. This is an
older public fork rather than the shipped 5.12.27 code, so it is corroboration rather than proof of current
behaviour. `[DOCUMENTED]` (third-party GPL mirror of an older version)

Three details from that source that our data could not have revealed, and that matter:

1. **It clamps at the *upper* grid edges** (`if (windSpeed > tws.last()) windSpeed = tws.last();` and likewise
   for TWA) — so above 24 kt TWS the polar stops responding to wind and `POL` flat-lines at the 24 kt column.
   Our data never reaches that region (max `TWS` in genuine rows is well under 24 kt), so this is untested here
   but is a real trap for a heavy-air session. Note this is *not* symmetric with the low end, where our data
   clearly shows scaling toward zero rather than clamping — the zero-padded axes described above and the
   upper-edge clamp coexist.
2. **It takes `abs(TWA)`** — the polar is assumed port/starboard symmetric. So `POL` can never capture
   asymmetric boat performance (rig tune bias, a bent mast, one-sided sail damage), and `STW/POL` compared
   across tacks is comparing against an identical target on both. That is an argument *for* the tack-split
   analysis this project wants, not against it: any systematic tack asymmetry in `STW/POL` is real, because the
   denominator cannot manufacture one.
3. **With a polar object present but unloaded it returns `0`**, not empty — which refines the next section.

### What is `POL` when no polar is loaded? `[INFERRED FROM DATA]` — almost certainly empty.

Not directly observable: a polar was loaded for every one of these 11 sessions. But `POL` is empty in exactly
the 36 rows where the whole wind group (`TWD`,`TWS`,`TWA`) is empty, and non-empty in all 4,283 rows where
`TWS` is present — including all 237 rows where `STW` is empty. So `POL` requires only `(TWA, TWS)` plus a
polar; with no polar there is nothing to interpolate and the field would be blank rather than 0. Treat as
nullable and do not read a missing `POL` as "zero target speed".

**Refinement from the source lineage:** `Polar::myGetSpeed` opens with `if (!loaded && !force) return 0;`, so
if a polar *object* exists but has not successfully loaded, the returned value is **`0`, not empty**. That
means a `POL` of exactly `0.0` at non-zero `TWS` is a strong signal of a broken/absent polar rather than a
genuine target speed. 🔴 **A parser should treat `POL == 0` while `TWS > 0` as null, not as zero** — otherwise
`STW/POL` divides by zero or, worse, a "0% of target" row silently poisons an average.
`[DOCUMENTED]` (third-party GPL mirror of an older version) + `[INFERRED FROM DATA]` (no such row exists in
our 11 files, so this is defensive, not observed).

### ⚠️ The load-bearing caveat for a "% of target speed" metric `[UNRESOLVED]`

**`POL` is only as good as whichever polar file was loaded in qtVlm at record time — and that is not
recorded in the CSV.** Reconstructing `POL/predicted` per file against the repo's current polar:

| file | n | median `POL`/predicted | within 2% |
|---|---|---|---|
| 06-03-26-beer-can | 216 | 1.0002 | 99.1% |
| 06-06-26-nood | 303 | 0.9996 | 100.0% |
| 06-07-26-nood | 584 | 1.0001 | 99.8% |
| 06-20-26-chi-wauk | 155 | 1.0003 | 100.0% |
| 06-26-26-chi-mi-chi | 688 | 0.9256 | 44.5% |
| 07-01-26-beer-can | 275 | 0.9245 | 41.5% |
| 07-22-26-beer-can | 271 | 0.9359 | 0.0% |
| 07-29-26-beer-can | 245 | 0.9361 | 0.0% |
| 08-04-26-100-beer-can | 241 | 0.9171 | 0.0% |
| 08-22-26-glr | 438 | 0.9346 | 0.0% |
| 08-26-26-beer-can | 185 | 0.9359 | 0.0% |

There is a clean break after 2026-06-20. The first four files reproduce the repo's
`HandsomePete_2026_ORC_final.pol` essentially exactly; the last five sit at a tight but non-constant
0.90–0.95 of it (p10 0.905, p90 0.945 — a *shape* change, not a scalar multiplier), and the two middle
files are bimodal. The most likely causes are a different polar file loaded in qtVlm from 06-26 onward, or
qtVlm applying a wave-polar coefficient (the manual, p. 39: *"103% of the polar speed will be used if
TWS=10, Wave Height is 2 meters…"*). **I could not distinguish these from the CSV alone.** It is not the
2026-07-04 compass autocompensation — that boundary falls between files 6 and 7, not 4 and 5.

**Consequence:** a "% of target speed" figure computed as `STW / POL` is **not comparable across the season**
without knowing which polar was live. It is honest *within* a session and dishonest *across* sessions.
For the record, `median(STW/POL) = 0.961` and `median(SOG/POL) = 0.980` over the whole set — plausible
numbers, which is exactly why this trap is dangerous.

**Recommendation:** store `POL` as recorded, but also store a per-recording `polar_version`/`polar_hash`
annotation, and *either* gate cross-session % comparisons on it *or* recompute the target from a single
known polar at query time rather than trusting `POL`. Prefer the latter for any user-facing metric.

The sibling document `docs/research/orc-polar-file-formats.md` reaches the same conclusion independently and
lists it among its own unsettled items: *"The polar file in the repo is not the polar that produced `POL` for
7 of the 11 recordings. The break is real and measured, but why is not determinable from the files."*
Two separate investigations, same break, same verdict.

---

## Q3. `GWD`/`GWS` vs `TWD`/`TWS` — which is current-corrected?

**The brief's framing is inverted relative to qtVlm's. `GWD`/`GWS` is the current-corrected one;
`TWD`/`TWS` is not.** `[DOCUMENTED]`

qtVlm manual, **p. 211**:

> **GWS: Ground Wind Speed**
>
> This instrument displays Ground Wind Speed, which is the vector subtraction of Sea Wind (TWS/TWD)
> and currents.

and **p. 212**:

> **GWD: Ground Wind Direction**
>
> This instrument shows Ground Wind Direction, which is the wind blowing on Earth as opposed to
> TWS/TWD which is the wind blowing on the sea.

So, precisely:

- **`TWD`/`TWS` = "sea wind"** — the wind in the *water's* frame of reference. This is the wind the boat and
  its sails actually experience. It is what you get from apparent wind + boat speed *through the water*. It is
  **not** current-corrected.
- **`GWD`/`GWS` = "ground wind"** — the wind in the *earth's* frame. `GW = TW − current` (vector). It is
  **current-corrected**, and it is what a weather model or a fixed shore/buoy station reports.

`GWD`/`GWS` also carries a **second** correction that `TWD`/`TWS` does not — normalisation to 10 m: `[DOCUMENTED]`

- p. 180: *"Wind instruments altitude is used to calculate a 10m wind value for GWS/GWD, this is needed when
  comparing wind data from instruments with wind data from grib."*
- p. 183: *"Wind instruments altitude is used to calculate a 10m Wind speed for GWS (Ground Wind Speed)."*
- p. 106: *"The last tab of the grib information dialog compares Grib's data with actual wind coming from
  instruments (GWD/GWS, i.e. corrected with Currents and instrument's altitude so show wind at 10m)."*
- p. 80: *"Recorded wind speed will eventually be adjusted to 10 meters height, using the 'Wind instruments
  altitude' parameter."*

**`GWD`/`GWS` exist for one purpose: comparing your instruments against a GRIB / forecast.** That is exactly
what qtVlm uses them for.

Note also (p. 180) that qtVlm's interpretation of an incoming NMEA `MWD` sentence is configurable —
by default `MWD` is treated as ground wind, and if the option is unchecked qtVlm treats `MWD` as sea wind and
computes ground wind itself. So which channel is primary depends on a setting.

### Which one should a sail-selection decision be indexed against? **`TWS` (sea wind).** `[INFERRED FROM DATA]`

Sail selection is about the load on the rig and sails, which is set by apparent wind, which is built from the
wind *in the water's frame* plus boat speed through the water. That is `TWS`/`TWD` by qtVlm's definition. Using
`GWS` would double-count the current. qtVlm itself agrees implicitly: its polar lookup for `POL` uses
`TWS`/`TWA`, not `GWS` (manual p. 77), and its sail-selection feature is documented as configured
"according to TWS and TWA" (change log, 5.9-8: *"Add possibility to configure sails selection according to
TWS and TWA."*) `[DOCUMENTED]` for the qtVlm-uses-TWS part; the physical argument is mine.

### On this boat specifically, `GWD`/`GWS` are contaminated — prefer `TWD`/`TWS`. `[INFERRED FROM DATA]`

qtVlm derives current from the GPS-vs-water disagreement: *"Currents Speed and Direction are calculated by
qtVlm from COG, SOG, CTW (that includes LWY), STW"* (manual p. 214). Any error in `CTW` (fluxgate compass
deviation) or `STW` (paddlewheel calibration) therefore gets **laundered into a fake "current"**, and from
there into `GWD`/`GWS`.

Measured over the 3,301 rows where both are present:

- `GWS/TWS` median **1.035** (p5 0.935, p95 1.169), and per-file medians ranging 1.000 → 1.113.
- `GWD − TWD` median **−7.2°**, per-file medians ranging **−18.9° → +1.6°**.
- The implied current magnitude from the `|GW − TW|` vector is **median 1.46 kt, p90 4.72 kt**. Lake Michigan
  does not have a 1.5 kt median current, let alone 4.7 kt.
- The independently implied current from GPS-vs-water (`SOG@COG − STW@CTW`) is median 1.03 kt; the two
  correlate only **0.556**.
- Crucially, the per-file `GWD − TWD` offset **shrinks from ~−12°…−19° to ~−2° after 2026-07-04**, the date of
  the compass autocompensation recorded in `compass-calibrations.yaml`. The "current" was mostly compass error.

**Verdict: store both, but treat `TWD`/`TWS` as the sailing-truth channel and `GWD`/`GWS` as
forecast-comparison-only, with a documented health warning. Do not feed `GWS` to sail selection.**

### Why are `GWD`/`GWS` blank 23.6% of the time? `[UNRESOLVED]`

```
GWD  non-empty=3301/4319 (76.43%)   empty=1018
GWS  non-empty=3301/4319 (76.43%)   empty=1018   (always blank together — verified)
```

Per-file rates vary wildly: 0% blank in `07-01` and `08-04`, but 65.4% blank in `07-29`. The blanks are
**intermittent** — e.g. 126 separate short runs in `06-07-26-nood` — not one leading block, so it is not a
"warming up" effect.

What I tested and ruled out:
- **Not** simply `STW` missing: `STW` is blank in only 9.6% of the `GWS`-blank rows, and `GWS` is *present*
  in 174 of the 237 rows where `STW` is blank.
- **Not** `TWS` missing: `TWS` is blank in only 3.5% of `GWS`-blank rows.
- Weakly speed-related: mean `SOG` 4.95 when blank vs 5.49 when present.

**Best remaining hypothesis** (not verified): `GWD`/`GWS` are only written when qtVlm has a *fresh* current
estimate in the same update cycle, and the current solver drops out per-sample. **What would settle it:**
inspecting qtVlm's source or the `vdr.db` SQLite file directly, or reproducing with a known NMEA replay.

---

## Q4. `CTW`/`STW` vs `COG`/`SOG`

### Confirmed: `CTW`/`STW` are instrument-derived, `COG`/`SOG` are GPS-derived. `[DOCUMENTED]`

qtVlm manual, **p. 212–213**:

> **CTW: Course Through Water** — This instrument shows Course Through Water. It is different from COG in
> case of Currents, for instance. […] Note that **CTW is calculated from HDG and LWY.**
>
> **STW: Speed Through Water** — This instrument shows Speed Through Water. It is different from SOG in case
> of Currents, for instance.
>
> **HDG: Heading** — This instrument shows heading **as measured on a Compass**. It is different from COG in
> case of Currents and/or leeway.

And p. 205: `COG`/`SOG` are Course/Speed Over Ground.

**Two important refinements to the brief's phrasing:**

1. **`CTW` is *not* raw compass heading — it is `HDG + leeway`.** There is no `HDG` column in the VDR export
   (it is not in the documented channel list), so **the raw fluxgate reading is not directly recoverable**.
   However: leeway is estimated from heel (change log, 5.12-23: *"Add an instrument LWY (Leeway). Leeway is
   estimated with HEEL/STW and a K factor"*), and this boat has **no heel sensor**. With no heel input,
   leeway ≈ 0 and **`CTW` ≈ raw fluxgate heading**. `[DOCUMENTED]` for the formula, `[INFERRED FROM DATA]`
   for the ≈.
2. `STW` is the paddlewheel; the change log notes NMEA `VBW` ("speed on water") support (5.8-6).

### `STW` empty rate: **272 of 4,319 rows = 6.30%.** `[INFERRED FROM DATA]`

Per file:

| file | rows | `STW` empty | % |
|---|---|---|---|
| 06-03-26-beer-can | 372 | 91 | 24.5% |
| 06-06-26-nood | 412 | 65 | 15.8% |
| 06-07-26-nood | 632 | 6 | 0.9% |
| 06-20-26-chi-wauk | 258 | 51 | 19.8% |
| 06-26-26-chi-mi-chi | 715 | 5 | 0.7% |
| 07-01-26-beer-can | 319 | 7 | 2.2% |
| 07-22-26-beer-can | 296 | 6 | 2.0% |
| 07-29-26-beer-can | 257 | 1 | 0.4% |
| 08-04-26-100-beer-can | 260 | 0 | 0.0% |
| 08-22-26-glr | 480 | 5 | 1.0% |
| 08-26-26-beer-can | 318 | 35 | 11.0% |

(The sample row quoted in the brief, `07/22/2026 17:45:30`, is one of the 6 blanks in that file — and its
`SOG` is 0.2 kt, i.e. the boat was stationary. It is not representative.)

### Hypothesis: **not a failing paddlewheel — a paddlewheel that stalls at low speed.** `[INFERRED FROM DATA]`

This is the good news, and it contradicts the brief's expectation.

Evidence:

1. **The blanks are concentrated at near-zero boat speed.** In the 272 rows where `STW` is blank, `SOG` has
   **mean 1.06 kt, median 0.5 kt, 75th percentile 0.9 kt** (max 7.3). Per-file, mean `SOG` when `STW` is
   blank is 0.35–0.90 kt for eight of the nine affected files, against an overall mean `SOG` of 5.37 kt.
   A paddlewheel has a stall threshold — below roughly 1 kt the impeller stops turning and the transducer
   reports nothing. That is normal, expected behaviour, not a fault.
2. **When it *is* reading, it is healthy and well-calibrated.** Over the 4,047 rows with `STW`:
   `corr(STW, SOG) = 0.9715`, `mean(STW − SOG) = −0.18 kt`, `median(STW/SOG) = 0.971` (restricted to
   `SOG > 2`). A ~2.9% under-read is a small calibration offset, not a failure.
3. The two files with the highest blank rates (`06-03` 24.5%, `06-20` 19.8%) are also the two with the most
   drifting/pre-start loitering — `06-20-26-chi-wauk` additionally has a frozen GPS for 38.8% of its rows
   (see Q8), so it is a generally degraded recording.

**Verdict:** the paddlewheel is working. Blank `STW` is a *low-speed* artifact and should be handled by
excluding low-speed rows from performance analysis (which `clean_recordings.py` already does via its
`SOG < 2.0` gate) rather than by distrusting the sensor. Do **not** impute `STW` from `SOG` — that would
destroy the very GPS-vs-water difference the data is for.

### 🔴 But those 272 rows are worse than merely missing a column. `[DOCUMENTED — forum, by the qtVlm author]`

qtVlm's author (`maitai`) on the official Meltemus forum, in a thread on AWS vs GWS vs TWS:

> Of course if qtVlm does not have HDG/STW/CTW it falls back to COG/SOG instead for calculating
> TWS/TWD/TWA/etc.

Source: `https://www.meltemus.com/index.php/en/forum-new-en/qtvlm-application/880-help-aws-vs-gws-vs-tws`.
This is a forum post by the software's author, not manual text — labelled accordingly, but it is the most
authoritative available statement on the fallback.

**Consequence: in a row where `STW` (or `CTW`) is blank, `TWD`/`TWS`/`TWA` silently stop being
water-referenced and become ground-referenced, with nothing in the file to flag it.** The wind columns in
those 272 rows are not comparable with the wind columns in the other 4,047. Corroborating this, the official
qtVlm training material notes *"If your Boat Speed is not valid (considered to 0), it is normal that
TWS = AWS."*

So the recommendation above strengthens: **drop rows with blank `STW` or `CTW` from any wind analysis, not
just from boat-speed analysis.** These rows are at near-zero boat speed anyway, so nothing of value is lost —
but a schema should record a per-row `water_referenced` boolean (`STW IS NOT NULL AND CTW IS NOT NULL`) so the
distinction survives ingest rather than having to be rediscovered.

### Bonus finding: the compass calibration event is visible in `CTW − COG`. `[INFERRED FROM DATA]`

Median `CTW − COG` (restricted to `SOG > 3` and `STW > 3`):

| file | date | median `CTW − COG` |
|---|---|---|
| 06-03-26-beer-can | 2026-06-03 | +14.5° |
| 06-06-26-nood | 2026-06-06 | +12.0° |
| 06-07-26-nood | 2026-06-07 | +12.4° |
| 06-20-26-chi-wauk | 2026-06-20 | +15.6° |
| 06-26-26-chi-mi-chi | 2026-06-26 | +9.3° |
| 07-01-26-beer-can | 2026-07-01 | +13.4° |
| — *compass autocompensation 2026-07-04* — | | |
| 07-22-26-beer-can | 2026-07-22 | +3.7° |
| 07-29-26-beer-can | 2026-07-29 | +2.6° |
| 08-04-26-100-beer-can | 2026-08-04 | +4.3° |
| 08-22-26-glr | 2026-08-22 | +4.3° |
| 08-26-26-beer-can | 2026-08-26 | +0.9° |

`compass-calibrations.yaml` in the Handsome-Pete repo records `date: '2026-07-04', type: autocompensation`.
The offset drops by ~10° exactly at that boundary. **Implication: `CTW` in the six pre-2026-07-04 files
carries a ~10–12° fluxgate deviation error, and because `TWD = CTW + TWA` (see Q5), that error propagates
into `TWD`, `GWD`, and `TWA (calc)` for those files.** Any wind-direction analysis spanning the season must
account for this. This is a stronger caveat than anything in the column semantics.

---

## Q5. The `(calc)` variants, and why there is no plain `AWA`/`AWS`

### `(calc)` means "computed by qtVlm at CSV-export time, not read from an instrument". `[DOCUMENTED]`

The decisive documentation is the official change log
(<https://www.meltemus.com/index.php/en/change-log>), VDR module:

> Calculate TWA, AWA and AWS when exporting in CSV format.

…listed alongside *"Add GWS and GWD data."* **Caveat on this citation:** the entry *text* was returned
consistently across repeated reads of that page, but the automated extraction gave inconsistent version/date
attribution (5.10-6 / Sep 2021 on one read, 5.10-10 / Jul 2024 on another) and inconsistent module heading
(Routes / VDR). Treat the **wording** as documented and the **version** as unpinned. `[UNRESOLVED]` on version.

The local 5.12.27 manual does **not** mention `(calc)` columns anywhere (`grep -c "(calc" → 0`), and the
documented VDR channel list on p. 77 does not include them. They are export-time additions layered on top of
the recorded channels.

### The asymmetry explained: **the VDR never records apparent wind at all.** `[DOCUMENTED]` + `[INFERRED FROM DATA]`

The manual's channel list (p. 77) is: *Position, COG, SOG, TWS, TWD, TWA, CTW, STW, PRE, XTE, RPM, GWD, GWS
and Active Alarms*, plus `POL`. **`AWA` and `AWS` are absent.** qtVlm *has* AWA and AWS instruments (manual
pp. 210–211) but does not persist them in the VDR. So on export it **synthesises** them from what it did
record. Hence there is no plain `AWA`/`AWS` to be asymmetric with — the `(calc)` versions are the only apparent
wind that exists in this file format.

`TWA` is different: it *is* recorded, so you get both the recorded value and the export-time recomputation.

### Exactly how each `(calc)` column is computed — reverse-engineered and confirmed. `[INFERRED FROM DATA]`

**`AWS (calc)` and `AWA (calc)` are the apparent-wind vector built from `TWS`, the *plain* `TWA`, and `STW`:**

```
along  = STW + TWS·cos(TWA)
across =       TWS·sin(TWA)
AWS (calc) = hypot(along, across)
AWA (calc) = atan2(across, along), expressed in 0..360
```

| boat-speed input | angle input | n | `AWS` median abs err | within 0.1 kt | `AWA` median abs err | within 1° |
|---|---|---|---|---|---|---|
| **`STW`** | **`TWA`** | 4046 | **0.026 kt** | **100.0%** | **0.089°** | **99.6%** |
| `STW` | `TWA (calc)` | 4046 | 0.046 | 73.3% | 0.552° | 66.7% |
| `SOG` | `TWA` | 4281 | 0.117 | 45.2% | 0.860° | 54.7% |
| `SOG` | `TWA (calc)` | 4281 | 0.154 | 37.1% | 1.306° | 41.6% |

A 100% / 99.6% match is not a correlation — it is an identity. Two things follow:

1. **`AWA (calc)`/`AWS (calc)` contain no independent information.** They are an algebraic function of
   `TWS`, `TWA`, `STW`. Storing them is redundant; more importantly, **they are not the Aluwind's actual
   measurement.** The masthead unit's real AWA/AWS — the only truly raw wind observation on the boat — is
   **lost** by this export format. That is a genuine loss for calibration work.
2. qtVlm uses **`STW`, not `SOG`** — i.e. the physically correct water-referenced frame, consistent with
   `TWD`/`TWS` being sea wind (Q3). Note `AWS (calc)`/`AWA (calc)` are therefore **blank-propagating on
   `STW`**: they are non-empty in 4,283 rows while `STW` is non-empty in only 4,047, so in ~236 rows qtVlm
   evidently substituted something (likely 0 or last-known) for the missing `STW`. Treat `(calc)` apparent
   wind as unreliable wherever `STW` is blank.

**`TWA (calc)` is the pure geometric identity `wrap(TWD − CTW)`:**

| candidate | target `TWA` | target `TWA (calc)` |
|---|---|---|
| `wrap(TWD − CTW)` | median err 1.000°, 76.4% within 1° | **median err 0.000°, 100.0% within 1°** |
| `wrap(TWD − COG)` | 8.900°, 5.4% | 8.800°, 6.0% |
| `wrap(GWD − CTW)` | 8.450°, 7.2% | 8.400°, 7.1% |
| `wrap(GWD − COG)` | 5.500°, 10.9% | 5.600°, 11.1% |

And symmetrically, `TWD = wrap(CTW + TWA (calc))` matches at 99.1% within 1° (median error 0.000°), versus
75.6% for `TWD = wrap(CTW + TWA)`.

This is corroborated by the change log, Instruments module, **5.12-24** (the latest release):

> TWA/TWD are now calculated against CTW/STW instead of HDG/STW.

`[DOCUMENTED]` — and note the version-sensitivity: in older qtVlm builds this was `HDG`-based, so the
identity above is **not guaranteed for files from other versions.**

Because `TWD` was itself derived from the instrument-side `TWA` plus heading, `TWA (calc) = TWD − CTW` is a
**round trip**: it recovers `TWA` up to rounding and smoothing drift. Observed drift: identical in 45.2% of
rows, median absolute difference 1.0°, p95 3.0°, **but with tail outliers up to 158° and sign disagreement in
0.29% of rows** (12 of 4,193) — presumably mid-tack, where the smoothing paths for `TWD` and `TWA` diverge.

### Which is authoritative?

**Use plain `TWA`.** `[INFERRED FROM DATA]`

- Plain `TWA` is the value the instrument chain (Aluwind → TL-25) actually produced and the value qtVlm
  itself trusted when synthesising apparent wind. It is the closest thing to a measurement.
- `TWA (calc)` is a derived round-trip that adds no information, is internally consistent with `TWD`/`CTW`
  by construction, and inherits `CTW`'s fluxgate deviation error.
- They agree to ±3° for 95% of rows, so the choice rarely matters — but the 0.29% sign disagreements matter a
  lot, because tack detection keys on `sign(TWA)`. `clean_recordings.py` in the Handsome-Pete repo already
  keys maneuver detection on plain `TWA`, which is the right call.
- For **apparent wind** there is no choice: `AWA (calc)`/`AWS (calc)` are all you have, and they are derived.
  Label them as such in any UI so nobody mistakes them for a masthead reading.

---

## Q6. `TWA` sign convention and range

### Range: **signed, −180..180.** `[INFERRED FROM DATA]`

Over 4,283 non-empty values: **min −179.0, max +180.0**; 1,879 negative, 2,400 positive, 4 exactly zero.
Zero values above 180 and zero below −180. So it is a signed half-turn convention, **not** 0..360.

`TWA (calc)` is the same: min −180.0, max +180.0, 1,884 negative.

**But `AWA (calc)` is different — it is unsigned 0..360:** min 0.0, max 359.3, **zero negative values**, with
a clean bimodal distribution (peaks around 0–120 and 240–360). **This asymmetry is a live parser trap.**

### Sign: **positive `TWA` = wind from starboard = starboard tack.** `[INFERRED FROM DATA]` (two independent proofs)

**Proof 1 — the heading relationship.** `TWA ≈ wrap(TWD − CTW)`: sign agreement **99.69%** over the 4,189
rows where both magnitudes exceed 5° (96.89% of rows agree within 5° in magnitude). The reversed convention
`wrap(CTW − TWD)` fits 0.42% of rows — comprehensively refuted.

Since `TWA = TWD − heading`, a positive `TWA` means the wind direction is *clockwise* of the bow, i.e. the
wind is coming over the **starboard** side. That is starboard tack.

**Proof 2 — the apparent-wind cross-tabulation, which is perfect.** `AWA (calc)` uses the standard convention
of degrees measured clockwise from the bow, so 0–180 is the starboard side and 180–360 the port side.
Cross-tabulating over the 4,159 rows with `|TWA| > 10`:

```
                       AWA (calc) <= 180   AWA (calc) > 180
TWA > 0  (2347 rows)              2347                   0
TWA < 0  (1812 rows)                 0                1812
```

**Zero exceptions in either off-diagonal cell.** `TWA > 0` ⟺ apparent wind on the starboard side.
Additionally, converting `AWA (calc)` to signed form (`AWA − 360` when `> 180`) gives sign agreement with
`TWA` of **99.95%**, and `|signed AWA| ≤ |TWA|` in **100.00%** of rows — the physically required result
(apparent wind is always further forward than true wind when making way), which independently validates that
both angle conventions are consistent and correctly interpreted.

**Documentation:** the manual does not state the sign convention numerically. It says only, for the `TWA`
instrument (p. 209): *"The digital display also shows a red or green dot, depending on the tack"*, and for
`AWA` (p. 210): *"Tack side is represented with a green or red dot over the digital display."* Red/green is
the standard port/starboard colour pair, which is consistent but not decisive on the numeric sign.
So the sign convention is `[INFERRED FROM DATA]`, not `[DOCUMENTED]` — but with 99.69% and 100% agreement
from two independent tests over 4,000+ rows, it is not in doubt.

**Upgrade: there is a documented statement after all, one page later than I first looked.** Manual, **p. 226**
(the active-waypoint information panel):

> Note that next TWA is **red if wind is port side, and green if starboard**.

This ties qtVlm's `TWA` explicitly to a port/starboard side determination — so `TWA` is definitively
side-aware rather than a magnitude, which is the half of the question the colour-dot sentences left open. The
numeric polarity (which side gets the minus sign) is still `[INFERRED FROM DATA]`, but the two are now
mutually consistent.

**Cross-check against the convention qtVlm is imitating.** Expedition's manual states the convention
explicitly under "Notes on sign of data":

> Expedition uses the standard sign conventions, as below. **Twa & awa — Positive on starboard, negative on
> port.** Trim (pitch) — Bow up pitch is positive. Heel (roll) — Roll is positive to starboard (sailing on
> port).

This matches what the data shows for qtVlm's `TWA`, and it is the industry-standard convention, so a
`positive = starboard` assumption is safe. `[DOCUMENTED]` (Expedition manual — a *different* program, cited
only as evidence for the industry convention; see Q0 on why this format is not Expedition's).

Note the residual oddity this leaves standing: qtVlm follows the standard convention for `TWA` but **violates
it for `AWA (calc)`**, which Expedition would have signed and qtVlm emits as unsigned 0–360. Two conventions in
one row remains the trap; the documentation does not acknowledge it.

---

## Q7. `XTE`, `ALARM`, `OBSERVATIONS`

### `XTE` = Cross Track Error, in **metres**. Drop it. `[DOCUMENTED]` + `[INFERRED FROM DATA]`

Manual, **p. 206**:

> **XTE: Cross Track Error** — This instrument shows the distance between your position and a theoretical
> route, in meters. An active WP or an XTE reference must have been defined, this is done through the route
> contextual menu.

**Populated in 0 of 4,319 rows (100% empty), with no non-empty value anywhere in the set.** The crew never ran
an active waypoint or XTE reference in qtVlm — unsurprising for buoy racing, where the course is not a
pre-programmed route.

Note the brief's guess that it is "routing-dependent, likely useless without an active route" is exactly
right, and confirmed both by the documentation and by the data. **Recommendation: do not store it.** If a
future distance race does use an active route, `XTE` would still be near-worthless for Layline's purposes
(it measures deviation from a plan, not a weather or performance quantity).

### `ALARM` = the currently-active qtVlm alarms; `"None"` is the no-alarm sentinel. Store it (cheaply). `[DOCUMENTED]` + `[INFERRED FROM DATA]`

The manual's VDR channel list (p. 77) calls it **"Active Alarms"**. The Alarms Module (pp. 81–83) documents a
configurable alarm set — AIS, anchor, distance-to-coast, atmospheric pressure, radio communication, radar
MARPA/guard-zone, laylines — and critically:

> Several alarms can be defined at the same time, in which case qtVlm will generate a playlist with all the
> sounds. […] When one or several alarms are activated, a box showing which alarms are triggered is shown on
> the screen.

**In our data, the only value ever observed is the literal string `"None"` — all 4,319 rows.** No alarm ever
fired.

**Two parser consequences:**

1. **`"None"` is a string sentinel, not a null.** Any parser that applies default CSV NA-handling will silently
   convert it to null. **This bug is live in the Handsome-Pete pipeline**: `clean_recordings.py` calls
   `pd.read_csv(path, sep=";", parse_dates=["Date"])` without `keep_default_na=False`, and the resulting
   `cleaned-recordings/*.csv` have an **empty** `ALARM` column. Worth reporting upstream.
2. **⚠️ `ALARM` may contain *multiple* alarm names when several fire at once, and the joining separator is
   undocumented and unobserved.** If qtVlm joins them with `;` or `,`, an unquoted multi-alarm row would
   **shift every subsequent field**. `[UNRESOLVED]` — never exercised in these files. A parser must
   validate field count per row and reject/quarantine rows whose count differs from the header.

3. 🔴 **`"None"` is UI-localised — do NOT detect the no-alarm case by matching the string `"None"`.** A real
   qtVlm VDR export published on the vendor's forum
   (`https://www.meltemus.com/media/kunena/attachments/1746/vdr.txt`) carries **`Aucune`** in the same column,
   and also carries genuine alarm names (`AIS`) on 63 of its 192 rows — proving both that the sentinel is
   translated and that real alarm names do appear in this field in practice. `[DOCUMENTED]` (third-party file
   published on the official forum). The robust rule is the inverse of the obvious one: treat the **single most
   frequent value in the file** as the no-alarm sentinel, or equivalently treat any value that is not the
   modal value as an alarm. Matching a hardcoded `"None"` would report constant alarms on a French-locale file.

**Recommendation: store the raw string as nullable text, mapping the file's no-alarm sentinel → `null`, and
keep the raw value when it is anything else.** It is one short string per row and it is the only channel that
could ever explain an anomaly ("why did the data go strange here? — because the anchor alarm was firing").
Note that the documented alarm vocabulary is large (p. 81 onward: AIS, anchor, danger detection, coasts,
depth, WP, laylines, COG, SOG, TWS, TWA, AWS, AWA, PPC, XTE, currents, heel, pressure, GPS, radio, internet,
time, radar), so an enum is the wrong model here — free text is correct.

### `OBSERVATIONS` = free text typed by the crew. Store it, and encourage its use. `[DOCUMENTED]`

Manual, **p. 79**, "Adding Observation and/or images to a VDR line":

> You can double click on a line to insert a comment or an image.
>
> Note that images are stored as images and not as links to a file, meaning that once inside the VDR you
> can delete the original image file.

And p. 80: *"Export will export the VDR in a CSV files. **Images are not included.**"* — so the CSV carries
only the text half of an observation; any attached image stays behind in `vdr.db`.

**Is it ever populated? No — 0 of 4,319 rows.** Checked as a raw string with NA-handling disabled; the only
distinct value across all 11 files is the empty string.

So the hoped-for outcome ("if the crew already types notes there, that's valuable") does **not** hold today —
the crew records annotations out-of-band in `metadata.yaml` instead (race start/finish, sail changes, sea
state), which is where the real annotation value currently lives.

**Recommendation: store the column as nullable text anyway, and separately treat this as a product
opportunity** — `OBSERVATIONS` is the one place where a sailor's in-the-moment note can be timestamped to the
exact data row, which `metadata.yaml`'s coarse time windows cannot do. It is worth telling the crew this field
exists.

**⚠️ Parser hazard:** this is arbitrary user text in a semicolon-delimited file. No row in these 11 files
contains a `"` character or a `,` (verified: 0 double-quotes, 0 commas, in every file), so **qtVlm's quoting
and escaping behaviour for a semicolon or newline typed into `OBSERVATIONS` is completely unverified**.
`[UNRESOLVED]`. See Q8 for the defensive recommendation.

---

## Q8. Format stability

### The column set is **user-configurable**. A parser must NOT assume this header. `[DOCUMENTED]` + `[INFERRED FROM DATA]`

Manual, **p. 78**, "VDR settings":

> You can also choose to hide some columns. Data is collected even if a column is hidden.

**And our own 11 files prove it in practice.** There are **two distinct headers** in the set:

```
# files 1-7 (06-03 .. 07-22), 20 columns, 19 semicolons per line:
Date;Longitude;Latitude;COG;SOG;TWD;TWS;TWA;GWD;GWS;CTW;STW;POL;PRE;XTE;TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS

# files 8-11 (07-29 .. 08-26), 21 columns, 20 semicolons per line:
Date;Longitude;Latitude;COG;SOG;TWD;TWS;TWA;GWD;GWS;CTW;STW;POL;PRE;XTE;RPM;TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS
```

**`RPM` appears mid-season, inserted at position 16 — in the middle, not appended at the end.** Any
positional/index-based parser written against the 20-column header would mis-map every column from `TWA
(calc)` onward on the four later files. This is the single most important defensive finding in this document.

(`RPM` is documented as *"RPM: Rotations Per Minute"*, manual p. 218; NMEA `RPM` sentence support added in
change log 5.8-6; VDR `RPM` data in 5.8-3. In our files it is present in 1,315 rows and its value is
**always exactly `0.0`** — engine off, or a sender reporting zero. Useless as data, but useful as an
engine-on/off flag if it ever becomes non-zero.)

Note also that ordering is *not* alphabetical or arbitrary: the documented channel list on p. 77 lists
`PRE, XTE, RPM` in that adjacency, matching where `RPM` was inserted. So the order follows qtVlm's internal
channel order, with hidden columns simply omitted. **Parse by header name, always.**

**Two further columns can appear that our files do not have: `DPH` and `HEEL`.** Both are documented qtVlm
instrument channels — *"DPH: Depth"* (manual p. 215) and *"HEEL/PCH: Heel and Pitch"* (p. 216) — and both sit
in the same recorded-channel family as `PRE`/`XTE`/`RPM`. Our boat has neither a depth sounder feeding NMEA
nor a heel sensor, so the columns are absent, but another boat's export may well carry them (and if a
`HEEL` column ever appears, leeway and therefore `CTW` stop being degenerate — see Q4). A parser must tolerate
**extra unknown columns**, not just missing ones. `[DOCUMENTED]` for the channels' existence; `[UNRESOLVED]`
whether the exporter's full column order is exactly
`… PRE;DPH;XTE;RPM;HEEL;TWA (calc);…` — plausible from the p. 215–216 ordering, but I have not seen a file
containing them.

**⚠️ Do not confuse this export with qtVlm's *other* CSV export.** qtVlm can also export a *track*, and that
file likewise contains a `POL` column with different neighbours (a `PPC` column appears alongside it; `PPC` is
the documented *"PPC: Polar Percent"* instrument, p. 207). If a file's header lacks `Date;Longitude;Latitude`
followed by the VDR channel run, it is not a VDR export and the semantics in this document do not apply.
Detect the VDR format by requiring the header to contain `ALARM` and `OBSERVATIONS` (the two VDR-only fields).
`[INFERRED FROM DATA]` / partly `[UNRESOLVED]` — I have not obtained a track-export sample to confirm its
exact header.

### The semicolon delimiter is qtVlm's house convention, **not** locale-derived. `[DOCUMENTED]`

This resolves the brief's puzzle ("semicolon delimiting usually implies a decimal-comma locale, yet these
values use decimal points"). qtVlm documents exactly this combination for its polar files (manual **p. 38**):

> It is basically a simple text file, with fields separated by a semi-column. **The decimal separator is the
> point.**

The boat's own polar file follows it (`twa/tws;4;6;8;10;…` with values like `0.88`), and so do the VDR
exports. qtVlm — a French-origin program whose author would default to a decimal comma if following locale —
deliberately fixes semicolon-plus-point. Verified in the data: **0 commas and 0 double-quote characters in
any of the 11 files.**

`[UNRESOLVED]`: I found no documentation of a *configurable* delimiter, and the change log has no entry for
one. I cannot prove it is unconfigurable, only that no source suggests it is. Given the polar-format
precedent, I would treat the **semicolon** as stable but still sniff it defensively (it is nearly free to do
so).

🔴 **Correction to the second half of this claim: the decimal *point* is NOT stable across installations.** A
real qtVlm VDR export published on the vendor's forum
(`https://www.meltemus.com/media/kunena/attachments/1746/vdr.txt`) uses **semicolon delimiters with comma
decimals**. So the delimiter and the decimal separator vary *independently*, and semicolon-plus-point is this
installation's combination, not the format's. `[DOCUMENTED]` (third-party file published on the official
forum)

Practical consequence: sniff the decimal separator too. It is unambiguous in a semicolon-delimited file — if
any field matches `^-?\d+,\d+$`, decimals are commas. Do not rely on the p. 38 polar-format sentence to
constrain the VDR exporter; it constrains only polar files.

### `Date` format: **always `MM/DD/YYYY HH:MM:SS`, local time, no zone indicator.** `[INFERRED FROM DATA]`

- **Strict format conformance: 100%.** All 4,319 values match `^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$`
  (zero-padded, 24-hour, no fractional seconds, no offset, no `T` separator).
- **It is `MM/DD`, not `DD/MM`.** Field 1 ranges 6–8 across the set while field 2 ranges 1–29, and field 1
  matches each file's own name (`08-22-26-glr.csv` → `08/22/2026`). Unambiguous.
- **Strictly monotonically increasing** within every file; zero non-positive intervals.
- **Midnight rollover is handled correctly.** In the overnight distance race
  `06-26-26-chi-mi-chi.csv` (2026-06-26 22:16:37 → 2026-06-27 04:09:13), the sequence is
  `06/26/2026 23:59:20` → `06/26/2026 23:59:50` → `06/27/2026 00:00:20` → `06/27/2026 00:00:50`. The date
  field advances; timestamps stay monotonic. **A parser must therefore parse the full date and must not
  reconstruct dates from a filename** — this file legitimately spans two calendar dates.
- **It is local time (America/Chicago, CDT during this season), not UTC.** Evidence: the Wednesday beer-can
  races have a `metadata.yaml` start of `19:00:00` and file spans of roughly 17:45–21:10, and 2026-06-03,
  07-01, 07-22, 07-29 and 08-26 are all genuinely Wednesdays. 19:00 UTC would be 14:00 local — not an evening
  beer can. `metadata.yaml` timestamps and `Date` are on the same clock (every recorded start falls inside
  its file's span).
- **⚠️ There is no timezone indicator whatsoever**, so the offset is unrecoverable from the file. It must be
  supplied out-of-band. Note the DST hazard: a recording spanning a US DST transition (early November) would
  contain an ambiguous repeated local hour, and these files give no way to disambiguate.

Supporting but not conclusive: qtVlm's own scripting XML documents the same literal pattern,
`<waitUntil>MM/dd/yyyy hh:mm:ss</waitUntil>` (manual p. ~283), suggesting `MM/dd/yyyy` is a qtVlm-fixed
format string rather than one inherited from Windows regional settings. A French locale would produce
`dd/MM/yyyy`. `[INFERRED FROM DATA]`

**Does qtVlm offer UTC export? YES — and the date format itself is a user setting.** `[DOCUMENTED]`

This was `[UNRESOLVED]` in the first pass and is now settled. Manual, **p. 43**, "General settings":

> From the main configuration dialog, you can choose the language, select the units for distance, **the
> format and zone for the time and date**, and many other details.

So both the **date/time format** and the **time zone** applied to displayed and exported timestamps are global
user preferences. `MM/DD/YYYY` + local time is *this installation's* configuration, not the format.

**Independently confirmed against a third-party file.** A real qtVlm VDR export attached to the vendor's own
forum (`https://www.meltemus.com/media/kunena/attachments/1746/vdr.txt`) uses **`20/11/2025` — DD/MM/YYYY**,
*and* **comma decimal separators**, with the same semicolon delimiter. `[DOCUMENTED]` (third-party file
published on the official forum)

🔴 **This is the single worst ingest hazard in the format, worse than the varying header**, because it fails
*silently* rather than loudly: `08/01/2026` is a valid date under both orderings, and misreading it moves a
recording by seven months with no parse error. A parser must not hardcode `MM/DD/YYYY`. Sniff the whole
column: if any day-position field exceeds 12 the order is decided; if none does (entirely possible for a
single evening's race in the first twelve days of a month), the order is **genuinely undecidable from the
file** and must come from configuration or from the filename convention. For our 11 files the filename
(`08-22-26-glr.csv`) and the `Date` column agree, so `MM/DD` is certain here.

Also note the earlier "qtVlm's own `MM/dd/yyyy` scripting pattern" argument above is now **downgraded to
irrelevant** — it describes the scripting XML's fixed format, which does not constrain the VDR export.

### Sampling interval is configurable **and** event-triggered — so rows are NOT evenly spaced. `[DOCUMENTED]` + `[INFERRED FROM DATA]`

Manual, **p. 78**:

> You can set the time interval for the recording. Minimum value is 10 seconds. Recommended value is 1
> minute.
>
> You can also add some more events that will trigger a VDR update:
> - A change in COG more than n degrees,
> - A tack or a Gybe,
> - A new alarm event.

In our data, ten of eleven files have a **median interval of 30 s** but with off-cadence rows down to **1–3 s**
(the documented event triggers — usefully, a 3 s gap is a decent tack/gybe hint) and gaps up to **780 s**
(NMEA dropout). **`06-20-26-chi-wauk.csv` is configured differently: median interval 74 s, with intervals
clustered at 15/45/75/105 s and a maximum gap of 3,352 s (56 minutes).**

**Do not assume 30-second sampling.** Store the timestamp and derive intervals; any rate-based computation
(e.g. distance, or averaging over a window) must weight by actual elapsed time.

---

## Parser implications

### Overriding principle

**Parse by header name, never by column index.** The header genuinely varies within this very dataset
(`RPM` inserted at position 16 in 4 of 11 files), and qtVlm explicitly permits users to hide any column. A
positional parser is guaranteed to break.

### Recommended handling per column

| Column | Store? | TS type | Notes |
|---|---|---|---|
| `Date` | **Yes — required** | `Date` (parse as local wall time + explicit IANA zone supplied out-of-band) | `MM/DD/YYYY HH:MM:SS` **in our files only — order and zone are user settings.** Sniff the order; never infer the date from the filename. |
| `Longitude` | **Yes — required** | `number` | Decimal degrees, negative = W. 10 dp. |
| `Latitude` | **Yes — required** | `number` | Decimal degrees. |
| `COG` | **Yes** | `number \| null` | Degrees true, 0..360. GPS. |
| `SOG` | **Yes** | `number \| null` | Knots. GPS. |
| `TWD` | **Yes** | `number \| null` | Degrees, 0..360. **Sea wind.** Carries fluxgate deviation error. |
| `TWS` | **Yes** | `number \| null` | Knots. **Sea wind. Use this for sail selection.** |
| `TWA` | **Yes — authoritative** | `number \| null` | **Signed −180..180. Positive = starboard tack.** |
| `GWD` | Yes, flagged | `number \| null` | Ground wind. Current- + 10 m-corrected. Forecast comparison only. |
| `GWS` | Yes, flagged | `number \| null` | Ground wind. **Do not use for sail selection.** |
| `CTW` | **Yes** | `number \| null` | ≈ raw fluxgate heading on this boat (leeway ≈ 0, no heel sensor). |
| `STW` | **Yes** | `number \| null` | Paddlewheel. Blank ⇒ boat below stall speed, not a fault. **Do not impute from `SOG`.** Blank also ⇒ that row's wind is ground-referenced. |
| `POL` | Yes, **with a polar-version tag** | `number \| null` | Polar **boat speed** at current (TWA, TWS). Not comparable across sessions alone. **Coerce `0` at non-zero `TWS` to null.** |
| `PRE` | Yes (nullable) | `number \| null` | Atmospheric pressure. Always null today. Cheap future-proofing. |
| `XTE` | **No — drop** | — | Always null; needs an active route; no value to Layline even then. |
| `RPM` | Optional | `number \| null` | Absent in 7/11 files, always `0.0` in the rest. Only useful as engine-on flag. |
| `TWA (calc)` | **No — drop** | — | Exactly `wrap(TWD − CTW)`. Redundant, derived, inherits compass error. |
| `AWA (calc)` | Yes, **labelled derived** | `number \| null` | **UNSIGNED 0..360** — different convention from `TWA`. Only apparent wind available. |
| `AWS (calc)` | Yes, **labelled derived** | `number \| null` | Knots. Computed from `TWS`,`TWA`,`STW` — not a masthead reading. |
| `ALARM` | Yes | `string \| null` | Map the file's **modal** value → `null` (the sentinel is localised — `None` here, `Aucune` in French). Free text, not an enum. May contain multiple alarms with an unknown separator. |
| `OBSERVATIONS` | Yes | `string \| null` | Free user text. Empty today; worth surfacing to the crew. |
| `DPH`, `HEEL` | Yes if present | `number \| null` | Not in our files, but valid qtVlm channels. Tolerate unknown columns generally. |

If you want to store only one apparent-wind representation, prefer keeping `AWA (calc)`/`AWS (calc)` and
**normalising `AWA (calc)` to signed −180..180 on ingest** so that all angles in the schema share one
convention. Record that you did so.

### Be defensive about

1. **Column presence and order.** Build a name → index map from the header row of each file. Require the
   core set (`Date`, `Longitude`, `Latitude`, `COG`, `SOG`); treat everything else as optional. Reject a file
   whose header lacks the core set rather than guessing.
2. **Field count per row.** Compare each row's field count to the header's. A mismatch means either an
   unescaped delimiter in `OBSERVATIONS`/`ALARM` or a truncated write — quarantine the row, do not shift-fill.
3. **Empty string ≠ zero ≠ null-sentinel.** Empty means "no reading". `ALARM`'s `"None"` is a *string*
   sentinel that naive CSV NA-handling will eat (this bug is live in `clean_recordings.py`). Configure your
   CSV reader to do no automatic NA coercion and handle sentinels explicitly.
4. **Wind-speed outliers.** `TWS`, `GWS` and `AWS (calc)` all contain absurd spikes — max **3,249.7 kt**
   (p99.9 = 22.0, p99.99 = 3,169). Only 3 rows exceed 25 kt across the whole set, and **all 3 occur at
   `SOG ≤ 0.2 kt`** (boat stationary, where the true-wind solution degenerates). Recommended gate: reject
   wind speeds above ~40 kt outright, and distrust all wind channels when `SOG` is below ~1 kt.
   `SOG`/`STW`/`POL` have no such outliers (max 9.6 / 8.7 / 9.9).
5. **Stale/frozen GPS.** 2.5% of rows overall (106/4,319) repeat the previous row's `COG`, `SOG` **and**
   position exactly — but this is concentrated almost entirely in `06-20-26-chi-wauk.csv` (**38.8%** of its
   rows). Add a staleness detector (identical consecutive position) and treat that file as degraded.
6. **Angle wrapping.** Never average or difference bearings arithmetically. `TWA` is −180..180 while
   `AWA (calc)` is 0..360 and `TWD`/`GWD`/`COG`/`CTW` are 0..360 — three conventions in one row.
7. **Non-uniform sampling.** Median 30 s, but 1 s to 3,352 s observed, and one file is on a ~74 s cadence.
   Weight anything rate-based by actual elapsed time.
8. 🔴 **Date order AND timezone are both user settings, and neither is recoverable from the file.** Manual
   p. 43: *"you can choose … the format and zone for the time and date"*. A real forum-published qtVlm export
   uses `DD/MM/YYYY`. Sniff the day field across the whole column; if no field exceeds 12, the order is
   undecidable and must come from ingest metadata. Require an explicit IANA zone per recording. **This is the
   only hazard in the format that fails silently rather than loudly** — see Q8.
9. 🔴 **Decimal separator is also a user setting** — the same forum-published export uses commas. Sniff for
   `^-?\d+,\d+$` before parsing numerics. The `;` delimiter appears stable, but sniff it too; it is free.
10. **Extra unknown columns.** `DPH` (depth) and `HEEL` may appear in other boats' exports. Ignore unknown
    columns rather than failing, and never assume the header is a closed set.
11. **`POL == 0` at non-zero `TWS`** means "polar not loaded", not "target speed zero". Coerce to null before
    computing `STW / POL`.
12. **`ALARM`'s no-alarm sentinel is localised** (`None` in ours, `Aucune` in a French export). Use the modal
    value, not a hardcoded string.
13. **Rows with blank `STW`/`CTW` have ground-referenced, not water-referenced, wind** (qtVlm falls back to
    `COG`/`SOG`). Set a `water_referenced` flag at ingest and exclude those rows from wind analysis.
14. **qtVlm version.** The `TWA`/`TWD`-vs-`CTW` relationship changed in 5.12-24 (previously `HDG`-based), and
    the `(calc)` columns were added around 5.10. Store the producing version if it can be captured; do not
    hard-code the algebraic identities documented here as invariants.
15. **The data is not necessarily raw, which cuts against this project's own core principle.** Manual p. 183:
    *"It is possible to smooth data received for wind/currents speed and direction, and boat speed and
    direction. The value indicates the number of last received data that should be averaged. **As this data is
    used in all calculations** … The default value (1) means not smoothing."* Plus configurable sensor offsets
    for pressure, internal compass and depth, and the 10 m normalisation on `GWS`. So a qtVlm VDR CSV is
    already a *processed* product; treating it as the raw instrument feed is a category error. The smoothing
    factor is not recorded in the export. `[DOCUMENTED]` / `[UNRESOLVED]` as to what this installation used —
    though the observed `TWA` values being always whole degrees suggests little or no smoothing on that channel.
16. **A VDR file can contain simulated data with nothing to mark it.** Manual p. 77: *"Once started, VDR will
    automatically run when NMEA **or Simulation mode** is active."* qtVlm's Simulation Mode drives a boat from
    grib and polar data. A simulated session would produce a structurally identical CSV in which `STW` matches
    `POL` almost exactly — worth a sanity check (`median(STW/POL) ≈ 1.000` with implausibly low variance) before
    trusting an unfamiliar file. Our files are genuine (median `STW/POL` ≈ 0.89 with realistic scatter).
    `[DOCUMENTED]`

### Two data-integrity caveats that outrank the parser

Per the project's raw-data-integrity principle, store everything as received — but **record these as
metadata** so downstream interpretation is honest:

1. **Pre-2026-07-04 heading error.** The fluxgate compass carried a ~10–12° deviation until the
   autocompensation on 2026-07-04 (visible as `median(CTW − COG)` dropping from ~13° to ~3°). Because
   `TWD = CTW + TWA`, **`TWD`, `GWD` and `TWA (calc)` in the six earlier files are biased by roughly the same
   amount.** Any cross-season wind-direction analysis must account for this.
2. **Mid-season polar change.** `POL` reproduces the repo's polar exactly for files 1–4 and at ~0.90–0.95 of
   it for files 5–11. Until that is explained, `STW / POL` is not a cross-session metric.

---

## Sources

**Official documentation (local):**
`/Users/apieprzycki/Documents/git/Handsome-Pete/instrument-documentation/qtVlm_documentation_en_5.12.27`
(qtVlm manual v5.12.27, 300 pp.). **All page numbers below are the manual's *printed* page numbers** (taken
from its table of contents), matching the convention used in `docs/research/orc-polar-file-formats.md`; note
that the physical PDF page index is printed-page + 1. Pages cited: 38 (polar CSV format), 39 (wave polar interpolation),
77 (VDR channel list — the key citation), 78 (VDR settings, interval, hiding columns), 79 (Observations),
80 (VDR export to CSV, 10 m adjustment), 81–83 (Alarms module), 106 (grib-vs-instrument comparison),
124 (weather-station UTC/local choice), 180 (NMEA other options, MWD, wind instrument altitude),
183 (data smoothing, pressure offset, K leeway, heel correction), 205–218 (Available Instruments:
COG/SOG 205, VMC/XTE 206, TSP/PPC 207, TWD 208, TWA 209, TWS/AWA 210, AWS/GWS 211, GWD/CTW 212,
STW/HDG/CNM 213, DNM/CS/CD 214, DPH/PRE 215, RPM 218), 220 (UTC instrument), ~255 (scripting `CPOL`).
Added in the second pass: **43** (General settings — *"the format and zone for the time and date"*, the
citation that settles Q8), **216** (`HEEL/PCH: Heel and Pitch`), **226** (active-WP panel — *"next TWA is red
if wind is port side, and green if starboard"*).

**Official documentation (web):**
- qtVlm change log — <https://www.meltemus.com/index.php/en/change-log>
  (entries cited: *"Add Voyage Data Recorder feature."*; *"Add POL (theoretical polar speed) column."*;
  *"Calculate TWA, AWA and AWS when exporting in CSV format."*; *"Add GWD and GWS instruments."*;
  *"TWA/TWD are now calculated against CTW/STW instead of HDG/STW."*; *"Add an instrument LWY (Leeway).
  Leeway is estimated with HEEL/STW and a K factor."*; *"Improve NMEA MDA message management (pressure and
  air temperature)."*; *"Add messages ZDA (date/time), RPM (Revolutions per minute) and VBW (speed on
  water)."*; *"Add possibility to configure sails selection according to TWS and TWA."*; *"Add RPM data."*)
  Retrieved via automated page fetch; version/date attribution for individual bullets proved unreliable
  across reads and is flagged where it matters (Q5).
- qtVlm site index — <https://www.meltemus.com/index.php/en/> (documentation, forum, downloads, change-log
  links). `https://www.meltemus.com/index.php/en/qtvlm-news` returns HTTP 404.

**Ground-truth data:**
`/Users/apieprzycki/Documents/git/Handsome-Pete/raw-regatta-recordings/*.csv` (11 files, 4,319 data rows),
`.../metadata.yaml`, `/Users/apieprzycki/Documents/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol`,
`/Users/apieprzycki/Documents/git/Handsome-Pete/compass-calibrations.yaml`,
`/Users/apieprzycki/Documents/git/Handsome-Pete/scripts/clean_recordings.py`.
All statistics in this document were computed with Python/pandas over the full 11-file set, reading every
field as a string with `keep_default_na=False` so that empty fields and the `"None"` sentinel were not
conflated.

**Sibling research document (independent corroboration):**
`/Users/apieprzycki/Documents/git/layline/docs/research/orc-polar-file-formats.md` — qtVlm provenance,
`.pol`/`.sailselect`/`.saildesc` formats, and an exact reverse-engineering of qtVlm's polar interpolation
(same n=1,640, same residual, reached separately).

**Second-pass sources (added after the first version; labelled by tier, per the brief's instruction that a
forum post still counts as long as it is called a forum post):**

- **Third-party qtVlm VDR export, published on the vendor's own forum** —
  <https://www.meltemus.com/media/kunena/attachments/1746/vdr.txt>. A real export from a different
  installation, and the single most useful second-pass source: it is what proves the decimal separator varies
  (commas), the date order varies (`20/11/2025`, DD/MM/YYYY), the `ALARM` sentinel is localised (`Aucune`), that
  real alarm names appear in that field (`AIS` on 63 of its 192 rows), and that the column set differs from
  ours. Not documentation, but *evidence* of the strongest kind — a second real file.
- **Forum post by the qtVlm author (`maitai`)** —
  <https://www.meltemus.com/index.php/en/forum-new-en/qtvlm-application/880-help-aws-vs-gws-vs-tws>. Source of
  the COG/SOG fallback statement in Q4. **This is a forum post, not official documentation** — but it is by the
  program's author and is the only available statement on that behaviour.
- **GPL source, older lineage** — <https://github.com/nohal/qtVlm/blob/master/src/Polar.cpp> (`Polar::myGetSpeed`).
  Source of the bilinear-interpolation confirmation, the upper-edge clamping, the `abs(TWA)` symmetry
  assumption, and the `return 0` when a polar object exists but is unloaded. **This is a third-party mirror of
  an older version, not the shipped 5.12.27 code**, so it corroborates rather than proves current behaviour —
  though our data independently confirms the bilinear part exactly.
- **Expedition manual**, "Notes on sign of data" — cited in Q6 *only* as evidence for the industry-standard
  `positive = starboard` convention, and in Q1 for the contrasting `Baro` channel name. Expedition is a
  different program and did not produce these files.

**Claims deliberately NOT incorporated:** a second-pass research thread reported details from disassembly of a
shipped qtVlm binary (an `exportMe()` header string, a `VDR` SQLite table definition, an internal
`-1000000.0` missing-value sentinel). Those are plausible and consistent with everything here, but I could not
verify them against any artefact in this repo or any published source, so they are excluded rather than
recorded at a confidence tier they have not earned. The conclusions they would have supported — that `POL` and
the `(calc)` columns are computed at export time, that `OBSERVATIONS` is a stored comment, that missing values
are written as empty fields, that `DPH`/`HEEL` can appear — are all independently established above from the
manual, the change log, and the data.

**Not used as a source:** no Expedition documentation was found that describes this header, and none is
cited. Where this document says the format is qtVlm-specific rather than shared with Expedition, that is an
inference from the exact match against qtVlm's documented channel list, not a documented claim about
Expedition.
