# ADR 0009: Upload Quality Gates, and Row Quality as a Computed View

## Status

Accepted. Refines ruling 2 of `docs/adr/0008-provenance-not-rawness-for-instrument-data.md` — upholding the ruling, settling *when* the cleaned view is computed. Consumed by the schema and by the upload flow.

## Context

Layline is about to accept uploaded recordings from a sailor rather than from a script. Nine hazards were catalogued from the format research, all of them documented or measured rather than hypothetical, and the question was what each one does at upload: refuse, block, warn, or note.

Three of the nine were already answered elsewhere, and answering them properly is most of this ADR's value.

**The archive grew while this was being decided, and that is the substance rather than a footnote.** It now holds thirteen recordings, 6,337 rows, 4,088 of them inside a race window. Two of those recordings arrived after the format research, and one of them broke the model the gates were being designed around.

`09-04-2026-chicago-st-joe` is the longest race in the archive by a factor of two and a half: 18:50 on 4 September to 08:30 on 5 September, 13.68 hours, 1,636 in-window rows. **815 of them — 49.8% — are fabricated.** When the boat's data feed dies, the navigation software does not stop recording; it keeps writing on schedule with the last known fix repeated verbatim, because position is sticky state it needs in order to draw the boat, while instrument channels expire on a validity timeout and log as blank. The timeline has no gap. Half of that race looked exactly like data.

The prior art now detects this and marks the rows, with an ADR behind it (`Handsome-Pete/docs/adr/0002-dropout-detection.md`) that validates zero false positives across 4,051 transitions and reasons carefully about a bobbing boat. Three measurements from this archive establish that the condition needs its own test and cannot be folded into an existing one:

- **855 of the 869 frozen rows sit at `SOG` of 2 knots or more.** The feed latched at a sailing speed, so a minimum-speed gate flags almost none of them. On the St Joe race it flags none at all.
- **`water_referenced` cannot stand in either**, and this matters because it is the one column ADR 0008 ruling 2 permits on a Transcription. It agrees on most frozen rows only incidentally — 845 of 869 — misses the frozen-but-live rows entirely (69 of them on `06-20-26-chi-wauk`), and undercounts the start of every dropout block by one row, because each block opens with a verbatim duplicate that still carries live instrument data.
- **Windowing hides dropouts rather than catching them.** `09-02-2026-beer-can` is 53.1% frozen across its full 275 rows and 0% frozen inside its race window, because the freeze happens to fall after the finish. That file has passed through the pipeline looking clean.

The hazard the gates were originally most worried about turned out to be the smallest. Implausible sensor values exist — `TWS` of 3249.7 and 3062.3 knots on `06-06-26-nood` — but they sit at 11:07 and 11:08, and that race's window opens at 11:45. **There are zero implausible values inside any race window in the entire archive.**

Two further findings bear on gates that were expected to be strict. The date-ordering ambiguity is real but self-solving: `MM/DD` versus `DD/MM` is a qtVlm *installation* setting rather than a per-file one, and **6 of 13 files contain a date component above 12**, which proves month-first for the installation and therefore for all thirteen. And `POL == 0` at non-zero `TWS` — which the format research recorded as absent from this archive — is in fact present in **22 rows across 8 files**; the ruling is unaffected only because ADR 0006 already established that Layline never reads `POL`.

## Decision

### Four outcomes, and rejection is nearly always wrong

A gate resolves to one of four things, and the fourth is what most hazards get:

1. **Reject** — there is nothing to store and no override. Only for a file that cannot be parsed into rows at all, or that has no `Date` or position.
2. **Block pending input** — the upload waits for a fact only the sailor holds. Only for a race window that is impossible (start at or after finish) or that does not intersect the data at all.
3. **Warn and confirm** — the upload proceeds, and the fact that it proceeded is recorded. Reserved for duplicate content against an existing race, since re-uploading is legitimate when the first attempt was annotated wrong.
4. **Note** — recomputed on every read and shown on the race page forever. Everything else.

**A recording is never rejected for being poor.** The St Joe race is half fabrication and it is also a real race the sailor sailed, whose 821 live rows are the only record of it that will ever exist. Nothing about its quality is a reason to refuse the file; everything about its quality is a reason to say so loudly on the page.

### Row Quality is computed at read, not stored

Cleaning happens in the first release — a race page that plots a frozen two-hour tail as a stationary boat is lying — but it happens as a projection over the Transcription rather than as columns on it. ADR 0008 ruling 2 stands unamended: only a pure function of a row's own values may be added, and `water_referenced` remains the only such column.

**Row Quality** has three states and they are three separate tests, not levels of one:

- **Frozen** — inside a **Dropout**. Detected by a run of at least two rows whose latitude, longitude, `COG` and `SOG` are all identical to the previous row. This state invalidates every other claim about the row, so it is evaluated first and never overwritten.
- **Not Water-Referenced** — `STW` or `CTW` absent, so the wind columns were computed from GPS and mean something different from their neighbours. Read from the stored column.
- **Low-Speed** — `SOG` below 2 knots. Gated on `SOG` rather than `STW` because GPS speed is verifiable while paddlewheel calibration varies between sessions.

**Gap Seconds** is computed alongside: elapsed time since the previous non-Frozen row. Anything computing a row-to-row rate must read it, or a two-hour dropout reads as one ordinary sampling interval.

**Detection runs over the whole Transcription, and the window is applied afterwards.** This is what makes the `09-02` case detectable, and it is measurably more correct on two further recordings — `06-20-26-chi-wauk` gains a frozen row whose first in-window sample genuinely is a repeat of the row before the start.

### Row Quality and maneuvers are two axes, never one field

