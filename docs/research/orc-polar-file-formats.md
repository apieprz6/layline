# Sailing polar & sail-selection file formats (`.pol`, `.sailselect`, `.saildef`)

Research reference for building a TypeScript parser and a Postgres schema.

**Subject files** (Handsome Pete, a Beneteau 10R racing on Lake Michigan):

| File | Path |
|---|---|
| Polar | `/Users/apieprzycki/Documents/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol` |
| Sail selection grid | `/Users/apieprzycki/Documents/git/Handsome-Pete/sail-selection/HandsomePete_2026.sailselect` |
| Sail definitions | `/Users/apieprzycki/Documents/git/Handsome-Pete/sail-selection/HandsomePete_2026.saildef` |

**Primary documentation source**: `/Users/apieprzycki/Documents/git/Handsome-Pete/instrument-documentation/qtVlm_documentation_en_5.12.27` (PDF, 301 physical pages; the printed footer number is physical page − 1 — **all page citations below are printed page numbers**).

**Primary empirical source**: 11 VDR CSV recordings in `/Users/apieprzycki/Documents/git/Handsome-Pete/raw-regatta-recordings/` (4,319 rows), whose `POL` column is the navigation software's own evaluation of the polar file. This turned out to be the single most valuable evidence available, and it settles more than the documentation does.

Confidence tags used throughout: `[DOCUMENTED]`, `[INFERRED FROM FILES]`, `[UNRESOLVED]`.

---

## Summary: what's settled and what isn't

### Settled

1. **The software is qtVlm, and it is confirmed from the data, not just asserted.** The recordings are qtVlm **VDR (Voyage Data Recorder)** CSV exports. Every documented VDR column appears in the file header in the documented order. `[DOCUMENTED]` + `[INFERRED FROM FILES]`
   - Note: `Handsome-Pete/CONTEXT.md` calls these "raw Expedition CSV" files. **That is wrong** — see Q9.

2. **The polar contains boat speed (STW) in knots. It is not VMG.** Documented by qtVlm, and confirmed empirically two independent ways. This is the highest-consequence finding; see Q11.

3. **The 30°/35° rows are synthetic filler, not measured performance.** Row 35 is *exactly* 2 × row 30 in all nine columns, and every column's 30→35 line extrapolates to zero at TWA ≈ 25.00°. They are a linear ramp, not boat data. See Q11.

4. **qtVlm's interpolation algorithm is fully reverse-engineered**, reproducing the logged `POL` column for **1,639 of 1,640 rows exactly to the printed decimal** (the one miss is a `.x5` rounding tie). See Q11 / Parser implications.

5. **`.sailselect` is a real, documented qtVlm format.** `.saildef` **is not** — qtVlm's documented extension is **`.saildesc`**. See Q9 and Q12.

6. **Nothing in the Handsome-Pete repo reads any of the three files.** See Q9.

7. **All three files are clean**: pure ASCII, LF-only endings, no BOM, no comments, no blank lines, no trailing separators, uniform field counts. The one inconsistency is that `.sailselect` lacks a trailing newline while the other two have one. See Q13.

### Unsettled

- **The exact ORC certificate row set, column set, and units as ORC itself publishes them.** The file's *structure* is suggestive — 8 of its 16 rows are exactly the *widely-cited* ORC angle set (52/60/75/90/110/120/135/150), and several of the other 8 are provably synthetic — but I could not obtain an authoritative ORC specification, so I do **not** assert that set, or the commonly-repeated ORC TWS set, as verified. `[UNRESOLVED]` — see Q9 for what would settle it.
- **The polar file in the repo is not the polar that produced `POL` for 7 of the 11 recordings.** The break is real and measured, but *why* is not determinable from the files. `[UNRESOLVED]` — see Q11, "The mid-season polar change".
- **Whether the `.sailselect`/`.saildef` pair was ever loaded into qtVlm at all.** Given the wrong extension on one of them and no code that reads them, probably not. `[UNRESOLVED]`
- **qtVlm's behaviour above the top of the grid** (TWS > 24, TWA > 180). Never exercised in the data, never documented. `[UNRESOLVED]`
- Comment syntax, BOM tolerance, CRLF tolerance, and maximum grid size are **not documented anywhere** and not exercised by these files. `[UNRESOLVED]`

---

## Q9. Provenance of the formats

### `.pol` / polar grid: a documented qtVlm format and a broad de facto convention

`[DOCUMENTED]` — qtVlm documentation, printed p. 38, section "Wind Polar Formats". qtVlm accepts three polar formats and specifies them explicitly:

> **CSV format**
> CSV is the most used format. You can edit it in a spreadsheet.
> **It must start with TWA/TWS or TWA\TWS.**
> It is basically a simple text file, with fields separated by a semi-column. The decimal separator is the point.
> The 1st line contains wind speeds in knots. It has to be real wind TWS and not apparent wind). The 1st column contains wind angles (TWA). The table is then filled with a value in each cell that will indicate the boat's speed for that couple TWS/TWA. **The steps between TWAs and TWs is free of constraints, but each cell must have a value.**
>
> **POL format**
> It is the same as CSV format, except that the separator between field is the `<tab>` character.
>
> **XML format**
> It the format used by Maxsea. It comes as an XML file.

**Critical conflict — the file wins.** qtVlm's documentation says the `.pol` *format* is **tab**-separated and the `.csv` *format* is **semicolon**-separated. Our file is named `.pol` but is **semicolon**-separated:

```
$ head -c 32 HandsomePete_2026_ORC_final.pol | xxd
00000000: 7477 612f 7477 733b 343b 363b 383b 3130  twa/tws;4;6;8;10
00000010: 3b31 323b 3134 3b31 363b 3230 3b32 340a  ;12;14;16;20;24.
```

`[INFERRED FROM FILES]` — Despite that, qtVlm demonstrably loaded and evaluated this exact table: my reimplementation of the grid reproduces the logged `POL` column for 1,639/1,640 rows in the first four recordings. So **qtVlm does not use the file extension to choose the delimiter** — it sniffs, or accepts either. A parser must do the same. **Do not trust the extension to imply the delimiter.**

**Is `.pol` a published standard?** No. It is a **de facto convention** — a semicolon/tab-delimited TWA × TWS matrix — independently documented by qtVlm and shared informally across navigation and routing software. There is no ORC, ISO, or World Sailing specification for it. `[INFERRED FROM FILES]` + `[DOCUMENTED]` (qtVlm p. 38 is a vendor spec, not an industry standard). The strongest supporting evidence that it is *shared* rather than qtVlm-private is that qtVlm itself points users at a third-party ORC polar repository as a source of files in this format (below).

### How you get from an ORC certificate to a `.pol` file

`[DOCUMENTED]` — qtVlm documentation p. 31 recommends `http://jieter.github.io/orc-data/site/` as a polar source, alongside Meltemus' own "Polars server" ("More than 250 polars available") and an "Import polar" function. That third-party project (`jieter/orc-data`) converts published ORC certificate data into downloadable polar grids. **This is the documented ORC → `.pol` bridge, and it is a community project, not an ORC product.**

So the pipeline is: ORC issues a certificate containing VPP-predicted performance → a third-party tool (or a person with a spreadsheet) reshapes that into the TWA × TWS grid convention → qtVlm reads it.

**What ORC itself publishes** — `[UNRESOLVED]`.

*What I did:* the local qtVlm PDF (the only authoritative document available offline) covers polar *file* formats thoroughly but says nothing about ORC certificate structure beyond pointing at `jieter.github.io/orc-data/site/` as a source. I did not obtain an ORC-published specification, so I am **not** asserting the ORC angle set, the ORC TWS set, or ORC's row labels — including the widely-repeated claim that certificates report at 6/8/10/12/14/16/20 kt and that "Beat VMG"/"Run VMG" rows sit separate from the fixed-angle boat-speed table. That claim is plausible and consistent with the file's structure, but I could not verify it and it must not be treated as verified.

*What would settle it:* the annual **ORC VPP Documentation** PDF (published on orc.org), a real ORC certificate for this boat, or the public certificate database at `data.orc.org`. Any one of those would confirm the exact TWS columns, the exact TWA rows, whether ORC reports beat/run performance as an angle-plus-VMG pair or as boat speed, and hence exactly which of our 16 rows are certificate data and which are converter output. **This matters concretely**: it would tell us whether the 4 kt and 24 kt columns are certificate data or extrapolation, which in turn tells us whether the polar can be trusted at the edges of its wind range.

