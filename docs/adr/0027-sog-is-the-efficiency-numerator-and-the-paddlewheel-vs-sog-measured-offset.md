# ADR 0027: `SOG` Is the Polar/VMG Efficiency Numerator, and the Paddlewheel-vs-`SOG` Check That Settled It

## Status

Accepted. Resolves LAY-139 ("Design the paddlewheel-vs-SOG divergence check, and settle the
Polar/VMG Efficiency numerator"), a two-part question the map deliberately carved into one ticket
because the two parts are entangled: the check this ADR designs is close to the instrument that
measures how much the numerator question actually matters on this boat.

Builds on ADR 0009 (**Row Quality**), ADR 0025 (**Countable**), ADR 0026 (the analysis query
layer's `computeRowEfficiency` seam, which names the numerator as exactly what this ADR settles,
and the **Analysis Filter** every Instrument Tuning check reads through), and
`docs/research/compass-calibration-and-awa-offset-port.md` (LAY-145 — the sibling Instrument
Tuning checks' Calibration-Log era-partitioning technique and "Measured Offset for `X`, via `Y`"
naming convention, both reused here rather than reinvented). Also responds to Handsome-Pete's own
`docs/adr/0001-sog-for-speed-gate.md`, which chose `SOG` for the low-speed gate on the same
distrust-the-paddlewheel grounds this ADR now extends to the numerator itself.

## Context

`CONTEXT.md` flagged Polar Efficiency's numerator as an open ambiguity: `STW` is dimensionally
correct — the **Polar** is a through-water target — but the paddlewheel's calibration is known to
vary between sessions; `SOG` is trustworthy but measures a different quantity, wrong in any
current. LAY-138 (the Instrument Tuning map) separately needs a new "paddlewheel vs SOG" check for
its Instrument Tuning screen — new analysis, since Handsome-Pete has no such script. Resolving the
check's design requires deciding what it measures and over what rows; resolving the numerator
requires knowing how much `STW` actually diverges from `SOG` on this boat. Each blocks a clean
answer to the other, so one ticket, one ADR.

## Decision

### The check: a `SOG`-on-`STW` regression, partitioned by `STW` calibration era

For each era of the **`STW` Calibration Channel** (the merged Calibration Log — Calibration
Events plus Instrument Calibration Version changes — filtered to channel `STW`, the same technique
LAY-145 used to partition `HDG` eras), scatter GPS `SOG` (the response) against the recorded,
already-corrected `STW` (the predictor) over every **Countable** row matching the screen's
**Analysis Filter**, exactly as the other two Instrument Tuning checks compose with both (ADR
0025, ADR 0026). No override of `Countable` for this check: measured on the local archive, rows
below the Low-Speed threshold are five times noisier in the `STW`/`SOG` ratio than rows above the
sibling checks' own analysis-only speed gate, so Handsome-Pete's ADR 0001 hope that low-speed
divergence is clean calibration signal does not hold up empirically — the uniform rule is correct
here too, not merely convenient.

Because `STW` is recorded *after* the display's own multiplier and Programmed Offset are applied,
there is no "raw" paddlewheel value to recover — synthesizing one by inverting the currently-active
correction would manufacture a value nothing ever recorded (AGENTS.md; ADR 0008). The regression
is fit directly against `STW` as stored. This also means the **current config is the 1:1 line**:
since `STW` already carries its own correction, "the instrument reading exactly matches `SOG`"
*is* the diagonal, with no separate reference line to compute.

**What is reported: `R²` and a bias in knots, never a drafted `(multiplier, offset)`.** The gap
between the fit line and the 1:1 line, expressed in knots, is the **Measured Offset for `STW`, via
`SOG`** — the same naming convention LAY-145 used for `HDG`'s Measured Offset via `CTW`, and for
the same reason: `SOG` is a legitimate proxy for the true quantity, with one stated caveat (below)
rather than a structural defect. The fit's `R²` is reported alongside it as a confidence figure.
The fit's own slope and intercept are not surfaced as a standalone pair — doing so would be
drafting a calibration value, which decision 7 on the LAY-138 map rules out for every Instrument
Tuning check ("it reports a Measured Offset; it never drafts a value to type into a new Instrument
Calibration Version... the correction has to happen on the boat first anyway"). The regression
line is drawn for its diagnostic shape, not its coefficients.

**The stated caveat:** this Measured Offset assumes current is negligible on this venue. Lake
Michigan's current is small enough, and this boat's own `SOG`-vs-`STW` divergence is direction-
independent across every 30° course bin measured in the archive (never flipping sign, which a real
current would), that a current-vs-calibration separation by course direction was considered and
rejected as complexity without payoff for this boat and this lake — see Rejected Alternatives. A
boat or venue where current is not negligible would need to revisit this before trusting the
figure as calibration-only.

### Per-Race tile and era aggregate

- **Per-Race**: always renders its scatter (a race is real data regardless of what it can support),
  and draws its own fit line only if it clears `MIN_VALID_POINTS = 5` (reused from the compass
  check) **and** its `SOG` spans at least 3kt (a starting value, not strongly defended — revisit
  against real per-race ranges once the archive is larger). A race that misses either gate still
  shows its points and still contributes its rows to the era aggregate below; it just doesn't get
  a line of its own. This is also the per-Race summary tile LAY-138 already stubs, per the same
  "the per-Race point is the tile" precedent LAY-145 established for the other two checks.
- **Era aggregate**: pools every Countable, filter-matching row from every Race in the era into one
  regression, with each row weighted `1 / (that race's row count in this era)` so every Race's
  total influence on the fit is equal, regardless of how many rows or how much duration it
  contributed. This is deliberately not row-count-weighted pooling and not a per-Race-fit average
  gated behind the 3kt spread requirement above — see Rejected Alternatives for why both were
  considered and rejected. An era with too little total weighted data is excluded outright, no
  fit drawn and no null/zero point substituted, matching LAY-145's "a data-poor Race contributes
  nothing" precedent applied one level up.

### Blank-`STW` rows (19.8% of the archive)

A row with no `STW` (`water_referenced = false`) cannot appear in the scatter at all — there is no
x-value to plot, not a filtering choice but a mechanical consequence of what the check compares.
These rows are surfaced separately as an explicit coverage stat on the Instrument Tuning screen
("the paddlewheel had no reading for X% of this population"), matching the archive's existing
discipline of showing "unknown"/"no data" as its own visible bucket rather than an omission (Sea
State's unannotated-races handling, `withinRaceWindow`'s explicit bounds).

### The numerator: `SOG`

Polar Efficiency, VMG (and therefore VMG Efficiency) read `SOG`, not `STW`, as boat speed.
Measured on the local archive (13 races, 6,337 rows, `SOG ≥ 3.5kt` gate): `STW` underreads `SOG`
by a mean ratio of 0.979, and the bias is not constant — it widens from roughly 0.99 at 4-5kt to
roughly 0.90 at 9-10kt, i.e. it grows at exactly the boat speeds a Race's performance numbers care
about most. The divergence is stable across all 13 races (no drift or step visible across the
season) and direction-independent across course bins, both of which point toward a systematic
paddlewheel scaling bias rather than current. `STW`'s theoretical advantage — dimensional
correctness against a through-water Polar target — only pays off if current is doing real work
against the boat; on Lake Michigan it measurably is not. `SOG`'s theoretical disadvantage therefore
costs almost nothing here, while `STW`'s practical disadvantage — an uncalibrated, session-varying,
speed-dependent bias — is real, measured, and larger at race pace than at idle. `CONTEXT.md`'s
Polar Efficiency, `VMG`, and the numerator's flagged ambiguity are updated to state this plainly.

## Consequences

- `services/analysis/`'s `computeRowEfficiency` seam (ADR 0026) reads `SOG` for actual boat speed;
  nothing about the seam's shape changes, only its body, exactly as ADR 0026 anticipated.
- A new `services/analysis/` module (paddlewheel divergence) joins the compass-deviation and
  AWA-asymmetry modules LAY-145 specs, feeding `getInstrumentTuningData` (ADR 0026) as the third
  Instrument Tuning check. It needs the Calibration Log filtered to `STW` (era boundaries), the
  Countable predicate, and the Analysis Filter's matched-row shape — no new primitive beyond those.
- `CONTEXT.md`'s Polar Efficiency and `VMG` definitions now name `SOG` explicitly; the numerator
  flagged ambiguity is marked resolved in place, per the doc's existing convention for closed
  ambiguities.
- A future recalibration or paddlewheel replacement does not retroactively change any Race's
  numbers — same "a Race is measured against the versions that were current when it was sailed"
  rule that already governs every other Boat Setup artifact.
- If Layline is ever used on a boat or a body of water where current is not negligible, this ADR's
  numerator conclusion and its Measured Offset's current-negligible caveat both need revisiting —
  stated here so that revisit has a documented reason to happen rather than a silent default to
  dislodge.

## Rejected alternatives

- **Bin by course direction (COG) to separate calibration error from current**, the natural
  extension of binning by heading the way the compass check does. Rejected: Lake Michigan's current
  is negligible for this boat's racing, the archive's own data already shows no direction-dependent
  sign flip (the signature a real current would leave), and the added complexity would mostly
  confirm what venue knowledge already establishes rather than discover anything actionable.
- **Reconstruct a "raw" pre-correction paddlewheel value** by inverting the currently-programmed
  multiplier/offset, to fit against the sensor's uncorrected signal the way a factory calibration
  procedure would. Rejected: nothing upstream of the display's own correction was ever recorded:
  synthesizing it manufactures a value with no source, violating the "as recorded, with known
  provenance" standard (ADR 0008) for no benefit the corrected-`STW` fit doesn't already provide.
- **Surface the regression's fitted `(multiplier, offset)` as a standalone pair.** This is what a
  sailor would type into the instrument display, and Instrument Tuning is diagnostic-only by
  decision 7 on the LAY-138 map. The fit line and its `R²`/bias communicate the same finding
  without also drafting the correction.
- **Pool every Countable row in an era unweighted.** More data sounds like a better estimate, but
  rows within one Race are highly autocorrelated (a slowly-varying process sampled every ~30s, not
  independent draws), so unweighted pooling would let one long or anomalous Race (a fouled
  paddlewheel, an unusual day) dominate the era's fit in direct proportion to its row count or
  duration — the opposite of protection against exactly the "conditions on the day" risk pooling
  was meant to address — and would overstate the fit's apparent `R²`.
- **Fit each Race independently, gated behind the same 3kt spread requirement as the per-Race tile,
  then average the per-Race fits for the era number.** Would throw away legitimate rows from calm
  days that never individually spanned 3kt of `SOG`, even though several such days pooled together
  can jointly cover the full range as informatively as one race that spanned it alone.
- **Let this check special-case Row Quality/`Countable`** on the strength of Handsome-Pete's ADR
  0001 argument that low-speed divergence is informative for calibration work. Rejected on this
  archive's own evidence: low-speed rows are measurably five times noisier in the divergence ratio
  than rows above the analysis speed gate, so the uniform `Countable` rule (ADR 0025) is the
  correct choice for this check too, not an unexamined default.