The prior art carries `valid` / `stale` / `low-speed` / `tack` / `gybe` in a single `STATUS` column. For the frozen state that collapse is correct and reasoned: a frozen row's values are fabricated, so calling it a tack would be a claim about fiction. For the rest it is an accident of assignment order, and **34 rows across 5 recordings are both low-speed and inside a maneuver window, keeping only the low-speed marker** — which are precisely the rows a comparison of tack cost across setups would want.

Layline computes quality and maneuvers independently. Only quality is computed in the first release; maneuver detection belongs to the analysis effort, which inherits an independent predicate rather than a slot in a column.

### The remaining gates

- **Date ordering.** Assume month-first. The sailor's race window must intersect the parsed range, which is a free cross-check rather than the disambiguator; failure blocks pending input. Store the `Date` string verbatim, the resolved timestamp, and the ordering chosen, so a wrong reading is fixable without re-uploading.
- **Delimiter and decimal separator** are sniffed independently, because a real vendor export uses semicolons with comma decimals.
- **Unknown columns** are typed and queryable where recognised, kept in an `extra` map where not, and the header is stored in its original order per recording so the round-trip test can reassemble the line. `RPM` already appeared mid-season; `DPH` and `HEEL` are valid channels that have not yet.
- **`POL == 0`** needs no gate. ADR 0006 established that Layline never reads `POL`, and ADR 0008 forbids storing anything corrected, so the 22 affected rows are transcribed as they are and ignored as everything in that column is.
- **A window overrunning the data** is a note and never a block: `08-22-26-glr`'s annotated finish is 1,155 seconds after its last row, and it is a legitimate race.
- **Too few rows** is a note with no invented floor. `09-02-2026-beer-can` has 42 in-window rows and is a real race.
- **Format and cadence properties** — column set, row count, cadence, largest gap, dead channels, dropout fraction and longest block — extend the single generated provenance line ADR 0008 ruling 6 already specifies, rather than inventing a second warnings surface. Cadence is per recording because it varies: `06-20-26-chi-wauk`'s median in-window interval is 75 seconds, not 30, and it contains a 3,352-second hole.
- **A simulated-data check is not built.** It would need the analysis effort's Target Speed to compute, there is one uploader who knows whether a file is simulated, and a simulated race announces itself as a flat 100% Polar Efficiency the moment that effort ships.

### Rejected alternatives

- **Store `STATUS` as a column, amending ADR 0008.** The detector's rulings changed for 829 rows in a single upstream commit — 815 on St Joe, 14 reclassified on chi-wauk. Stored, every one of those is a migration; computed, it is a redeploy. Recomputation over 4,088 in-window rows is free, and the constants are a first guess at values that will move.
- **Substitute `water_referenced` for dropout detection**, avoiding cross-row computation entirely. Tested upstream and rejected there on measurements this archive reproduces: it misses frozen-but-live rows and undercounts every block's first row.
- **Reject a recording above some dropout fraction.** Discards the only record of a race that was sailed. The failure mode worth preventing is a 50%-fabricated race that *looks* complete, and that is a display problem.
- **Clip to the race window before detecting, as the prior art does.** Cheaper and strictly worse: it is what has been hiding `09-02`'s 146 frozen rows.
- **Carry the prior art's `stale` as the marker name.** `Stale` is already a Layline term for cached weather 30-120 minutes old, rendered on screen today. Both can appear in one session, and one is about the age of a fetch while the other is about whether a number was ever measured.
- **Build the plausibility gate now.** Zero in-window occurrences archive-wide, so it would ship untested against real data. The two known garbage rows are transcribed like everything else and fall outside every window.

## Consequences

- The schema inherits two stored fields from this decision, not a bag of quality flags: the date ordering chosen and a content hash. Row Quality and Gap Seconds are functions, and the detector needs a version identifier so a race page can state which rules produced what it is showing.
- The upload flow's Review step, which promised "any parse warnings" without saying what they were, renders notes rather than warnings almost everywhere. There are exactly two blocking conditions and one confirmation.
- Effort 1 bakes in two constants, both computed and therefore both revisable without touching a row: the 2-knot speed gate and the two-row minimum dropout run. The upstream `STALE_WARN_FRACTION` threshold is not needed, because a dropout fraction is always a note and the figure is shown rather than compared.
- Seeding the archive re-uploads thirteen recordings rather than eleven, and every one passes. Two will carry prominent dropout notes.
- A recording is not required to be water-referenced, low-speed-free, or dropout-free to be stored, displayed, or annotated. The analysis effort decides what its metrics exclude; that exclusion policy is not settled here, and leaving it unstated would silently change every number.

### Carried to the analysis effort

Measured while resolving this, and not acted on:

- The maneuver window span is unsettled: the upstream code marks a 3-point span (1 before, 1 after the sign flip) while its own glossary documents 4 (1 before, 3 after). The stated rationale — data is unreliable while the boat is "turning and recovering speed" — favours the asymmetric version, since 30 seconds is enough for the turn and not for a keelboat to rebuild speed. The difference is 263 rows against 415.
- **Classifying every true-wind-angle sign flip as a tack or a gybe is wrong for 16% of them.** Of 94 in-window flips, 51 are unambiguously tacks and 28 unambiguously gybes, but 15 cross the entire wind range within one 30-second sample. Those are mark roundings, and the split between them is arbitrary: −154° → +4° averages 79 and is called a tack, +28° → −163° averages 95.5 and is called a gybe. They are the same event. Putting roundings into a tack-cost population poisons it, since the speed lost rounding a leeward mark says nothing about tacking technique. This is worth sending back upstream, where it affects polar analysis today.
- Whether any metric excludes Low-Speed or in-maneuver rows is still unstated. The pipeline marks them; nothing says the analysis skips them.
