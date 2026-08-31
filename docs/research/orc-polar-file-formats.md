# Sailing polar & sail-selection file formats (`.pol`, `.sailselect`, `.saildef`)

Research reference for building a TypeScript parser and a Postgres schema.

**Subject files** (Handsome Pete, a Beneteau 10R racing on Lake Michigan):

| File | Path |
|---|---|
| Polar | `/Users/apieprzycki/Documents/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol` |
| Sail selection grid | `/Users/apieprzycki/Documents/git/Handsome-Pete/sail-selection/HandsomePete_2026.sailselect` |
| Sail definitions | `/Users/apieprzycki/Documents/git/Handsome-Pete/sail-selection/HandsomePete_2026.saildef` |

**Primary documentation source**: `/Users/apieprzycki/Documents/git/Handsome-Pete/instrument-documentation/qtVlm_documentation_en_5.12.27` (PDF v1.7, 300 pages; the printed footer number is physical page − 1 — **all page citations below are printed page numbers**). The same manual is published at <https://download.meltemus.com/qtvlm/qtVlm_documentation_en.pdf>.

> **Citation check.** Every qtVlm page citation in this document was verified by extracting the PDF (`pdftotext -layout`) and locating each quoted phrase, plus rendering pp. 38 and 41 as images to read the two screenshots that carry no extractable text. Three citations were off by one (they named the physical page rather than the printed one) and have been corrected. No qtVlm quotation in this document is paraphrased or reconstructed.

**Primary empirical source**: 11 VDR CSV recordings in `/Users/apieprzycki/Documents/git/Handsome-Pete/raw-regatta-recordings/` (4,319 rows), whose `POL` column is the navigation software's own evaluation of the polar file. This turned out to be the single most valuable evidence available, and it settles more than the documentation does.

**External sources** (retrieved and read; none of these citations is second-hand unless labelled so):

