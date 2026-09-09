# Prototype — the boat sections and their signed-out state (LAY-95)

**Throwaway.** Nothing here is production code, no number is real, and no write does
anything. Delete the folder once the questions below are answered.

Run it:

```bash
npm run dev
# http://localhost:4000/prototype/boat?variant=A&viewer=admin
# ...&variant=B&tab=races&race=race-0812   (B only: open a section, or one race)
```

Both knobs live in the URL, so any screen can be shared exactly as seen. `variant` is
`A`, `B` or `C`; `viewer` is `guest`, `member` or `admin`. Variant B also reads `tab`
(`setup`, `races`, `overall`) and `race`, so a specific race screen can be linked rather
than described. The floating bottom bar
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
| Race row | Plain text row | Three derived stats: speed against the polar, the wind it was sailed in, whether the Crossover Chart agrees | Timeline entry among Versions, Events and sail retirements |
| Race detail | Minimal, with an explicit `Analysis` seam | Testimony as chips under the title; a scrubbable track and traces sharing one cursor; then the polar and crossover readings | Split: *what we say happened* above the line, *what the file says* below it |
| Editing | A separate **Amend** screen | One pencil at the top right; the Testimony chips become inputs in place | A pencil per field, inline, everywhere |
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

Boat speed in the fixture is generated **from** the Polar and scaled by a per-recording
"sailed at" factor, so the polar percentages land somewhere a sailor would not reject out
of hand (87–106%) instead of the 140% that a wind-independent speed model produced in
light air. That makes the percentage circular by construction: it is there to size the
layout, and nothing about the number is evidence of anything. The upwind/downwind split
is real arithmetic over the rows, and uses **speed through the water**, because a polar is
water-referenced and scoring it against a figure that includes current would be a
different claim wearing the same percent sign.

Types are local to this folder on purpose — they belong to the throwaway, not to
`types/index.ts`. There are no tests: the checks that ran against this were themselves
throwaway.

## Awkward cases the fixture forces you to look at

- A window that ends 20 seconds into a wind-instrument freeze: **1** frozen row inside
  the window, 147 across the file. The detail screen has to be honest about both.
- A window that outruns its recording: *"recording ended 19 min before the finish."* Row
  counts are never shown to the reader anywhere — how long the feed was dead is a fact
  about the race, how many lines that took is a fact about the file.
- A paddlewheel that stops, so speed through water is missing while everything else keeps
  coming.
- Drifting on the line either side of the gun, where the wind maths is meaningless.
- A Sail Definition (number 7, "Main + A3") that no cell in the crossover chart ever
  calls for.
- Polar rows below 40° that are filler, not measurements — row 35 is exactly twice row 30
  — and must not be read as data. 40° *is* a measured row, and since the fixture sails at
  42° TWA, suppressing it would silently throw away every upwind figure on the screen. The
  screen and the derivation share one threshold constant so they cannot disagree.
- A Crossover Chart that calls for the **Jib 3** on a race in August, after that sail was
  retired on 08-01. The chart outlived the inventory, which settles which side is wrong
  without Layline having to guess (`race-0812`).
- A three-hour regatta with two lines in the sail log, where the chart disagrees with most
  of the race. The honest reading is *the sails on record do not track this race*, not two
  hours under the wrong sail — so the screen says that once instead of listing fifteen
  spans of one fact (`race-0822`).
- A race whose every recorded sail change is what the chart called for, but where 19 min
  could not be checked at all because the paddlewheel was out (`race-0715`). A chart is
  read against true wind, and true wind was not a real figure there.
- Two races on 6 June from a single uploaded file, which the race list has to look right
  with.
