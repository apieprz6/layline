# ADR 0007: What a Rig Tune Records

## Status

Accepted

## Context

Rig Tune is the one Boat Setup artifact with no source file anywhere. No `.rig` exists in the Handsome-Pete archive, the mockup's four rows were invented (`0–8 kt / cap 46mm / lower 22mm`), and the design nonetheless presented the artifact as a file called `Wayward_Wind.rig` with both a Download and an Upload action. Decision 6 of the charting map established only that it is a real versioned artifact whose numbers are typed into a form rather than uploaded. Everything the form contains was open.

Two investigations settled the ground.

**The boat has a published tuning guide, under a name nobody was searching for.** The Beneteau First 10R is the same boat as the **First 34.7 / Beneteau 34.7** (Farr, 2005–2009, 125 hulls), so *North Sails France, "Beneteau First 34.7 Sails & Tuning Guide" (June 2006)* is Handsome Pete's own guide — confirmed by its rig dimensions (`P=12800, E=4450, IM=13170, J=3679 mm`). Its base settings read, verbatim:

```
Headstay swing mark: 1888 mm arc from tack black band on mast to headstay
J: 3670 mm from front of mast to headstay pin
Mast base: center hole
V1: 72 mm between turnbuckle threads
D1: 64 mm between turnbuckle threads
D2: 61 mm between turnbuckle threads
Pre-bend: 80 mm @ 50% using main halyard at tack
```

Its per-band table is headed `Quick adjsutements (full turns from base settings)` and covers eight bands — `0-5 | 6-8 | 8-12 (BASE) | 12-14 | 14-17 | 17-20 | 20-25 | +25` — as signed full turns for `HEADSTAY`, `V1`, `D1`, `D2`, alongside a `HEADSAILS` column. The `0-5 kt` `D1` cell prints as `1` with no minus sign, verified in the PDF's content stream; given `6-8 kt` reads `-1` this is the guide's own typo, and it is not inherited.

Three facts from that guide shaped the decision. **Turnbuckle gap in millimetres is a genuine published convention**, not a mockup invention — it is this guide's primary base spec, and North's 36.7 guide records it as separate `Port Gap =` / `Starboard Gap =` blanks per band per shroud. **The boat is a 9/10 fractional rig** — Sparcraft aluminium section, keel-stepped, two sets of swept spreaders at 20°, Dyform wire, adjustable backstay on tackle, no runners, checkstays or babystay — so it carries three shroud pairs: `V1` caps, `D1` lowers, `D2` intermediates. And **the headstay is the guide's dominant per-band adjustment**, swinging −6 to +12 turns where `V1` moves −1 to +1.

**Handsome Pete cannot use that adjustment.** The headstay turnbuckle is not easily reachable on this boat, and the owner's practice is to shift gears on the shrouds alone. That is published practice, not a compromise: Doyle's 36.7 guide is headed `DOYLE BASE SETTINGS - FOR RF HEADSTAY` and prints `N/A` in its Head Stay column for every band except base. The boat owner's ruling is that the form documents settings the crew can actually change, so headstay is excluded outright rather than carried as an unusable field.

The design was also rewritten while this decision was open, from a read-only four-row list into a per-band, per-shroud, per-side stepper editor with its own dirty → Revert/Save. That rewrite got the shape substantially right — three positions, port and starboard, numeric values with the unit rendered separately — and its remaining gaps are recorded below.

## Decision

### Shroud Positions only

A Rig Tune records **standing rigging the crew can adjust from the dock**, and nothing else.

| Shroud Position | Guide name | Function |
| --------------- | ---------- | -------- |
| `V1`            | Cap shroud | Mast tip and side bend |
| `D1`            | Lower      | Low-panel support, mast-bend restraint |
| `D2`            | Intermediate | Mid-panel side bend, mast-bend restraint |

Each is recorded **port and starboard separately**, as North does. Nothing else is modelled: no headstay in any form, no headstay tension or sag, no mast rake, no pre-bend, no mast butt position, no `ARC` or `J` reference. Running rigging — backstay, cunningham, outhaul, traveller — is trim, not tune, and stays on the weather side of the application as briefing output.

