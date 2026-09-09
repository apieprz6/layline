# Prototype — the boat sections and their signed-out state (LAY-95)

**Throwaway.** Nothing here is production code, no number is real, and no write does
anything. Delete the folder once the questions below are answered.

Run it:

```bash
npm run dev
# http://localhost:4000/prototype/boat?variant=A&viewer=admin
```

Both knobs live in the URL, so any screen can be shared exactly as seen. `variant` is
`A`, `B` or `C`; `viewer` is `guest`, `member` or `admin`. The floating bottom bar
switches variants (arrow buttons, or ← / →) and viewers, and hides itself in
production builds.

## The question

What do **Boat management** and **Boat performance** look like when the analysis engine
that gives them their point does not exist yet — and what does a guest see where those
sections would be?

The prototype also owns a screen the design does not have at all: the **Race detail page
with editable fields** (LAY-98 / ADR 0010).

## What it should settle

1. Is a race row worth tapping in effort 1, and if so on the strength of what — a track
   on a map, a SOG/TWS trace, the raw rows — or is the detail screen deliberately minimal
   with the missing engine left as a visible seam?
2. What the Boat performance **Overall** tab's empty state says. It has to read as *not
   yet*, not as *broken*.
3. How the config artifacts survive 390px: a 16 × 9 polar grid and a 26 × 13 crossover
   matrix.
4. What a **guest** sees where the boat sections would be — nothing in the drawer, or
   visible-but-locked entries inviting sign-in. Silent or advertised.
5. Where the admin write affordances go, and whether they are simply absent for everyone
   else. Calibration is the hard case: recording a valueless act (a **Calibration Event**)
   and changing the programmed numbers (a **Version** correction) are two different acts
   that are easy to confuse.
6. Whether boat identity lives on Boat management or in Settings.

LAY-93 already settled that there are exactly **two reading tiers** — guest and signed
in — because every signed-in user reads everything regardless of `role`, including
`NULL`. Admin only changes what you can *write*. `viewer.ts` encodes that and says so.

## How the three variants disagree

They share the same fixture and the same pure derivations, and disagree about hierarchy,
where editing happens, what the Overall tab does, and what a guest is told.

| | **A — Index** | **B — Evidence-first** | **C — Ledger** |
|---|---|---|---|
| Position | Until the engine exists the boat sections are an index; everything is a list and the seam stays visible | The archive already holds a track, a trace and an honest account of row quality, so show them | One boat, one chronological record; everything is an entry in it |
| Race row | Plain text row | Sparkline + quality bar + coverage sentence | Timeline entry among Versions, Events and sail retirements |
| Race detail | Minimal, with an explicit `Analysis` seam | Track map first, then SOG and TWS traces | Split: *what we say happened* above the line, *what the file says* below it |
| Editing | A separate **Amend** screen | An **Amend** toggle that turns the Testimony fields into inputs in place | A pencil per field, inline, everywhere |
| Overall tab | No numbers at all — a seam reading **Not yet.** and four named future sections | Six honest figures from the archive, then a seam: **None of the above is performance.** | A greyed skeleton of the future cards with a **Waiting on:** line each |
| Polar | `PolarTable` — the whole grid, sideways scroll | `PolarHeat` — tap a cell to read it | `PolarByWind` — pick a TWS, read horizontal bars |
| Crossover | `CrossoverMatrix` — all 26 × 13 | `CrossoverMatrix` in a sheet | `CrossoverRuns` — runs collapsed to `45–65° → Main + Jib 1` |
| Guest | No boat entries in the drawer at all | Both entries, padlocked, with placeholder shapes (not blurred data) and the stated cost | Entries present and tappable; a tap opens the Auth Sheet |
| Identity | Edited in Settings | Edited on Boat management, as the header | Edited on the ledger head |

Handing the same artifact three different renderings is itself the answer to question 3.

## Layout of the folder

- `fixture.ts` — a synthetic archive shaped like the LAY-93 schema. Four artifacts, 14
  Recordings over 13 distinct files backing 14 Races, one file uploaded twice for the two
  races it carries, seven races with no annotation at all, a retired jib that still has to
  render in old races, and a null Rig Tune pointer on every Race. Times are naive
  wall-clock strings, because recordings carry no timezone.
- `derive.ts` — every derivation, pure and React-free. **Nothing computed is stored**:
  Row Quality, Dropout spans, coverage, the calibration log and the archive summary are
  all worked out at read. Also holds the two shared Race Window refusals, so no variant
  reimplements them.
- `primitives.tsx` — the display primitives, deliberately offering *competing* renderings
  of the same artifact. Frozen spans are visually distinct wherever a series is plotted;
  a latched fix on the track map is circled and named; "not recorded" is hatched and
  italic so it can never be mistaken for a value; provenance is one generated sentence,
  never a badge per number.
- `viewer.ts` — the three viewer states and the two predicates every variant gates on.
- `VariantA.tsx`, `VariantB.tsx`, `VariantC.tsx` — the three positions.
- `PrototypeBoat.tsx`, `page.tsx` — URL wiring, inside the real `AppLayout` chrome, so
  the variants are judged against the app rather than in a vacuum.

The production `HamburgerMenu` is untouched; each variant draws its own drawer preview,
since the guest treatment of the drawer is one of the questions.

Types are local to this folder on purpose — they belong to the throwaway, not to
`types/index.ts`. There are no tests: the checks that ran against this were themselves
throwaway.

## Awkward cases the fixture forces you to look at

- A window that ends 20 seconds into a wind-instrument freeze: **1** frozen row inside
  the window, 147 across the file. The detail screen has to be honest about both.
- A window that outruns its recording: *"340 rows inside the window; recording ended 19
  min before the finish."*
- A paddlewheel that stops, so speed through water is missing while everything else keeps
  coming.
- Drifting on the line either side of the gun, where the wind maths is meaningless.
- A Sail Definition (number 7, "Main + A3") that no cell in the crossover chart ever
  calls for.
- Polar rows below ~45° that are filler, not measurements — row 35 is exactly twice row
  30 — and must not be read as data.
- Two races on 6 June from a single uploaded file, which the race list has to look right
  with.