What the file itself tells us is strong circumstantial evidence:

`[INFERRED FROM FILES]` — Of the 16 TWA rows in our polar, exactly eight are the widely-cited ORC fixed-angle set, and eight are not:

```
rows in file that are in the ORC set : [52, 60, 75, 90, 110, 120, 135, 150]
rows in file NOT in the ORC set      : [30, 35, 40, 45, 100, 160, 170, 180]
```

And of the eight non-ORC rows, several are provably synthetic. Testing whether each row is an exact linear interpolation of its two neighbours:

```
  TWA   100 (between 90 and 110, t=0.500): maxerr=0.0050 -> SYNTHETIC (exact interp)
  TWA   110 (between 100 and 120, t=0.500): maxerr=0.1950 -> independent
  TWA   135 (between 120 and 150, t=0.500): maxerr=1.6150 -> independent
```

Row 100 is the exact midpoint of rows 90 and 110 in all nine columns (residual 0.005 = rounding noise). It carries **no information**. Rows 30 and 35 are a pure ramp (Q11). That leaves the eight ORC angles plus 40/45 (upwind, plausibly derived from ORC beat-angle/beat-VMG data) and 160/170/180 (downwind, plausibly derived from ORC run-angle/run-VMG data) as the only rows that could carry independent certificate content.

**Conclusion for Q9 on `.pol`:** the format is a vendor-documented, industry-shared convention with no published standard; the ORC content in this particular file has been *reshaped and padded* by a conversion step, and roughly a third of its rows are interpolation or extrapolation artifacts rather than certificate data.

### `.sailselect`: a real, documented qtVlm format

`[DOCUMENTED]` — qtVlm documentation pp. 32–33, section "Sails parameters":

> You can specify sails configurations for ranges of TWS/TWA. This information will be shown in various Route Module places, such as Route's logbook, Route's tooltip and Route's statistics. There is also an instrument available that will display the current optimum configuration.
> Data for this is provided in the form of a **sails polar, divided in two files**
> The first file affects a number to each sail's configuration. Its extension must be **".saildesc"**.
> The second file (extension **sailselect**) defines the utilization of each sail's definition according to TWS/TWA
> In both cases separation is the **semi-column**. These files must be placed in the **"polar" directory**.
> Note that sails changes appear in route logbook and can also be shown on the route itself.

The documented `.sailselect` example (p. 33) — note the header cell is the **slash** form and the TWS axis includes a `25` breakpoint:

```
TWA/TWS;8;12;16;20;25;30;32
40;1;1;2;3;3;4;5
80;6;6;6;2;2;4;5
100;7;7;7;6;2;4;5
110;7;7;7;6;2;2;5
120;7;7;7;7;2;2;5
130;8;8;8;7;2;2;4
140;8;8;8;7;7;7;3
150;8;8;8;8;7;7;3
180;8;8;8;8;8;7;3
```

So `.sailselect` is **not** Expedition-only. It is a documented qtVlm format, and our file conforms to it exactly (semicolon-delimited, `TWA/TWS` header, integer sail indices).

### `.saildef`: NOT a qtVlm format — the extension is wrong

`[DOCUMENTED]` + `[INFERRED FROM FILES]` — **qtVlm's documented extension for the sail-definition file is `.saildesc`, and the documentation says "Its extension must be `.saildesc`" (p. 33).** Our file is named `.saildef`.

The *content* is a perfect match for the documented `.saildesc` format. Compare qtVlm's documented example (p. 33, French sail names) with ours:

| qtVlm doc example (`.saildesc`) | Our file (`.saildef`) |
|---|---|
| `1;GV + Genois` | `1;Main + Jib 1` |
| `2;GV + Inter` | `2;Main + Jib 2` |
| `3;1ris + Inter` | `3;Main + Jib 3` |
| `4;2ris + Foc` | `4;Reef + Jib 2` |
| `5;3ris + Foc` | `5;Reef + Jib 3` |
| `6;GV + Leger` | `6;Main + Reaching Spin` |
| `7;GV + Assym` | `7;Reef + Reaching Spin` |
| `8;GV + Sym` | `8;Main + A2` |

Identical structure, identical 1..8 numbering, same `number;label` shape. **So `.saildef` is a correctly-formatted `.saildesc` file with the wrong extension.** As named, qtVlm would not pick it up, and therefore the `.sailselect` grid would have no labels to resolve against.

### Does anything actually consume these files? — resolving the coordinator's three options

`[INFERRED FROM FILES]` — Searching the whole Handsome-Pete repo for any consumer:

```
$ grep -rniE "pol|sailselect|saildef|polar" scripts/ docs/ CLAUDE.md CONTEXT.md
scripts/compass_calibration.py:81:  ... subplot_kw={"projection": "polar"}
scripts/compass_calibration.py:239: ... subplot_kw={"projection": "polar"}
docs/adr/0001-sog-for-speed-gate.md:7: **STW** — more theoretically correct for polar analysis ...
CONTEXT.md:3: Tools and data for analyzing sailing performance from race recordings, ...
```

The only `polar` hits are matplotlib polar-projection plots. **No script in the repo reads `.pol`, `.sailselect`, or `.saildef`.** `requirements.txt` is just `pandas / pyyaml / matplotlib`.

The answer is therefore **split between the coordinator's options (a) and (c)**:

- **`.pol` — option (a), and proven.** qtVlm reads this format, and demonstrably read *this table*: the `POL` column of the first four recordings is reproduced from it to the printed decimal. It is a live input to the navigation software, even though no repo code parses it.
- **`.sailselect` / `.saildef` — effectively option (c), with a strong hint of (b).** The format is genuine qtVlm (option a in principle), but one of the two files carries a non-qtVlm extension, and no code in the repo reads either. There is **no observable consumer of the pair anywhere** — no sail-selection output appears in the VDR exports, and the grid's sail numbers never appear in any recording. The `SAIL_CONFIG` column in `cleaned-recordings/` uses the *metadata.yaml* word vocabulary (`main+jib-1`, `main+A2`, …), **not** `.saildef` indices.

**Practical consequence, which is the point of asking:** `.pol` must be parsed faithfully because qtVlm's interpretation of it is authoritative and observable. `.sailselect`/`.saildef` are, in current practice, **local conventions with no live consumer** — Layline is free to treat them as an editable project-owned artifact and may safely normalise, extend, or re-key them. Be strict with the polar; be permissive and constructive with the sail files.

### The "Expedition" claim in the repo is incorrect

`[DOCUMENTED]` + `[INFERRED FROM FILES]` — `Handsome-Pete/CONTEXT.md` line 3 onward defines a "Recording" as "A raw **Expedition** CSV file". The evidence says qtVlm:

- qtVlm p. 77 (VDR): *"Data recorded is Position, COG, SOG, TWS, TWD, TWA, CTW, STW, PRE, XTE, RPM, GWD, GWS and Active Alarms. In addition, qtVlm will insert a **POL column which contains the calculated current polar speed of your boat, for the couple TWS/TWA**."*
- Our header is `Date;Longitude;Latitude;COG;SOG;TWD;TWS;TWA;GWD;GWS;CTW;STW;POL;PRE;XTE;TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS` — every documented VDR field, in the documented relative order, including the distinctive qtVlm-specific `GWD`/`GWS` (Ground Wind, i.e. true wind with current vectored out — pp. 211–212) and the auto-inserted `POL`.
- `RPM` and `DPH` are documented optional "Extra fields" toggles (p. 78: *"You can also choose to hide some columns. Data is collected even if a column is hidden."*), which explains their absence — and their mid-season appearance (below).

`TWA (calc)`, `AWA (calc)`, `AWS (calc)` are not covered in the 5.12.27 PDF; likely a newer qtVlm build, or a local post-processing addition. `[UNRESOLVED]`

**Recommendation:** correct `Handsome-Pete/CONTEXT.md` to say qtVlm. Any Layline code or docs describing these CSVs as Expedition exports should be corrected too.

### One important definition correction

