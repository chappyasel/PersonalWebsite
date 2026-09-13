"""Read local source files into a disposable, gitignored personality snapshot.

No workbook macros, notebook code, or result URLs are executed.
"""
import ast
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
HOME_DIR = Path.home()
DIRECTORY = HOME_DIR / "Library/Mobile Documents/com~apple~CloudDocs/Spreadsheets/Friends Directory.xlsx"
CURVES = HOME_DIR / "Desktop/Other/1 Life/Personality/Big Five.xlsx"
NOTEBOOK = HOME_DIR / "Desktop/Repos/0 Archive/compare-personalities/personality_comparison.ipynb"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
TRAITS = ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Neuroticism"]


def sheet(path, number):
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(s.itertext()) for s in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        root = ET.fromstring(archive.read(f"xl/worksheets/sheet{number}.xml"))
        cells = {}
        for c in root.findall(".//m:sheetData/m:row/m:c", NS):
            value = c.find("m:v", NS)
            if value is not None:
                cells[c.attrib["r"]] = strings[int(value.text)] if c.get("t") == "s" else value.text
            elif c.find("m:is", NS) is not None:
                cells[c.attrib["r"]] = "".join(c.find("m:is", NS).itertext())
        return cells


def scores(cells, columns, row):
    result = {}
    for trait, col in zip(TRAITS, columns):
        value = cells.get(f"{col}{row}", "")
        if value != "":
            number = float(value)
            if not 0 <= number <= 120:
                raise ValueError(f"Score outside expected scale at {col}{row}")
            result[trait] = number
    return result


friends = sheet(DIRECTORY, 2)
glossary = sheet(DIRECTORY, 1)
old_curves = sheet(CURVES, 1)
notebook = json.loads(NOTEBOOK.read_text())
literals = {}
for cell in notebook["cells"]:
    if cell["cell_type"] != "code":
        continue
    for statement in ast.parse("".join(cell["source"])).body:
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name) and target.id in {"personality_data", "population_norms"}:
                    literals[target.id] = ast.literal_eval(statement.value)

norms = {trait: {"mean": float(glossary[f"{col}19"]), "sd": float(glossary[f"{col}20"])} for trait, col in zip(TRAITS, "MNOPQ")}
for trait, mean_col, sd_col in zip(TRAITS, ["B", "H", "N", "T", "Z"], ["C", "I", "O", "U", "AA"]):
    for key, col in [("mean", mean_col), ("sd", sd_col)]:
        assert abs(norms[trait][key] - literals["population_norms"][trait][key]) < 1e-8
        assert abs(norms[trait][key] - float(old_curves[f"{col}18"]) * 1.2) < 1e-8

people = []
for row in sorted({int(re.sub(r"\D", "", key)) for key in friends}):
    name = friends.get(f"D{row}", "").strip()
    if row == 1 or not name:
        continue
    values = scores(friends, "OPQRS", row)
    people.append({"id": f"friend-{row}", "name": name, "group": "Friends", "records": [{"source": "directory", "label": "Friends Directory", "ref": f"Friends Directory.xlsx · List!O{row}:S{row}", "scores": values}] if values else []})

people.insert(0, {"id": "chappy", "name": "Chappy", "group": "You", "records": [{"source": "directory", "label": "Friends Directory", "ref": "Friends Directory.xlsx · Glossary!M3:Q3", "scores": scores(glossary, "MNOPQ", 3)}]})
for name, values in literals["personality_data"].items():
    # The notebook uses a short name; preserve this explicit identity mapping.
    person = next((p for p in people if p["name"] == {"Gabi": "Gabi Grengez"}.get(name, name)), None)
    if person is None:
        person = {"id": name.lower(), "name": name, "group": "Family", "records": []}
        people.append(person)
    person["records"].append({"source": "notebook", "label": "Family notebook", "ref": f"personality_comparison.ipynb · cell 4 · personality_data[{name!r}]", "scores": values})

output = ROOT / "data/personality-prototype/snapshot.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({"people": people, "norms": norms, "sources": [str(DIRECTORY), str(CURVES), str(NOTEBOOK)]}, indent=2) + "\n")
print(f"Imported {len(people)} entries; {sum(bool(p['records']) for p in people)} have scores; {sum(len(p['records']) for p in people)} score snapshots.")
print("Reference values agree across the notebook, directory, and earlier curve workbook after its 1.2 scale conversion.")
