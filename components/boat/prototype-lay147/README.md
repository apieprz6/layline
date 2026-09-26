# PROTOTYPE — LAY-147, the Instrument Tuning screen

**Throwaway. Do not build on this.** It exists to be looked at, argued with, and deleted.
The winner gets rewritten properly; the rest lives on the `prototype/lay-147-instrument-tuning`
branch and never lands on `main`.

> Three variants of the new Instrument Tuning screen — plus each variant's own Overall-tab
> teaser, shown beside the real "Instrument calibration" row it has to be told apart from —
> switchable via `?variant=A|B|C` and `?view=overall|screen` on
> `/boat-performance/instrument-tuning-prototype`.

Run it: **`npm run prototype:lay147`**, then open
`http://localhost:3000/boat-performance/instrument-tuning-prototype`.

That one command is the whole setup. It builds and starts with `NEXT_PUBLIC_PROTOTYPE_LAY147=1`,
which is what un-hides the floating variant bar — a plain production build leaves it out, so
merging this branch by accident could not put the bar in front of a sailor. The reason it has to be
a real build at all is that `next dev` never hydrates in this environment (AGENTS.md), and the bar
needs hydration to work.

`←`/`→` cycle variants, `↑`/`↓` flip between the screen and its Overall-tab teaser.

`shots.mjs` shoots all six views at 390px into `/tmp` and reports each one's height and whether it
overflows sideways — `next start -p 4111`, then `node components/boat/prototype-lay147/shots.mjs`.

## What each variant is a position on

LAY-147 asks four questions. Each variant answers all four, differently and coherently —
they are not three arrangements of the same screen.

| | **A — Channel cards** | **B — Era ledger** | **C — Shared timeline** |
|---|---|---|---|
| **Q1 layout** | three stacked per-channel cards | one table: eras down, channels across | one date axis, three lanes, then a feed |
| **Q2 "how bad is bad"** | a **band** derived from the figure's own σ — never a value | **no verdict at all**; the era-to-era Δ is the signal | a **noise envelope** per lane; a dot outside its band is self-evidently out |
| **Q3 Calibration Events** | dashed vertical rules annotating each channel's trend | events **are** the table's rows — not annotations at all | full-height rules crossing all three lanes, plus interleaved in the feed |
| **Q4 Overall teaser** | same row shape as its neighbour, amber diagnostic pill | row with a **second line**, so the shape differs from the file row | promoted out of the row list into a **mini-chart card** |

## Things every variant is already committed to (not up for grabs here)

These come from closed tickets, so a variant that broke one would be wrong, not different.

- `HDG` → **Measured Offset for `HDG`, via `COG`**, with the `CTW = HDG + leeway` caveat stated.
- `AWA` → **Apparent Wind Asymmetry**, and explicitly *not* a Measured Offset. LAY-145 found the
  asymmetry can't be isolated to the vane, so no variant is allowed to call it one.
- `STW` → **Measured Offset for `STW`, via `SOG`** (ADR 0027), reported as an `R²` plus a knot gap
  from the 1:1 line. Never a `(multiplier, offset)` pair.
- **Excluded races are visible, with their reason.** Never a zero point, never a silent gap
  (LAY-145 §2.4).
- **Blank-`STW` rows (19.8%) are a coverage stat**, not a filter (ADR 0027).
- **Diagnostic only.** No variant drafts a correction value anywhere (LAY-138 decision 7).
- The six-dimension **Analysis Filter** is stubbed in every variant — LAY-144 owns its design.

## The open question the prototype surfaced

The Overall tab ends up with two rows starting "Instrument …", both with amber pills, meaning
completely different things: the existing one opens a **file** (effort 1's artifact viewer), the
new one opens a **season of measurements**. Variants B and C each try a different way out of the
collision; A deliberately does not, so the problem is visible in at least one variant.
