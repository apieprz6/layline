# ADR 0010: A Race Is Testimony Over an Immutable Transcription

## Status

Accepted. Builds on ADR 0008, whose read-time resolution ruling is this decision's premise, and settles a question that ADR 0008 named and left open.

Decided concurrently with **ADR 0009**, which owns what happens to a recording *at* upload while this one owns what happens to a Race *after* it. They overlap on two rulings — which windows are refused, and what a duplicate content hash does — and reached the same answer independently. Where they touch, ADR 0009 is the authority on the ingest gate and this ADR states only what the amendment path needs from it.

## Context

The upload wizard finishes and the sailor notices the finish time is wrong. What can be changed, and what happens to everything hanging off it?

ADR 0008 made this question much cheaper than it looked. An **Annotation** is one ordered list per kind on the **Race**, resolved onto **Recording Rows** by time when read, so correcting a mistyped sail-change time edits one entry rather than several hundred rows. The **Transcription** is verbatim and immutable, so no amendment can reach it. Nothing derived is stored, so nothing derived needs rewriting. What remained was the policy itself: which fields, with what audit, and what a second upload of the same file means.

Three things narrowed the answer.

**ADR 0008 had already drawn the line without naming it.** It introduced **Testimony** as a fourth provenance class — a value a person typed in from memory — and applied it to annotations. But every other field the wizard collects is Testimony by the same test: the race window is the sailor's claim about which rows are the race, the recorded **Wind Band** is what the crew remembers setting up for, and the frozen **Boat Setup** Version pointers are what somebody recalls being current. The only thing on a Race that a source gave us is the Transcription.

**There is no existing behaviour to preserve.** The mockup has no amend, edit, delete or re-upload affordance for a logged race anywhere: not on the race list, not on a race card, not on the analysis screen, no overflow menu, and no parameterised wizard mode — its wizard is hardcoded `New regatta`. The two `+ Add …` buttons in wizard steps 3 and 4 are the only handler-less buttons in the file. So this is a greenfield decision, and the design's silence is not a constraint.

**The archive says amendment is the normal case, not the exception.** It holds **thirteen** recordings, each with a hand-written `start`/`finish` in `metadata.yaml` and a 1:1 match between the two — no file without a window, no window without a file. Those windows are visibly estimates: **11 of the 13 have zero-second boundaries on both ends**, and six of the seven beer-can recordings start at exactly `19:00:00` (the seventh, `08-04-26-100-beer-can`, starts `18:50:00`). Only the two distance races carry an odd second anywhere. Two windows do not sit inside their own data — `08-22-26-glr` has a finish of `14:09:00` against a last row at `13:49:45`, 19.25 minutes past the end, and `06-26-26-chi-mi-chi` starts at its file's first timestamp to the second. And **six of the thirteen have no sail or sea-state annotation at all**, the same six on both kinds: everything from `06-03` through `07-01`, after which every recording is annotated. Any validation rule strict enough to look tidy fails on real races at seed time.

## Decision

**A Race is Testimony over an immutable Transcription. Nothing a source gave us is editable; everything a person said is.**

That sentence is the whole policy, and it is stated in ADR 0008's own vocabulary rather than as a second, parallel rule.

### What is editable

The race window (start and finish), every **Annotation** entry (add, edit, delete), the recorded **Wind Band**, every frozen **Boat Setup** Version pointer, and the title. All of it edited in place by an `admin`, with no change reason and no note.

A Race's **date is derived from its window start** rather than stored as its own field, so editing the window moves the date and the two cannot drift. The **title is optional free text and is never generated** — a sailor may type "Wednesday Night — Race 14" if that is what they call it, but Layline must not compose it, which is the constraint `AGENTS.md` already imposes about assumed schedules.

There is **no Venue field**, though the wizard collects one. Every Recording Row carries GPS, so a venue string is Testimony duplicating something Position-Derived and more trustworthy, and every race in the archive was sailed from the same club off the same circle. If a race is ever sailed elsewhere, the position data says so first.

**"Frozen" means the pointer does not follow the current Version** — a June race does not silently begin reporting against July's polar. It never meant a human cannot change it. ADR 0005 and ADR 0007 made those pointers nullable precisely so that seeding would not backdate a guess, which implies somebody fills one in later when they remember; write-once would turn a remembered guess into a permanent one, and filling in thirteen races' pointers from memory in a single sitting is exactly when a wrong one gets typed.

