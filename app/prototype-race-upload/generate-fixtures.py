#!/usr/bin/env python3
"""
THROWAWAY — fixture generator for the LAY-94 race-upload prototype.

Reads the real qtVlm archive out of ../Handsome-Pete and emits fixtures.json:
six recordings chosen to cover every hazard LAY-97 / LAY-98 name, with Row
Quality computed here rather than invented, so the variants are judged against
real dropouts and the real annotation load.

Run:  python3 app/prototype-race-upload/generate-fixtures.py
"""

import csv
import hashlib
import json
import os
from datetime import datetime

HP = os.path.expanduser("~/git/Handsome-Pete")
RAW = os.path.join(HP, "raw-regatta-recordings")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")

# ADR 0009 constants, read out of clean_recordings.py rather than the docs.
DROPOUT_FIELDS = ["Latitude", "Longitude", "COG", "SOG"]
DROPOUT_MIN_RUN = 2
SOG_THRESHOLD = 2.0

# The six the prototype ships, and why each earns its place.
CHOSEN = {
    "06-03-26-beer-can": "the empty path — no sails, no sea state, 51 minutes",
    "08-26-26-beer-can": "the heavy path — 7 sail changes, the worst typing load in the archive",
    "06-26-26-chi-mi-chi": "crosses midnight — any same-day time picker breaks",
    "08-22-26-glr": "the window outruns the data — finish is past the last row",
    "09-02-2026-beer-can": "146 frozen rows, 53.1% of the file, 0% in-window",
    "09-04-2026-chicago-st-joe": "49.8% fabricated and still a real 13.68-hour race",
}

# metadata.yaml's vocabulary is superseded (CONTEXT.md). The schema doc says
# metadata.yaml is read by nothing and the 13 races are hand-typed at seed
# time, so this map is only how the fixture states the *typing target*.
SEA_STATE = {"flat": "calm", "light-chop": "slight", "moderate": "moderate", "heavy": "rough"}
SAIL_RENAME = {"reaching-spin": "A3"}


def parse_meta():
    import yaml

    with open(os.path.join(RAW, "metadata.yaml")) as fh:
        raw = yaml.safe_load(fh)

    meta = {}
    for name, m in raw.items():
        meta[name] = {
            "start": str(m["start"]),
            "finish": str(m["finish"]),
            "sails": [
                {
                    "time": str(e["time"]),
                    "config": [SAIL_RENAME.get(s, s) for s in (e.get("config") or [])],
                }
                for e in (m.get("sails") or [])
            ],
            "sea_state": [
                {"time": str(e["time"]), "state": SEA_STATE.get(e["state"], e["state"])}
                for e in (m.get("sea_state") or [])
            ],
        }
    return meta