Naming follows the guide, not the mockup. The design's `Upper` / `Mid` / `Lower` map to `V1` / `D2` / `D1` respectively — note the crossing — and the guide's names are used so figures transcribe off the North card without a mapping step.

### Two encodings, both authoritative

Every band carries both:

| | Unit | How it is set | Authority |
| --- | --- | --- | --- |
| **Turnbuckle Gap** | mm, port and starboard | typed, caliper-measured | spec |
| **Turns From Base** | signed, 0.5 resolution | half-turn stepper | spec |

Neither is derived from the other and **no thread-pitch constant is stored**. This is not redundancy: Turns From Base is how the rig is re-geared at the dock without tools, and Turnbuckle Gap is how it is restored with a caliper when something has moved. Both are edited deliberately, and editing either is editing the standard. A useful side effect is that thread pitch becomes derivable from the boat's own recorded pairs rather than sourced from Sparcraft, which makes the triple self-checking.

### The Base Tune

One band is flagged as the **Base Tune**. It holds absolute Turnbuckle Gaps; every other band's Turns From Base is signed relative to it.

Base is **one of the heavier bands** — for Handsome Pete it is the tune set for the Race to Mackinac, chosen for heavy-ish all-round offshore conditions and then left in. It is therefore *not* the middle band, and not the guide's `8-12 kt`. Two consequences: most of the table runs negative, with the largest deltas at the light end, which is the mirror image of the guide's shape; and the base flag must be an explicit field. It may not be a positional index into the band list, and it may not be a magic key string — the design's `RIG_BANDS[1]` fallback and its `key:'base'` are both rejected, because reordering or renaming a band would silently move which tune the boat is measured from.

### Wind Bands are data on the Version

The wind axis belongs to whoever wrote the tuning guide, not to Layline. Band edges are stored on each Version, seeded by hand, and are free to differ from the display classification in `lib/utils/wind.ts`. Bands must be **contiguous** with an **open-ended top band**, because a Race records the band it was set to and a gap would leave a wind speed with no valid answer while an overlap would give two.

Three band schemes existed in the codebase and mockup for one boat, and the rig's own keys made it worse. `RIG_BANDS` keyed its bands `light` / `base` / `medium` / `heavy`, three of which collide with `classifyBin`'s return values while meaning different ranges — rig `medium` is 15–20 kt, which `classifyBin` calls `heavy`, and 9–14 kt has no `classifyBin` key at all. `rigValues[classifyBin(tws)]` therefore compiles, runs, and returns the wrong tune. **Those keys are forbidden.** A band is identified by its edges, not by a word shared with an unrelated classifier.

### Staleness when base moves

When the Base Tune's Turnbuckle Gaps change, every other band's gaps are **flagged stale**. They are not recomputed — that would need the pitch constant deliberately not stored, and would overwrite measurements with arithmetic — and they are not left silently wrong, because caliper recovery is the only thing those figures are for. Turns From Base survive a base change untouched; only the gaps go stale.

### Versioning

A **Version is the whole table**: every band, its edges, which band is base, and every value. Save mints one, timestamped, with a **required** change reason. The dirty → Revert/Save pattern stays table-wide, so the design's `rigDirty` whole-object diff is correct and its banner copy — "Unsaved tune changes in this band" — is the bug. Nothing is persisted as a draft, and Save is disabled when nothing has changed, so opening the form cannot mint a version.

The current pointer moves **forward only**. There is no restore action and no repointing to an earlier Version; changing a tune means hand-editing the values and saving a new Version. Past Versions must nonetheless be **readable**, because a Race freezes a pointer at one and that pointer is worthless if nobody can open it. The design has no way to view an older tune at all — its version rows are not clickable and the card always renders current values — so read-only viewing is new work.

A Rig Tune Version is immutable, with no correction exception. It is a measurement of the boat, not a transcription off a display, so the reasoning that made **Instrument Calibration** correctable in place (ADR 0005) does not apply here: a wrong Rig Tune is superseded by the right one.

### Notes

Two free-text fields, both editable, neither optional in the same way:

- A **per-band note** carries the reasoning — what this band is for and when to reach past it. This is where sea-state judgement lives ("looser in chop"), and it is the field an LLM would read.
- A **per-version change reason** is required on Save. It answers why the version exists, which a value diff cannot: a rigger re-measure and a typo fix look identical in the numbers.