### What is not editable

The Transcription and the stored bytes. Ever, by anyone, through any path.

### No audit trail

Amending a Race records nothing beyond `updated_at`. No change reason, no note, no per-field history.

This is a deliberate asymmetry with **Rig Tune**, whose Versions require a change reason and a `created_by` (ADR 0007), and it has a principled basis rather than being the nearest pattern to hand: a Boat Setup Version is **pointed at by Races**, so editing one silently changes what other records report. Nothing points at a Race. Amending it changes only its own reading, and that reading is recomputed from scratch on every view. Against one boat and one admin — who is also the sailor whose memory is the source being corrected — a required reason field produces the string "typo" a dozen times, and a real audit trail is per-field history: schema and UI for a problem nobody has.

### Re-upload, duplicates and delete

A second upload of a file **always creates a new Race** and never replaces an existing one. Replacement has no constituency: a botched upload is almost always bad Testimony, which is now editable in place, so the only genuine reasons to upload again are the wrong file or an untrusted parse — both better served by deleting the Race and starting over than by a bespoke replace flow that must decide what happens to annotations already typed.

**Identical bytes produce their own Recording and Transcription.** This is chosen for simplicity over the alternative of extracting a Recording entity keyed by content hash and pointing many Races at it. The cost is roughly 700 duplicated rows, which the map already calls trivial, and the objection that two copies must be kept in agreement does not survive scrutiny: each Transcription is independently parsed from its own stored bytes, so ADR 0008's round-trip test holds per-Transcription and the two agree by construction. It also keeps `CONTEXT.md`'s relationship *a Recording contains exactly one Race* true, where the shared-entity model would have broken it.

**A duplicate is detected by hashing the uploaded bytes and produces an informational warning, never a refusal** — ADR 0009's *warn and confirm* outcome, which it reserves for exactly this one case. The hash is unambiguous on this archive: all thirteen digests differ, no two files share a single data row or a single timestamp, and the thirteen time spans are strictly sequential with no overlap at all. Nothing inside a CSV identifies the boat or the session, so the bytes are the only honest identity. The warning must be phrased for the legitimate case — a second race sailed from one recording — because that is a normal thing to be doing, not a near-miss:

> This recording is already logged as ⟨race⟩. Continue if this is a different race from the same file.

**Delete is allowed**, `admin` only, behind a confirmation, and takes the Race's annotations, its Transcription and its Storage object with it. The design's only destructive guard — the two-step `Confirm upload` on the artifact upload form — is the pattern to reuse.

**Nothing is written to the database until the wizard is submitted.** The wizard must parse the file at step 1 to validate it and populate the window, but the Race does not exist until step 5, so uploaded bytes land under a temporary Storage prefix and move to their permanent path on submit, where the Recording, Transcription and Race are written together. An abandoned wizard then leaves an object only under the temporary prefix — cleanable by a Storage lifecycle rule — and never an orphaned database row.

### One Recording may hold more than one Race

A recording of a regatta day plausibly contains two or three windward-leewards; `06-06-26-nood` and `06-07-26-nood` are the two days of one NOOD regatta with 131- and 163-minute windows. The prior art cannot adjudicate, because `metadata.yaml` permits exactly one `start`/`finish` per file, so a multi-race day was flattened before anybody wrote it down.

The ruling is that **a multi-race recording is uploaded once per race and annotated differently each time**. A Race stays one window with one set of annotations; what stops being true is that a *file* corresponds to one Race.

### What a window may be

Two hard refusals, and only two:

1. A finish at or before its start. That is not a window.
2. Zero Recording Rows inside the window. A Race with no rows has nothing to compute, nothing to plot and no coverage to state; the honest response is that the recording failed, not a Race with no data behind it.

These are ADR 0009's two *block pending input* outcomes, arrived at independently there and here. What this decision adds is that **they bind an amendment exactly as they bind an upload**: the window is editable, so the same two checks run when it is edited, and they are the only two that ever refuse. A validation rule that exists only in the wizard is a rule the amendment path can walk around.

