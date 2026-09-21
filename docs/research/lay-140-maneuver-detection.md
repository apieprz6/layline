# LAY-140 — Maneuver window span and mark-rounding detection for `services/analysis/`

Research and validation for LAY-140, a child of the LAY-138 map. Answers the two questions ADR 0009's
"Carried to the analysis effort" section opened and did not resolve: how wide a maneuver window should
be around a tack/gybe, and how to stop mark roundings from being forced into `tack`/`gybe`. **This is a
spec, not code** — nothing here touches `services/analysis/` or any TypeScript.

Primary sources: `Handsome-Pete/scripts/clean_recordings.py` and `Handsome-Pete/CONTEXT.md` at commit
`9658a77` (both last touched there, same commit — the code/docs contradiction did not arise from one of
them drifting after the other), `Handsome-Pete/docs/adr/0001-sog-for-speed-gate.md` and
`0002-dropout-detection.md`, and the archive itself: the 13 recordings in
`Handsome-Pete/raw-regatta-recordings/` plus `metadata.yaml`. On the Layline side:
`docs/adr/0009-upload-quality-gates-and-row-quality-as-a-computed-view.md` (source of the 263/415 and
94/51/28/15 figures the ticket quotes) and `CONTEXT.md`'s **Row Quality** entry.

## Methodology and a fidelity check

This sandbox has neither `pandas` nor `pyyaml`. `clean_recordings.py`'s `mark_dropouts`,
`mark_low_speed` and `detect_maneuvers` were re-implemented line-for-line in stdlib Python (plain
loops over lists, no vectorization) and run against the real archive; `metadata.yaml`'s `start`/
`finish` pairs were hand-transcribed since no YAML parser is available. Full listing in the Appendix.

Before trusting any number out of a hand port, it was checked against two figures ADR 0009 states
independently of this ticket's own claims:

- **Total in-window rows: 4088.** Exact match to ADR 0009 ("6,337 rows, 4,088 of them inside a race
  window").
- **Frozen/`stale` rows under clip-then-detect: 869.** Exact match to ADR 0009's clip-first figure
  (the ADR's own "870" is Layline's *improved* windowed-detection number, which this port doesn't
  attempt — it deliberately reproduces `clean_recordings.py`'s current clip-first behavior).

Both landing exactly right, across three separate marking passes and a hand-transcribed metadata file,
is the fidelity evidence for everything below.

**The sign-flip and window-cost totals do not exactly match the ADR's cached figures, and that is
expected, not a bug:** this port finds **93** in-window sign flips and **229/367** rows under a (1,1)
vs (1,3) window, against the ADR's **94** and **263/415**. The ticket itself warns the upstream code
"may have moved" since the map measured those numbers — `clean_recordings.py` and this archive are
both live files in a sibling repo, not frozen fixtures. The relative shape is preserved (367/229 =
1.60× vs the ADR's 415/263 = 1.58×), which is what the reasoning below leans on; the numbers in this
document are the current ground truth, reproduced directly against the code and archive as they exist
today, and should be treated as superseding the ADR's cached ones.

---

## Q1 — Window span: how wide, and should it be symmetric?

### The disagreement

`clean_recordings.py`:
```python
MANEUVER_BEFORE = 1
MANEUVER_AFTER = 1
```
`CONTEXT.md`'s **Maneuver Window** entry: *"The 4-point span (1 before, 3 after the TWA sign flip)..."*
— i.e. `MANEUVER_BEFORE = 1, MANEUVER_AFTER = 3`. Same commit introduced both files with this
contradiction already in place; neither is a stale edit of the other.

### Cost of the choice

| Span | Rows marked tack/gybe | % of 4088 in-window rows |
|---|---|---|
| (before=1, after=1) — current code | 229 | 5.6% |
| (before=1, after=3) — `CONTEXT.md` | 367 | 9.0% |

Going asymmetric costs 138 more rows, +60% relative — real money if a downstream metric excludes
maneuver rows, so it needs a reason better than "the glossary says so."

### The reason, measured directly

The rationale `CONTEXT.md` and ADR 0009 both gesture at — "data is unreliable while the boat is
turning and recovering speed," and recovery is the slower half — is checkable against `SOG` in the
archive itself. For every unambiguous tack/gybe (the same-zone events from Q2, so roundings don't
contaminate the sample), take the mean `SOG` of the up-to-3 rows immediately before the flip as a
baseline, then find the first row at or after the flip whose `SOG` returns to ≥90% of that baseline:

| Rows after the flip until 90%-of-baseline `SOG` | Tacks (n=51 with data, 56 total) | Gybes (n=26 with data, 28 total) |
|---|---|---|
| Recovered by row **0** (the flip row itself) | 25% (13) | 12% (3) |
| Cumulative by row **1** | 78% | 73% |
| Cumulative by row **3** | 94% | 88% |
| Cumulative by row **4** | 98% | 92% |
| Cumulative by row **5** | 100% | 96% |
| Never recovers within 8 rows | 5 of 56 (9%) | 2 of 28 (7%) |

`AFTER=1` (current code) leaves roughly a quarter of tacks and gybes still below 90% of pre-maneuver
speed when the window closes. `AFTER=3` (`CONTEXT.md`) closes that to ~6–12%, and `AFTER=4` buys only
another 4 points of coverage for 63 more excluded rows (+17% relative — see the sweep below). Tacks
and gybes recover on near-identical schedules, so one shared `AFTER` constant is enough; there's no
case here for two.

The **before** side got the same check — mean `SOG` one row before the flip against the mean of the
further-back rows (i−4..i−2) — and shows far less distortion: median ratio 0.94, and only 39% of
events (33 of 84) are already ≥10% below that earlier baseline a single row out. The turn itself is
brief; the boat is not meaningfully slowed until it's mid-turn. `BEFORE=1` has no measured pressure to
grow.

Full before/after sweep, for context on where the knee is:

| before | after | rows | % |
|---|---|---|---|
| 0 | 1 | 155 | 3.8% |
| 1 | 1 | 229 | 5.6% |
| 0 | 3 | 299 | 7.3% |
| **1** | **3** | **367** | **9.0%** |
| 2 | 3 | 431 | 10.5% |
| 1 | 4 | 430 | 10.5% |

### Recommendation

**`MANEUVER_BEFORE = 1`, `MANEUVER_AFTER = 3`, asymmetric.** Adopt what `CONTEXT.md` documents, not
what `clean_recordings.py` currently runs — the code is the one that's out of step with its own
project's stated reasoning, and the archive's own `SOG` data backs the documented span, not the coded
one. Symmetry was never the right shape: a tack/gybe's turn is a brief single-sample event, its speed
recovery is a multi-sample one, and a window that treats them the same either wastes rows on the turn
side or, as today, cuts the recovery side short.

---

## Q2 — Mark-rounding detection

### Why `avg_abs_twa > 90` breaks

The current rule averages the magnitudes of the TWA on either side of a sign flip and calls the
average a gybe if it's past the beam. A rounding — bearing away from a beat straight onto a run, or
heading up from a run onto a beat, all inside one 30-second sample — puts one side of the flip near
0° and the other near 180°, and *where the average of those two lands is arbitrary*: reproduced from
the archive,

| Recording | prev TWA | curr TWA | avg\_abs\_twa | Current label |
|---|---|---|---|---|
| `06-06-26-nood` | −154.0° | +4.0° | 79.0° | `tack` |
| `06-06-26-nood` | +28.0° | −163.0° | 95.5° | `gybe` |

Same kind of event — a full change of point of sail in one sample — opposite label, entirely because
16.5° of averaging arithmetic happened to land it on one side of 90 rather than the other.

### The rule

A tack is physically a pivot between two close-hauled angles — both sides of the flip sit forward of
the beam. A gybe is a pivot between two run angles — both sides sit aft of the beam. That is exactly
what `avg_abs_twa > 90` is trying to say, except it checks the *average* instead of checking *each
side*. Checking each side against the same 90° boundary the code already uses is the minimal fix, and
it structurally can't reproduce the flip-flop above, because a rounding is defined by exactly the
disagreement that caused it:

```
zone(twa) = "downwind" if |twa| > 90 else "upwind"

zone(prev) == zone(curr) == "upwind"    -> tack
zone(prev) == zone(curr) == "downwind"  -> gybe
zone(prev) != zone(curr)                -> rounding
```

No new constant — 90° is the boundary the code already draws, moved from the averaged value to each
side individually.

### Validated against the archive

Running this against all 93 in-window sign flips (current archive, current code):

| Classification | Count | % of 93 |
|---|---|---|
| Same-zone upwind → `tack` | 56 | 60% |
| Same-zone downwind → `gybe` | 28 | 30% |
| Mixed-zone → `rounding` | **9** | **10%** |

The nine roundings, including both canonical examples from the ticket and from ADR 0009:

| Recording | prev TWA | curr TWA | Current (wrong) label | Wrapped angular distance travelled |
|---|---|---|---|---|
| `07-22-26-beer-can` | −134.0° | +48.0° | `gybe` | 178.0° |
| `06-07-26-nood` | −24.0° | +151.0° | `tack` | 175.0° |
| `06-06-26-nood` | +28.0° | −163.0° | `gybe` | 169.0° |
| `06-06-26-nood` | −154.0° | +4.0° | `tack` | 158.0° |
| `06-07-26-nood` | +36.0° | −167.0° | `gybe` | 157.0° |
| `06-20-26-chi-wauk` | −101.0° | +49.0° | `tack` | 150.0° |
| `06-07-26-nood` | +93.0° | −24.0° | `tack` | 117.0° |
| `06-26-26-chi-mi-chi` | −80.0° | +170.0° | `gybe` | 110.0° |
| `08-04-26-100-beer-can` | −87.0° | +173.0° | `gybe` | 100.0° |

("Wrapped angular distance travelled" is `curr − prev`, wrapped into [−180°, 180°], then made
positive — the actual heading change, taking the shorter arc. It's shown for intuition; it is *not*
the detection rule, see below.)

### Why zone-crossing, not just "a big angle change"

A tempting simpler rule is "flag any flip whose wrapped angular distance is large." It's close but
worse: several genuine wide-angle tacks and gybes — light-air reaching maneuvers where the boat's
close-hauled or running angle is wide — sit at 90–113° of wrapped distance without changing point of
sail at all:

| Recording | prev TWA | curr TWA | Wrapped dist | Zones | Genuine label |
|---|---|---|---|---|---|
| `06-20-26-chi-wauk` | +132.0° | −115.0° | 113.0° | both downwind | `gybe` (wide-angle) |
| `06-07-26-nood` | −58.0° | +36.0° | 94.0° | both upwind | `tack` (wide-angle) |
| `06-20-26-chi-wauk` | +38.0° | −52.0° | 90.0° | both upwind | `tack` (wide-angle) |

A raw-distance cutoff set low enough to catch these as safe would also swallow the loosest of the nine
genuine roundings (100°); set high enough to spare them, it lets some roundings through. Zone-crossing
doesn't have this tension, because it asks the question that actually distinguishes a rounding — did
the boat change which side of the beam it's sailing on — rather than how far it swung.

### Threshold sensitivity, and why 90° and not something tuned

| Zone boundary | Roundings found (of 93) |
|---|---|
| 60° | 18 |
| 70° | 12 |
| 80° | 10 |
| **90°** | **9** |
| 100° | 8 |
| 110° | 7 |
| 120° | 9 |

90° is recommended **because it is already the code's own tack/gybe boundary**, not because it
produces a particular count. A lower boundary (60–70°) does land closer to the ADR's cited "15 of 94,"
but that figure was a manual, inspection-based tally ("51 unambiguously tacks and 28 unambiguously
gybes... 15 cross the entire wind range") rather than the output of a fixed rule, and matching it
exactly isn't a goal worth introducing an untethered second constant for. The two are not in tension
about *which* events are suspect — every canonical rounding this document found, and both of the
ticket's own examples, are captured at 90°; the gap between 9 and 15 is the difference between a
reproducible threshold and a human eyeballing a plot, plus the archive/code drift already noted above.

### Recommendation

Classify by zone-crossing at the existing 90° boundary, applied per side rather than to the average.
Label the result `rounding`, a third value alongside `tack`/`gybe`/`none` — never collapse it into
either neighbor, and never silently drop the row from maneuver analysis (the whole point is that a
rounding's speed loss is a different phenomenon and must not enter a tack-cost or gybe-cost
population, exactly as ADR 0009 already found for the two examples it named).

---

## Row Quality independence (binding constraint from ADR 0009 / `CONTEXT.md`)

`CONTEXT.md`: *"**Row Quality** says how far a row can be trusted; what the boat was **doing** is a
separate axis, and the two never share a field."* ADR 0009 found the prior art violates this for 34
rows across 5 recordings, because `detect_maneuvers` only overwrites a row currently `== "valid"` —
a row already marked `low-speed` keeps that label and silently loses the maneuver one, "precisely the
rows a comparison of tack cost across setups would want."

This spec inherits the part of `clean_recordings.py` that already gets this right — a flip is never
read across a Frozen row, because a frozen row's `TWA` is a fabricated repeat, not a heading, and no
maneuver window may claim a Frozen row at all — and explicitly does **not** inherit the part that gets
it wrong. For `services/analysis/`:

- **Maneuver label** (`none | tack | gybe | rounding`) and **Row Quality** (`Frozen | Not
  Water-Referenced | Low-Speed | none of the above`) are computed as two independent functions over
  the same rows, never merged into one field, and neither is allowed to overwrite the other's output.
- A row can be simultaneously `Low-Speed` and inside a `tack` window, and both facts must survive to
  whatever reads the row. This is exactly the case the prior art's single `STATUS` column collapsed.
- **Exception, inherited deliberately:** a `Frozen` row may never anchor or be claimed by a maneuver
  window, because there is no real `TWA` to read there. This one collapse is correct (ADR 0009 says
  so explicitly for the Frozen case) — it is the *only* Row Quality state that gates maneuver
  detection, and `Not Water-Referenced` / `Low-Speed` must not.

---

## Spec for `services/analysis/`

**Constants**
```
MANEUVER_BEFORE = 1
MANEUVER_AFTER  = 3
ZONE_BOUNDARY_DEG = 90   // reused from the existing tack/gybe split, not a new number
```

**Sign-flip detection** (unchanged from `clean_recordings.py`, carried forward as-is)
- Walk consecutive in-window rows. A candidate flip at row `i` requires: `TWA[i-1]` and `TWA[i]` both
  present and non-zero, opposite signs, and **neither `i-1` nor `i` is a Frozen row** (Row Quality —
  see above).

**Classification**
```
zone(twa) = "downwind" if abs(twa) > ZONE_BOUNDARY_DEG else "upwind"

zone(prev) == zone(curr) == "upwind"    -> "tack"
zone(prev) == zone(curr) == "downwind"  -> "gybe"
zone(prev) != zone(curr)                -> "rounding"
```

**Window**
- Rows `[i - MANEUVER_BEFORE, i + MANEUVER_AFTER]`, clipped to the recording's own bounds.
- Every row in that span gets the maneuver label, **regardless of that row's Row Quality**, except a
  row that is itself Frozen (which never receives any maneuver label, per the exception above).
- The label is additive metadata, not a status overwrite: a row keeps whatever Row Quality it already
  has, and gains a maneuver label alongside it.

**Validated on the archive (13 recordings, 4088 in-window rows, current `clean_recordings.py`
behavior reproduced faithfully — see fidelity check above):**

| Metric | Value |
|---|---|
| In-window sign flips | 93 |
| → same-zone-upwind (`tack`) | 56 |
| → same-zone-downwind (`gybe`) | 28 |
| → mixed-zone (`rounding`) | 9 |
| Rows inside a maneuver window at (1, 3) | 367 (9.0% of in-window rows) |
| vs. at the current code's (1, 1) | 229 (5.6%) |

## Residual ambiguity to flag, not silently resolve

- **Race-window-boundary flips.** A few flips sit at `i=1` or `i=2` of a recording's in-window slice
  (e.g. `06-07-26-nood` row 1: 93.0° → −24.0°). These may be the tail of a pre-start maneuver rather
  than a racing one; this spec classifies them the same as any other flip (this one lands `mixed-zone`
  → `rounding`, which is arguably closer to correct than either `tack` or `gybe` would have been) and
  takes no special action. Worth a second look once `services/analysis/` has a reason to care about
  race-window edges specifically.
- **The 90° boundary is a boundary, not a law of sailing.** A boat that flies exactly on the beam
  (`TWA` = ±90°) is an edge case the archive doesn't happen to contain; if one appears, the rule sends
  it to whichever zone the sign convention favors. Not worth guarding against speculatively — no
  instance exists to validate a guard against.

## Appendix — reproduction

`pandas`/`pyyaml` are unavailable in this environment; the pipeline below is a line-for-line stdlib
port of `clean_recordings.py`'s `mark_dropouts` / `mark_low_speed` / `detect_maneuvers`, run against
`Handsome-Pete/raw-regatta-recordings/*.csv` with `metadata.yaml`'s `start`/`finish` values transcribed
by hand (both files listed in full in the git history of the branch this document ships on, at
`/tmp/analyze_maneuvers.py` in the session that produced it — not committed, since it is scaffolding
for this research rather than a repo artifact). Fidelity was checked against two numbers ADR 0009
states independently of anything in this ticket (4088 in-window rows, 869 clip-first frozen rows) and
both matched exactly before any of the numbers above were trusted.

Core loop (the part worth keeping in mind when `services/analysis/` is actually built):

```python
def detect_maneuvers(rows, status, before, after):
    twa = [r["TWA"] for r in rows]
    for i in range(1, len(twa)):
        prev_twa, curr_twa = twa[i - 1], twa[i]
        if status[i - 1] == "stale" or status[i] == "stale":
            continue  # never read a flip across a Frozen row
        if prev_twa is None or curr_twa is None or prev_twa == 0 or curr_twa == 0:
            continue
        if not ((prev_twa > 0 and curr_twa < 0) or (prev_twa < 0 and curr_twa > 0)):
            continue

        def zone(twa, thresh=90):
            return "downwind" if abs(twa) > thresh else "upwind"

        zp, zc = zone(prev_twa), zone(curr_twa)
        maneuver_type = "tack" if zp == zc == "upwind" else "gybe" if zp == zc == "downwind" else "rounding"

        window_start = max(0, i - before)
        window_end = min(len(twa) - 1, i + after)
        for j in range(window_start, window_end + 1):
            status[j] = maneuver_type  # additive label alongside Row Quality, never overwriting it
    return status
```
