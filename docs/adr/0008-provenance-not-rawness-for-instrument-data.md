# ADR 0008: Provenance, Not Rawness, for Instrument Data

## Status

Accepted. Amends the Raw Data Integrity principle in `docs/design-docs/core-beliefs.md`, together with its seven restatements in `AGENTS.md` and its statement in `PROJECT_PLAN.md`.

Ruling 2 is upheld and **refined by ADR 0009**, which settles *when* the cleaned view is computed rather than whether it is stored. The consequence below reading "`STATUS` does not exist in effort 1" was right about the column and wrong about the timing: the quality half of it is computed at read from the first release.

Ruling 3 is upheld in substance and **amended by ADR 0010** in one clause: "whose first entry sits at the race start" is a **convention at entry time, not an invariant**, and no code may enforce it. Because the race window is editable, the entry that resolves onto the earliest row is whichever is earliest, with resolution falling back to it. ADR 0010 also settles the question this ADR left open below — how an admin amends a Race after upload — and extends **Testimony** to cover everything a Race holds that is not its Transcription.

## Context

Layline's founding principle says: **never modify incoming weather measurements**, store them exactly as received, and interpret only in prompts and UI. It was written about buoys, and the worked example is Harrison Dever — the station reports 20 knots at 85 feet, so store 20 and explain, never scale to surface.

Absorbing the boat's own instrument data puts that rule under a strain it was not written for, in three separate ways.

**There is almost no raw measurement to store.** Of the 20-21 columns in a qtVlm VDR export, exactly one live channel is an uncomputed sensor reading: `STW`, off the paddlewheel. The position group (`Longitude`, `Latitude`, `COG`, `SOG`) comes from GPS. Everything else that matters — `TWD`, `TWS`, `TWA`, `GWD`, `GWS`, and the three `(calc)` columns — is computed by the navigation software before the file is written.

**The raw observations do not reach us at all.** The VDR format never records apparent wind, so `AWA (calc)` and `AWS (calc)` are synthesised at export time from `TWS`, `TWA` and `STW` — verified as an algebraic identity, matching to within 0.1 kt on speed for 100.0% of rows and 1° on angle for 99.6%. The masthead unit's actual reading, the only genuinely raw wind observation on the boat, is discarded by the format. There is likewise no `HDG` column, so the fluxgate's own heading is unrecoverable; what survives is `CTW`, which is heading plus leeway.

**What does reach us has been processed by settings that are not recorded.** The navigation software applies configurable smoothing to wind and boat speed — its manual notes this matters because "this data is used in all calculations" — normalises `GWS` to 10 metres using a wind-instrument altitude parameter, and subtracts a current it solved for itself. None of those three settings appears in the export, and none is recoverable from it. Upstream of all of that, the instrument display has already applied `multiplier × reading + Programmed Offset` per channel (ADR 0005), so even `STW` is a corrected figure before it is logged.

So "store measurements exactly as received" cannot be honoured for wind, not because we are unwilling but because the raw figure was never in our possession. A qtVlm export is a processed product, and treating it as the raw instrument feed is a category error.

There is a worked example of the failure mode this principle exists to prevent, and it is in this boat's own season. The navigation software derives current from the disagreement between GPS and through-water motion, so the fluxgate's deviation error was laundered into a value labelled **current**, and from there into `GWD` and `GWS`. The result is an implied median current of 1.46 kt on Lake Michigan, whose per-file offset collapses from roughly −12…−19° to about −2° precisely at the 2026-07-04 autocompensation. The "current" was mostly compass error wearing a physical quantity's name — and it contaminated two columns nobody was thinking about. Once a correction is folded into a stored value, the error stops being distinguishable from signal and propagates.

One further piece of context, recorded because it changes what this ADR is for. **The principle is already not honoured on the weather side.** `BuoyMetadata` carries `windMeasurementHeight` and `adjustmentNote` exactly as `core-beliefs.md` prescribes, is genuinely populated, and is read by nothing — `.metadata` has no non-test consumer anywhere in `app/`, `components/`, `lib/` or `services/`. So this is not a working practice being extended to a new domain; it is a doctrine that has never been enforced. The risk in restating it is producing a second aspirational document, which is why the central commitment below is a mechanical test rather than a sentence.

## Decision

**The principle is restated, once, to govern all of Layline's data: never overwrite what a source gave you. Derive alongside it, and carry the provenance of both.**

"Raw" is retired as the standard, because it makes a claim about instrument data that is false. What replaces it is **as-recorded, with its provenance stated**. The rule is not narrowed to weather, and it is not weakened; its subject changes from the rawness of a number to the non-destruction of it.

Six specific rulings follow.

**1. A Recording is transcribed into the database completely and verbatim.** Every column, every row, including the three `(calc)` columns that carry no independent information. The commitment is a test, not a comment: re-parsing the stored bytes reproduces the stored rows exactly, and that round-trip is checked against all thirteen real recordings.

**2. Only a column that is a pure function of its own row may be added to the transcription.** `water_referenced` (`STW IS NOT NULL AND CTW IS NOT NULL`) qualifies: it makes no new truth claim and cannot drift. `STATUS` does not, because it depends on `SOG_THRESHOLD` and a maneuver-window span that live outside the row and are not yet settled. This is the line, and it is sharper than "derived versus not".