Everything else is a **stated fact, never an ingest error** — including a window that extends past the end of the recording, which means what it says: *the recording dropped out before the race finished*. The Race page states its own coverage: the rows inside the window, their **Row Quality**, and the gap between the last row and the finish (*"recording ended 19 min before the finish"*). This matches ADR 0005's warn-don't-block stance, ADR 0007's ruling that a mismatch between the recorded band and the logged wind is a finding for the race page rather than an ingest error, and ADR 0009's finding that a recording is never rejected for being poor.

**There is no overlap check between the windows of two Races from the same file**, and no code for one. One boat cannot sail two races at once, so an overlap is always a mistake — but it is a harmless one, it cannot touch a Transcription, and a check exists only to tell a sailor something they can see.

### A window's timestamps carry no timezone

A Recording's `Date` column is `MM/DD/YYYY HH:MM:SS` with no offset, no `Z`, and nothing in the export or the navigation software's documentation settles which zone it is; 18:00–21:00 starts for weeknight races imply local. A window is a comparison against those timestamps, so it is **stored and compared in the recording's own naive wall-clock frame, with no conversion**, and a Recording is documented as carrying no timezone. Rendering it as Chicago local is a display decision, not a storage one. This is the only choice that cannot silently move a boundary.

### Annotations under an editable window

ADR 0008 says an annotation list is "one ordered list per kind whose first entry sits at the race start". That coupling is now between two independently editable things, and the archive shows it was mechanical rather than meaningful: every `sea_state` entry is timestamped identically to `start`, and `annotate_wizard.py:161` hardcodes the initial sail configuration's time to `start`.

Three rulings:

- **Every entry carries a timestamp**, uniformly. The first is not special.
- **Resolution is the latest entry at or before the row's time, falling back to the earliest entry.** The fallback is what makes an editable window safe: moving a start earlier than the first entry cannot produce an unannotated row, because the initial configuration honestly extends backwards — nobody changed sails, so what they started with applies.
- **Moving the window never rewrites an annotation timestamp.** Editing one field must not silently edit Testimony as a side effect, which is the one thing this decision exists to prevent.

ADR 0008's "first entry sits at the race start" is therefore a **convention at entry time, not an invariant**, and no code should enforce it.

### An empty annotation list means the race is not remembered

Six of the thirteen recordings have `sails: []` and `sea_state: []` — everything from `06-03` through `07-01`, and it is the same six on both kinds, so annotation is all-or-nothing per race rather than patchy within one. So an empty list is not an error state to be designed around: it is nearly half the archive, and it means **the sailor does not remember the race**, not that some default applied.

Consequently **no chip is pre-selected**, both annotation steps are skippable, and the Race page shows "not recorded" as visibly distinct from any recorded value. The mockup pre-selects by index — `i === 0` for `Main + Jib 1`, `i === 1` for `Slight (1–2 ft)` — and shipping that would record, for six races, that the boat started on main and jib-1 in slight chop, which nobody said. That is the same failure as `services/buoys/ndbc.ts:395`'s `wind_direction ?? 0`: a plausible value standing in for a missing one.

### The contract with the analysis effort

**Every derived figure is computed from a Race's current Testimony at read time. An amendment is immediately observable by everything. Any future cache is keyed on the Race's `updated_at`, and no derived value is ever stored against a Race.**

Stated as a commitment the analysis effort inherits rather than as an observation about today, because today's answer — nothing is stored, so nothing needs invalidating — stops being true the first time somebody adds a materialised view for cross-race aggregation, which ADR 0008 already anticipates.

### Two flows, not one

**Amendment is in-place field editing on the Race detail page, with no upload step anywhere in it.** Re-running a five-step wizard to fix a finish time would drag a file upload into an operation that must never touch the Transcription.

**Logging a second race from one recording is a fresh wizard run** with the same file dropped again. Under the simplicity ruling above there is no shared recording to offer and nothing to reuse, which is why the duplicate warning is worded as information: on this path it fires every time, correctly.

### Rejected alternatives