| Source | What it settles | Kind |
|---|---|---|
| [ORC Rating Systems 2026](https://orc.org/uploads/files/Rules-Regulations/2026/ORC-Rating-Systems-2026.pdf) | The authoritative certificate TWS/TWA grid | Official (authority) |
| [ORC VPP Documentation 2026](https://orc.org/uploads/files/Rules-Regulations/2026/ORC-VPP-Documentation-2026.pdf) | `TA = 3600/v`; the VPP's internal angle set | Official (but see the stale-text warning in Q9) |
| [ORC Speed Guide Explanation 2025](https://orc.org/uploads/files/Rules-Regulations/2025/Speed-Guide-Explanation-2025.pdf) | 10 m wind reference height; AA/DA not applied | Official |
| [ORC Speed Guide sample](https://orc.org/uploads/files/Speed-guide-for-Sample.html.zip) | `BTV` vs `VMG` columns, with checkable arithmetic | Official |
| `data.orc.org/public/WPub.dll?action=DownRMS&ext=json&Family=1&VPPYear=2026&CountryId=USA` | 901 live USA certificates, all on one grid | Official live data |
| [qtVlm manual](https://download.meltemus.com/qtvlm/qtVlm_documentation_en.pdf) | The `.pol`/`.csv`/`.sailselect`/`.saildesc` formats | Official (vendor) |
| [Expedition manual](https://www.expeditionmarine.com/downloads/documents/Expedition.pdf) | Negative evidence: Expedition has none of these formats | Official (vendor) |
| [qtVlm polar library](http://download.meltemus.com/polars/) — 273 files downloaded | Real-world distribution of header tokens and delimiters | Primary data corpus |
| [`jieter/orc-data`](https://github.com/jieter/orc-data) | The ORC → `.pol` converter; likely origin of *this* file | Third-party open source |
| [`nohal/qtVlm` `src/Polar.cpp`](https://github.com/nohal/qtVlm/blob/master/src/Polar.cpp) | qtVlm's actual parse + zero-padding logic | Third-party open source (an *older fork*; current qtVlm is closed) |
| [`rgleason/weather_routing_pi` `src/Polar.cpp`](https://github.com/rgleason/weather_routing_pi/blob/master/src/Polar.cpp) | OpenCPN's tolerances, blank-vs-zero convention, size caps | Third-party open source |
| [zapfware polar formats](https://www.zapfware.de/nmearemote/polar/) | The best single overview of all format families | Third-party write-up (not authoritative) |
| [Avalon Offshore](https://www.avalon-routing.com/) | A same-name, different-file "SailSelect" | Official (vendor) for that product |

**Sources that could not be reached** — stated so that absences are not mistaken for findings:

- **Sailing Anarchy forums**: inaccessible. `forums.sailinganarchy.com/search/...` returns HTTP 307 to a bot paywall (`tollbit.sailinganarchy.com`). **No Sailing Anarchy thread is cited anywhere in this document.**
- **qtVlm user forums**: not reachable, which is why the `.saildef`-vs-`.saildesc` naming history stays `[UNRESOLVED]`.
- **Not verified**: iRegatta, savvy-navvy, Zezo, and Adrena primary documentation; Deckman's format (Bluewater Racing's polar-formats page now 404s). `iregatta.com/help/polar` returns HTTP 200 with zero text (JavaScript-rendered). Where this document says "could not find", that reflects this constraint — not a claim that no source exists.
- **PredictWind's blank-first-cell requirement** is unverified: read on help pages but with no verbatim quote captured.
- **zapfware's "ORC export polar format"** row vocabulary appears to be a community convention; no ORC document specifying that *file layout* was found. It is cited as a third-party write-up only.
- Search tooling was degraded (no `WebSearch`; most engines blocked automated access). Findings came from direct `curl`/`WebFetch` against known URLs, the `gh` CLI, and repository clones.

Confidence tags used throughout: `[DOCUMENTED]`, `[INFERRED FROM FILES]`, `[UNRESOLVED]`. Where a `[DOCUMENTED]` claim rests on third-party open source or a third-party write-up rather than a vendor/authority document, that is stated inline.

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

8. **There is no published standard for the polar grid format.** It is a de facto convention with at least five mutually incompatible interpretations of the `.pol` extension alone. `[DOCUMENTED]` — see Q9.

9. **The file's `4;6;8;10;12;14;16;20;24` TWS axis is genuine, current ORC output — not extrapolation.** ORC added 24 kt in 2024 and 4 kt in 2025. All 901 live USA 2026 certificates use exactly this axis. `[DOCUMENTED]` — see Q9. (This corrects the widely-repeated "ORC publishes 6–20 kt" claim, which several *official ORC documents still print*.)

10. **ORC publishes boat speed for its eight fixed angles and VMG for beat/run** — as time allowances in s/NM, converted with `v = 3600/TA`. This independently corroborates the Q11 verdict. `[DOCUMENTED]`

11. **This file bears `jieter/orc-data`'s exporter signature** (lowercase `twa/tws` preamble + semicolon), not qtVlm's own (`TWA\TWS` + tab). That identifies the ORC → `.pol` conversion path concretely. `[DOCUMENTED]` (third-party open source) + `[INFERRED FROM FILES]`

### Unsettled

- **The exact qtVlm coefficient that makes `POL` unreproducible for 7 of the 11 recordings**, and the date it was applied. The polar file is confirmed to be the same one all season (see Q11); a coefficient inside the qtVlm installation moved, and it is recorded neither in the file nor in the export. `[UNRESOLVED]` — see Q11, "The mid-season coefficient change".
- **Whether the `.sailselect`/`.saildef` pair was ever loaded into qtVlm at all.** Given the wrong extension on one of them and no code that reads them, probably not. `[UNRESOLVED]`
- **qtVlm's behaviour above the top of the grid** (TWS > 24, TWA > 180). Never exercised in the data, never documented. Note that OpenCPN, by contrast, *refuses* to extrapolate and returns a distinct error — see Q11. `[UNRESOLVED]`
- **The provenance of the specific 25° ramp anchor** in rows 30/35. The ramp *mechanism* is now confirmed as endemic (68 of 273 official library polars show it), but every library exemplar anchors at TWA 0 with 5°/10°/15° steps; none anchors at 25°. That choice looks bespoke to whatever built this file. `[UNRESOLVED]`
- **Where TWA rows 100, 160 and 170 came from.** They are in neither ORC's published nor its internal angle set. Row 100 is a provable exact interpolation; 160 and 170 are *not* linear interpolations of 150/180 (residuals 0.43 and 0.35 kt), so they carry real curvature from some smoothing or spline step. `[UNRESOLVED]`
- **The meaning of `0` in a `.sailselect` cell.** Undocumented in qtVlm; OpenCPN's polar convention (blank = interpolate, `0.0` = invalid) is suggestive but is about *polars*, not sail charts. `[UNRESOLVED]`
- **Maximum grid size.** No vendor documents one; OpenCPN's source caps TWS columns at 200. `[UNRESOLVED]` as a format rule.

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

`[INFERRED FROM FILES]` — Despite that, qtVlm demonstrably loaded and evaluated this exact table: my reimplementation of the grid reproduces the logged `POL` column for 1,639/1,640 rows in the first four recordings. So **the shipping qtVlm does not use the file extension to choose the delimiter** — it sniffs, or accepts either. A parser must do the same. **Do not trust the extension to imply the delimiter.**

This conflict is sharper than it looks, because an *older open-source qtVlm fork* chooses the delimiter from the extension and would have **rejected** this file outright. `[DOCUMENTED]` (third-party open source) — [`nohal/qtVlm` `src/Polar.cpp`](https://github.com/nohal/qtVlm/blob/master/src/Polar.cpp):

```cpp
isCsv = fname.endsWith("csv",Qt::CaseInsensitive);
if(isCsv) list = line.split(';'); else list = line.split('\t');
if(list[0].toUpper() != "TWA\\TWS" && list[0].toUpper() != "TWA/TWS" && list[0].toUpper() != "TWA")
    { /* error: "Fichier %1 invalide (doit commencer par TWA\TWS et non '%2')" */ }
```

Split a semicolon file on TAB and `list[0]` becomes the entire header line, which fails the sentinel check. **The files win: our `.pol` was demonstrably read, so current qtVlm (closed source, Meltemus) must have relaxed this.** Two caveats to record honestly: `nohal/qtVlm` is a fork of the *former* open-source qtVlm and may lag the shipping build by years, and it is possible the boat's copy was installed under a `.csv` name. Either way, **the shipping behaviour is more permissive than both the manual and the fork**, and a parser should be too.

**Is `.pol` a published standard?** No — and the `.pol` extension is in fact **overloaded across at least four mutually incompatible formats**. `[DOCUMENTED]`

The clearest statement of this comes from a third-party implementer who supports all the variants (a credible write-up, *not* an authority) — [zapfware](https://www.zapfware.de/nmearemote/polar/):

> "A polar file contains the table representation of the polar data. **A problem is that there is no standard definition for these files.** As some navigation and routing programs are supporting polars, the big players have defined their own format."
> "In general they are all CSV … the file extensions are either `.csv`, `.txt` or `.pol` (a pseudo file extension for polar)."
> "The rule is that the first line starting with 'TWA/TWS' (sometimes 'Windspeed' or only 'TWA' by MaxSea, Adrena and SailGrib) defines the TWSs, and the first column of each row defines the TWA."
> "The POL (.pol) format is the same except is uses a TAB as separator."

The four incompatible meanings of `.pol`:

1. **qtVlm / SailGrib lineage** — the grid, **TAB**-delimited (`.csv` = the same grid, semicolon). Delimiter by extension. `[DOCUMENTED]`
2. **Expedition / Deckman** — a *completely different* format: one line per TWS followed by TWA/BSP pairs. `[DOCUMENTED]` (Expedition manual)
3. **OpenCPN `weather_routing_pi`** — writes semicolon; accepts space, `;`, `,`, TAB interchangeably. `[DOCUMENTED]` (third-party open source)
4. **PredictWind** — grid form, but the first header cell must be **blank**. `[UNRESOLVED]` — I read this on PredictWind help pages but captured no verbatim quote; treat as unverified.

`[INFERRED FROM FILES]` — **The convention is measurable.** Downloading the entire official qtVlm polar library (273 files, `http://download.meltemus.com/polars/`, whose index page credits SailGrib for many of them):

```
First header cell:  TWA\TWS 164 | TWA 86 | TWA/TWS 11 | twa/tws 4 | twa\tws 2
                    -1 2 | '' 1 | BOM+TWA/TWS 1 | BOM+twa/tws 1 | <!DOCTYPE 1
Extension/delimiter: (.pol, TAB) 234 | (.csv, SEMI) 36 | (.csv, COMMA) 1
                     (.pol, SPACE) 1 | (.pol, SEMI) 1
```

So the `.pol`-means-TAB / `.csv`-means-semicolon split holds in **234 of 236** `.pol` files. **Our file is in the 1-in-236 minority** — a semicolon-delimited `.pol`. That is not a corruption, but it *is* unusual, and it is a direct consequence of its provenance (below). Note also that two files in the official library are outright broken (one is an HTML error page saved as a polar, one starts `-1`), which is a good argument for defensive parsing.

**Which programs read the grid format** — establishing that it is genuinely shared, not qtVlm-private:

| Program | Reads the grid? | Evidence | Confidence |
|---|---|---|---|
| qtVlm | Yes — `.csv` semicolon, `.pol` tab, Maxsea XML | Manual p. 38; `src/Polar.cpp` | High |
| OpenCPN `weather_routing_pi` | Yes — ` ;,\t\r\n` all accepted | Third-party open source | High |
| SailGrib / SailGrib WR | Yes — and tolerates decimal commas | Vendor help pages | High |
| NMEAremote | Yes — CSV, POL, "ORC export", Expedition | Vendor (that app) | High |
| Avalon Offshore | Yes, but **comma**-delimited `.csv` | Vendor | High |
| **Expedition** | **No** — different format entirely | Expedition manual | High |
| Deckman | Expedition-style pairs format | zapfware only; Bluewater Racing's page now 404s | Low (second-hand) |
| Maxsea | XML variant; also cited as bare `TWA` header | qtVlm manual + zapfware | Medium |
| Adrena | Cited as using a bare `TWA` header | zapfware only; no Adrena primary doc found | **Low — `[UNRESOLVED]`** |
| iRegatta, savvy-navvy, Zezo | Unverified | help pages are JS shells or absent | **`[UNRESOLVED]`** |

### How you get from an ORC certificate to a `.pol` file

`[DOCUMENTED]` — qtVlm documentation p. 31 recommends `http://jieter.github.io/orc-data/site/` as a polar source, alongside Meltemus' own "Polars server" ("More than 250 polars available") and an "Import polar" function. That third-party project (`jieter/orc-data`) converts published ORC certificate data into downloadable polar grids. **This is the documented ORC → `.pol` bridge, and it is a community project, not an ORC product.**

So the pipeline is: ORC issues a certificate containing VPP-predicted performance → a third-party tool (or a person with a spreadsheet) reshapes that into the TWA × TWS grid convention → qtVlm reads it.

**And this file is identifiably a `jieter/orc-data` export.** `[DOCUMENTED]` (third-party open source) — [`src/polar-csv.js`](https://github.com/jieter/orc-data/blob/master/src/polar-csv.js):

```js
const CSV_PREAMBLE = 'twa/tws';
const CSV_SEPARATOR = ';';
export function polarImport(str) {
    if (str.trim().indexOf(CSV_PREAMBLE) !== 0) { throw 'CSV should start with ' + CSV_PREAMBLE; }
    var rows = str.split(/\r?\n/).filter((s) => s.length > 0 && s[0] != '#');  // '#' comments
    ...
}
```

**Lowercase `twa/tws` + semicolon is exactly this exporter's signature**, and it is exactly what our `.pol` has — while being 1 of only 236 `.pol` files in the official qtVlm library that is semicolon-delimited. That resolves the delimiter oddity: the file was produced by the ORC converter (semicolon, lowercase) and then given the `.pol` extension by hand.

### What ORC itself publishes — now settled

`[DOCUMENTED]` — [*ORC Rating Systems 2026*](https://orc.org/uploads/files/Rules-Regulations/2026/ORC-Rating-Systems-2026.pdf), Introduction p. 2, verbatim:

> "Boat ratings are matrix of time allowances calculated from the predicted boat speeds for **9 different true wind speeds (4, 6, 8, 10, 12, 14, 16, 20 and 24 knots)** and **8 true wind angles (52°, 60°, 75°, 90°, 110°, 120°, 135°, 150°)**, and two optimum angles on sailing upwind and downwind for which VMG (Velocity Made Good) is maximized."

And Rule 402.2 in the same document:

> "ORC certificate provide a range of ratings (**time allowances expressed in s/NM**) for different wind conditions in the range of 4 – 24 knots of true wind speed from optimum beat, over 52, 60, 75, 90, 110, 120, 135, 150 degrees of true wind angle to the optimum run."

`[DOCUMENTED]` (official live data) — Confirmed against 901 USA certificates pulled from ORC's public endpoint, `data.orc.org/public/WPub.dll?action=DownRMS&ext=json&Family=1&VPPYear=2026&CountryId=USA`. Across all 901, without exception:

```
WindSpeeds variants: Counter({(4, 6, 8, 10, 12, 14, 16, 20, 24): 901})
WindAngles variants: Counter({(52, 60, 75, 90, 110, 120, 135, 150): 901})
```

**This is the single most useful external finding, and it corrects a widely-repeated claim.** ORC expanded the grid recently — from the yearly official dumps archived in `jieter/orc-data`:

```
ALL2019 … ALL2023.json : speeds = (6, 8, 10, 12, 14, 16, 20)         7 speeds
ALL2024.json           : speeds = [6, 8, 10, 12, 14, 16, 20, 24]     24 kt added
ALL2025.json           : speeds = [4, 6, 8, 10, 12, 14, 16, 20, 24]  4 kt added
```

Corroborated inside ORC's own VPP documentation §5.1.3: *"…the introduction of the solution at TWS=24 knots complicated even more the scenario. A revised scheme (2024) allows the depowering by reef and flat in parallel…"*

**Therefore our file's `4;6;8;10;12;14;16;20;24` axis is genuine, current ORC output. The 4 kt and 24 kt columns are computed by the ORC VPP, not extrapolated by a converter.** This was the specific thing I previously could not verify, and it is now settled in the *reassuring* direction: the polar can be trusted at the edges of its wind range as much as anywhere else (subject to the separate row-level caveats below).

**A warning if you cite sources on this**: several *official ORC documents are themselves stale or self-contradictory.* The **2026** VPP Documentation §8.1.1 still says *"7 different true wind speeds (6-8-10-12-14-16-20 knots)"*; the 2025 *Speed Guide Explanation* says *"**seven** different True Wind Speeds (TWS): 6, 8, 10, 12, 14, 16, 20 and 24 knots"* — says seven, lists eight. Treat *ORC Rating Systems 2026* plus the live RMS data as authoritative and the VPP Documentation's §7/§8 grid statements as legacy text.

**The certificate's row vocabulary**, decoded from the live RMS field names:

```
BeatAngle  optimal beat angle @tws (degrees)
Beat       Beat VMG @tws          (s/NM)  <- VMG, at BeatAngle
R52 … R150 time allowance @twa/@tws (s/NM) <- BOAT SPEED at that fixed angle
Run        Run VMG @tws           (s/NM)  <- VMG, at GybeAngle
GybeAngle  optimal gybe angle @tws (degrees)
```

plus per-course allowances `DW180`, `DW165`, `DW150`, `WL`, `CR`, `OC`. Convert with `[DOCUMENTED]` VPP Documentation §8.1.2: *"velocity predictions are also expressed as time allowances in s/NM where **TA = 3600/v**."*

**Crucially, ORC's internal angle set is finer than the published one.** `[DOCUMENTED]` VPP Documentation §7.2 "Sailing angles":

> "The VPP calculates the sailing speed at the following true wind angles and wind speeds:" — `TWS: 6 8 10 12 14 16 20`, `TWA: vmgup 52 60 70 75 80 90 110 120 135 150 165 180 vmgdn`

So 70, 80, 165 and 180 exist internally and appear in the Speed Guide, but are not on the certificate's allowance table.

### Which of our 16 rows are certificate data

`[INFERRED FROM FILES]` + `[DOCUMENTED]` — Now that the ORC angle sets are known rather than assumed:

```
TWA axis in file: [30, 35, 40, 45, 52, 60, 75, 90, 100, 110, 120, 135, 150, 160, 170, 180]
in ORC published: [52, 60, 75, 90, 110, 120, 135, 150]
NOT in published : [30, 35, 40, 45, 100, 160, 170, 180]
NOT in internal  : [30, 35, 40, 45, 100, 160, 170]      <- 180 IS in the internal set
```

Testing every interior row for being an exact linear interpolation of its two neighbours:

```
  TWA  45 from 40/52 : max|resid| = 0.346
  TWA  52 from 45/60 : max|resid| = 0.116
  TWA 100 from 90/110: max|resid| = 0.005   <-- EXACT INTERP, carries no information
  TWA 110 from 100/120: max|resid| = 0.195
  TWA 135 from 120/150: max|resid| = 1.615
  TWA 160 from 150/170: max|resid| = 0.250
  TWA 170 from 160/180: max|resid| = 0.140
linear test 150/180 -> 160: max|resid| = 0.427
linear test 150/180 -> 170: max|resid| = 0.353
```

Row-by-row verdict:

| Row(s) | Status |
|---|---|
| 52, 60, 75, 90, 110, 120, 135, 150 | **ORC certificate data.** Exactly the published fixed-angle set. |
| 180 | **Plausibly ORC**, from the internal set / Speed Guide (which prints 165 and 180). |
| 40, 45 | **Derived from ORC beat data** (`BeatAngle` + `Beat` VMG), converted; 40 is partly ramp-governed in light air (Q11). |
| 100 | **Synthetic — exact midpoint of 90 and 110** (residual 0.005). Zero information. |
| 160, 170 | **Origin unknown but not trivially synthetic.** Neither is a linear interpolation of 150/180 (residuals 0.43 and 0.35 kt), so they carry real curvature — likely a spline or the converter's own smoothing. Neither angle is in ORC's published or internal set. `[UNRESOLVED]` |
| 30, 35 | **Synthetic linear ramp.** See Q11. |

**Conclusion for Q9 on `.pol`:** the format is a vendor-documented, industry-shared convention with **no published standard** and an overloaded extension; ORC's own grid is now confirmed and our file's TWS axis matches it exactly; but the file's *TWA* axis has been reshaped and padded by the conversion step, so 3 of its 16 rows are provably or probably manufactured and 2 more are partly so.

### The VMG → boat speed conversion, which is where converters go wrong

`[DOCUMENTED]` (third-party open source) — To place a Beat or Run figure into a fixed-angle polar cell, a converter must undo the VMG projection. `jieter/orc-data`'s [`src/util.js`](https://github.com/jieter/orc-data/blob/master/src/util.js):

```js
export function vmg2sog(beat_angle, vmg) { return vmg / Math.cos(beat_angle * DEG2RAD); }
```

Its "extended" export mode emits **sparse diagonal rows** — one row per TWS, each with a single non-zero cell at its own TWS column, because each TWS has a *different* optimum beat angle, and zeros elsewhere. Those zeros are a notorious trap: naive consumers read them as real 0-knot predictions. **Our file contains no sparse diagonal rows**, so it was exported in plain (non-extended) mode — good news, and one less hazard to handle.

**Worked example so the units are unambiguous** — TP 52 "SMOKE" (GPH 445.7), from the live 2026 USA pull, `[DOCUMENTED]` (official live data):

```
WindSpeeds [4, 6, 8, 10, 12, 14, 16, 20, 24]
R52    [647.6, 465.1, 414.9, 396.2, 385.5, 377.6, 371.9, 366.1, 369.3]
Beat   [1019.8, 712.9, 613.9, 575.0, 553.7, 539.9, 531.2, 526.0, 536.7]
BeatAngle [46, 43.7, 40.4, 39.2, 38.9, 38.5, 38.2, 38.2, 39.4]
```

At TWS 12: boat speed at 52° = `3600/385.5` = **9.34 kt**. Beat VMG = `3600/553.7` = **6.50 kt** at 38.9°, so close-hauled boat speed = `6.50/cos 38.9°` = **8.36 kt**. Note 8.36 < 9.34, as it must be. **And note that writing the Beat VMG straight into a 38.9° polar cell would understate close-hauled boat speed by ~22%** — the exact error mode Q11 has to rule out for our file.

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

**Definitive negative evidence for Expedition.** `[DOCUMENTED]` — I downloaded the full public [Expedition manual](https://www.expeditionmarine.com/downloads/documents/Expedition.pdf) and converted it to text. **Grepping the entire manual for `sailselect`, `saildef` and `saildesc` returns zero hits.** Expedition does not use these formats or these words.

Expedition *does* have an equivalent feature, but it is a different file with a different shape — verbatim from the manual:

> "The format of the sail chart file is a simple text table, with **TWA across, TWS down** and the **name** of each sail separated by **tabs**. See the sample file included with Expedition."

Note it is **transposed** relative to qtVlm's `.sailselect` (Expedition: TWA across / TWS down; qtVlm: TWS across / TWA down), **tab**-delimited rather than semicolon, and holds **names** rather than integer ids — so there is no chance of accidentally parsing one as the other, but also no chance our files came from Expedition.

**A name collision worth knowing about.** `[DOCUMENTED]` — [Avalon Offshore](https://www.avalon-routing.com/) has a feature it calls **SailSelect** with the same purpose, but plain **comma**-delimited `.csv` files rather than a `.sailselect` extension:

> "A SailSelect table (also under csv format) listing your preferred sail per TWS and TWA… **TWS and TWA are very flexible. You can use variable steps.**"

Its published template header is `TWA/TWS,0,4,8,10,12,16,18,20,24,28,32,40,50,60,70` and its cells contain *text* (e.g. `Voile inconnue`). Two things this independently corroborates: **irregular TWS steps like 18 and 28 are normal** in sail-selection charts (relevant to the `25` column, Q12), and **sail labels are free text in more than one language** (also Q12). If someone says "SailSelect", establish which product they mean.

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

`[UNRESOLVED]` — Where the `.saildef` spelling came from. It looks like an older qtVlm sample-file name (and it is the kind of thing that propagates through forum posts), but the qtVlm user forums were not reachable, so this is a guess and is recorded as one. What matters practically is settled either way: **the documented, required extension is `.saildesc`.**

### Does anything actually consume these files?

`[INFERRED FROM FILES]` — Searching the whole Handsome-Pete repo for any consumer:

```
$ grep -rniE "pol|sailselect|saildef|polar" scripts/ docs/ CLAUDE.md CONTEXT.md
scripts/compass_calibration.py:81:  ... subplot_kw={"projection": "polar"}
scripts/compass_calibration.py:239: ... subplot_kw={"projection": "polar"}
docs/adr/0001-sog-for-speed-gate.md:7: **STW** — more theoretically correct for polar analysis ...
CONTEXT.md:3: Tools and data for analyzing sailing performance from race recordings, ...
```

The only `polar` hits are matplotlib polar-projection plots. **No script in the repo reads `.pol`, `.sailselect`, or `.saildef`.** `requirements.txt` is just `pandas / pyyaml / matplotlib`.

The answer differs sharply between the polar and the sail pair:

- **`.pol` — a live, proven input.** qtVlm reads this format, and demonstrably read *this table*: the `POL` column of the first four recordings is reproduced from it to the printed decimal. It is consumed by the navigation software even though no repo code parses it.
- **`.sailselect` / `.saildef` — no observable consumer.** The format is genuine qtVlm, but one of the two files carries a non-qtVlm extension, and no code in the repo reads either. There is **no observable consumer of the pair anywhere** — no sail-selection output appears in the VDR exports, and the grid's sail numbers never appear in any recording. The `SAIL_CONFIG` column in `cleaned-recordings/` uses the *metadata.yaml* word vocabulary (`main+jib-1`, `main+A2`, …), **not** `.saildef` indices.

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

`[DOCUMENTED]` (third-party open source) — **The case-insensitivity is confirmed in source, and a bare `TWA` is also accepted.** Both qtVlm and OpenCPN uppercase before comparing, and both accept three spellings:

```cpp
// nohal/qtVlm src/Polar.cpp
if(list[0].toUpper() != "TWA\\TWS" && list[0].toUpper() != "TWA/TWS" && list[0].toUpper() != "TWA") { /* reject */ }

// rgleason/weather_routing_pi src/Polar.cpp
// polar file has optional first line which is description
for (;;) {
  token = strtok_polar(line, &saveptr);
  while (*token < 0) token++;                 /* chomp invisible bytes (BOM) */
  if (!strcasecmp(token, "twa/tws") || !strcasecmp(token, "twa\\tws") || !strcasecmp(token, "twa")) break;
  if (linenum == 2) PARSE_ERROR(_("Unrecognized format."));
}
```

Note two extra OpenCPN behaviours worth copying: it **scans up to two lines** for the sentinel (the first line may be a free-text description), and it **strips a BOM** before comparing.

**But not every implementation is lenient.** `jieter/orc-data` requires **lowercase `twa/tws` at byte offset 0**, case-*sensitively* (`str.trim().indexOf('twa/tws') !== 0`). So the two ends of the pipeline that produced our file disagree: the exporter insists on lowercase, and qtVlm's documentation prints uppercase. That is precisely why a parser must accept both.

**Observed and permitted first-cell values**, with real-world frequencies from the 273-file official qtVlm library `[INFERRED FROM FILES]` (a primary data corpus):

| Value | Count in 273 | Evidence |
|---|---|---|
| `TWA\TWS` | 164 | `[DOCUMENTED]` qtVlm p. 38 and its example — **the most common form in the wild** |
| `TWA` (bare) | 86 | `[DOCUMENTED]` accepted by qtVlm and OpenCPN source; zapfware attributes it to MaxSea, Adrena, SailGrib |
| `TWA/TWS` | 11 | `[DOCUMENTED]` qtVlm p. 38, p. 33; and our `.sailselect` |
| `twa/tws` | 4 | `[INFERRED FROM FILES]` our `.pol`; `jieter/orc-data`'s exporter emits this |
| `twa\tws` | 2 | observed in the corpus |
| BOM + `TWA/TWS`, BOM + `twa/tws` | 2 | **BOMs occur in real files** — see Q13 |
| `-1`, `''`, `<!DOCTYPE` | 3 | genuinely corrupt files (one is a saved HTML error page) |
| blank | 1 | occurs, but is also PredictWind's *required* form `[UNRESOLVED]` |

So a bare `TWA` is the **second most common** header in the wild — my earlier note that it was "never observed" was wrong, and the corpus settles it. This matters: a parser matching only the two slash forms would reject a third of all real polars.

**Recommendation for a parser: skip line 1's first cell for *routing* purposes, but validate it leniently.** Strip any BOM, trim, lowercase, normalise `\` to `/`, and accept `twa/tws` **or bare `twa`**. Allow one arbitrary description line before the header (OpenCPN's rule). Emit a *warning* — not an error — on anything else, including blank, because a mismatch is a strong smell that the file is transposed (TWS down the side, TWA across the top) or is a different format entirely. That is the real risk the token protects against. Do not hard-reject: the one real-world file we have would fail an exact-match check, and 86 library files would fail a slash-only check.

---

## Q11. What the `.pol` numbers mean

### Verdict: boat speed (STW) in knots. Not VMG. High confidence.

This is settled by documentation and by two independent empirical tests that agree.

`[DOCUMENTED]` — qtVlm p. 38, on the polar grid: *"The table is then filled with a value in each cell that will indicate the **boat's speed** for that couple TWS/TWA."* Units are knots (same page: *"The 1st line contains wind speeds **in knots**"*, and p. 267 ties the grid to the `STW` field: *"You can show which coefficients have been applied on Polar Speed by hovering **STW** field with the mouse."*).

`[DOCUMENTED]` — qtVlm treats VMG as **derived from** the polar, never stored in it: p. 41, *"This dialog shows critical angles for the polar (**best VMGs**)"*; p. 209, *"The red parts on the dial represent the polar VMG limits and are recomputed dynamically"*; p. 257, *"Normally qtVlm calculates automatically best angles upwind and downwind based on the polar."* A polar file that already contained VMG would make all of this incoherent.

`[DOCUMENTED]` — And the `POL` log column is the polar grid evaluated directly, not a VMG: p. 77, *"qtVlm will insert a POL column which contains **the calculated current polar speed of your boat, for the couple TWS/TWA**"*; p. 218 (`PSP` instrument), *"This LCD displays theoretical polar speed for the current couple TWS/TWA."*

**ORC independently confirms this, and its own publication makes the units checkable.** `[DOCUMENTED]` — I obtained an actual [ORC Speed Guide sample](https://orc.org/uploads/files/Speed-guide-for-Sample.html.zip). It contains 35 tables (5 sail configurations × 7 TWS) whose column headers are:

```
TWA | BTV | VMG | AWS | AWA | Heel | Reef | Flat
```

Sample rows from the TWS = 6 kt table:

```
 42.0°  BTV 5.61  VMG 4.17  AWS 10.83  AWA 21.6°  Heel 6.2°  Reef 1.00  Flat 1.00
 52°    BTV 6.26  VMG 3.85
 90°    BTV 6.68  VMG 0.00
142.4°  BTV 4.82  VMG 3.82
```

Verify the arithmetic: `5.61 × cos 42° = 4.17`. `4.82 × |cos 142.4°| = 3.82`. VMG at 90° is exactly `0.00`. So **`VMG = BTV × cos(TWA)`, `BTV` is boat velocity through the water, and both are in knots** — ORC publishes them as two distinct, separately-labelled quantities. Combined with the certificate row vocabulary in Q9 (`R52`…`R150` = boat speed, `Beat`/`Run` = VMG), the source data unambiguously *distinguishes* the two, so a converter that produced our file had both available and no reason to conflate them. This is documentary corroboration of the empirical verdict below, from an entirely independent direction.

**Two ORC caveats that bear directly on Layline.** `[DOCUMENTED]` — [*Speed Guide Explanation 2025*](https://orc.org/uploads/files/Rules-Regulations/2025/Speed-Guide-Explanation-2025.pdf):

> "Note that your boat's Age Allowance (AA) and Dynamic Allowance (DA) are not applied in the polars"
> "Predictions are given on the polar diagrams and data sheets for true wind velocities (VTW) of 8 knots, 10 knots, 12 knots and so forth. **The VTW shown is calculated to be at 10 meters (33 ft.) above the water.**"

**The 10 m reference height is the important one.** The polar's TWS axis is defined at **10 m / 33 ft**, which is *not* the boat's masthead and *not* Harrison Dever's 85 ft. Feeding an 85 ft CHII2 reading straight into this polar as "TWS" will select a column 20–30% too high and therefore overstate the target speed. (For reference, Expedition documents the standard correction explicitly — `Twswand = Tws10m · (h/10)^a` with the Hellmann exponent `a ≈ 0.11–0.14` at sea — and notes that *"most yacht designers' polar files are scaled to a 10 metre height wind, most sailors want the polars and targets scaled to masthead instrument height."*) Note also that ORC changed its roughness length in 2022 (`z0` from 0.001 to 0.005), which *"has the effect of reducing wind velocities at lower levels"* — so polars from different certificate years are not strictly comparable at the same nominal TWS.

Per the project's raw-data-integrity principle: **do not rewrite the buoy reading.** Do the height correction at the point of *polar lookup*, record which height convention each input carries, and say so in the UI.

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

**The decisive external point: ORC publishes nothing below the optimum beat angle.** `[DOCUMENTED]` — On the certificate the lowest fixed angle is **52°**, and the only sub-52° datum is the optimum beat angle itself (typically 38–46°), reported as a *VMG at a per-TWS angle*. In the ORC Speed Guide sample I examined, the first row of each table **is** the optimum beat angle (42.0° at TWS 6) — there are no rows below it at all. **ORC never asserts a boat speed at 30° or 35°.** So those rows in an ORC-derived polar were necessarily manufactured by the converter. This is no longer an inference from the numbers; it follows from what the source data contains.

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

**This artifact is endemic, and it can be quantified.** `[INFERRED FROM FILES]` — Across the 273 files in the official qtVlm polar library, testing for the ramp signature (second non-zero TWA row ≈ 2 × the first):

```
Files with the linear-ramp signature: 68 / 273  (25%)
  e.g. A31.pol, A35.csv, Bavaria38.pol, Class40.pol, Figaro2.pol, First31_7.pol, ...
  — in ALL of these the ramp sits at TWA 5 / 10 / 15
Files whose first data row is >= 20 deg AND next row ~2x: NONE
```

One polar in four in the *official library* contains this exact construction. A worked example, `Bavaria38.pol`:

```
TWA\TWS  0   4    6    8    10   12   14   16   20   25   30   35   40 ...
0        0.0 ... all zeros ...
5        0.0 0.3  0.5  0.6  0.7  0.8  0.8  0.9  0.9  0.9  0.8  0.7  0.1
10       0.0 0.6  0.9  1.2  1.4  1.6  1.7  1.7  1.8  1.7  1.6  1.3  0.3
15       0.0 0.9  1.4  1.8  2.2  2.4  2.6  2.6  2.6  2.6  2.5  2.0  0.7
...
32       0.0 2.0  3.1  4.0  4.9  5.5  5.8  5.9  6.0  5.9  5.6  4.5  3.4
```

Rows 5/10/15 are a clean 1×/2×/3× ramp, then a **discontinuous jump at row 32** where real data begins.

**The likely mechanism, and it explains our file too.** `[DOCUMENTED]` (vendor help pages) — SailGrib documents building polars on a *fixed* axis: TWA at "0°, 5°, 10°, 15°, 20°, 25°, 32°, 36°, 40°, 45°, 52°, 60°, …" and TWS at "0, 4, 6, 8, 10, 12, 14, 16, 20, 25, 30, …", compiled "from different sources like boat builders, naval architects or **ORC certificates**". `Bavaria38.pol` matches that grid cell-for-cell, and the Meltemus library index credits SailGrib for many of its files. So: **a fixed grid much wider than the source data, plus a format rule that every cell must have a value, equals ramps at the edges.** Confidence: high for the mechanism, medium for attributing this library's specific ramps to SailGrib's tooling.

`[UNRESOLVED]` — **The 25° anchor specifically is not attributable to any library exemplar.** No file in the 273 anchors its ramp at 25°; they all anchor at TWA 0 with 5° steps. Our file's "ramp to zero 5° below the lowest emitted row" looks like a bespoke converter choice. It does not change any recommendation here — the detection logic in Parser implications finds the crossing angle empirically rather than assuming one — but it is worth recording that the *specific* anchor is unexplained.

**So the ticket's three candidate explanations resolve as follows:**

- *"The file mixes conventions (VMG upwind, boat speed downwind)"* — **No.** Rejected by both empirical tests: at 45° the boat's *boat speed* matches the polar (ratio 0.98), not its VMG (0.72).
- *"30° is simply below the boat's optimal upwind angle, so genuinely slow"* — **Directionally right, but it is not a physical prediction.** The boat's real best-VMG angle per this polar is 40–45°, and 30° is indeed unsailable. But the values there are not a VPP's estimate of what happens at 30°; they are a straight line to zero at 25°.
- *"An ORC-derived convention worth knowing about"* — **Partly, and now precisely.** The convention is emphatically **not** ORC's; it is the *converter's* padding convention. ORC does not report a 30° or 35° figure at all — 52° is the lowest fixed angle on the certificate and the Speed Guide's tables start at the optimum beat angle. `[DOCUMENTED]` (ORC Rating Systems 2026 + ORC Speed Guide sample) — this was `[INFERRED FROM FILES]` before and is now documented.

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

`[DOCUMENTED]` — qtVlm's own sample polars **do include a TWA 0 row of zeros *and* a TWS 0 column of zeros**. Both of the manual's screenshots show it, and I read them directly (they carry no extractable text, so this is from the rendered images):

- **p. 38**, a spreadsheet view of `boat_Class40.csv`: header row `TWA\TWS` then `0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20…`; first data row is TWA `0` with `0.000` in **every** column; and the TWS `0` column reads `0.000` for **every** TWA row (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50…). The accompanying Notepad view confirms the on-disk form: `TWA\TWS;0;2;4;6;8;10;12;14;16;18;20;22;24;26…`.
- **p. 41**, the Polar Editor: TWS axis `0.0 … 60.0` in 2.0 kt steps, TWA rows `0.0° … 130.0°` in 5° steps, with the `0.0°` row and the `0.0` column both filled with `0.00` throughout.

So the padding-with-zeros convention is real and documented by example in two places — the vendor's own sample polars pad the grid rather than rely on extrapolation, which is precisely why qtVlm's evaluator synthesises those rows when they are absent.

`[INFERRED FROM FILES]` — In the corpus, a TWA 0 row is present in a clear majority but far from all files:

```
Files with an explicit TWA 0 row: 173 / 273  (63%)
First TWA row present:  0°:173  30°:10  32°:1  33°:1  35°:1  36°:3  40°:1  44°:9  45°:1  52°:71
```

So **a parser must handle both cases**, and 37% of real files omit the row.

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

**And this is now confirmed in source, not merely inferred.** `[DOCUMENTED]` (third-party open source) — `nohal/qtVlm` `src/Polar.cpp` does exactly this, including zero-padding short rows:

```cpp
bool missingTws0=false; if(tws.first()!=0.0) missingTws0=true;
if(firstTWA){ if(list.first().toDouble()!=0.0){ /* synthesize TWA 0 row of zeros */ } }
while(i<=tws.count()) polar_data.append(0);
```

That is an independent confirmation of the reverse-engineered algorithm from a completely different direction, and it upgrades the interpolation model from "empirically fitted" to "empirically fitted *and* corroborated by the vendor's own former source". The two agree.

**Contrast: OpenCPN deliberately refuses to do this**, and its choice is arguably the correct one for a *user-facing target*. `[DOCUMENTED]` (third-party open source) — the padding code exists but is compiled out (`#if 0 … #endif`), and instead:

```cpp
if (twa < degree_steps[0])         { *status = POLAR_SPEED_ANGLE_TOO_LOW;  return NAN; }
else if (twa > degree_steps[last]) { *status = POLAR_SPEED_ANGLE_TOO_HIGH; return NAN; }
...
if (optimize_tacking) { float vmgW = twa;
  if (VMGAngle(ws1, ws2, tws, vmgW))
    return Speed(vmgW, tws, status, bound, false) * cos(deg2rad(vmgW)) / cos(deg2rad(twa)); }
```

So OpenCPN either returns **NaN with an explicit "angle too low" status**, or — with tacking optimisation on — substitutes the VMG-optimal angle and rescales by `cos(vmg_angle)/cos(twa)`. **That is the right model for "you cannot point that high", and it is what Layline should implement for its own metric**, even though `polarSpeed()` must still reproduce qtVlm's zero-padded interpolation in order to match what the boat's instruments displayed. Keep the two concerns separate: *reproduce* qtVlm for reconciliation, *report* OpenCPN-style for the sailor.

**Is starting at 30° standard?** There is no standard, and 30° is in fact one of the **rarest** choices. `[DOCUMENTED]` qtVlm p. 38 is explicit: *"The steps between TWAs and TWs is free of constraints"*, and its own documented `.sailselect` example starts at TWA 40.

`[INFERRED FROM FILES]` — The real-world distribution of the first TWA row carrying *non-zero* data, across the 273 official library files, is strongly bimodal:

```
  5°: 148   <- synthetic wide-grid polars, ramping up from 0
 52°:  76   <- raw ORC conversions: nothing below the certificate's lowest angle
 44°:  11
 30°:  10
 40°:   5
 35°:   5
```

The two *honest* choices in the wild are "start at 52° because that is what ORC gives you" (76 files) or "start near 0° with an obvious ramp" (148 files). **Starting at 30–35° with real-looking numbers is the rarest and the most misleading option**, because unlike a 5° row containing 0.3 kt — transparently bogus at a glance — a 30° row containing 0.88–2.54 kt looks like data. Our file is in that unfortunate 15-file minority, which is exactly why the ticket's question arose.

Our polar starts at 30 and our sail chart at 35 — different axes in the same boat's file set. **A parser must not assume any particular first angle, step size, or that the two files share an axis.**

### Bonus finding: the mid-season coefficient change — `POL` is unreproducible for 7 of 11 recordings

> **Read the resolution at the end of this section before acting on it.** The heading below originally read "the polar in the repo is not the polar that logged 7 of 11 recordings." That inference was wrong: the polar file is the same all season, and a qtVlm coefficient is what moved. The measurements stand; the explanation was corrected.

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

**RESOLVED after this section was first written — the polar did not change. A qtVlm coefficient did.** Three findings overturn the inference above:

1. **The boat owner confirms one polar file for all 11 regattas.** The repo simply did not exist yet when recording started: Handsome-Pete's *initial* commit is 2026-07-27, and `git log --all -- 'polars/'` returns that single commit with no later modification. So the absence of earlier revisions reflects the absence of a *repo*, not the absence of a *file*.
2. **The polar's shape fits all 11 recordings; only a scalar moved.** Solving each row for the wind speed that would produce the logged `POL` at the logged `TWA` gives an implied-to-logged `TWS` ratio of **1.000 / 0.999 / 1.000 / 1.001** for the four June files and **0.857–0.908** for the other seven. A revised *grid* would distort the ratio non-uniformly across angles; a single coefficient compresses it, which is what is observed.
3. **qtVlm documents exactly this mechanism.** p. 267: *"You can show which **coefficients** have been applied on Polar Speed by hovering **STW** field with the mouse."* Polar Speed is a coefficient-bearing quantity by design, and the coefficients live in the installation, not in the file or the export.

Ruled out along the way: the polar input is `TWA`/`TWS`, not `GWS` or `AWS (calc)` — `TWA`/`TWS` matches 100% of June rows while `GWS` pairings match 15–31%, and `GWS/TWS` holds at 1.00–1.11 all season, so no wind-channel switch occurred.

`[UNRESOLVED]` — the coefficient's *value and date of change* are not recoverable from the files, and whether it was applied to the polar output or the wind input is not distinguishable from these data (neither a pure output scale nor a pure input scale reproduces every row).

**Schema consequence — corrected.** One polar artifact covers all 11 races, so a single version pointer per race is sound and effective-date ranges are not required for this data. The real consequence is different and narrower: **`POL` is not reproducible from the stored polar alone for 7 of the 11 races**, because qtVlm applied coefficients it recorded nowhere. Any percent-of-target Layline computes from the stored polar will disagree with the `POL` qtVlm logged by roughly 10–15% on those races. Two yardsticks that disagree — pick one and apply it consistently, or a season-wide aggregate silently compares June against August on different scales. Persisting the per-row `POL` keeps both options open.

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

**So the honest answer is: unknown semantics, because neither the specification nor the only real example provides one.** `[UNRESOLVED]` for `0` specifically.

There *is* a relevant convention from a neighbouring format, worth adopting by analogy but not worth claiming as this format's rule. `[DOCUMENTED]` (third-party open source) — OpenCPN's polar parser distinguishes blank from zero explicitly, and its warning text states the intended semantics outright:

```
blank cell -> NAN -> interpolated
token "0"  -> PARSE_WARNING("Warning: 0 values found in polar. These measurements will be
              interpolated. To specify interpolated, leave blank values. To specify course
              as 'invalid' use 0.0 rather than 0")
s < .05    -> s = 0
```

So in OpenCPN's model: **blank means "no measurement, interpolate it"; `0.0` means "this course is invalid".** On save it omits an all-zero TWS 0 column, writes NaN as an empty field, and writes a true zero as `0.01` to keep the two distinguishable. That is a well-designed convention and Layline should mirror its *spirit* — but note it is about **polars**, not sail charts, and it comes from a different program. Do not present it as qtVlm's rule for `.sailselect`.

**Recommendation:** reject empty cells in `.sailselect` (the format forbids them, and silently defaulting would fabricate a sail choice). Accept `0` but map it to an explicit `null`/"no recommendation" rather than guessing "don't sail" — and do not invent a "storm / stay home" meaning the format does not define. Layline's own storm messaging should come from wind classification, not from a sentinel in this grid.

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

`[DOCUMENTED]` — Independently corroborated by a second vendor. Avalon Offshore's published SailSelect template uses the axis `0,4,8,10,12,16,18,20,24,28,32,40,50,60,70` — also irregular, also with non-round steps — and its documentation states plainly: *"TWS and TWA are very flexible. **You can use variable steps.**"* Two unrelated products document irregular sail-chart axes, so this is the format's intent rather than a local quirk.

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
| **UTF-8 BOM** | **Absent.** First bytes are `7477 612f` (`twa/`), `5457 412f` (`TWA/`), `313b 4d61` (`1;Ma`) — no `EF BB BF` | **BOMs occur in real files** and must be stripped. `[INFERRED FROM FILES]` 2 of the 273 official qtVlm library polars begin with a BOM (`BOM+TWA/TWS`, `BOM+twa/tws`). `[DOCUMENTED]` (third-party open source) OpenCPN strips it explicitly before matching the sentinel: `while (*token < 0) token++;  /* chomp invisible bytes */`. qtVlm's documentation says nothing, so its own behaviour is `[UNRESOLVED]` — **strip defensively** |
| **Line endings** | **LF only.** `tr -cd '\r' \| wc -c` = **0** for all three files | `[UNRESOLVED]` — not documented. Windows-authored files are highly likely in this ecosystem (qtVlm is cross-platform, and the docs recommend editing polars in a spreadsheet and show a Notepad screenshot). **Accept CRLF and bare CR** |
| **Trailing newline** | **Inconsistent across the three files.** `.pol` and `.saildef` end with LF; **`.sailselect` does not** (last byte is `35` = `'5'`) | **Both cases occur in the same directory, from the same author.** A parser must handle a final line with and without a terminator, and must not treat the resulting empty final element as a row |
| **Trailing semicolons** | **Absent.** All rows have exactly the header's field count (`.sailselect`: `all rows same width: True (widths [13])`) | `[UNRESOLVED]`. Spreadsheet round-trips commonly add them. **Tolerate one trailing empty field; do not emit one** |
| **Comments** | **None present** (`hashes: 0` in all three) | **Two different markers exist, depending on lineage — this was previously unresolved and is now documented.** `#` — `[DOCUMENTED]` (third-party open source) `jieter/orc-data`, i.e. **the very tool that produced our file**: `.filter((s) => s.length > 0 && s[0] != '#')`. `!` — `[DOCUMENTED]` Expedition manual: *"Comments may be used in the polar file by adding a '!' character at the start of each comment line. Note that these comments aren't saved by Exp"* (Expedition files idiomatically open with `!Expedition polar`). **None** — qtVlm documents no comment syntax and its parser has none, so a `#` line would fail its numeric parse. OpenCPN has no marker but absorbs one arbitrary leading description line. **Recommendation: skip lines beginning `#` or `!` with a warning** — our file's own exporter emits `#` comments, so rejecting them would reject files from the upstream tool |
| **Blank lines** | **None present** | `[UNRESOLVED]` — not documented. **Skip them** (cheap, safe, and the likely product of a trailing newline or spreadsheet export) |
| **Non-ASCII in labels** | **Absent.** `grep -c '[^ -~\t]'` = **0**; label chars are `' +123AJMRSabcefghinp'` | **Must be supported.** `[DOCUMENTED]` — qtVlm's own p. 33 example uses French sail names (`GV + Genois`, `GV + Assym`); real-world files will contain accented characters (`Génois`, `Trinquette`). **Decode as UTF-8 with a Latin-1 fallback** |
| **Whitespace around values** | **None present.** Values are bare: `30;0.88;1.36;...` | `[UNRESOLVED]` — not documented. **Trim every field** before parsing. Spreadsheet exports and hand edits routinely introduce spaces |
| **Decimal separator** | **Always `.`** — `4.0`, `8.0`, `0.88`; max 2 decimal places; no bare integers in the polar body | **Implementations disagree, so this is a real interoperability hazard.** `[DOCUMENTED]` qtVlm p. 38: *"The decimal separator is the point"* — and confirmed in source (`QString::toDouble()` is C-locale). `[DOCUMENTED]` (vendor help) **SailGrib explicitly accepts both**: *"the boat speeds can be formatted with '.' or ',' as decimal separators."* OpenCPN cannot support commas at all, since `,` is one of its delimiters. Note `;` is the delimiter European locales use *precisely because* they use decimal commas, so comma-decimal files genuinely circulate. **Recommendation: accept decimal commas only when the delimiter is `;` or TAB, normalise on ingest, and warn** — rejecting outright would reject valid SailGrib-lineage files |
| **Delimiter** | **Semicolon in all three files** — including the `.pol`, which per the docs "should" be tab-delimited | `[DOCUMENTED]` p. 38: `;` for CSV format, TAB for POL format — and `nohal/qtVlm` picks by extension (`isCsv = fname.endsWith("csv")`). `[INFERRED FROM FILES]` But the shipping qtVlm read our semicolon `.pol`, and 5 different extension/delimiter pairings occur in the official 273-file library, including `(.pol, SPACE)` and `(.csv, COMMA)`. OpenCPN accepts ` ;,\t\r\n` interchangeably. **The extension does not reliably determine the delimiter. Sniff line 1: prefer TAB if present, else `;`, else `,`, else space** |

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

The *location* of the peak is physically correct — the fastest angle migrates aft as the wind builds, which is exactly what the grid shows:

```
column max location (which TWA peaks each TWS column):
  TWS  4: max  4.50 at TWA  75      TWS 14: max  8.24 at TWA 120
  TWS  6: max  5.92 at TWA 110      TWS 16: max  8.65 at TWA 120
  TWS  8: max  6.91 at TWA 110      TWS 20: max  9.72 at TWA 135
  TWS 10: max  7.42 at TWA 110      TWS 24: max 11.71 at TWA 135
  TWS 12: max  7.81 at TWA 120
```

So 135° being the fastest angle at 24 kt is structurally right; it is the **magnitude** (11.71 kt, ~1.6 × hull speed) that is odd.

`[UNRESOLVED]` — **One coincidence, recorded and then dismissed.** The value is very close to what a VMG → boat-speed conversion at 45° would produce from the 180° row: `8.30 / cos 45° = 11.738` versus the actual `11.71`. That is the signature of a `vmg2sog()` result leaking into the grid. But the same identity fails badly in all eight other columns (`TWS 4: 2.28 vs 3.67`; `TWS 12: 6.85 vs 7.53`), and ORC's gybe angle *increases* with wind (the TP 52 example runs 139.7° → 151.2° from 4 to 24 kt), so a VMG value at 24 kt would land near 150°, not 135°. **Most likely coincidence.** I record it because it is the exact failure mode to look for if another boat's polar shows a single implausible downwind cell.

This cell was never exercised (max observed `POL` = 9.1, and the recordings never saw TWS > 24), so it is unproven either way — but **flag cells implying speeds far above hull speed** as probable extrapolation or conversion artifacts.

### A silent-corruption hazard worth guarding against explicitly

`[DOCUMENTED]` (third-party open source) — **qtVlm does not error on a non-increasing TWS axis; it silently truncates the grid there.**

```cpp
if(!tws.isEmpty() && list[i].toDouble()<=tws.last()) break;   // stops reading columns
```

A header with a duplicated or out-of-order TWS loses **every column after the offending one**, with no warning to the user. A polar that appears to cover 0–30 kt could in fact be evaluating only its first few columns and clamping above them. OpenCPN instead fails loudly, and its rule set is the one to copy:

```
wind speeds must be strictly increasing -> PARSE_ERROR("Invalid wind speeds. Wind speeds must be increasing.")
W < 0 || W > 180                        -> PARSE_WARNING("Wind direction out of range.")
W <= lastentryW                         -> PARSE_WARNING("Wind direction out of order.")
MAX_WINDSPEEDS_IN_TABLE 200
```

**Recommendation: treat a non-increasing or duplicated axis value as a hard error, never as a truncation point.** This is the one place where being *stricter* than qtVlm is unambiguously correct, because the permissive behaviour produces a wrong answer rather than no answer.

OpenCPN also reads gzipped polars transparently (`zu_open`/`zu_gets`) — cheap to support if you want it, and a hint that large polars circulate compressed.

### Maximum plausible grid size

`[UNRESOLVED]` as a *format* rule — **no limit is documented** by any vendor. Evidence for a sane bound:

- `[DOCUMENTED]` (third-party open source) OpenCPN caps the TWS axis at **`MAX_WINDSPEEDS_IN_TABLE 200`**. This is the only concrete numeric cap found in any implementation.
- `[DOCUMENTED]` Expedition's manual states the opposite for its own format: *"There is no limit to the number of rows (True Wind Speed) or columns (True Wind Angle) that you can have in your polar."*
- `[DOCUMENTED]` The qtVlm Polar Editor screenshot (p. 41, read from the rendered image) shows a real grid spanning TWS `0.0 → 60.0` kt in 2 kt steps (**31 columns**) with TWA in 5° steps (rows `0.0°` through `130.0°` visible, scrolled — so at least 27 and presumably 37 rows to 180°), and `Save` / `Cancel` / `Add TWA` / `Add TWS` / `Remove` buttons. Grids of that order are normal and no cap is stated.
- `[INFERRED FROM FILES]` The largest file in the 273-file official library is well within this; our own files are 16 × 9 and 26 × 13.
- Note that dense grids are genuinely produced by tooling: `craigsailing/polar-expander-converter` exists specifically to expand a polar "to 1 knot intervals and 1 degree wind angles", which would yield a 181 × ~60 grid.

**Recommendation:** accept up to **181 TWA rows × 200 TWS columns** — 1° TWA resolution over 0–180 is the finest meaningful grid, and 200 matches OpenCPN's documented cap. Reject beyond that as a malformed-input guard, and cap raw file size around 1 MB.

### One more caution about expanded polars

`[DOCUMENTED]` (third-party open source) — `craigsailing/polar-expander-converter` interpolates sparse polars into dense ones using `numpy.polyfit(xpf, ypf, 3)` — a **cubic fit applied separately to the upwind (TWA ≤ 100) and downwind halves**. This is worth knowing because it is exactly the class of tool that turns an 8-angle ORC certificate into a smooth-looking 181-row grid, and **a cubic fit extrapolated below 52° will produce arbitrary values** that look far more credible than a linear ramp does. If Layline ever ingests a polar with suspiciously fine angular resolution, the sub-beat-angle rows deserve *more* suspicion, not less.

---

## Parser implications

### TypeScript types

```ts
// ---------- shared ----------

/**
 * First cell of the header row. Compare after stripping BOM, trimming,
 * lowercasing and normalising '\' -> '/'. A bare 'twa' is the SECOND most
 * common form in the wild (86 of 273 official library polars).
 */
const HEADER_TOKENS = ['twa/tws', 'twa'] as const;

/** All five extension/delimiter pairings occur in the official library. */
export type GridDelimiter = ';' | '\t' | ',' | ' ';

export interface ParseWarning {
  readonly code:
    | 'unexpected-header-token'
    | 'bare-twa-header'
    | 'trailing-empty-field'
    | 'blank-line-skipped'
    | 'comment-line-skipped'        // '#' (jieter/orc-data) or '!' (Expedition)
    | 'description-line-skipped'    // one free-text line before the header
    | 'decimal-comma-normalised'    // SailGrib emits these; normalise, don't reject
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
  /**
   * Ascending, knots, at the reference height in `windReferenceHeightM`.
   * Does NOT include 0 unless the file did.
   */
  readonly twsAxis: readonly number[];
  /**
   * Height above water at which the TWS axis is defined. ORC-derived polars are
   * 10 m / 33 ft (DOCUMENTED, ORC Speed Guide Explanation 2025). Harrison Dever
   * (CHII2) reports at 85 ft, so a raw CHII2 speed MUST be height-corrected
   * before it is used to index this axis, or the target speed is overstated.
   * There is no field in the file for this; it must be recorded at import.
   */
  readonly windReferenceHeightM: number;
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
       first_trustworthy_twa,
       wind_reference_height_m,           -- 10.0 for ORC-derived; see Q11
       orc_vpp_year,                      -- nullable; ORC's grid changed in 2024 and 2025
       imported_at, raw_sha256)
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
- A non-numeric TWA or TWS axis value.
- **A non-ascending or duplicated axis value — as a hard error, not a truncation point.** This is the one place to be deliberately stricter than qtVlm, which silently drops every column after the offending one and then reports confident numbers from a half-read grid. OpenCPN's `PARSE_ERROR("Invalid wind speeds. Wind speeds must be increasing.")` is the correct behaviour.
- TWA outside `0..180`; TWS negative. (Signed TWA belongs in *logs*, not in polar files — take `Math.abs` at lookup time, never at parse time.)
- A negative boat speed.
- A `.sailselect` cell referencing a sail id absent from the definitions.
- A `.saildesc` line without a `;`, a non-integer or non-positive id, or a duplicate id.
- Grids beyond **181 × 200**, or files beyond ~1 MB.

### What to tolerate

- **A UTF-8 BOM** — strip it, warn. It would otherwise corrupt the header token, and 2 of 273 real library files have one.
- **CRLF or bare CR** line endings — normalise, warn.
- **Blank lines anywhere** — skip, warn.
- **Comment lines beginning `#` or `!`** — skip, warn. `#` is emitted by `jieter/orc-data`, i.e. the tool that produced our own file; `!` is Expedition's documented marker. Neither is qtVlm syntax, so warn — but do not reject, or you reject upstream output.
- **One arbitrary description line before the header** — OpenCPN's rule: scan up to two lines for the sentinel before giving up.
- **One trailing delimiter** per line — drop the empty field, warn.
- **Leading/trailing whitespace** in every field — trim.
- **Any casing, either separator, and a bare `TWA`** in the header token (`twa/tws`, `TWA\TWS`, `TWA`, …). Warn on anything unrecognised but **continue** — our real `.pol` uses lowercase, and a bare `TWA` is the second most common form in the wild (86 of 273 library files).
- **Any of four delimiters, regardless of extension** — sniff line 1: TAB, else `;`, else `,`, else space. Our `.pol` is semicolon-delimited despite the documented POL format being tab-delimited, and the official library contains all five extension/delimiter pairings.
- **Decimal commas** — normalise to `.` and warn, but only when the delimiter is `;` or TAB (with `,` as the delimiter it is unambiguous corruption). SailGrib explicitly emits both forms, so rejecting them would reject valid files. *(This reverses an earlier recommendation in this document to reject them outright.)*
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
  **This gap is structural and permanent, not a converter shortcoming.** `[DOCUMENTED]` — ORC Rule 402.2 defines the certificate's range as *"4 – 24 knots of true wind speed"*, so **no ORC-derived polar can ever contain data above 24 kt.** Any number shown above 24 kt is somebody's extrapolation. Do not plan a UI that expects a target speed at storm strength from this source; that is exactly where Layline's own wind-classification messaging (23+ kt = storm) should take over.
- Likewise the chart starts at TWA 35 and the polar at 30. Below 35° there is no sail recommendation at all — which is consistent with Q11's finding that below ~45° there is no meaningful target either.