`created_by` comes from auth, replacing the design's hardcoded `Uploaded by You`.

### Sea state is not a second axis

Sea state genuinely affects tune — UK Sailmakers: *"In flat water, you should err toward a tight rig… In choppy conditions, you need to err toward loose settings"* — and Doyle's guide logs `SEA` beside `TWS`. It is nonetheless **not** modelled as an axis. No published guide in this family tabulates it; every one handles it as prose. A wind × sea-state grid would be 16 cells before multiplying by position and side, for a table whose numbers already barely move. It lives in the per-band note, and if the archive ever reveals a consistent chop correction, it can be discovered from recorded races rather than guessed at now.

### Race linkage

A Race freezes `rig_tune_version_id` **and** records **which band the boat was set to**, chosen by the sailor during the upload wizard. The design records neither: its config summary reads `Polar v3 · Sail select v2 · Sail defs v1 · Instrument cal v4`, with rig absent.

The band is recorded rather than derived from the recording's own wind data, and it is **not validated against it**. The crew sets up for the forecast and the breeze does what it likes; the gap between the two is the interesting signal, not an error to correct at ingest. Flagging a mismatch belongs on the race page during analysis.

Following ADR 0005's treatment of the calibration pointer, the rig pointer is **nullable**, and the band is null with it. The eleven archived races were sailed before any Version existed, and a Version backdated to cover them would be a guess presented as a measurement.

### No seed

Version 1 is the boat's own Mac tune, measured with a caliper and entered by hand. The guide's `72 / 64 / 61 mm` are **not** seeded: they are a different base for a differently-tuned rig, and stored as v1 they would be indistinguishable from measurements — the same failure as the mockup's invented `46mm / 22mm` and the fictional `BG_H5000.cal`. The North card may appear as a collapsed reference panel, clearly marked as the guide's numbers.

### Not a file

Rig Tune has no filename, no Download and no Upload. The design's `Wayward_Wind.rig`, its `Download v2` and the list subtitle *"Upload a new version any time you refit"* all go; the artifact keeps its row on Boat management alongside the others, showing version and date. Upload suppression is already in place (`fileMeta.id !== 'rig'`); download is not.

## Consequences

- Five new terms in `CONTEXT.md` — **Shroud Position**, **Turnbuckle Gap**, **Turns From Base**, **Base Tune**, **Wind Band** — and the **Rig Tune** entry rewritten from one line to a real definition.
- The three-way wind-band conflict is resolved by separating concerns rather than picking a winner: `lib/utils/wind.ts` keeps owning display classification across the dashboard, and a Rig Tune owns its own axis as data. `classifyBin` is the mockup's and belongs to the analysis effort, where it must not be joined to rig bands.
- With the headstay excluded, the guide's remaining per-band spread is roughly one to three turns. The artifact's value therefore leans on the per-band notes and the per-race band record more than on the numbers — a near-flat table is mostly useful for proving what the boat was on when it went well.
- The redesigned form needs four changes: step in **half turns** rather than `RIG_STEP = 0.5` mm (a tenth of a turn, finer than the rig can be set by hand); rename positions to `V1` / `D1` / `D2`; fix the dirty banner to describe a table-wide diff; and make the mirror action bidirectional or drop it, since "Match sides" currently copies port onto starboard only and thereby asserts port is the truth.
- Read-only viewing of past Versions is new work, and is a prerequisite for the frozen Race pointer to mean anything.
- Two items are deferred, not dropped: renaming the shipped `RigRecommendation` card, which is labelled "Rig setup" — a phrase `CONTEXT.md` already lists under *Avoid* for this artifact — and feeding the current Rig Tune Version into the briefing prompt so trim advice can reference the boat's actual numbers. That card is currently hidden, so neither blocks this effort.
- Corrections to earlier working assumptions, recorded so they are not re-derived: cap shroud tension does **not** control headstay sag on this rig. Quantum's guide for the sister boat is explicit — *"On this rig the headstay is essentially controlled through the lower shrouds (D1) and diagonals (D2)"* — via stiffness rather than tension transfer, with `V1` governing side bend. And no guide in this family publishes a sag or tension target in any unit, so no field should be built expecting one to validate against.