- **Freeze the window at upload and require delete-and-re-upload to change it.** The window is the amendment most worth protecting — it is a judgement that changes every number the analysis effort will compute. But it is also a remembered figure with no other holder of the truth to check against, wrong on the first pass often enough that the archive's own windows are round-numbered estimates. Freezing it protects no data, because the Transcription is unchanged either way; it only adds ceremony to the most likely correction.
- **Write-once Version pointers: null may be filled, non-null may not be re-pointed.** Tidy-looking, and it assumes the first non-null value is right. During a thirteen-race seed it will not be, and this turns a wrong guess into a permanent one — the exact failure ADR 0005 and ADR 0007 made the pointers nullable to avoid.
- **A required change reason on amendments, matching Rig Tune.** Consistency for its own sake, at the cost of friction that produces no information. The asymmetry is justified by who points at what, and is recorded here so it reads as chosen.
- **Extract a Recording entity keyed by content hash, with many Races pointing at it.** The more normalised model, and the one that stores the file and runs the round-trip test exactly once. Rejected on the owner's preference for simplicity: it adds a table, a foreign key and reference-counted deletion to save roughly 700 duplicated rows in an archive the map already calls trivially small, and it would have made `CONTEXT.md`'s Recording-to-Race relationship one-to-many.
- **Refuse a duplicate upload outright.** Wrong on the facts: legitimate re-uploads exist — a deleted Race being redone, a second race from one recording — and a hard block on a single-admin tool means editing the database by hand.
- **Require the window to sit inside the recording's own time span.** Fails on two of thirteen real races at seed time, and misreads a dropout as an error. The window is the sailor's claim about the race; the recording is a separate claim about what the instruments captured, and they are allowed to disagree.

## Consequences

- Two new terms in `CONTEXT.md` — **Race Window** and **Amendment** — with **Recording**, **Annotation** and **Provenance**'s Testimony class amended, since Testimony now covers everything on a Race that is not the Transcription.
- A Race detail page with editable fields is new work with no counterpart in the design, which offers only a back chevron on the analysis screen. Amendment is not a variant of the wizard and shares no UI with it.
- Four wizard defects follow from this decision and ADR 0007, all in the same two steps: the pre-selected sail and sea-state chips must go, both steps must be skippable, a **Wind Band** field must be added (the wizard collects none, though ADR 0007 requires a Race to record one), and the `Venue` field must go. Separately, the wizard's Boat Setup summary is a hardcoded string with no control that omits Rig Tune entirely, so version pointer selection is new work too.
- "Wave state" is the mockup's word at those steps; it is **Sea State** throughout, per the charting map.
- Delete is genuinely destructive and has no undo. The Transcription and the Storage object go with the Race, and re-creating it means re-uploading the file and re-typing every annotation. The confirmation is the only guard, which is proportionate for a single-admin tool but should not be omitted.
- Nothing here needs `STATUS`, a cleaning pipeline, or any derived value, so the amendment path can be built and tested before the analysis effort begins.
- **An amendment changes which rows a Race counts, and one recording shows how sharp that edge is.** `09-02-2026-beer-can.csv` ends in a **Dropout**: data rows 129 to 275 repeat one position, `COG` and `SOG` for 73 minutes on an unbroken 30-second cadence, and from row 131 onward all eleven wind and derived columns are empty while the stale fix keeps repeating — a latched GPS, not a boat sitting still. The annotated finish of `19:20:00` falls **20 seconds into that freeze**, so exactly one **Frozen** row is inside the window and the other 146 sit past the finish. The window is therefore honest today by 20 seconds. Push the finish 73 minutes later — an ordinary amendment, and a plausible one for a sailor who remembers finishing late — and 147 fabricated rows enter the window with nothing in the timestamps to betray them. This is precisely why the Race page states coverage as **Row Quality** rather than a row count, and why ADR 0009's decision to compute quality over the whole Transcription and *then* filter to the window is what makes an editable window safe. Nothing here needs the analysis effort.
- The charting map's earlier count of eleven recordings is superseded twice over; there are **thirteen**, each with a window in `metadata.yaml`, and the seed and its acceptance test are at least thirteen Races — more if any recording turns out to hold a second race.
- The archive never exercises the second hard refusal. Every one of the thirteen windows contains data, the leanest being `09-02-2026-beer-can` at 42 in-window rows, so *zero rows inside the window* is a guard against a future mistake rather than a rule with a precedent behind it. Worth knowing before someone deletes it as dead code.
