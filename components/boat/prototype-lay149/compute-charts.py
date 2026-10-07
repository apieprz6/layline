#!/usr/bin/env python3
"""
PROTOTYPE (LAY-149) — THROWAWAY. Not production code, not run by the app.

Computes the *real* per-Race and per-era figures behind the three Instrument Tuning charts, so the
variants argue over the archive's honest coverage instead of LAY-147's invented fixture. Reads the
owner's archive outside this repo:

    ~/git/Handsome-Pete/raw-regatta-recordings/*.csv + metadata.yaml   (13 races)
    ~/git/Handsome-Pete/compass-calibrations.yaml                       (the 2026-07-04 autocomp)

Reproduces, deliberately roughly and in pure Python:

  - Countable (ADR 0025), copied from LAY-146's compute-cells.py: not Frozen, not Low-Speed, not
    inside a Maneuver Window. Frozen is detected over the whole recording, then clipped.
  - compass_calibration.py as LAY-145 §1.2 ports it: SOG >= 3.5, CTW and COG present, error =
    normalize(CTW - COG), 10° half-open bins, >= 3 rows per bin, >= 5 valid points per Race.
    Era curve = mean of per-Race bin means (§2.3), never pooled rows.
  - awa_offset.py as §1.3 ports it, including the fix the Python lacked: STW must be present.
  - ADR 0027's regression: SOG on STW over Countable rows, per-Race fit only with >= 5 points and
    >= 3 kt of SOG spread, era fit weighted 1 / (race's row count in the era).

The era boundary is the 2026-07-04 autocompensation from compass-calibrations.yaml, *standing in*
for a Calibration Event the owner would have to enter by hand (ADR 0031). It splits HDG only;
the AWA chart marks it; STW has no event, so STW is one era.

Writes charts.json next to this file.
"""

import csv
import json
import math
from datetime import datetime
from pathlib import Path

PETE = Path.home() / "git" / "Handsome-Pete"
OUT = Path(__file__).parent / "charts.json"

SOG_MIN = 3.5
BIN_SIZE = 10
MIN_POINTS_PER_BIN = 3
MIN_VALID_POINTS = 5
UPWIND_MAX_AWA = 50
DOWNWIND_MIN_AWA = 110
MIN_CONSECUTIVE = 3
MAX_GAP_SECONDS = 300
STW_MIN_SPREAD = 3.0
AUTOCOMP = datetime(2026, 7, 4)

STAMP = "%m/%d/%Y %H:%M:%S"
META_STAMP = "%Y-%m-%d %H:%M:%S"


def num(text):
    return float(text) if text not in (None, "") else None


def parse_metadata(path):
    """Only start/finish are needed here — Instrument Tuning ignores sails (ADR 0031)."""
    races, current = {}, None
    for raw in path.read_text().splitlines():
        if not raw.strip():
            continue
        if not raw.startswith(" "):
            current = raw.strip().rstrip(":")
            races[current] = {}
        elif raw.strip().startswith(("start:", "finish:")):
            key, value = raw.strip().split(":", 1)
            races[current][key] = value.strip().strip("'")
    return races


def frozen_flags(rows):
    channels = ["longitude", "latitude", "cog", "sog"]
    evidence = ["moved"]
    for i in range(1, len(rows)):
        repeated, moved = 0, False
        for channel in channels:
            here, before = rows[i][channel], rows[i - 1][channel]
            if here is None or before is None:
                continue
            if here != before:
                moved = True
                break
            repeated += 1
        evidence.append("moved" if moved else "repeated" if repeated == len(channels) else "silent")
    frozen = [False] * len(rows)
    run_start, repeats = 0, 0
    for i in range(len(rows) + 1):
        if i < len(rows) and evidence[i] != "moved":
            if evidence[i] == "repeated":
                repeats += 1
            continue
        if repeats >= 2:
            for at in range(run_start, i):
                frozen[at] = True
        run_start, repeats = i + 1, 0
    return frozen


def maneuver_flags(twa, frozen):
    inside = [False] * len(twa)
    for i in range(1, len(twa)):
        before, here = twa[i - 1], twa[i]
        if before is None or here is None or before == 0 or here == 0:
            continue
        if (before > 0) == (here > 0) or frozen[i - 1] or frozen[i]:
            continue
        for at in range(max(0, i - 1), min(len(twa), i + 4)):
            if not frozen[at]:
                inside[at] = True
    return inside


def normalize_angle(angle):
    return (angle + 180) % 360 - 180  # Python's % is a true modulo; the TS port must double-mod


