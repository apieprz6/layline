# ADR 0025: Low-Speed and Maneuver Rows Are Excluded From Every Performance Metric

## Status

Accepted. Resolves the item ADR 0009 carried forward and left open: "Whether any metric excludes
Low-Speed or in-maneuver rows is still unstated. The pipeline marks them; nothing says the analysis
skips them." Builds on ADR 0009's **Row Quality** and the maneuver spec in
`docs/research/lay-140-maneuver-detection.md` (LAY-140).

## Context

Effort 2 (`docs/design-docs`/LAY-138) adds four things that read **Recording Rows** and turn them into
a performance number: **Polar Efficiency** / **VMG Efficiency**, the Sail Selection Chart's per-cell
percent-of-target and coverage count, three Instrument Tuning checks (compass-vs-COG, AWA symmetry,
paddlewheel-vs-SOG), and the per-Race GPS-track heatmap. Every one of them can read a **Low-Speed** row
or a row inside a **Maneuver Window**, and until now nothing said whether it should. **Frozen** rows
were already settled by ADR 0009 — fabricated, so no metric may read them — and are not open here.

Left unstated, each of the four was free to pick its own answer, silently, and disagree with the
others. A Sail Selection Chart cell that counts Low-Speed rows and a Polar Efficiency number that
doesn't would show two different pictures of the same race with no way for a sailor to know why.

## Decision

**A single rule for all four.** A row counts toward a performance metric unless it is **Low-Speed** or
inside a **Maneuver Window** (tack, gybe, or rounding — undifferentiated for this purpose; LAY-140's
three-way split exists to keep roundings out of a tack/gybe *cost* population, which is a different
question from whether a steady-state performance number should read the row at all). This applies
identically to Polar Efficiency, VMG Efficiency, the Sail Selection Chart's percent-of-target, and
every Instrument Tuning check. None of the four had a reason to diverge: all four are averages or
buckets of steady-state boat performance, and a boat that is parked or mid-turn is not in a state any
of them are measuring.

**Exclusion is a hard filter on the number, a visible note wherever there's room.** An excluded row
never enters an average or a chart cell — there is no ambiguity here worth preserving the way Frozen
fabrication was. But per ADR 0009's "note, never hide" precedent, any screen with room for a count
shows how many rows it excluded: the Sail Selection Chart's coverage count, the heatmap's rendering
(below). Polar/VMG Efficiency's Overall-tab hero card has no room for a count and shows the filtered
number alone; the Polar performance detail screen, filterable and less space-constrained, is the
natural place for that count if a future ticket wants one — this ADR does not require it.

**The GPS-track heatmap renders the point, distinctly.** The heatmap is the one screen plotting
individual rows rather than an aggregate, and a Low-Speed or mid-maneuver point still has a real
position — the boat was there. Dropping it would leave a gap or a broken line where the boat sailed.
It renders on the track but styled as a distinct excluded state rather than color-coded by its
percent-of-target, which is the same value the other three screens have just agreed not to trust. Exact
styling is left to the screen's own prototype ticket; this ADR fixes only that it must be
distinguishable, never colored by the misleading percentage.

## Consequences

- `services/analysis/` needs one predicate, used by all four consumers, rather than four
  hand-rolled row filters that could drift apart the way this ADR exists to prevent.
- A Frozen row was already excluded from every maneuver window (LAY-140) and now composes cleanly with
  this rule: Frozen, Low-Speed and in-Maneuver-Window are three independent reasons a row fails to
  count, checked as one combined test.
- This is a computed exclusion, not a stored one — like Row Quality and the maneuver label themselves,
  changing the rule later is a redeploy, not a migration.

## Rejected alternatives

- **Let each screen decide.** The status quo this ADR exists to close — the risk was never a wrong
  answer, it was four unrelated ones.
- **Split maneuver exclusion by tack/gybe/rounding.** Considered because LAY-140 makes the distinction
  available, but none of the four screens compute maneuver *cost*, which is the only reason the
  distinction exists. Carrying it into this decision would add a knob nothing here needs.
- **Soft-flag instead of hard filter.** Would keep Low-Speed/maneuver rows in every average, caveated
  rather than excluded — but a Sail Selection Chart cell or a Polar Efficiency number is a single
  figure with no room to show a caveat inline, unlike the heatmap's per-point rendering. The exclusion
  has to happen before the number exists; the note is what has room to be soft.
