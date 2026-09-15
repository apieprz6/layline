# Parser fixtures

Sample files collected while specifying the qtVlm CSV and polar formats. These exist to be
parsed in tests — they are not Handsome Pete's data.

## `qtvlm-vdr-french-locale.csv`

A third-party qtVlm VDR export (193 rows), published as an attachment on qtVlm's own vendor
forum: <https://www.meltemus.com/media/kunena/attachments/1746/vdr.txt>. Not our data and not
our boat — it is vendored here verbatim so tests have a second real export to parse. Its value
is that it differs from our own recordings in every locale-dependent way at once:

| | Handsome Pete's recordings | This file |
|---|---|---|
| Date format | `MM/DD/YYYY` | `DD/MM/YYYY` |
| Decimal separator | `.` | `,` |
| Alarm vocabulary | `None` | `Aucune` |
| Column set | 20–21 columns, incl. `CTW`, `STW`, `RPM` | 16 columns, no `CTW`/`STW`/`RPM` |

Both use `;` as the field delimiter, so the decimal comma is genuinely ambiguous against it
on a naive split.

It has already earned its place twice, before ever being used as a test fixture: it overturned
this spec's claim that decimal points were part of a fixed qtVlm house convention, and corrected
`ALARM`'s no-alarm sentinel from the literal `None` to something UI-localised. Both errors were
headed into the parser. That is the case for a real third-party export over a synthetic one — a
fixture we author can only encode what we already believe about the format.

Four parser behaviours it exercises that our own files cannot:

1. **Decimal commas coerce silently.** `parseFloat("-1,7910683333")` returns `-1` — no throw, no
   `NaN`, just a position 0.79° off. The worst failure class in the file.
2. **The no-alarm value is localised.** `Aucune`, not `None`. Any equality check against the
   English string passes every row through as if an alarm were set.
3. **Boat-speed columns can be absent entirely.** 16 columns against our 20–21, with no `CTW` or
   `STW` at all — so every row's `TWS`/`TWD`/`TWA` is GPS-derived. Our own data has this as a
   per-row condition (272 rows); here it is the permanent state of the file, so a parser that
   hardcodes our column set fails on the whole thing rather than on a subset.
4. **Fields go empty mid-row.** Row 2 has `;;` for `GWD` and `GWS`. Empty is not zero.

**What it does not test, despite looking like it should:** the date format. All 192 rows are
`20/11/2025`, and `20` is not a valid month — so a parser wrongly assuming `MM/DD/YYYY` fails
*loudly* here. This file proves `DD/MM/YYYY` occurs in the wild; it does not exercise the silent
case, where a date like `03/05/2025` parses successfully as the wrong day. That needs a synthetic
fixture, and the format is an undeclared installation setting either way.

## `orc-first-10r.pol`

An ORC certificate grid for a **Beneteau First 10R** — Handsome Pete's design, a different
boat — turned
into a `.pol` here, not downloaded as one. Built from ORC's own live certificate feed,
`data.orc.org/public/WPub.dll?action=DownRMS&ext=json&Family=1&VPPYear=2026&CountryId=USA`,
certificate **US61013**: each cell is `3600 / allowance`, the seconds-per-mile allowance the
certificate publishes converted to knots and written to two decimals, which is what the
ORC → `.pol` converters do. The axes are the certificate's, untouched: 9 wind speeds
(4–24 kt) × 8 true wind angles (52–150°).

It is written in the form the boat's own file has and which `../orc-polar-file-formats.md`
attributes to the `jieter/orc-data` converter: lowercase `twa/tws`, **semicolon** delimiter, LF
endings, no trailing delimiter. A semicolon-delimited `.pol` is unusual in the wild — the
documented rule is TAB for `.pol` and it holds in 234 of the official library's 236 `.pol`
files — and it is the first thing our parser has to read.

Its value as a fixture is what it does **not** contain. A certificate tabulates nothing below
the boat's beat angle, so this grid starts at 52° and has no filler in it at all: it is the
control case for suppression, where the answer must be "suppress nothing" and the whole grid is
shown. Its row 60 is not twice its row 52, which is what stops a single low row being read as a
ramp seed on its own.

**It is not the boat's polar.** Handsome Pete's own file is 16 × 9: the same nine wind speeds,
and sixteen angles of which eight are not on ORC's published allowance table — `30, 35, 40, 45`
below the certificate's lowest, which is where its ramp filler is, and `100, 160, 170, 180`
above. It lives outside this repository.

## `qtvlm-library-class40.pol`

`Class40.pol` from the official qtVlm polar library, <http://download.meltemus.com/polars/>,
vendored byte-for-byte. Not our data and not our boat. 37 true wind angles (0–180° in 5° steps)
× 13 wind speeds (0–60 kt).

Every format decision in it is the opposite of the file above, which is the point of having
both:

| | `orc-first-10r.pol` | `qtvlm-library-class40.pol` |
|---|---|---|
| Header token | `twa/tws` | `TWA\TWS` |
| Delimiter | `;` | TAB |
| Line endings | LF | CRLF |
| Trailing delimiter | none | one on every line |
| Grid | 8 × 9 | 37 × 13 |

It also carries, in a file nobody here authored, the artifact the display rule exists for. Rows
5 through 30 are each n × row 5 to within 0.05 kt — a straight ramp up from a row of zeros at
TWA 0 — rows 35 and 40 are still on that ramp in light air, and row 45 is the first row off it.
`../orc-polar-file-formats.md` quantifies the construction across the whole library: one polar
in four has it. A TWS 0 column of zeros and a TWA 0 row of zeros come with it, which is a file
saying it has nothing there rather than saying the boat is stopped.

The two polar fixtures disagree about where generated rows end by twenty degrees of tabulated
angles and agree that nothing below 45° can be trusted. That disagreement is why
`services/boat/polarSyntheticRows.ts` measures the ramp out of the grid instead of suppressing
a fixed angle.

See `../qtvlm-csv-columns.md` for the column reference and `../orc-polar-file-formats.md`
for the polar and sail-chart formats.