`[DOCUMENTED]` — **`PRE` is atmospheric pressure, not "performance" or "percent of polar."** qtVlm p. 215: *"PRE: Atmospheric Pressure — This instrument displays pressure as received from NMEA data or internal sensor."* The percent-of-polar field is a *different* instrument, **`PPC` (Polar Percent)**, p. 207: *"This instrument shows the difference between actual speed and theoretical polar speed, as a percentage and as values."* **`PPC` is not in the VDR column set**, so the recordings contain no logged percent-of-polar.

`[INFERRED FROM FILES]` — Consistent with `PRE` being a barometer reading from a sensor this boat does not have, the column is **100% empty** across all 4,319 rows:

```
  PRE              filled     0 (  0.0%)
  XTE              filled     0 (  0.0%)
  OBSERVATIONS     filled     0 (  0.0%)
```

If Layline ever computes a "% of target", it must compute it itself; do not expect it in the log.

---

## Q10. The canonical header token

**Is the token significant?** Yes — qtVlm documents it as mandatory. **Is it case-sensitive? No, in practice.**

`[DOCUMENTED]` — qtVlm p. 38: *"**It must start with TWA/TWS or TWA\TWS.**"* Both the forward-slash and **backslash** forms are explicitly accepted. The documented in-manual examples use both: the polar example on p. 38 shows `TWA\TWS;0;2;4;...`, and the `.sailselect` example on p. 33 shows `TWA/TWS;8;12;...`.

`[INFERRED FROM FILES]` — Our two grid files disagree in case, and both are otherwise valid:

```
$ python3 ...
header token: 'TWA/TWS'  (.pol header token: 'twa/tws')
```

The polar's token is **lowercase** `twa/tws`, which matches neither documented spelling exactly. **And qtVlm accepted it** — proven, because the logged `POL` column is reproduced from that file's grid for 1,639/1,640 early rows. **Where documentation and files disagree, the files win: qtVlm's check on this token is case-insensitive (or absent).**

**Observed and permitted first-cell values:**

| Value | Evidence |
|---|---|
| `TWA/TWS` | `[DOCUMENTED]` p. 38, p. 33; and our `.sailselect` |
| `TWA\TWS` | `[DOCUMENTED]` p. 38 and its example |
| `twa/tws` | `[INFERRED FROM FILES]` our `.pol`; accepted by qtVlm in practice |
| `twa\tws`, `TWA/tws`, other casings | `[UNRESOLVED]` — not observed, but implied by the case-insensitivity finding |
| blank, `TWA`, something else | `[UNRESOLVED]` — never observed. qtVlm's *"must start with"* wording suggests a blank or bare `TWA` would be rejected, but I have no positive or negative test |

**Recommendation for a parser: skip line 1's first cell for *routing* purposes, but validate it leniently.** Match case-insensitively against `twa/tws` and `twa\tws` (normalise the separator), and emit a *warning* — not an error — on anything else, because a mismatch is a strong smell that the file is transposed (TWS down the side, TWA across the top) or is a different format entirely. That is the real risk the token protects against, and it is worth catching. Do not hard-reject: the one real-world file we have would fail an exact-match check.

---

## Q11. What the `.pol` numbers mean

### Verdict: boat speed (STW) in knots. Not VMG. High confidence.

This is settled by documentation and by two independent empirical tests that agree.

`[DOCUMENTED]` — qtVlm p. 38, on the polar grid: *"The table is then filled with a value in each cell that will indicate the **boat's speed** for that couple TWS/TWA."* Units are knots (same page: *"The 1st line contains wind speeds **in knots**"*, and p. 268 ties the grid to the `STW` field: *"You can show which coefficients have been applied on Polar Speed by hovering **STW** field with the mouse."*).

`[DOCUMENTED]` — qtVlm treats VMG as **derived from** the polar, never stored in it: p. 41, *"This dialog shows critical angles for the polar (**best VMGs**)"*; p. 210, *"The red parts on the dial represent the polar VMG limits and are recomputed dynamically"*; p. 31/258, *"Normally qtVlm calculates automatically best angles upwind and downwind based on the polar."* A polar file that already contained VMG would make all of this incoherent.

`[DOCUMENTED]` — And the `POL` log column is the polar grid evaluated directly, not a VMG: p. 77, *"qtVlm will insert a POL column which contains **the calculated current polar speed of your boat, for the couple TWS/TWA**"*; p. 218 (`PSP` instrument), *"This LCD displays theoretical polar speed for the current couple TWS/TWA."*

`[INFERRED FROM FILES]` — **Empirical test 1: the ratio test at close-hauled angles.** Over 278 close-hauled rows (|TWA| 42–50°, STW ≥ 4.5 kt, TWS 6–16 kt):

```
  median STW/POL              = 1.019   (=1.0 if polar is BOAT SPEED)
  median (STW*cosTWA)/POL     = 0.717   (=1.0 if polar is VMG)
```

The boat's *through-water speed* sits at 102% of the polar. Its *VMG* sits at 72% of the polar. A well-sailed boat racing to an ORC certificate lands near 100% of a boat-speed polar; it does not land at 72% of a VMG polar. Downwind (|TWA| 130–150°, n=653) gives the same answer: `median STW/POL = 0.973`, `median (STW*|cos|)/POL = 0.724`.

`[INFERRED FROM FILES]` — **Empirical test 2: percent-of-polar is sane across the whole wind range** when read as boat speed. Median STW/POL by TWA band (moving rows only, STW ≥ 3):

```
        band     n  medTWS  medPOL  medSTW  STW/POL
  43-50      239     8.2    5.90    5.80     0.98
  50-58      259     7.9    6.20    5.70     0.92
  58-70      332     8.0    6.30    5.90     0.94
  70-85      303     8.8    6.60    6.20     0.94
  85-100     272     9.1    6.70    6.30     0.94
 100-115     227     9.9    7.00    6.40     0.91
 115-130     401    11.8    7.30    6.90     0.95
 130-145     638    11.3    7.00    6.50     0.93
 145-165     348    12.6    6.70    6.50     0.97
```

91–98% of polar at every angle from 43° to 165°. That is exactly the signature of an honest boat-speed polar.

**A "% of target" metric computed as `STW / POL` is therefore honest — but only for |TWA| ≳ 43°.** See below.

### Resolving the 30° anomaly: those rows are synthetic, and are neither boat speed nor VMG

The ticket flagged that the 30° row tops out at 2.54 kt while 180° reaches 8.3 kt, and asked whether the file mixes conventions. **It does not mix conventions. Rows 30 and 35 are not performance data at all — they are linear filler manufactured by whatever produced the file.**

`[INFERRED FROM FILES]` — Row 35 is *exactly* twice row 30, in all nine columns:

```
  TWS    r30    r35  2*r30      d |    r40  3*r30      d
    4   0.88   1.75   1.76  -0.01 |   2.63   2.64  -0.01
    6   1.36   2.73   2.72  +0.01 |   4.09   4.08  +0.01
    8   1.79   3.59   3.58  +0.01 |   5.38   5.37  +0.01
   10   2.21   4.43   4.42  +0.01 |   6.21   6.63  -0.42
   12   2.46   4.91   4.92  -0.01 |   6.44   7.38  -0.94
   14   2.52   5.03   5.04  -0.01 |   6.55   7.56  -1.01
   16   2.54   5.08   5.08  +0.00 |   6.61   7.62  -1.01
   20   2.49   4.97   4.98  -0.01 |   6.65   7.47  -0.82
   24   2.25   4.50   4.50  +0.00 |   6.59   6.75  -0.16
```

Residuals of ±0.01 are pure two-decimal rounding. And the line through (30, r30) and (35, r35) crosses zero at the **same angle in every single column**:

```
  TWS=    4  slope=0.1740/deg  zero at TWA= 24.94
  TWS=    6  slope=0.2740/deg  zero at TWA= 25.04
  TWS=    8  slope=0.3600/deg  zero at TWA= 25.03
  TWS=   10  slope=0.4440/deg  zero at TWA= 25.02
  TWS=   12  slope=0.4900/deg  zero at TWA= 24.98
  TWS=   14  slope=0.5020/deg  zero at TWA= 24.98
  TWS=   16  slope=0.5080/deg  zero at TWA= 25.00
  TWS=   20  slope=0.4960/deg  zero at TWA= 24.98
  TWS=   24  slope=0.4500/deg  zero at TWA= 25.00
```

