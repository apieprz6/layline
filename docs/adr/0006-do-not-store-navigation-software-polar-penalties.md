# ADR 0006: Do Not Store the Navigation Software's Polar Penalties

## Status

Accepted

## Context

The boat's navigation software applies percentage penalties to the Polar — separate figures for upwind, downwind, and night sailing. They are real, they are configurable, and they have moved: solving each recorded row for the wind speed that would produce its logged target speed gives a ratio of 1.000 for the season's four June recordings and 0.857-0.908 for the other seven. The coefficient behind that step lives in the software installation and appears in no exported file, which is why the logged target speed cannot be reproduced from the stored Polar for most of the archive.

Since Layline is absorbing the boat's configuration, storing these penalties looked obviously correct — and the natural home was a field on each Polar Version, so that a Race's frozen Polar pointer would reproduce its targets exactly.

Two things emerged from the boat owner that reverse this.

**The penalties are a planning hedge, not a description of the boat.** They exist for long offshore races, where the crew gets tired and trims less actively than it would around the buoys, and they are set pessimistically *on purpose* so that weather routing makes cautious decisions. They describe an expectation about crew fatigue, not the hull's capability.

**The hoped-for use was to derive them from race data** — to dial in a penalty from what the boat actually achieved, aiming for races to read close to 100% of polar.

That second idea is circular. If `Target = Polar × P`, and `P` is chosen so that `actual / Target ≈ 100%`, then Polar Efficiency reads approximately 100% for every race in perpetuity. The yardstick has been calibrated to the measurement, and the only number that was telling us something is destroyed.

The first fact is independently disqualifying. A deliberately lowered target means the boat scores *better* than it deserves, and a figure that flatters by construction is worse than no figure.

## Decision

**Layline does not store the navigation software's polar penalties, and never applies them.** Target Speed is always computed from the stored Polar as published.

The number the owner actually wanted already exists and is already named: **Polar Efficiency**, computed against the unpenalised Polar. "We sail at 91% of polar upwind in 12 knots" is that figure. It flows one way — Layline computes it, and a human types an informed penalty into the navigation software for the next offshore race. It never comes back in.

Rejected alternatives:

- **Store on the Polar Version and apply.** Flatters every result, for the reason above.
- **Store documentation-only, never computed with.** The single capability it buys is reproducing the software's own logged target speed, which Layline has already ruled it never reads. A stored number that nothing computes with is a number somebody eventually wires into a computation by mistake.

## Consequences

- The mid-season coefficient shift stays a documented historical curiosity in `docs/research/qtvlm-csv-columns.md`. Nothing Layline computes depends on it, so it stops being a threat to cross-race aggregation.
- A frozen Polar pointer reproduces Layline's targets exactly, but still does not reproduce the *navigation software's* logged targets. That gap is permanent and intentional.
- No schema change: no penalty fields on the Polar or its Versions.
- Polar Efficiency becomes an output worth surfacing per condition band, since it is the input to the owner's offshore penalty decision. That surfacing belongs to the analysis effort.
- A night penalty would have required a day/night determination, and the archive contains an overnight race running 22:16 to 04:09. Not storing the penalties removes that requirement from this effort entirely.
