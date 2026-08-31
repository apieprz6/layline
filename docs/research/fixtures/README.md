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

See `../qtvlm-csv-columns.md` for the column reference and `../orc-polar-file-formats.md`
for the polar and sail-chart formats.
