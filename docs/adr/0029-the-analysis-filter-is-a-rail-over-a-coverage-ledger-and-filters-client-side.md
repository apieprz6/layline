# ADR 0029: The Analysis Filter Is a Rail Over a Coverage Ledger, and Filters Client-Side

## Status

Accepted. Resolves LAY-144 ("Design the shared six-dimension filter UI and its missing-annotation
behavior"), the ticket ADR 0026 itself named as the place to find out whether `searchParams` navigation
"feels wrong on mobile".

**Amends ADR 0026** in three places, and nowhere else:

- its "Unknown is a selectable bucket, on by default" section keeps its mechanism and loses its name: the
  bucket is called **Not recorded**, and it gains a ledger switch above it;
- its "An Analysis Filter travels as URL `searchParams`; each screen's Server Component page calls its
  aggregation function directly" becomes: the filter is client state mirrored into `searchParams`, and
  aggregation runs in the browser after first paint;
- its deferral of bucket boundaries "to the screen-level prototype tickets" is discharged for all six
  dimensions.

Builds on ADR 0012 (absence renders as a legitimate answer), ADR 0014 (disabled-but-present), ADR 0023
(the Crossover Chart owns the only sail vocabulary), and ADR 0025 (Countable). [Prototype how the Sail Selection Chart visualizes matched race
data](https://linear.app/layline-sailing/issue/LAY-146), [Prototype the Instrument Tuning
screen](https://linear.app/layline-sailing/issue/LAY-147) and [Prototype the GPS track + polar-%-of-target
heatmap overlay](https://linear.app/layline-sailing/issue/LAY-148) are open and each owns its own
dimension registry under the rule set out below.

The three variants this decision was made against live on the throwaway branch
`prototype/lay-144-analysis-filter`, not in `main`.

## Context

The Claude Design mockup's Polar-performance screen carries a collapsible **Filters** panel: five rows of
chips, one row per dimension, single-select per row, sail chips derived from whatever sails appear in the
data, and three wind bands (`≤9` / `10–14` / `15+`). It does not show the date dimension as a chip, does
not show what a Race with no annotation looks like, and does not say whether the same control appears on
the other screens.

Three variants were built as a throwaway route and driven by the **real archive** rather than invented
data — the thirteen hand-entered Races, 3,251 **Recording Rows** carrying both TWS and TWA, and the eight
**Sail Definitions** from the boat's own `.saildef`. That grounding is what decided this, because the real
numbers are lopsided in ways invented ones are not:

- **1,593 rows — 49% of the archive — have no Sea State, and the same 1,593 have no Sail Configuration.**
  Six of thirteen Races were never annotated. "Not recorded" is therefore the **largest single bucket in
  two of the six dimensions**, larger than Calm (1,178) and larger than Main + Jib 1 (885). A treatment
  that buries it as a trailing chip in a collapsed panel understates the biggest thing in the archive.
- **Three Sail Definitions never appear** (Reef + Jib 2, Reef + Jib 3, Reef + Reaching Spin), and **Storm
  is one row in one Race**. A chip list derived from the data would silently shrink as the sailor
  narrowed, and the sailor could not tell "never sailed" from "filtered away".
- **A Sail Configuration can name no Sail Definition at all.** The 26 Aug Race flew mainsail alone, which
  the Crossover Chart has no word for (ADR 0023) — a real annotation with no vocabulary entry, 4 rows.
  "Sail used" therefore has three non-value states, not the one the ticket assumed.
- **The archive is one season** (3 Jun – 4 Sep 2026), so a season chip degenerates to a single chip.
  Months (Jun 1,481 rows / Jul 258 / Aug 646 / Sep 866) are the only chip granularity that earns its
  place today, and `when` is the one dimension whose buckets are derived from the archive rather than
  fixed.

## Decision

### The control is a rail that never hides, not a disclosure panel

One menu chip per dimension, reading its own current narrowing — `Wind speed: Any ⌄`, `Sea state: Calm ⌄`
— in a horizontally scrolling rail under the screen title. Tapping a chip opens a popover of that
dimension's buckets; nothing else moves, and the chart is never covered.

The rail never collapses. Its state is legible without opening anything, which is what a collapsed panel
cannot do: on a 390px screen the mockup's panel either eats the chart or hides what it is doing.

### A Coverage Ledger sits under the rail, permanently

It states what is matched — `3251 rows · 13 of 13 races` — and beneath it, what share of that rests on
rows with nothing written down: "Of those, 1,593 (49%) have no Sea state recorded."

Permanent, not a warning that appears when something looks wrong. Half this archive is unannotated; a
figure that only surfaces once a sailor narrows teaches nothing about the archive they are reasoning
about. This is the same instinct as ADR 0008's provenance rule applied to absence: state what the record
does not say, in place, every time.

### Missing annotations: one switch in the ledger, plus a per-dimension chip

**Default: included**, exactly as ADR 0026 decided. A filter nobody has touched shows everything.

- The ledger carries **"Include rows with nothing recorded"** — the everyday control, acting at once on
  every dimension that has a record bucket. Turning it off means: on each such dimension, select all the
  real values and none of the record ones.
- Each dimension's popover *also* carries its own **Not recorded** chip, so one gap can be isolated —
  "show me only the rows with no Sea State" is how a sailor audits what is worth going back and
  annotating.

The switch is **derived, never independent state**: it reads on, off, or mixed from the buckets currently
selected. Two controls over one piece of state, not two pieces of state — otherwise a per-dimension chip
and the switch could disagree, and the ledger would lie.

### The word is "Not recorded", never "Unknown"

The shipped UI already says **Not recorded** for an annotation nobody wrote, in one place:
`components/common/NotRecorded.tsx`, used by the Race detail view, the boat setup list, the rig tune and
calibration screens. Italic, `--text-muted`, dashed border, 135° hatch of `--surface-divider` — geometry
ADR 0012 requires and the LAY-95 prototype settled, deliberately unlike a zero, a dash or a skeleton. The
word and the geometry carry over; every colour stays a token, so night vision keeps working.

Never "Unknown", never "N/A", never an em dash, and never a zero. This renames ADR 0026's bucket and
CONTEXT.md's **Analysis Filter** entry; the mechanism they describe is untouched.

**The filter's chip is not that component, and must not become it.** `NotRecorded` is a Server Component
whose own comment says "nothing about an absence is interactive", and that stays true of it: it renders an
absent *value*. A filter chip is a control for selecting *rows that lack* a value — a different thing
wearing the same clothes. So the filter gets its own interactive chip that borrows the vocabulary and the
hatch, and the primitive keeps its stance. If the two ever need to drift apart visually, the chip is the
one that moves.

### "Sail used" has three non-value states

1. A **Sail Definition** from the Crossover Chart's vocabulary.
2. **Note only** — a Sail Configuration that names no Sail Definition. Not a data defect: ADR 0023 makes
   the Crossover Chart the only sail vocabulary, and a boat can fly something outside it (mainsail alone,
   4 rows). The chip footnote says so in as many words.
3. **Not recorded** — no Sail Configuration at all.

(2) and (3) both ride with the ledger switch, because both are statements about the record rather than
about a sail.

### Buckets are multi-select, and empty ones render disabled-but-present

This supersedes the mockup on two counts: its single-select-per-dimension (re-tap to clear, no "All"
chip), and its sail chips derived from the data.

- **Multi-select**, which ADR 0026 already presumes when it says "unless Unknown is also selected".
- **Every bucket in the vocabulary always renders.** Reef + Jib 2 with zero rows shows disabled, not
  absent — ADR 0014's rule, for its reason: a chip that vanished would not say why, and "this boat has a
  sail it has never raced" is worth seeing.
- **Every chip carries its row count**, computed with every *other* dimension applied but not its own, so
  the number predicts what tapping it does instead of describing what is already on screen.

### Wind speed uses the four bands `AGENTS.md` already defines

`Light (0–8 kt)` / `Medium (9–15 kt)` / `Heavy (16–22 kt)` / `Storm (23+ kt)`, per ADR 0026's instruction
to reuse them — not the mockup's three. Storm is a single row in this archive and still gets its chip.

### When: month chips over a Race timeline

No season chips while there is one season — a control whose vocabulary is one item is not a control. The
popover offers month chips as the shortcut, and below them the Races themselves: tap the first and last to
include. A continuous dimension gets a continuous control, and the Races are what a sailor actually
remembers ("the St Joe race", not "4 September").

Because these buckets are derived from the archive, a second season adds year grouping to the same
control rather than a different kind of control.

### The filter is client state, mirrored into `searchParams` with `replaceState`

- A tap **never navigates**. The filter lives in client state, so narrowing is instant.
- Every change is mirrored into the URL with `history.replaceState`, so a filtered view stays shareable,
  bookmarkable and reload-safe. ADR 0026's serialization survives; only its round-trip goes.
- **First paint still reads `searchParams` on the server**, so a shared link renders correctly before
  hydration, and the sanitising reader that drops bucket ids it does not recognise stays where it is.

The consequence for ADR 0026's three layers is real and is the price of this choice: **aggregation moves
into the browser.** The Server Component's job becomes read, resolve annotations onto rows, tag Countable,
ship once; row matching and the per-screen aggregations must be pure and isomorphic so the same functions
run on both sides. No `app/api/` route appears — there is still nothing to fetch.

This is a bet on payload size that has to be watched: 3,251 rows today, ten small fields each. If the
archive outgrows shipping a screen's rows, the retreat is back to `searchParams` navigation — the thing
this ADR just amended — and **not** an API route, which ADR 0026 rejected for reasons this decision does
not touch.

### One component, with a per-screen dimension registry

The same component on all three screens. Each screen declares which dimensions it offers, and the rule
for what it may leave out is: **a dimension whose values are the chart's own answer is omitted**, because
filtering by it narrows away the axis being read.

- **Polar performance**: all six.
- **Sail Selection Chart**: five — no "Sail used".
- **Instrument Tuning**: decided by [Prototype the Instrument Tuning
  screen](https://linear.app/layline-sailing/issue/LAY-147), which must also settle whether the `when`
  dimension survives at all there or is replaced by partitioning on Calibration era (ADR 0027).

Not three components sharing a vocabulary: one, so a new dimension is added once.

## Consequences

- `services/analysis/`'s row-matching primitive and its three aggregation functions must be free of
  server-only imports. That is a constraint on how they are written, not a change to what ADR 0026 says
  they do.
- Each screen's Server Component ships its row set to the client. Row payload shape becomes a thing to
  measure, and the ledger's own numbers are the cheapest early warning that an archive is growing.
- The ledger gives every screen a permanent, honest statement of how much of what is displayed rests on
  unannotated rows — and, incidentally, a standing nudge toward annotating the six Races nobody has.
- Two documents need the rename to **Not recorded**: ADR 0026's bucket section and CONTEXT.md's Analysis
  Filter entry. Both are edited by this ticket.

## Rejected alternatives

- **The mockup's disclosure panel, finished (prototype Variant A).** Six chip rows fitted 390px better
  than feared, but the panel is either open and pushing the chart off-screen, or closed and silent about
  what it is doing. Its "Not recorded" chip also sits last in its row, which is exactly backwards for the
  largest bucket in that row.
- **A bottom sheet with one dimension per drill-in (prototype Variant B).** Scales to any number of
  dimensions and batches its URL writes into one, but it hides the filter behind two taps, puts "Not
  recorded" below a scroll, and — fatally — makes the coverage figure something a sailor would have to go
  looking for.
- **Purely client-only, no URL at all.** What Variant C actually did, and the one thing about it not
  adopted: a filtered view that cannot be linked or survive a reload is a worse artifact to reason with,
  and `replaceState` costs nothing to keep.
- **`searchParams` navigation under the rail.** ADR 0026 as written. Rejected because a server round-trip
  per chip tap is what makes a six-dimension filter feel like paperwork on a phone — the concrete reason
  that ADR asked this ticket to look for.
- **Per-dimension "Not recorded" chips with no ledger switch.** Closest to ADR 0026's wording, but
  excluding unannotated rows then costs one tap per dimension, and half the archive is unannotated.
- **The ledger switch alone, with no per-dimension chip.** Simpler, but it removes the only way to ask
  which Races are missing which annotation.
- **Sail chips derived from the data, as the mockup does.** A vocabulary that changes size while you use
  it cannot be read, and it hides the three sails this boat owns but has never raced.
- **Single-select per dimension, as the mockup does.** Cannot express "Calm or Slight", which is most of
  what a sailor wants from a Sea State filter given how little of it was recorded.