**3. Annotations are stored as dated entries on the Race, never copied onto rows.** Sail Configuration and Sea State are neither measurements nor derivations — a person remembered them and typed them in. They are held once, as one ordered list per kind whose first entry sits at the race start, and resolved onto rows by time when read. (Per ADR 0010, that first clause is a data-entry convention, not a rule to enforce; resolution is the latest entry at or before the row's time, falling back to the earliest.)

**4. Nothing corrected is ever stored.** No corrected column, and no correction factor applied on read. A **Measured Offset** is computed when someone looks at a Race, displayed as what it is — the residual still present after the display's **Programmed Offset** — and never written back into any stored value.

**5. Where two columns describe the same quantity, the spec names one authoritative and the other is stored but never read.** For true wind angle that is plain `TWA`: it is what the instrument chain produced and what the software itself trusted when synthesising apparent wind, whereas `TWA (calc)` is `wrap(TWD − CTW)` and inherits the fluxgate's deviation. They disagree in sign on 19 of 5,344 rows with outliers to 158°, and tack detection keys on that sign. Apparent wind has no authoritative alternative — `(calc)` is all that exists — so any display of it must be labelled derived, or a sailor will read it as what the masthead said.

**6. Provenance is data, not copy.** Each column of the Recording format carries one provenance — Measured, Computed, or Position-Derived — held once as reference data about the format. A Race renders a single generated provenance line rather than a badge per number, and rows that are not water-referenced are visually distinct wherever wind is plotted, because those are not a caveat on a measurement but a different measurement.

### Rejected alternatives

- **Apply the rule verbatim.** Not merely awkward — incoherent. It requires storing a raw wind measurement that the export format destroyed before we ever saw the file.
- **Narrow the rule to weather data, and govern instruments separately.** Keeps the wording true at the cost of the reasoning. The stated *why* — that sailors trust original source data and hiding the interpretation layer breaks that trust — transfers to instrument data completely. Two rules would also drift, and the honesty convention would be maintained in two places by whoever touched one last.
- **Drop the redundant `(calc)` columns on transcription**, as the format research recommended, since they are algebraically derivable from columns we already store. Rejected because "copy the file completely" is mechanically testable and "drop what is redundant" is a judgement that decays: the next person meets a column that is *nearly* redundant. A pipeline in the prior art already proves the point — `clean_recordings.py` reads the CSV without `keep_default_na=False`, so pandas silently converted the literal string `"None"` in `ALARM` to empty in every one of 6,337 rows. Nobody decided that; a default did, and only a round-trip check catches it.
- **Store a correction factor and apply it on read.** Cheaper than a corrected column and wrong in the same way: the number a sailor sees is not the number the boat recorded, and the difference is invisible at the point of use.

## Consequences

- Any cleaned or corrected view of a Recording costs a computation or a join. At 4,088 in-window rows for the entire archive this is free, and if cross-race queries later need speed that is a materialised view over the truth, not a change to it.
- Effort 2 may revise `SOG_THRESHOLD`, the maneuver window span, the 45° suppression floor, and the Polar Efficiency numerator without rewriting a single stored row. This is the main practical payoff.
- Correcting a mistyped sail-change time edits one annotation entry rather than re-deriving several hundred rows. The open question of how an admin amends an annotation after upload gets materially easier — **now settled by ADR 0010**, which generalises it: everything on a Race except the Transcription is Testimony, and all of it is editable in place.
- The parsed rows are not a superset of the raw file in any useful sense — they are the file. The prior art's `cleaned-recordings/` was lossy in two directions at once (rows deleted, `ALARM` emptied); Layline's transcription is lossy in neither.
- `STATUS` does not exist in effort 1. Marking rows `low-speed` or `maneuver` is cleaning, and cleaning belongs to the analysis effort; when it arrives it may not sit on the transcription. **Refined by ADR 0009**: the column never exists, but the *quality* half of the cleaning is computed at read in effort 1, because a dropout makes a recording misleading rather than merely unrefined. Maneuver marking does wait for the analysis effort.
- No provenance field is needed on an annotation. Every annotation is hand-entered, so a `source: 'auto' | 'manual'` distinction has nothing to distinguish, and the mockup's "Auto-matched to wind readings — nothing to fill in" is removed rather than implemented.
- `twa`/`tws` are not stored on a sail-change entry, though the mockup puts them there. They are already in the recording at that timestamp; the Crossover Chart comparison reads them from the row.

### Pre-existing violations on the weather side

The restated principle binds boat data as of this decision. The weather ingest predates it and does not comply. These are recorded so the rule is not read as decorative, and are **not scheduled by this effort** — they are app-code defects, and this map produces a spec:

- `services/buoys/ndbc.ts:395` — `dir: row.wind_direction ?? 0` renders a missing wind direction as 0°, due north, plotted and colour-coded as a real reading. Line 385 filters null speeds and does not filter null directions, so it is reachable. This is `core-beliefs.md`'s own "never do this" example, in shipped code.
- `services/buoys/ndbc.ts:243` converts m/s to knots in place and discards the source value; `ndbc.ts:313-314` rounds speed and direction *before* caching, so no consumer can recover source precision. The fields are annotated `// knots (raw, unmodified)` at `types/index.ts:31-32`; that comment is false. Note the Purdue path does it correctly — metric as received in `purdue_buoy_readings`, converted at read — so the correct pattern already ships in this repo.
- `components/dashboard/SummaryBar.tsx:21-32` averages CHII2 at 85 ft with Purdue at surface into the single headline wind speed, then uses the result to select the wind condition band. A blanket adjustment, unannotated, in the first number a sailor reads.
- The 20-30% elevation caveat is hardcoded in three places and self-contradictory: `services/buoys/ndbc.ts:29` says 85 ft reads 20-30% *higher than surface*, `components/dashboard/TabbedInfoPanel.tsx:260` says surface is 20-30% *lower* than 85 ft. Those are different claims, neither derived from `windMeasurementHeight`, and the note renders on one tab of one page while five other components show CHII2 figures uncaveated.
