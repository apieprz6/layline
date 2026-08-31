# ADR 0005: Instrument Calibration as a Versioned Artifact Plus an Event Log

## Status

Accepted

## Context

While charting the boat-configuration effort, instrument calibration was ruled to be an **append-only event log and explicitly not a settings editor**. The reasoning was sound at the time: the prior art in the Handsome-Pete repo is a single-entry YAML file recording one dated action with no value —

```yaml
- date: '2026-07-04'
  type: autocompensation
```

— and the mockup's calibration screen was a live control surface with six ± steppers, a "Push to instruments?" banner, and a fake filename (`BG_H5000.cal`) naming hardware this boat does not have. Since Layline cannot reach the instruments from a web app, and since calibration *values* were believed to be derived by analysis scripts rather than stored, an event log looked like the whole truth.

Two things turned out to be wrong.

**The stepper fields were not invented.** Only the B&G branding was. The boat's TL-25 display is exactly where per-channel corrections are programmed, and they take the form `y = mx + b`: a multiplier and an offset. `AWA` and the compass have an offset only; `AWS` and the paddlewheel have both. That is the mockup's field set, including its "added after correction" ordering.

**Calibration therefore has a current value.** A channel with a programmed `m` and `b` can be asked "what is it set to right now", and the answer matters: those numbers change what every subsequent recording contains. An event log with no current pointer structurally cannot answer it, and folding the log to reconstruct per-channel state is the same problem in a worse shape.

Meanwhile the valueless dated acts are real and are not going away. A compass autocompensation rebuilds an internal deviation curve; nobody types a number, and no coefficient changes. The existing archive contains exactly one such event, and it moved the measured compass error from about +13° to about +3° — visible across the season's recordings, and consequential because true wind direction is computed from the compass.

Options considered:

- **One event log**, where an event optionally carries the coefficient it set, and "current" means the latest event naming that channel.
- **Two shapes**: a versioned artifact for the coefficients, and a log for the valueless acts.
- **Settings only**, treating an autocompensation as a version with a note and no numeric change.

## Decision

Model calibration as **two shapes**, with the log presented as a view over both.

### Instrument Calibration — a versioned Boat Setup artifact

The fifth member of Boat Setup, alongside the Polar, Crossover Chart, Sail Definitions and Rig Tune. Numbers typed into a form off the display's own screens, exactly as a Rig Tune is typed off the dock.

| Calibration Channel | multiplier | Programmed Offset |
| ------------------- | ---------- | ----------------- |
| `AWA`               | —          | degrees           |
| `AWS`               | e.g. `1.02`| knots             |
| `STW`               | e.g. `1.02`| knots             |
| `HDG`               | —          | degrees           |

- Applied as `multiplier × reading + offset`.
- Stored in the encoding the display shows — a multiplier (`1.02`), never a percent — and offsets in each channel's own unit. These are transcriptions; a converted number would not match the number on the boat.
- `HDG`'s Programmed Offset stacks on top of the compass's autocompensation deviation table. The two are independent, so both can move the heading.
- A **Version** snapshots all channels at once. Changing one value mints a Version carrying the rest unchanged.
- A Version carries `effective_from` (date-only, sailor-supplied — when the numbers went into the instrument) and a recorded-at timestamp (when they were typed into Layline). The former is what a Race joins on.
- A Version may carry an optional note. "After bottom paint" is information the diff cannot reconstruct; "changed the offset" is not, so the note is not required.
- Form validation warns outside expected ranges but never blocks. A hard block would be Layline telling the boat its own display is wrong.

### Calibration Log — a read-time projection

Not a table. One timeline assembled by merging hand-authored **Calibration Events** with Instrument Calibration Versions, each Version rendered as a computed diff plus its note. No fact is stored twice, so no two representations of one change can disagree.

A **Calibration Event** is:

- a date-only date;
- a type of `autocompensation` or `other`;
- a non-empty set of Calibration Channels it was performed on;
- a required free-text note.

`autocompensation` is constrained to `{HDG}` — it is a compass operation by definition. Everything else is `other` plus the note: a paddlewheel replaced or cleaned, a masthead unit swapped or re-aligned, a smoothing setting changed in the navigation software. No value field, and no author field: one boat, one writer, and a note that can name a rigger in words if one ever does the work.

### Freezing, and the absent case

A Race freezes a **nullable** pointer to the Instrument Calibration Version in force when it was sailed. Null means *not recorded*. Seeding the eleven existing races involves entering coefficients from memory, and where memory fails the pointer is left empty rather than backdated to a guess — a fabricated Version would read as fact forever, and this dataset has already been caught out once by an unrecorded change.

Where an event's date falls inside a race's calendar span, before/after resolves to **unknown** rather than a guess. This has not yet occurred — the one existing event sits in an 18-day gap between recordings — but the archive contains an overnight race spanning two calendar dates, so it is reachable.

### Corrections

Both Versions and Log entries are editable in place. Strict immutability would leave a mistyped coefficient standing permanently as what the boat ran, with every Race pointing at it reporting against a figure that never existed. Editing a Version's values must warn that it changes what those Races report.

### Channel propagation is not modelled

An event names only what was acted on. A heading event reaches the wind columns too, because true wind direction is computed from the compass, but that propagation is a fixed property of the recording format — documented in `docs/research/qtvlm-csv-columns.md` — and identical for every heading event. Storing it per event would store a constant repeatedly and invite one row to disagree with the format. It is also not uniform: recordings whose through-water speed is blank have their wind computed from GPS instead, so a heading event reaches different columns for those rows. That conditionality belongs in the analysis layer.

## Consequences

- Boat Setup grows from four members to five. `CONTEXT.md` amended accordingly, along with the Calibration Log and Measured Offset definitions.
- Three new terms: **Instrument Calibration**, **Calibration Channel**, **Programmed Offset**. The last exists to break a genuine collision — the figure a person programs and the figure the analysis derives are both "offsets" and are never the same number.
- Because the display corrects a reading before it is recorded, a **Measured Offset** is a *residual* — what is left after the Programmed Offset, not the whole error. Any analysis that treats it as absolute is wrong, and the honesty annotation this implies feeds the raw-vs-derived question.
- The mockup's `CAL_FIELDS` steppers survive as the edit form. Its "Push to instruments?" banner, its Download action, its version-history-with-uploader, and its fake filename do not. Its derived `CAL_CHECKS` and `CAL_TRENDS` are Measured Offsets and belong to the analysis effort.
- The Version history and the Log are the same list, so the detail screen renders one timeline, not two.
- `Version` is documented as immutable, and this creates a scoped exception for calibration corrections. The schema work must reconcile that rather than inherit a contradiction.
- The archive's single existing event — the 2026-07-04 compass autocompensation — is hand-entered against `{HDG}` during seeding.
