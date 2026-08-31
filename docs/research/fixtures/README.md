# Parser fixtures

Sample files collected while specifying the qtVlm CSV and polar formats. These exist to be
parsed in tests — they are not Handsome Pete's data.

## `qtvlm-vdr-french-locale.csv`

A third-party qtVlm VDR export (193 rows), recovered during research. Its value is that it
differs from our own recordings in every locale-dependent way at once:

| | Handsome Pete's recordings | This file |
|---|---|---|
| Date format | `MM/DD/YYYY` | `DD/MM/YYYY` |
| Decimal separator | `.` | `,` |
| Alarm vocabulary | `None` | `Aucune` |
| Column set | 20–21 columns, incl. `CTW`, `STW`, `RPM` | 16 columns, no `CTW`/`STW`/`RPM` |

Both use `;` as the field delimiter, so the decimal comma is genuinely ambiguous against it
on a naive split.

Use it to pin down three parser behaviours that our own files cannot exercise:

1. **Date format is an installation setting and fails silently.** Nothing in the file declares
   it. `20/11/2025` is unambiguous only because there is no month 20; a race on the 5th of
   March is not.
2. **Decimal-comma handling.** `-1,7910683333;46,4886666667` is two fields, not four.
3. **The wind columns change meaning when boat-speed columns are absent.** This file has no
   `STW` or `CTW` at all, so every row's `TWS`/`TWD`/`TWA` is GPS-derived — the same condition
   that affects 272 rows of our own data, here as the permanent state of the file.

See `../qtvlm-csv-columns.md` for the column reference and `../orc-polar-file-formats.md`
for the polar and sail-chart formats.
