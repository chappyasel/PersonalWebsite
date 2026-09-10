"""Read a local workbook and emit a chart snapshot to stdout. Never commit output."""

import argparse
import datetime as dt
import json
import math
import re
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) and result > 0 else None
    except (ValueError, TypeError):
        return None


def trimmed_mean(values):
    valid = sorted(v for v in values if v is not None)
    if len(valid) >= 3:
        valid = valid[1:-1]
    return sum(valid) / len(valid) if valid else None


def extract(path, excluded_sheets=()):
    phases, weeks, scans, seen, set_points = [], [], [], set(), []
    checked, mismatches, text_cells = 0, 0, 0
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(si.itertext()) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        props = workbook.find("s:workbookPr", NS)
        epoch = dt.date(1904, 1, 1) if props is not None and props.get("date1904") in ("1", "true") else dt.date(1899, 12, 30)
        relations = {r.get("Id"): r.get("Target") for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in workbook.find("s:sheets", NS):
            name = sheet.get("name")
            if name in excluded_sheets:
                continue
            target = relations[sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")]
            root = ET.fromstring(archive.read("xl/" + target))
            cells, formulas = {}, {}
            for cell in root.findall(".//s:sheetData/s:row/s:c", NS):
                value = cell.find("s:v", NS)
                value = value.text if value is not None else None
                if cell.get("t") == "s" and value is not None:
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.itertext())
                cells[cell.get("r")] = value
                formula = cell.find("s:f", NS)
                if formula is not None and formula.text:
                    formulas[cell.get("r")] = formula.text
            def date(value):
                numeric = number(value)
                if numeric is None:
                    return None
                result = epoch + dt.timedelta(days=numeric)
                return result if 1900 <= result.year <= 2100 else None
            if name == "Agg":
                anchor = next((ref for ref, value in cells.items() if value == "Set Points"), None)
                if anchor:
                    column = anchor.rstrip("0123456789")
                    row = int(anchor[len(column):]) + 1
                    while number(cells.get(f"{column}{row}")) is not None:
                        set_points.append({"label": f"Set point {len(set_points) + 1}", "weight": number(cells[f"{column}{row}"])})
                        row += 1
            elif cells.get("E2") == "Mon" and cells.get("K2") == "Sun":
                phase_id = f"phase-{len(phases) + 1}"
                phase_weeks = []
                title = cells.get("B1") or name
                kind = "cut" if title.lower().startswith("cut") else "bulk" if title.lower().startswith("bulk") else "maintenance" if title.lower().startswith("maintain") else "other"
                # Column positions vary by workbook generation; locate OG Target by header.
                original_col = next((ref[:-1] for ref, value in cells.items() if ref.endswith("2") and value == "OG Target"), None)
                for row in range(3, max(int("".join(filter(str.isdigit, ref))) for ref in cells) + 1):
                    week = date(cells.get(f"D{row}"))
                    if week is None:
                        continue
                    if week.weekday() != 0:
                        raise ValueError("A weekly row does not start on Monday")
                    weights = [number(cells.get(f"{col}{row}")) for col in "EFGHIJK"]
                    for offset, weight in enumerate(weights):
                        raw = cells.get(f"{'EFGHIJK'[offset]}{row}")
                        if raw and weight is None:
                            text_cells += 1
                        if weight is not None:
                            day = week + dt.timedelta(days=offset)
                            if day in seen:
                                raise ValueError("Duplicate weigh-in date; review workbook before import")
                            seen.add(day)
                    average_days = list(range(7))
                    formula = formulas.get(f"M{row}", "")
                    selected_range = re.search(r"SUM\(([E-K])\d+:([E-K])\d+\)", formula)
                    if selected_range:
                        average_days = list(range(ord(selected_range[1]) - ord("E"), ord(selected_range[2]) - ord("E") + 1))
                    average = trimmed_mean([weights[day] for day in average_days])
                    cached = number(cells.get(f"M{row}"))
                    if average is not None and cached is not None:
                        checked += 1
                        if abs(average - cached) > 0.00001:
                            mismatches += 1
                    phase_weeks.append({"date": week.isoformat(), "phaseId": phase_id, "weights": weights, "averageDays": average_days,
                                        "target": number(cells.get(f"P{row}")),
                                        "originalTarget": number(cells.get(f"{original_col}{row}")) if original_col else None})
                if phase_weeks:
                    phases.append({"id": phase_id, "label": name, "kind": kind,
                                   "start": phase_weeks[0]["date"],
                                   "end": (dt.date.fromisoformat(phase_weeks[-1]["date"]) + dt.timedelta(days=6)).isoformat()})
                    weeks.extend(phase_weeks)
            elif name == "BF%":
                # Only total-body DEXA rows. Other methods and regional values are separate datasets.
                for row in range(3, 50):
                    if cells.get(f"A{row}") == "DEXA":
                        break
                    day = date(cells.get(f"A{row}"))
                    weight = number(cells.get(f"B{row}"))
                    if day and weight:
                        body_fat = number(cells.get(f"F{row}"))
                        scans.append({"date": day.isoformat(), "weight": weight,
                                      "leanMass": number(cells.get(f"C{row}")),
                                      "fatMass": number(cells.get(f"D{row}")),
                                      "bodyFatPercent": body_fat * 100 if body_fat is not None else None})
    if not seen or mismatches:
        raise ValueError("Import failed: no weigh-ins or weekly averages differ from Excel")
    result = {"version": 1, "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "sourceModifiedAt": dt.datetime.fromtimestamp(Path(path).stat().st_mtime, dt.timezone.utc).isoformat(),
              "setPoints": set_points,
              "phases": sorted(phases, key=lambda p: p["start"]),
              "weeks": sorted(weeks, key=lambda w: w["date"]),
              "scans": sorted(scans, key=lambda s: s["date"])}
    print(f"Validated {len(seen)} weigh-ins and {checked} weekly averages; skipped {text_cells} nonnumeric daily cells.", file=sys.stderr)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--exclude-sheet", action="append", default=[], help="Omit an unfinished worksheet after reviewing its contents")
    args = parser.parse_args()
    json.dump(extract(args.workbook, args.exclude_sheet), sys.stdout, allow_nan=False, separators=(",", ":"))