def to_float(v):
    v = (v or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def load(name):
    path = os.path.join(RAW, name + ".csv")
    with open(path, "rb") as fh:
        blob = fh.read()
    sha = hashlib.sha256(blob).hexdigest()
    with open(path, newline="") as fh:
        rdr = csv.DictReader(fh, delimiter=";")
        header = list(rdr.fieldnames)
        rows = list(rdr)

    parsed = []
    for i, r in enumerate(rows, start=1):
        t = datetime.strptime(r["Date"], "%m/%d/%Y %H:%M:%S")
        parsed.append(
            {
                "i": i,
                "t": t,
                "sog": to_float(r.get("SOG")),
                "tws": to_float(r.get("TWS")),
                "twa": to_float(r.get("TWA")),
                "stw": to_float(r.get("STW")),
                "ctw": to_float(r.get("CTW")),
                "key": tuple((r.get(f) or "").strip() for f in DROPOUT_FIELDS),
            }
        )

    # Frozen: runs of >= DROPOUT_MIN_RUN rows repeating lat/lon/COG/SOG verbatim.
    # Detected over the WHOLE transcription; the window filter comes later.
    frozen = [False] * len(parsed)
    start = 0
    for idx in range(1, len(parsed) + 1):
        same = idx < len(parsed) and parsed[idx]["key"] == parsed[start]["key"]
        if not same:
            if idx - start >= DROPOUT_MIN_RUN:
                for j in range(start, idx):
                    frozen[j] = True
            start = idx

    # Gap Seconds: elapsed since the previous non-Frozen row.
    prev_live = None
    for j, row in enumerate(parsed):
        row["frozen"] = frozen[j]
        row["water"] = row["stw"] is not None and row["ctw"] is not None
        row["low"] = row["sog"] is not None and row["sog"] < SOG_THRESHOLD
        row["gap"] = None if prev_live is None else int((row["t"] - prev_live).total_seconds())
        if not row["frozen"]:
            prev_live = row["t"]

    return {"header": header, "sha": sha, "rows": parsed, "bytes": len(blob),
            "trailing_newline": blob.endswith(b"\n")}


def stats(rows, start, finish):
    inw = [r for r in rows if start <= r["t"] <= finish]
    fz = [r for r in inw if r["frozen"]]
    nw = [r for r in inw if not r["water"]]
    longest, run = 0, 0
    for r in rows:
        run = run + 1 if r["frozen"] else 0
        longest = max(longest, run)
    # longest dropout in seconds, over the whole file
    longest_s, run_s, anchor = 0, 0, None
    for r in rows:
        if r["frozen"]:
            anchor = anchor or r["t"]
            longest_s = max(longest_s, int((r["t"] - anchor).total_seconds()))
        else:
            anchor = None
    return {
        "inWindowRows": len(inw),
        "frozenInWindow": len(fz),
        "frozenInFile": sum(1 for r in rows if r["frozen"]),
        "notWaterReferencedInWindow": len(nw),
        "longestDropoutRows": longest,
        "longestDropoutSeconds": longest_s,
        "medianGapSeconds": median([r["gap"] for r in inw if r["gap"] is not None]),
    }


def median(xs):
    xs = sorted(xs)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def main():
    meta = parse_meta()
    out = []
    for name, why in CHOSEN.items():
        f = load(name)
        m = meta[name]
        start = datetime.strptime(m["start"], "%Y-%m-%d %H:%M:%S")
        finish = datetime.strptime(m["finish"], "%Y-%m-%d %H:%M:%S")
        rows = f["rows"]
        st = stats(rows, start, finish)

        # Compact plot series: seconds from first row, SOG, TWS, and a flag
        # bitmask (1 frozen, 2 not-water-referenced, 4 low-speed).
        t0 = rows[0]["t"]
        series = [
            [
                int((r["t"] - t0).total_seconds()),
                r["sog"] if r["sog"] is not None else -1,
                r["tws"] if r["tws"] is not None else -1,
                (1 if r["frozen"] else 0) | (0 if r["water"] else 2) | (4 if r["low"] else 0),
            ]
            for r in rows
        ]

        out.append(
            {
                "filename": name + ".csv",
                "why": why,
                "sha256": f["sha"],
                "bytes": f["bytes"],
                "trailingNewline": f["trailing_newline"],
                "sourceColumns": f["header"],
                "dateOrder": "MDY",
                "rowCount": len(rows),
                "firstRowTime": rows[0]["t"].isoformat(sep=" "),
                "lastRowTime": rows[-1]["t"].isoformat(sep=" "),
                "t0": t0.isoformat(sep=" "),
                "series": series,
                "stats": st,
                # What the sailor is expected to re-type, from metadata.yaml.
                "truth": {
                    "windowStart": m["start"],
                    "windowFinish": m["finish"],
                    "sails": [
                        {"at": e["time"], "sails": e.get("config", []), "reef": "full"}
                        for e in m["sails"]
                    ],
                    "seaState": [{"at": e["time"], "state": e["state"]} for e in m["sea_state"]],
                },
            }
        )

    with open(OUT, "w") as fh:
        json.dump({"generated": "throwaway fixture for LAY-94", "recordings": out}, fh, indent=1)

    for r in out:
        s = r["stats"]
        print(
            f"{r['filename']:<32} rows={r['rowCount']:<5} in-window={s['inWindowRows']:<5} "
            f"frozen(file)={s['frozenInFile']:<4} frozen(win)={s['frozenInWindow']:<4} "
            f"not-water={s['notWaterReferencedInWindow']:<4} medGap={s['medianGapSeconds']} "
            f"sails={len(r['truth']['sails'])}"
        )


if __name__ == "__main__":
    main()