def mean(values):
    return sum(values) / len(values) if values else None


def std(values):
    if len(values) < 2:
        return None
    m = mean(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def r1(value, places=2):
    return None if value is None else round(value, places)


# ---------------------------------------------------------------- HDG


def compass(rows):
    valid = [r for r in rows if r["sog_n"] is not None and r["sog_n"] >= SOG_MIN
             and r["ctw_n"] is not None and r["cog_n"] is not None]
    if len(valid) < MIN_VALID_POINTS:
        return {"ok": False, "reason": "too-few-points", "points": len(valid)}
    errors = [normalize_angle(r["ctw_n"] - r["cog_n"]) for r in valid]
    bins = []
    for start in range(0, 360, BIN_SIZE):
        inside = [e for r, e in zip(valid, errors) if start <= r["ctw_n"] < start + BIN_SIZE]
        bins.append({
            "c": start + BIN_SIZE // 2,
            "n": len(inside),
            # A bin under the gate carries its count (so a chart can say "2 rows here") but no mean.
            "m": r1(mean(inside)) if len(inside) >= MIN_POINTS_PER_BIN else None,
        })
    occupied = sum(1 for b in bins if b["m"] is not None)
    return {
        "ok": True,
        "points": len(valid),
        "mean": r1(mean(errors)),
        "std": r1(std(errors)),
        "maxAbs": r1(max(abs(e) for e in errors)),
        "coverage": round(occupied / 36 * 100, 1),
        "bins": bins,
    }


# ---------------------------------------------------------------- AWA


def asymmetry(rows):
    valid = [r for r in rows if r["sog_n"] is not None and r["sog_n"] >= SOG_MIN
             and r["awa_n"] is not None and r["stw"] is not None and r["ctw"] is not None]
    if len(valid) < MIN_CONSECUTIVE * 2:
        return {"ok": False, "reason": "too-few-points", "points": len(valid)}
    for r in valid:
        signed = r["awa_n"] - 360 if r["awa_n"] > 180 else r["awa_n"]
        r["awa_s"] = signed
        a = abs(signed)
        r["pos"] = "upwind" if a < UPWIND_MAX_AWA else "downwind" if a > DOWNWIND_MIN_AWA else "reaching"
        r["tack"] = "starboard" if signed >= 0 else "port"
    segments, start = [], 0
    for i in range(1, len(valid) + 1):
        if i < len(valid) and (valid[i]["tack"], valid[i]["pos"]) == (valid[start]["tack"], valid[start]["pos"]):
            continue
        run = valid[start:i]
        if len(run) >= MIN_CONSECUTIVE and run[0]["pos"] != "reaching":
            segments.append({
                "start": run[0]["time"], "end": run[-1]["time"], "tack": run[0]["tack"],
                "pos": run[0]["pos"], "avg": mean([r["awa_s"] for r in run]), "n": len(run),
            })
        start = i
    if len(segments) < 2:
        return {"ok": False, "reason": "too-few-segments", "points": len(valid), "segments": len(segments)}
    pairs, used = [], set()
    for i, a in enumerate(segments):
        if i in used:
            continue
        for j in range(i + 1, len(segments)):
            if j in used:
                continue
            b = segments[j]
            if a["pos"] != b["pos"] or a["tack"] == b["tack"]:
                continue
            gap = (b["start"] - a["end"]).total_seconds()
            if gap < 0:
                continue
            if gap > MAX_GAP_SECONDS:
                break
            stbd, port = (a, b) if a["tack"] == "starboard" else (b, a)
            pairs.append({
                "t": min(a["start"], b["start"]).strftime("%H:%M"),
                "pos": a["pos"],
                "stbd": r1(stbd["avg"], 1),
                "port": r1(port["avg"], 1),
                "off": r1((stbd["avg"] + port["avg"]) / 2),
                "rows": stbd["n"] + port["n"],
            })
            used.update((i, j))
            break
    if not pairs:
        return {"ok": False, "reason": "no-pairs", "points": len(valid), "segments": len(segments)}
    up = [p["off"] for p in pairs if p["pos"] == "upwind"]
    down = [p["off"] for p in pairs if p["pos"] == "downwind"]
    return {
        "ok": True,
        "points": len(valid),
        "segments": len(segments),
        "pairs": pairs,
        "up": r1(mean(up)), "upN": len(up),
        "down": r1(mean(down)), "downN": len(down),
        "overall": r1(mean([p["off"] for p in pairs])),
    }


# ---------------------------------------------------------------- STW


def weighted_fit(points, weights):
    """SOG = a + b * STW, weighted least squares. Coefficients stay inside this script."""
    sw = sum(weights)
    if sw == 0 or len(points) < MIN_VALID_POINTS:
        return None
    mx = sum(w * x for (x, _), w in zip(points, weights)) / sw
    my = sum(w * y for (_, y), w in zip(points, weights)) / sw
    sxx = sum(w * (x - mx) ** 2 for (x, _), w in zip(points, weights))
    sxy = sum(w * (x - mx) * (y - my) for (x, y), w in zip(points, weights))
    syy = sum(w * (y - my) ** 2 for (_, y), w in zip(points, weights))
    if sxx == 0 or syy == 0:
        return None
    b = sxy / sxx
    a = my - b * mx
    r2 = (sxy * sxy) / (sxx * syy)
    bias = sum(w * (y - x) for (x, y), w in zip(points, weights)) / sw
    return {"a": a, "b": b, "r2": r1(r2, 3), "bias": r1(bias)}


def speed(rows):
    with_sog = [r for r in rows if r["sog_n"] is not None]
    pts = [(r["stw_n"], r["sog_n"]) for r in with_sog if r["stw_n"] is not None]
    blank = len(with_sog) - len(pts)
    out = {"points": len(pts), "blank": blank, "xy": [[round(x, 1), round(y, 1)] for x, y in pts]}
    if not pts:
        out["fit"] = None
        out["gate"] = "no-points"
        return out
    spread = max(y for _, y in pts) - min(y for _, y in pts)
    out["spread"] = r1(spread, 1)
    if len(pts) < MIN_VALID_POINTS:
        out["fit"], out["gate"] = None, "too-few-points"
    elif spread < STW_MIN_SPREAD:
        out["fit"], out["gate"] = None, "narrow-spread"
    else:
        fit = weighted_fit(pts, [1.0] * len(pts))
        out["fit"], out["gate"] = fit, None
        out["line"] = line_ends(fit, pts)
    return out


def line_ends(fit, pts):
    """The fit drawn over the STW range it was fit on — a shape, never printed as numbers."""
    if fit is None:
        return None
    lo, hi = min(x for x, _ in pts), max(x for x, _ in pts)
    return [[round(lo, 2), round(fit["a"] + fit["b"] * lo, 2)], [round(hi, 2), round(fit["a"] + fit["b"] * hi, 2)]]


def public_fit(fit):
    return None if fit is None else {"r2": fit["r2"], "bias": fit["bias"]}


# ---------------------------------------------------------------- run

metadata = parse_metadata(PETE / "raw-regatta-recordings" / "metadata.yaml")
races = []
for name, meta in sorted(metadata.items(), key=lambda kv: kv[1]["start"]):
    with (PETE / "raw-regatta-recordings" / f"{name}.csv").open() as handle:
        raw = list(csv.DictReader(handle, delimiter=";"))
    rows = [{
        "time": datetime.strptime(r["Date"], STAMP),
        "longitude": r["Longitude"] or None, "latitude": r["Latitude"] or None,
        "cog": r["COG"] or None, "sog": r["SOG"] or None,
        "stw": r["STW"] or None, "ctw": r["CTW"] or None,
        "twa": num(r["TWA"]), "sog_n": num(r["SOG"]), "cog_n": num(r["COG"]),
        "ctw_n": num(r["CTW"]), "stw_n": num(r["STW"]), "awa_n": num(r["AWA (calc)"]),
    } for r in raw]
    frozen_all = frozen_flags(rows)
    start = datetime.strptime(meta["start"], META_STAMP)
    finish = datetime.strptime(meta["finish"], META_STAMP)
    window = [(row, frozen_all[i]) for i, row in enumerate(rows) if start <= row["time"] <= finish]
    maneuver = maneuver_flags([r["twa"] for r, _ in window], [f for _, f in window])
    countable = [
        row for i, (row, fr) in enumerate(window)
        if not fr and not (row["sog_n"] is not None and row["sog_n"] < 2) and not maneuver[i]
    ]
    races.append({
        "id": name,
        "date": start.strftime("%Y-%m-%d"),
        "label": name.split("-", 3)[-1].replace("2026-", "").replace("-", " "),
        "hours": round((finish - start).total_seconds() / 3600, 2),
        "inWindow": len(window),
        "countable": len(countable),
        "hdgEra": 1 if start < AUTOCOMP else 2,
        "hdg": compass(countable),
        "awa": asymmetry([dict(r) for r in countable]),
        "stw": speed(countable),
    })

# HDG era curves: mean of per-Race bin means, and how many Races reached each bin.
hdg_eras = []
for era in (1, 2):
    members = [r for r in races if r["hdgEra"] == era and r["hdg"]["ok"]]
    bins = []
    for k in range(36):
        means = [r["hdg"]["bins"][k]["m"] for r in members if r["hdg"]["bins"][k]["m"] is not None]
        bins.append({"c": k * BIN_SIZE + 5, "m": r1(mean(means)), "races": len(means)})
    figures = [r["hdg"]["mean"] for r in members]
    reached = [b for b in bins if b["m"] is not None]
    hdg_eras.append({
        "era": era,
        "from": "2026-06-03" if era == 1 else "2026-07-04",
        "races": len(members),
        "excluded": [r["id"] for r in races if r["hdgEra"] == era and not r["hdg"]["ok"]],
        "binMean": r1(mean([b["m"] for b in reached])),
        "raceMean": r1(mean(figures)),
        "raceStd": r1(std(figures)),
        "coverage": round(len(reached) / 36 * 100, 1),
        "worst": max(reached, key=lambda b: abs(b["m"])) if reached else None,
        "bins": bins,
    })

# STW era fit: every Countable row, weighted 1 / (its race's row count).
all_pts, all_w = [], []
for r in races:
    n = r["stw"]["points"]
    for x, y in r["stw"]["xy"]:
        all_pts.append((x, y))
        all_w.append(1.0 / n)
era_fit = weighted_fit(all_pts, all_w)
total_with_sog = sum(r["stw"]["points"] + r["stw"]["blank"] for r in races)
total_blank = sum(r["stw"]["blank"] for r in races)

# AWA era: every pair from every Race. Equal weight per Race is the open question, so both are kept.
ok_awa = [r for r in races if r["awa"]["ok"]]
awa_era = {
    "races": len(ok_awa),
    "up": r1(mean([r["awa"]["up"] for r in ok_awa if r["awa"]["up"] is not None])),
    "upRaces": sum(1 for r in ok_awa if r["awa"]["up"] is not None),
    "upPairs": sum(r["awa"]["upN"] for r in ok_awa),
    "down": r1(mean([r["awa"]["down"] for r in ok_awa if r["awa"]["down"] is not None])),
    "downRaces": sum(1 for r in ok_awa if r["awa"]["down"] is not None),
    "downPairs": sum(r["awa"]["downN"] for r in ok_awa),
    "beforeAutocomp": r1(mean([r["awa"]["overall"] for r in ok_awa if r["hdgEra"] == 1])),
    "afterAutocomp": r1(mean([r["awa"]["overall"] for r in ok_awa if r["hdgEra"] == 2])),
}

for r in races:
    r["stw"]["fit"] = public_fit(r["stw"]["fit"])

OUT.write_text(json.dumps({
    "generated": "compute-charts.py — real archive, PROTOTYPE",
    "races": races,
    "hdgEras": hdg_eras,
    "awaEra": awa_era,
    "stwEra": {
        "races": sum(1 for r in races if r["stw"]["points"] > 0),
        "fit": public_fit(era_fit),
        "line": line_ends(era_fit, all_pts),
        "points": len(all_pts),
        "blank": total_blank,
        "blankPct": round(total_blank / total_with_sog * 100, 1),
    },
}, indent=1))

print(f"{'race':28} {'cnt':>5} | HDG pts cov  mean  std | AWA up(n) down(n) | STW pts blank fit")
for r in races:
    h, a, s = r["hdg"], r["awa"], r["stw"]
    hs = f"{h['points']:4} {h['coverage']:4.0f}% {h['mean']:+5.1f} {h['std']:4.1f}" if h["ok"] else f"-- {h['reason']}"
    aws = f"{a['up'] if a['up'] is not None else '—':>5}({a['upN']}) {a['down'] if a['down'] is not None else '—':>5}({a['downN']})" if a["ok"] else f"-- {a['reason']}"
    fs = f"R²{s['fit']['r2']} {s['fit']['bias']:+.2f}kt" if s["fit"] else f"-- {s.get('gate')}"
    print(f"{r['id']:28} {r['countable']:5} | {hs:24} | {aws:18} | {s['points']:4} {s['blank']:4} {fs}")
for e in hdg_eras:
    print("HDG era", e["era"], {k: e[k] for k in ("races", "binMean", "raceMean", "raceStd", "coverage", "worst", "excluded")})
print("AWA era", awa_era)
print("STW era", public_fit(era_fit), f"blank {total_blank}/{total_with_sog}")