TWA 25.00° ± 0.06° across nine independent columns is not a coincidence. **Rows 30 and 35 were generated as a straight ramp from an assumed zero-speed angle of 25°** — a stand-in for "the boat cannot point higher than this", filled in so that every cell has a value (which qtVlm requires: p. 38, *"each cell must have a value"*).

Row 40 shows the ramp being **capped by the real curve**: it equals 3 × row 30 exactly at TWS 4/6/8 (where light air widens the beat angle, so the ramp is still the binding constraint) and falls well below it at TWS ≥ 10 (where the boat's genuine close-hauled speed is the lower of the two). So the crossover from synthetic to real happens between 40° and 45° depending on wind strength.

**So the ticket's three candidate explanations resolve as follows:**

- *"The file mixes conventions (VMG upwind, boat speed downwind)"* — **No.** Rejected by both empirical tests: at 45° the boat's *boat speed* matches the polar (ratio 0.98), not its VMG (0.72).
- *"30° is simply below the boat's optimal upwind angle, so genuinely slow"* — **Directionally right, but it is not a physical prediction.** The boat's real best-VMG angle per this polar is 40–45°, and 30° is indeed unsailable. But the values there are not a VPP's estimate of what happens at 30°; they are a straight line to zero at 25°.
- *"An ORC-derived convention worth knowing about"* — **Partly.** The convention is not ORC's; it is the *converter's* padding convention. ORC does not report a 30° or 35° figure at all (those angles are not in the certificate angle set, see Q9). `[INFERRED FROM FILES]`

**What this means for a "% of target" metric — the most important downstream consequence.** The metric is honest for |TWA| ≥ ~45°, and **actively misleading below it**. Empirically:

```
        band     n  medPOL  medSTW  STW/POL
   0-32      189    1.00    4.80     4.80
  32-38      111    3.40    5.60     1.65
  38-43      175    5.30    5.90     1.11
  43-50      239    5.90    5.80     0.98
```

At |TWA| < 32° the boat reads as **480% of polar**. Concrete rows make the absurdity plain — here the boat is doing a genuine 6.8–7.0 kt while the polar "target" reads 1.4–2.6 kt:

```
  TWA=  -34 TWS=  6.3 POL= 2.60 STW= 7.00 SOG= 7.40  06-07-26-nood.csv
  TWA=  -32 TWS=  6.8 POL= 2.10 STW= 7.00 SOG= 7.10  06-07-26-nood.csv
  TWA=  -28 TWS=  6.6 POL= 1.40 STW= 6.80 SOG= 6.90  06-07-26-nood.csv
```

(Note also that 6.8 kt at 28° TWA is a VMG of 6.0 kt — so `POL = 1.4` is not the VMG either. It is simply the ramp.)

**Layline must suppress or flag percent-of-polar whenever the operating point falls in the synthetic region.** Concretely: refuse to report % of target when the interpolation draws on TWA rows below the polar's "first trustworthy angle". See Parser implications for how to detect that boundary automatically.

### TWA 0, and whether starting at 30° is standard

`[DOCUMENTED]` — qtVlm's own sample polars **do include a TWA 0 row of zeros and a TWS 0 column of zeros**. The p. 38 example begins `TWA\TWS;0;2;4;6;8;...` with first data row `00;0.000;0.00025;0.000;1.110;...`, and the Polar Editor screenshot (p. 41) shows a TWA=0 row filled with `0.00` across all TWS. So the padding-with-zeros convention is real and documented by example — the docs say sample polars pad the grid rather than rely on extrapolation.

`[INFERRED FROM FILES]` — Our file does **not** include a TWA 0 row or a TWS 0 column; it starts at TWA 30 and TWS 4. **qtVlm synthesises both.** This is proven rather than assumed — a model with an implicit TWA=0 row of zeros and an implicit TWS=0 column of zeros reproduces the logged `POL` exactly, including in the extrapolation regions:

```
=== behaviour outside the grid ===
  TWA=    -6 TWS= 1.60 POL= 0.10   (model: 0.07 -> 0.1)
  TWA=   -94 TWS= 1.30 POL= 1.40   (model: 4.35 * 1.30/4 = 1.41)
  TWA=  -109 TWS= 1.90 POL= 2.00   (model: 4.27 * 1.90/4 = 2.03)
  TWA=   -45 TWS= 2.50 POL= 2.20   (model: 3.50 * 2.50/4 = 2.19)
  TWA=  -124 TWS= 3.70 POL= 3.70   (model: 4.01 * 3.70/4 = 3.71)
|TWA|<=2 rows: 31   POL values: [0.0, 0.1, 0.2]
POL==0 rows: 16
```

Below the grid's lowest TWS, `POL` scales linearly to zero at TWS 0. Below the grid's lowest TWA, it scales linearly to zero at TWA 0. Both confirm implicit zero padding rather than clamping.

**Is starting at 30° standard?** There is no standard. `[DOCUMENTED]` qtVlm p. 38 is explicit: *"The steps between TWAs and TWs is free of constraints"*, and its own documented `.sailselect` example starts at TWA 40. `[INFERRED FROM FILES]` Our polar starts at 30 and our sail chart at 35 — different axes in the same boat's file set. **A parser must not assume any particular first angle, step size, or that the two files share an axis.**

### Bonus finding: the polar in the repo is not the polar that logged 7 of 11 recordings

`[INFERRED FROM FILES]` — This is not part of the ticket but it materially affects schema design, so it is recorded here. Reimplementing qtVlm's evaluation and comparing to the logged `POL` per recording:

```
file                                 n  match@k=1.00   best-fit k  match@bestk
06-03-26-beer-can.csv              340     99.7%          1.000       99.7%
06-06-26-nood.csv                  357    100.0%          1.000      100.0%
06-07-26-nood.csv                  601    100.0%          1.000      100.0%
06-20-26-chi-wauk.csv              214    100.0%          1.000      100.0%
06-26-26-chi-mi-chi.csv            694     45.0%          0.920       55.0%
07-01-26-beer-can.csv              299     46.2%          0.920       53.8%
07-22-26-beer-can.csv              277      0.0%          0.940       65.3%
07-29-26-beer-can.csv              246      0.0%          0.940       66.3%
08-04-26-100-beer-can.csv          244      0.0%          0.910       56.6%
08-22-26-glr.csv                   449      0.0%          0.940       60.6%
08-26-26-beer-can.csv              261      0.0%          0.940       62.5%
```

The first four recordings match **perfectly**. From 06-26 onward they do not, and no single scale factor rescues them (the best `k` still leaves 35–45% unexplained). In 06-26 and 07-01 the mismatch is concentrated downwind (median |TWA| = 132° and 109° for mismatches vs 62° and 55° for matches), i.e. the downwind rows were revised first; from 07-22 the whole table differs.

Corroborating evidence of active configuration churn: the CSV header itself changes mid-season, gaining an `RPM` column between 07-22 and 07-29:

```
06-03 … 07-22 : ...;STW;POL;PRE;XTE;TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS
07-29 … 08-26 : ...;STW;POL;PRE;XTE;RPM;TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS
```

`[UNRESOLVED]` — Why the polar changed is not determinable from the files. The repo file's mtime is 2026-07-07, *after* the divergence begins, and its name ends `_final`, so it is plausibly one revision in a series and not the one that was aboard for most of the season. Inspecting the Handsome-Pete git history for `polars/` would likely settle it (I did not run git commands, per instructions).

**Schema consequence: store polars as versioned rows with an effective date range, not as one current table per boat.** Any historical percent-of-polar computed against "the" polar will be wrong for most of this season otherwise.

---

## Q12. `.sailselect` / `.saildef` integrity rules

### Must sail numbers be contiguous from 1?

`[UNRESOLVED]` as a *requirement* — qtVlm p. 33 says only *"The first file affects a number to each sail's configuration"*, with no statement about contiguity, ordering, or a starting value.

`[INFERRED FROM FILES]` + `[DOCUMENTED]` — Both the documented example and our file happen to be contiguous 1..8:

```
sail numbers DEFINED      : [1, 2, 3, 4, 5, 6, 7, 8]
contiguous from 1         : True
```

Two independent 1..8 examples is suggestive, not conclusive. **Recommendation: require positive integers and uniqueness; do not require contiguity.** Treat gaps as a warning.

### Must every grid number exist in the definitions, and vice versa?

`[INFERRED FROM FILES]` — **The relationship is not bijective in the real file. Grid ⊆ definitions, strictly.**

```
sail numbers USED in grid : [1, 2, 3, 4, 5, 6, 8]
sail numbers DEFINED      : [1, 2, 3, 4, 5, 6, 7, 8]
defined but NEVER used    : [7]  -> ['Reef + Reaching Spin']
used but NOT defined      : []
```

Sail 7, `Reef + Reaching Spin`, is defined but referenced by **zero** grid cells. Cell counts per sail:

```
  1 Main + Jib 1             cells=  52
  2 Main + Jib 2             cells=  34
  3 Main + Jib 3             cells=  34
  4 Reef + Jib 2             cells=   5
  5 Reef + Jib 3             cells=  55
  6 Main + Reaching Spin     cells=  52
  7 Reef + Reaching Spin     cells=   0
  8 Main + A2                cells= 106
```

**Rules to enforce:** every number in the grid **must** resolve to a definition (a dangling reference is unrenderable — reject it). A definition with no grid reference is **legitimate and must be tolerated** — it is an inventory entry the crossover chart simply never calls for. Note that sail 4 appears in only 5 cells, so "rarely used" is a real state too.

### What does `0` or an empty cell mean?

`[DOCUMENTED]` — Empty cells are **prohibited by the format**: qtVlm p. 38 (which governs the shared grid shape) states *"each cell must have a value"*. There is no documented meaning for `0`, and no documented "do not sail" sentinel.

`[INFERRED FROM FILES]` — Neither occurs in our file:

```
any 0 cells               : 0
any empty cells           : 0
all rows same width       : True (widths [13])
```

**So the honest answer is: unknown semantics, because neither the specification nor the only real example provides one.** `[UNRESOLVED]` for `0` specifically. **Recommendation:** reject empty cells (the format forbids them, and silently defaulting would fabricate a sail choice). Accept `0` but map it to an explicit `null`/"no recommendation" rather than guessing "don't sail" — and do not invent a "storm / stay home" meaning the format does not define. Layline's own storm messaging should come from wind classification, not from a sentinel in this grid.

### Is there a maximum sail count?

`[UNRESOLVED]` — not documented (qtVlm pp. 32–33 and p. 38 state no limits of any kind; p. 38's only constraint is that steps are "free of constraints" and every cell filled). Both known examples use 8. A sane parser cap is discussed under Q13.

### Is the label free text or a controlled vocabulary?

`[INFERRED FROM FILES]` + `[DOCUMENTED]` — **Free text.** The documented example uses French abbreviations (`GV + Genois`, `1ris + Inter`, `GV + Assym`) and ours uses English (`Main + Jib 1`, `Reef + Jib 3`, `Main + A2`). No shared token, no enumeration, no parsing convention. The `+` is just a human convention for "these two sails together" and is not documented as syntax.

Character inventory of our labels — plain ASCII, spaces and `+` only:

```
labels non-ASCII : []
label chars used : ' +123AJMRSabcefghinp'
```

`[UNRESOLVED]` whether qtVlm imposes a length limit or forbids `;` in labels. Since `;` is the delimiter and there is no documented quoting or escaping mechanism, **a label containing `;` is almost certainly unrepresentable.** Split on the *first* `;` only, and reject or sanitise labels containing one.

### Cross-check against the boat's own sail vocabulary — the `.saildef` is incomplete

`[INFERRED FROM FILES]` — Comparing `.saildef` labels against `raw-regatta-recordings/metadata.yaml`, which records the sail actually flown:

```
distinct sail configs recorded in metadata.yaml:
  ('main', 'A2')                x5  -> saildef #8 (Main + A2)
  ('main', 'jib-1')             x4  -> saildef #1 (Main + Jib 1)
  ('main', 'jib-2')             x3  -> saildef #2 (Main + Jib 2)
  ('main', 'jib-3')             x2  -> saildef #3 (Main + Jib 3)
  ('main', 'reaching-spin')     x1  -> saildef #6 (Main + Reaching Spin)
  ('main',)                     x1  -> saildef #NO MATCH

metadata vocabulary: ['A2', 'jib-1', 'jib-2', 'jib-3', 'main', 'reaching-spin']
```

Findings:

1. **Five of six recorded configurations map cleanly** onto `.saildef` entries 1, 2, 3, 6, 8. The grid's sail numbers do correspond to real sails aboard — the chart is not fictional.
2. **`('main',)` — mainsail alone — has no `.saildef` entry.** It was genuinely flown (08-26, 19:43:49–19:45:40). The `.saildef` vocabulary is therefore **incomplete**: it cannot express a sail-down / main-only state.
3. **The two vocabularies are structurally different and cannot be joined automatically.** `metadata.yaml` uses an *unordered set of sail tokens*; `.saildef` uses a *single opaque label per numbered combination*. Mapping between them requires a hand-maintained lookup (the one above), and a set-based scheme can express combinations the numbered scheme cannot.
4. **`.saildef` entries 4, 5 and 7 are unrepresentable in `metadata.yaml`**, because the metadata vocabulary has **no reef token at all** — no `reef`, `1-reef`, etc. Yet reefed configurations are 3 of 8 `.saildef` entries, and sail 5 (`Reef + Jib 3`) occupies 55 grid cells, the second-largest share. So the chart recommends reefing in conditions the recording schema cannot record.
5. `cleaned-recordings/*.csv` carries `SAIL_CONFIG` using the **metadata word vocabulary**, not `.saildef` indices — further confirmation that `.saildef` has no consumer:

```
  ''                      x1618      'main+jib-2'          x53
  'main+jib-1'            x250       'main+reaching-spin'  x12
  'main+A2'               x238       'main'                x4
  'main+jib-3'            x235
```

**Schema recommendation:** model a sail configuration as a **set of sail components plus an optional reef state**, and treat the `.saildef` integer as an *external identifier* mapped onto that model — not as the primary key. That representation covers main-only, covers reefed states, and can round-trip both files. Add a `reef` dimension to the recording vocabulary.

### Grid shape and the `25` column

`[INFERRED FROM FILES]` — The `.sailselect` axes:

```
grid: 26 TWA rows x 13 TWS cols; all rows same width: True
TWS axis: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30]
TWS steps: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 5]
TWA axis: [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
           105, 110, 115, 120, 125, 130, 135, 140, 150, 160, 170, 180]
TWA steps: [5 ×21, 10, 10, 10, 10]
```

**On the odd `25` between `24` and `30` — it is meaningful, not a hand-editing artifact.** `[DOCUMENTED]` qtVlm's *own documented example* on p. 33 uses the TWS axis `8;12;16;20;25;30;32` — it too contains 25, and an equally irregular final step to 32. Combined with p. 38's *"The steps between TWAs and TWs is free of constraints"*, irregular breakpoints are clearly the intended usage: you place a column where the boat's behaviour changes, not on a round grid.

`[INFERRED FROM FILES]` — And the `25` column does real work. It differs from its neighbours substantially, so it is not a duplicate:

```
  col25 differs from col24 in 6/26 rows; from col30 in 18/26 rows
  col24: [5,5,5,5,5,5,5,5,3,3,3,3,3,3,3,3,3,6,6,6,8,8,8,8,8,8]
  col25: [5,5,5,5,5,5,5,5,3,3,3,3,3,3,3,3,3,6,6,6,6,6,6,6,6,6]
  col30: [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]
```

It encodes a specific decision: **at 25 knots the A2 (sail 8) is retired in favour of the reaching spinnaker (sail 6) at deep angles**, and by 30 knots everything reduces to `Reef + Jib 3` (sail 5) at every angle. That is a deliberate crossover, tightly placed at 25 kt precisely *because* 24 and 30 were too coarse to express it.

### Do not validate monotonicity

`[INFERRED FROM FILES]` — A tempting-but-wrong rule. Sail *numbers* are categorical labels, not an ordered magnitude, so they need not increase with TWS:

```
  TWA    75: monotonic      [1,1,1,1,1,1,2,2,3,3,3,3,5]
  TWA   110: NOT monotonic  [8,8,8,8,6,6,6,6,6,2,3,3,5]
  TWA   180: NOT monotonic  [8,8,8,8,8,8,8,8,8,8,8,6,5]
```

15 of 26 rows are non-monotonic, all legitimately — downwind sails (6, 8) simply carry higher indices than the upwind jibs (1, 2, 3) that replace them in a blow. I also checked for isolated single-cell outliers (cells differing from *all* four orthogonal neighbours), which would indicate a genuine typo:

```
=== isolated outlier cells: (none found) ===
```

There are none. Two rows (TWA 45 and TWA 80) contain locally surprising single values — `45: [1,1,1,1,2,2,4,3,5,...]` reefs at TWS 16 then un-reefs at 18, and `80: [1,6,1,1,...]` puts the reaching spinnaker in at 6 kt between two jib cells — but in both cases the value matches a vertical neighbour, so they are plausible deliberate entries rather than provable typos. **Report them as advisory warnings; do not reject.**

---

## Q13. Parsing hazards

### Byte-level findings for the three actual files

`[INFERRED FROM FILES]` — Command and output:

```
$ for f in *.pol *.sailselect *.saildef; do
    file "$f"; wc -lc "$f"; head -c 64 "$f" | xxd | head -2;
    tail -c 48 "$f" | xxd; tr -cd '\r' < "$f" | wc -c;
    LC_ALL=C grep -c '[^ -~\t]' "$f"; done

HandsomePete_2026_ORC_final.pol: ASCII text        17 lines,  792 bytes
HandsomePete_2026.sailselect:    ASCII text        26 lines,  810 bytes
HandsomePete_2026.saildef:       ASCII text         8 lines,  133 bytes
```

And a consolidated per-file check of every hazard in the table below:

```
--- HandsomePete_2026_ORC_final.pol
  BOM: False  ends with LF: True   CR count: 0
  non-empty lines: 17  field counts: [10]      (1 TWA + 9 TWS)
  field with surrounding space: False   empty field present: False
  TABs: 0  commas: 0  hashes: 0
--- HandsomePete_2026.sailselect
  BOM: False  ends with LF: False  CR count: 0
  non-empty lines: 27  field counts: [14]      (1 TWA + 13 TWS)
  field with surrounding space: False   empty field present: False
  TABs: 0  commas: 0  hashes: 0
--- HandsomePete_2026.saildef
  BOM: False  ends with LF: True   CR count: 0
  non-empty lines: 8   field counts: [2]       (id + label)
  field with surrounding space: False   empty field present: False
  TABs: 0  commas: 0  hashes: 0
```

Every line in every file has a uniform field count, so no row is short, padded, or trailing-delimited. `.saildef` splits to exactly 2 fields on every line, confirming **no label contains a `;`** — which matters because there is no documented quoting mechanism.

| Hazard | These three files | What the format permits |
|---|---|---|
| **UTF-8 BOM** | **Absent.** First bytes are `7477 612f` (`twa/`), `5457 412f` (`TWA/`), `313b 4d61` (`1;Ma`) — no `EF BB BF` | `[UNRESOLVED]` — not documented; qtVlm's behaviour with a BOM is untested. A BOM would corrupt the first header token, so **strip it defensively** |
| **Line endings** | **LF only.** `tr -cd '\r' \| wc -c` = **0** for all three files | `[UNRESOLVED]` — not documented. Windows-authored files are highly likely in this ecosystem (qtVlm is cross-platform, and the docs recommend editing polars in a spreadsheet and show a Notepad screenshot). **Accept CRLF and bare CR** |
| **Trailing newline** | **Inconsistent across the three files.** `.pol` and `.saildef` end with LF; **`.sailselect` does not** (last byte is `35` = `'5'`) | **Both cases occur in the same directory, from the same author.** A parser must handle a final line with and without a terminator, and must not treat the resulting empty final element as a row |
| **Trailing semicolons** | **Absent.** All rows have exactly the header's field count (`.sailselect`: `all rows same width: True (widths [13])`) | `[UNRESOLVED]`. Spreadsheet round-trips commonly add them. **Tolerate one trailing empty field; do not emit one** |
| **Comments** | **None present** | `[UNRESOLVED]` — **no comment syntax is documented anywhere** in the qtVlm manual for polar, `.saildesc`, or `.sailselect` files. Since `;` is the delimiter and `#`/`!` are unmentioned, assume **comments are not supported**. Do not invent support; a `#` line would most safely be reported as an error |
| **Blank lines** | **None present** | `[UNRESOLVED]` — not documented. **Skip them** (cheap, safe, and the likely product of a trailing newline or spreadsheet export) |
| **Non-ASCII in labels** | **Absent.** `grep -c '[^ -~\t]'` = **0**; label chars are `' +123AJMRSabcefghinp'` | **Must be supported.** `[DOCUMENTED]` — qtVlm's own p. 33 example uses French sail names (`GV + Genois`, `GV + Assym`); real-world files will contain accented characters (`Génois`, `Trinquette`). **Decode as UTF-8 with a Latin-1 fallback** |
| **Whitespace around values** | **None present.** Values are bare: `30;0.88;1.36;...` | `[UNRESOLVED]` — not documented. **Trim every field** before parsing. Spreadsheet exports and hand edits routinely introduce spaces |
| **Decimal separator** | **Always `.`** — `4.0`, `8.0`, `0.88`; max 2 decimal places; no bare integers in the polar body | `[DOCUMENTED]` — qtVlm p. 38: *"The decimal separator is the point."* **Decimal comma is not permitted.** But note the delimiter is `;`, which is exactly the convention European locales use *because* they use decimal commas — so a comma-decimal file is a realistic corruption. **Detect and reject with a clear message** rather than silently mis-parsing |
| **Delimiter** | **Semicolon in all three files** — including the `.pol`, which per the docs "should" be tab-delimited | `[DOCUMENTED]` p. 38: `;` for CSV format, TAB for POL format. `[INFERRED FROM FILES]` The extension does **not** determine the delimiter. **Sniff: use TAB if the first line contains one, else `;`** |

### Numeric ranges and rounding in the companion CSV logs

`[INFERRED FROM FILES]` — Relevant when correlating a polar against logged data:

```
POL values not on a 0.1 grid: 0 / 4283      -> POL is rounded to 1 decimal
TWA values not integral:      0 / 4283      -> TWA is rounded to whole degrees
TWS values not on a 0.1 grid: 0 / 4283      -> TWS is rounded to 1 decimal
```

So agreement with a polar can never be verified more finely than ±0.05 kt.

And the logs contain **physically impossible outliers** that any comparison must filter:

```
sane TWS<=45: 4280  (dropped 3 garbage-TWS rows)
garbage TWS examples: [(3249.7, 9.9, '06-06-26-nood.csv'),
                       (3062.3, 8.3, '06-06-26-nood.csv'),
                       (46.0, 4.5, '08-26-26-beer-can.csv')]
```

A TWS of 3,249.7 knots is a sensor/serial glitch. **Gate on plausible ranges before any polar arithmetic.**

### Data-quality flags inside the polar itself

`[INFERRED FROM FILES]` — Two things a validator should surface as warnings (not errors):

1. **Non-monotonic speed with rising wind** at close angles — real and expected (the boat depowers and slows in a blow), so this is *not* an error:

```
  TWA 30: NO -> [(16, 2.54, 20, 2.49), (20, 2.49, 24, 2.25)]
  TWA 45: NO -> [(20, 6.89, 24, 6.84)]
  TWA 52: NO -> [(20, 7.22, 24, 7.20)]
  TWA 60..180: yes (monotonic)
```

2. **A suspicious spike at TWA 135 / TWS 24 = 11.71 kt.** For a ~34 ft boat (hull speed ≈ 7.2 kt) this is very high, and it breaks the smoothness of its neighbours far more than the same triple does one column to the left:

```
global max cell: (11.71, TWA 135, TWS 24)
cells above 9.5 kt: [(120,24,9.88), (135,20,9.72), (135,24,11.71), (150,24,10.31)]
  at TWS 20: 120->9.27, 135->9.72, 150->8.66   (135 exceeds neighbours by 0.45)
  at TWS 24: 120->9.88, 135->11.71, 150->10.31 (135 exceeds neighbours by 1.4-1.8)
```

This cell was never exercised (max observed `POL` = 9.1, and the recordings never saw TWS > 24), so it is unproven — but **flag cells implying speeds far above hull speed** as probable extrapolation artifacts.

### Maximum plausible grid size

`[UNRESOLVED]` — **No limit is documented** anywhere in the qtVlm manual. Evidence for a sane bound:

- `[DOCUMENTED]` The Polar Editor screenshot (p. 41) shows a real grid spanning TWS 0→60 kt in 2 kt steps (**31 columns**) with TWA in 5° steps (**37 rows**), and dynamic "Add TWA" / "Add TWS" / "Remove" buttons — so grids of that order are normal and no cap is stated.
- `[INFERRED FROM FILES]` Our files are 16 × 9 and 26 × 13.

**Recommendation:** accept up to **181 TWA rows × 128 TWS columns** (1° TWA resolution over 0–180 is the finest meaningful grid; 128 wind columns is far beyond any real file). Reject beyond that as a malformed-input guard, and cap raw file size around 1 MB.

---

## Parser implications

### TypeScript types

```ts
// ---------- shared ----------

/** First cell of the header row. Case-insensitive; both separators occur. */
const HEADER_TOKENS = ['twa/tws', 'twa\\tws'] as const;

export type GridDelimiter = ';' | '\t';

export interface ParseWarning {
  readonly code:
    | 'unexpected-header-token'
    | 'trailing-empty-field'
    | 'blank-line-skipped'
    | 'bom-stripped'
    | 'crlf-line-endings'
    | 'non-monotonic-in-tws'      // polar: legitimate depowering, advisory only
    | 'implausible-speed'         // polar: cell far above hull speed
    | 'synthetic-upwind-rows'     // polar: linear ramp detected below beat angle
    | 'unreferenced-sail'         // saildesc entry with no grid cell
    | 'locally-anomalous-cell';   // sailselect: value surprising vs neighbours
  readonly message: string;
  readonly line?: number;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly ParseWarning[] }
  | { readonly ok: false; readonly error: string; readonly line?: number };

// ---------- .pol / polar CSV ----------

export interface PolarFile {
  /** Ascending, knots. Does NOT include 0 unless the file did. */
  readonly twsAxis: readonly number[];
  /** Ascending, degrees 0..180. Does NOT include 0 unless the file did. */
  readonly twaAxis: readonly number[];
  /** speeds[twaIndex][twsIndex] — boat speed through water, knots. */
  readonly speeds: readonly (readonly number[])[];
  readonly delimiter: GridDelimiter;
  readonly headerToken: string;
  /**
   * Lowest |TWA| at or above which values are believed to be real performance
   * data rather than synthetic sub-beat-angle filler. Derived, not from the file.
   * Percent-of-polar MUST be suppressed below this angle.
   */
  readonly firstTrustworthyTwa: number;
  /** TWA rows detected as a linear ramp to zero, or as exact interpolations. */
  readonly syntheticTwaRows: readonly number[];
}

// ---------- .saildesc (a.k.a. the local .saildef) ----------

export interface SailDefinition {
  readonly id: number;      // positive integer, unique; NOT assumed contiguous
  readonly label: string;   // free text, may be non-ASCII, must not contain ';'
}

export interface SailDefinitionFile {
  readonly sails: readonly SailDefinition[];
}

// ---------- .sailselect ----------

export interface SailSelectionFile {
  readonly twsAxis: readonly number[];
  readonly twaAxis: readonly number[];
  /** sailIds[twaIndex][twsIndex] — null only where the source cell was 0. */
  readonly sailIds: readonly (readonly (number | null)[])[];
  readonly delimiter: GridDelimiter;
  readonly headerToken: string;
}

/** The two sail files are only meaningful together. */
export interface SailPlan {
  readonly definitions: ReadonlyMap<number, string>;
  readonly selection: SailSelectionFile;
  /** Defined but never referenced by the grid — legitimate, keep. */
  readonly unreferencedSailIds: readonly number[];
}
```

For the Postgres schema, mirror this shape and — per the mid-season finding in Q11 — **version the polar**:

```
polar (id, boat_id, source, header_token, delimiter,
       effective_from, effective_to,      -- nullable upper bound; REQUIRED, see Q11
       first_trustworthy_twa, imported_at, raw_sha256)
polar_cell (polar_id, twa numeric, tws numeric, boat_speed_kt numeric,
            is_synthetic boolean,  PRIMARY KEY (polar_id, twa, tws))

sail_definition  (sail_plan_id, sail_id int, label text,
                  PRIMARY KEY (sail_plan_id, sail_id))
sail_selection   (sail_plan_id, twa numeric, tws numeric,
                  sail_id int NULL REFERENCES sail_definition,
                  PRIMARY KEY (sail_plan_id, twa, tws))
```

Store the raw file bytes and a hash alongside. Given the polar-version discovery, the ability to re-derive any historical figure from the exact bytes that were in force is worth the storage.

### What to reject

- Fewer than 2 lines, or a header with fewer than 2 fields.
- Any row whose field count differs from the header's (after tolerating one trailing empty field). qtVlm p. 38: *"each cell must have a value."*
- An **empty** cell in either grid body. Do not default it.
- A non-numeric TWA or TWS axis value; a non-ascending or duplicated axis value.
- TWA outside `0..180`; TWS negative. (Signed TWA belongs in *logs*, not in polar files — take `Math.abs` at lookup time, never at parse time.)
- A negative boat speed.
- **Decimal commas.** `4,5` must produce a clear "decimal comma not supported; use a point" error, never a silent mis-parse — the risk is high because `;` is the European-locale delimiter.
- A `.sailselect` cell referencing a sail id absent from the definitions.
- A `.saildesc` line without a `;`, a non-integer or non-positive id, or a duplicate id.
- Grids beyond 181 × 128, or files beyond ~1 MB.

### What to tolerate

- **A UTF-8 BOM** — strip it, warn. It would otherwise corrupt the header token.
- **CRLF or bare CR** line endings — normalise, warn.
- **Blank lines anywhere** — skip, warn.
- **One trailing delimiter** per line — drop the empty field, warn.
- **Leading/trailing whitespace** in every field — trim.
- **Any casing and either separator** in the header token (`twa/tws`, `TWA\TWS`, …). Warn on anything unrecognised but **continue** — our real `.pol` uses lowercase and qtVlm accepts it.
- **Either delimiter regardless of extension** — sniff for TAB in line 1, else `;`. Our `.pol` is semicolon-delimited despite the documented POL format being tab-delimited.
- **Non-ASCII labels** — decode UTF-8, fall back to Latin-1.
- **Non-contiguous sail ids**, and **definitions with no grid reference** (sail 7 in our file).
- **Non-monotonic sail numbers across a row** — 15 of 26 rows in our file are non-monotonic and all are correct. Never validate this.
- **Missing TWA 0 row and missing TWS 0 column** — the common case. Synthesise them (below).
- **A `.saildef` extension** — accept `.saildef`, `.saildesc`, and `.sailsdesc` as the same format, and warn that `.saildesc` is the extension qtVlm requires (p. 33). The local file is misnamed and qtVlm would not load it.

### Evaluating the polar: the algorithm, reverse-engineered

This reproduces qtVlm's `POL` column for **1,639 of 1,640 rows** across the four recordings that used this polar, exactly to the printed decimal; the single exception is a `.x5` rounding tie (`predicted 6.95` vs `logged 6.9`). Use it verbatim, because it is what the boat's instruments display.

```ts
export function polarSpeed(p: PolarFile, twaSigned: number, tws: number): number {
  // 1. TWA is symmetric about the wind axis; logs carry a sign for tack.
  let twa = Math.abs(twaSigned);

  // 2. Pad with implicit zeros. VERIFIED: qtVlm behaves exactly as if a
  //    TWA=0 row of zeros and a TWS=0 column of zeros were present. It
  //    interpolates linearly toward them rather than clamping.
  const twaAxis = p.twaAxis[0] > 0 ? [0, ...p.twaAxis] : p.twaAxis;
  const twsAxis = p.twsAxis[0] > 0 ? [0, ...p.twsAxis] : p.twsAxis;
  // ...and pad `speeds` to match with a zero row / zero column.

  // 3. Clamp above the top of the grid.
  //    NOTE: UNVERIFIED. The recordings never exceeded TWS 24 or TWA 180,
  //    so qtVlm's real behaviour above the grid is unknown. Clamping is the
  //    conservative choice; flag such results as extrapolated.
  twa = Math.min(twa, twaAxis.at(-1)!);
  tws = Math.min(Math.max(tws, 0), twsAxis.at(-1)!);

  // 4. Bilinear interpolation on the bracketing cell. Not spline, not nearest.
  //    (Nearest-cell scored only 9.9% within 0.05 kt; bilinear scores 100%.)
  return bilinear(twaAxis, twsAxis, paddedSpeeds, twa, tws);
}
```

Evidence for each choice, on the 1,640 rows from the four recordings that used this file:

```
model                                          n      median   <=0.05 kt
bilinear + implicit TWA0 row + implicit TWS0 col   1640   0.023     100.0%
bilinear + implicit TWA0 row, clamp TWS at 4       4283   0.282      44.4%
bilinear, no implicit rows (clamp TWA>=30)         4283   0.379      39.2%
nearest grid cell (no interpolation)               4283   0.410       9.9%
```

The residual across every TWA × TWS band in those four files is `±0.02` kt or less — i.e. rounding only:

```
                  TWS0-4      TWS4-8     TWS8-12    TWS12-16
 TWA   0-30    -0.00/32    +0.00/24    +0.00/66    +0.01/9
 TWA  30-45    -0.00/33    +0.01/85    +0.00/120       -/3
 TWA  45-60    -0.00/37    +0.00/109   -0.00/146   -0.02/15
 TWA  60-90    -0.01/70    -0.00/104   +0.00/119   +0.00/15
 TWA  90-120   +0.01/50    +0.01/25    +0.00/56    +0.00/45
 TWA 120-150   +0.01/36    -0.01/65    +0.00/195   +0.01/95
 TWA 150-181   +0.01/25    -0.02/7     -0.00/14    -0.01/39
```

### Detecting the synthetic upwind rows automatically

Because percent-of-polar is dishonest below the beat angle (Q11), compute `firstTrustworthyTwa` at import rather than hardcoding 45:

```ts
/**
 * Rows generated as a linear ramp to zero share one zero-crossing angle across
 * every TWS column. In our file: 24.94..25.04 degrees over 9 columns.
 */
function detectSyntheticUpwindRows(p: PolarFile): {
  fullyRampRows: number[];        // ramp in EVERY column
  partiallyRampRows: number[];    // ramp in SOME columns only
  exactInterpRows: number[];      // carry no information
} {
  // (a) For the lowest TWA rows, fit a line per TWS column through this row and
  //     the one below it, and collect the zero-crossing angles. If they agree
  //     within ~0.5 deg across ALL columns, the row is ramp filler.
  // (b) Per column, a row is ramp-governed where its value equals the ramp
  //     prediction ramp(twa) = row0 * (twa - zeroAngle) / (twa0 - zeroAngle).
  //     Rows matching in only some columns are PARTIALLY synthetic.
  // (c) Flag any row that is an exact linear interpolation of its two
  //     neighbours (our TWA 100 row: max residual 0.005 across all 9 columns).
}
```

For this file that yields `fullyRampRows = [30, 35]`, `partiallyRampRows = [40]`, and `exactInterpRows = [100]`.

**Note that trustworthiness is strictly TWS-dependent, not a single angle.** Row 40 equals 3 × row 30 exactly at TWS 4/6/8 (ramp-governed) but departs from it by 0.4–1.0 kt at TWS ≥ 10 (real data), because light air widens the beat angle. A fully correct implementation would store a per-column first-trustworthy angle.

**Recommendation: keep the scalar `firstTrustworthyTwa` and set it to the lowest row that is fully real in every column — 45 for this file.** Rationale: the field exists to gate a user-facing metric, and a conservative scalar is both simpler and safer than a per-column boundary. Setting it to 40 would admit the light-air cells where row 40 is still pure ramp. Derive it as *"the lowest TWA row that appears in neither `fullyRampRows` nor `partiallyRampRows` nor `exactInterpRows`"*, and record the finer per-column detail in `syntheticTwaRows` for diagnostics.

Then gate the metric:

```ts
export function percentOfPolar(
  p: PolarFile, twaSigned: number, tws: number, stw: number,
): { pct: number; trustworthy: boolean } {
  const twa = Math.abs(twaSigned);
  const target = polarSpeed(p, twa, tws);
  return {
    pct: target > 0.5 ? (100 * stw) / target : Number.NaN,
    trustworthy: twa >= p.firstTrustworthyTwa && target > 0.5,
  };
}
```

**In the UI, do not render a percentage when `trustworthy` is false.** Render "above beat angle — no target" or similar. The alternative is telling a sailor pinching at 28° that they are sailing at 480% of polar, which the data shows would happen on 189 of the rows we have.

`[INFERRED FROM FILES]` — **The cost of this gate is acceptable.** Applying it to the race-window rows in `cleaned-recordings/` (i.e. actual racing, transit excluded):

```
cleaned (race-window) rows with TWA+POL+STW: 2310
rows SUPPRESSED (|TWA| < 45 or POL <= 0.5):   366 (15.8%)
rows still reported:                         1944 (84.2%)
```

So the honest metric is still available 84% of the time. Suppressing the other 16% costs little and removes the cases where the number would be actively wrong.

### Handling the mismatched TWS axes between polar and sail chart

The two axes are **not** the same, but the relationship is more favourable than it first appears:

```
TWS axis .pol        : [4, 6, 8, 10, 12, 14, 16, 20, 24]
TWS axis .sailselect : [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30]
TWS in .pol not in .sailselect : []          <-- polar axis is a strict SUBSET
TWS in .sailselect not in .pol : [18, 22, 25, 30]

TWA axis .pol        : [30, 35, 40, 45, 52, 60, 75, 90, 100, 110, 120, 135, 150, 160, 170, 180]
TWA axis .sailselect : [35, 40, 45, 50, 55, 60, 65, ..., 135, 140, 150, 160, 170, 180]
TWA in .pol not in .sailselect : [30, 52]
TWA in .sailselect not in .pol : [50, 55, 65, 70, 80, 85, 95, 105, 115, 125, 130, 140]
```

**The single most important rule: never interpolate the sail chart.** Sail ids are categorical. Averaging sail 3 and sail 5 to get sail 4 is meaningless — and in this file actively wrong, since sail 4 is `Reef + Jib 2` while 3 and 5 are `Main + Jib 3` and `Reef + Jib 3`. Use two different lookups:

- **Polar → bilinear interpolation** on a continuous quantity (verified above).
- **Sail chart → step lookup** on a categorical one.

Do not resample either file onto the other's axis. Keep both at native resolution and query each at the live `(TWA, TWS)`:

```ts
export function conditionsAt(
  polar: PolarFile, plan: SailPlan, twaSigned: number, tws: number,
) {
  const twa = Math.abs(twaSigned);
  return {
    targetSpeedKt: polarSpeed(polar, twa, tws),   // bilinear, continuous
    recommendedSailId: sailAt(plan, twa, tws),    // step lookup, categorical
  };
}
```

For `sailAt`, prefer a **floor/step** lookup over nearest-neighbour on the TWS axis — take the largest axis value `<= tws` (and clamp below the first column). Rationale: the columns are *crossover thresholds*, so a boat in 24.6 kt should still be on the 24 kt recommendation and should not jump to the 25 kt one early. Nearest-neighbour would round 24.6 up to 25 and retire the A2 half a knot too soon — a real difference in this file, where col24 and col25 differ in 6 of 26 rows. On the TWA axis, nearest-neighbour is fine (angles are samples of a smooth boundary, not thresholds), but note the axis is irregular (5° steps to 140°, then 10°).

Two smaller consequences worth encoding:

- The polar's TWS axis is a **strict subset** of the chart's, so every polar column has an exact chart column. If you ever *do* need a joined table, iterate the polar's axis and look the sail up exactly — no interpolation needed in that direction. The reverse (chart → polar) needs interpolation for TWS 18, 22, 25, 30.
- The chart's TWS axis extends to **30 kt** while the polar stops at **24**. Above 24 kt you have a sail recommendation but **no trustworthy target speed** — the polar is being extrapolated by clamping, and qtVlm's real behaviour there is unverified. Surface the sail advice and suppress the target, rather than showing a clamped number as if it were a prediction.
- Likewise the chart starts at TWA 35 and the polar at 30. Below 35° there is no sail recommendation at all — which is consistent with Q11's finding that below ~45° there is no meaningful target either.
