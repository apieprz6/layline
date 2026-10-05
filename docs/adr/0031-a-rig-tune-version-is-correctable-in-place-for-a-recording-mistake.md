# ADR 0031: A Rig Tune Version Is Correctable in Place for a Recording Mistake

## Status

Accepted. Decided for LAY-151 ("Correct a Rig Tune Version in place").

Supersedes one sentence of ADR 0007 — "A Rig Tune Version is immutable, with no correction exception" —
and nothing else in it. Extends the scoped exception ADR 0005 made for **Instrument Calibration**, and
the kind-dependent rule ADR 0011 lists ("only an Instrument Calibration may be corrected in place").

## Context

ADR 0007 refused Rig Tune the correction ADR 0005 gave calibration, on the ground that a Rig Tune is a
measurement of the boat rather than a transcription off a display: "a wrong Rig Tune is superseded by
the right one." The database enforces it — `enforce_version_immutability()` refuses every UPDATE of a
`rig_tune` Version — and the past-Version notice tells the sailor to "record the next Version — never
to edit this one."

That reasoning covers a measurement that was wrong. It does not cover the mistake that actually
happened: a **Wind Band** the owner tuned for and never entered. The caliper was right; the record is
incomplete. Superseding it is the wrong remedy, for the same reason ADR 0005 gave for calibration:

- Every **Race** already sailed under that Version points at it, and keeps pointing at it. A new
  Version fixes the future only; the Races that matter keep reporting against a table that was never
  the boat's.
- The workaround — mint v(n+1) with the same effective date, then amend each Race onto it — is a
  duplicate Version whose change reason is "forgot a band", plus one **Amendment** per Race, done by
  hand, for a mistake in typing.

A Rig Tune differs from a calibration in ways that shape *how* it is corrected, not *whether*:

| | Instrument Calibration | Rig Tune |
| --- | --- | --- |
| Content lives in | `payload` JSONB on the Version row | rows of `rig_tune_bands`; payload is `{}` |
| Races point at | the Version | the Version **and a band row** (`ON DELETE RESTRICT`) |
| State stored against the previous Version | none (the Log diff is read-time) | `gaps_stale` |
| Note | optional | required change reason |

## Decision

### What may be corrected, and why

A Rig Tune Version may be **corrected in place for a recording mistake**: a band left out, a figure
mistyped, the wrong effective date. A change to the rig itself — a re-measure, a re-gear, a new base —
is still a new Version. The test is the one ADR 0005 applies: *did the record ever say what the rig
was?* If not, it is corrected; if the rig moved, it is superseded.

Any Version may be corrected, not only the one in force, because the Races affected by a mistake are
the ones sailed under it. Admins only, as with calibration.

### The whole table, through the same editor

A correction may change everything a new Version can hold: add or remove bands, move edges, move the
**Base Tune**, edit **Turnbuckle Gaps**, **Turns From Base**, labels and per-band notes, the effective
date and the change reason. It is `RigTuneEditor` in a `correct` mode — as `CalibrationVersionForm` has
`mode: 'record' | 'correct'` — so a correction can never hold a field a new Version lacks, and the
table rules (contiguous, open-ended top band, exactly one base) bind both by construction.

A forgotten band cannot be fixed under any narrower scope: contiguity means adding one always moves a
neighbour's edge.

### Band identity is preserved

A band kept through a correction is updated in place and keeps its id; a band added is inserted; a band
removed is deleted. Identity matters because a Race records `rig_tune_band_id`:

- **Pointers are never moved.** A Race records the band the crew *chose* to set the rig to (ADR 0007:
  recorded, not derived, not validated). If a correction narrows that band so the Race's logged wind
  now falls outside it, the read-time `windBandFinding` note says so, and the sailor amends the Race if
  they disagree. Re-pointing Races by their logged TWS would overwrite a recorded choice with a guess,
  and do nothing at all for a Race that logged no wind.
- **A band a Race points at cannot be removed.** The save is refused, naming the Races to amend first.
  The foreign key already refuses the delete; the app says why before it gets that far.

### The date stays in order

A corrected effective date must fall within its neighbours' — on or after the previous Version's, on or
before the next one's. Which Version is in force on a date is answered by date (`versionInForceOn`),
and an out-of-order pair would make the upload and amend wizards' default ambiguous. The calibration
correction does not check this; bringing it in line is not part of this decision.

### Staleness is the sailor's statement, not a recomputation

`gaps_stale` is stored at mint by comparing the new Base Tune with the old one. A correction **does not
run that rule**, and never touches another Version's flags. Fixing a typo does not change what was
measured when, so the flags that record that stay as they were. Instead, correct mode shows each
non-base band's flag as a checkbox: bands kept carry their stored flag, bands added start unchecked, and
the sailor — the only one who knows whether a forgotten band's millimetres were taken against that base
— says so. Cascading a recomputation into later Versions was rejected: it would rewrite records the
correction was not about, from a rule built for a different event.

### The change reason and the history

The change reason is prefilled and stays required and editable; a correction normally leaves it alone,
because the Version still exists for the reason it always did. There is **no correction log**, as with
calibration: the row is overwritten, and `recorded_at` keeps meaning when the Version was first
entered. The form says plainly what that costs — "This changes v{n} itself rather than adding a
Version. The {k} Races sailed under it will report against the corrected table" — before the save.

### Enforcement

- `enforce_version_immutability()` lets a `rig_tune` Version change `note` and `effective_from`, and
  nothing else; its payload stays `{}`.
- `rig_tune_bands` gets a guard of its own. Today the claim that bands are immutable lives only in a
  column comment — RLS is `FOR ALL` for admins and no trigger stops an UPDATE — so the exception is
  opened deliberately, through a single `correct_rig_tune_version` RPC that writes the Version row and
  its bands in one transaction, rather than left open by accident.

## Consequences

- The **Version** entry in `CONTEXT.md` names two exceptions instead of one, and the **Amendment**
  entry's _Avoid_ note no longer reserves "correction" for calibration alone.
- The past-Version notice and the test asserting "offers no way to edit a past Version, even to an
  admin" are replaced; the migration and table comments calling Rig Tune immutable are rewritten.
- A correction can change what a Race's recorded band means. That is the point — the band the Race
  pointed at was wrong — but it is silent beyond the consequence copy and the mismatch note, and there
  is no record afterwards that it happened.
- Correcting vN's Base Tune leaves vN+1's stored stale flags as they were computed against the
  uncorrected base. This is accepted rather than cascaded; the sailor can correct vN+1 too.
- Polar and Crossover Chart remain immutable: a bad upload is re-uploaded, which ADR 0011 already
  covers.
