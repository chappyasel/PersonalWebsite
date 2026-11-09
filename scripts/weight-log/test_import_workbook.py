import contextlib
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

from import_workbook import extract, trimmed_mean


class ImportTests(unittest.TestCase):
    def workbook(self, directory, average="135", formula="SUM(E3:K3)"):
        path = Path(directory) / "synthetic.xlsx"
        namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("xl/workbook.xml", f'<workbook xmlns="{namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic phase" r:id="r1"/></sheets></workbook>')
            z.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr("xl/sharedStrings.xml", f'<sst xmlns="{namespace}"><si><t>Mon</t></si><si><t>Sun</t></si><si><t>Bulk synthetic</t></si></sst>')
            cells = '<c r="B1" t="s"><v>2</v></c><c r="E2" t="s"><v>0</v></c><c r="K2" t="s"><v>1</v></c><c r="D3"><v>43836</v></c>'
            for col, value in zip("EFGHIJK", [100, 110, 120, 130, 140, 150, 200]):
                cells += f'<c r="{col}3"><v>{value}</v></c>'
            cells += f'<c r="M3"><f>{formula}</f><v>{average}</v></c>'
            z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{namespace}"><sheetData><row>{cells}</row></sheetData></worksheet>')
        return path

    def test_exclusion_preserves_raw_reading(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            log = extract(self.workbook(directory, "125", "SUM(E3:J3)"))
        self.assertEqual(log["weeks"][0]["weights"][-1], 200)
        self.assertEqual(log["weeks"][0]["averageDays"], [0, 1, 2, 3, 4, 5])
        self.assertEqual(log["weeks"][0]["date"], "2020-01-06")

    def test_cached_average_mismatch_fails_before_export(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                extract(self.workbook(directory, "999"))

    def test_trimmed_mean_sparse_and_tied(self):
        self.assertIsNone(trimmed_mean([None]))
        self.assertEqual(trimmed_mean([100, 110]), 105)
        self.assertEqual(trimmed_mean([100, 100, 110, 120, 120]), 110)

    def test_set_points_come_from_aggregate_header(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            path = self.workbook(directory, "130")
            with zipfile.ZipFile(path) as source:
                contents = {name: source.read(name) for name in source.namelist()}
            ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
            contents["xl/workbook.xml"] = contents["xl/workbook.xml"].replace(b"</sheets>", b'<sheet name="Agg" r:id="r2"/></sheets>')
            contents["xl/_rels/workbook.xml.rels"] = contents["xl/_rels/workbook.xml.rels"].replace(b"</Relationships>", b'<Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>')
            contents["xl/worksheets/sheet2.xml"] = f'<worksheet xmlns="{ns}"><sheetData><row><c r="Z23" t="inlineStr"><is><t>Set Points</t></is></c><c r="Z24"><v>140</v></c><c r="Z25"><v>160</v></c><c r="AA24"><v>999</v></c></row></sheetData></worksheet>'.encode()
            with zipfile.ZipFile(path, "w") as target:
                for name, payload in contents.items(): target.writestr(name, payload)
            log = extract(path)
        self.assertEqual(log["setPoints"], [{"label": "Set point 1", "weight": 140}, {"label": "Set point 2", "weight": 160}])

    def with_scan_sheet(self, path, regional_rows, regional_date=44000):
        """Add a synthetic BF% sheet: two total-body scans and one regional column."""
        with zipfile.ZipFile(path) as source:
            contents = {name: source.read(name) for name in source.namelist()}
        ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        contents["xl/workbook.xml"] = contents["xl/workbook.xml"].replace(b"</sheets>", b'<sheet name="BF%" r:id="r3"/></sheets>')
        contents["xl/_rels/workbook.xml.rels"] = contents["xl/_rels/workbook.xml.rels"].replace(b"</Relationships>", b'<Relationship Id="r3" Target="worksheets/sheet3.xml"/></Relationships>')
        text = lambda ref, value: f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>'
        num = lambda ref, value: f'<c r="{ref}"><v>{value}</v></c>'
        cells = text("A1", "DEXA") + text("B2", "Weight") + text("E2", "BMC") + text("F2", "BF%")
        # Scan 1: 2020-06-18 (44000), with a conditions note. Scan 2: 2020-12-20 (44185), BF% as an override.
        cells += num("A3", 44000) + num("B3", 150) + num("C3", 120) + num("D3", 24) + num("E3", 6) + num("F3", 0.16) + text("N3", "7:00am. Fasted ")
        cells += num("A4", 44185) + num("B4", 155) + num("C4", 124) + num("D4", 25) + num("E4", 6) + num("F4", 0.161)
        cells += text("A17", "DEXA") + num("C17", regional_date)
        for row, (section, label, value) in enumerate(regional_rows, start=18):
            cells += (text(f"A{row}", section) if section else "") + text(f"B{row}", label) + (num(f"C{row}", value) if value is not None else "")
        cells += text("A60", "Fit3D") + text("B61", "Weight") + num("A62", 44185) + num("B62", 999)
        contents["xl/worksheets/sheet3.xml"] = f'<worksheet xmlns="{ns}"><sheetData><row>{cells}</row></sheetData></worksheet>'.encode()
        with zipfile.ZipFile(path, "w") as target:
            for name, payload in contents.items(): target.writestr(name, payload)

    def test_scans_carry_bmc_conditions_and_regional_panel(self):
        rows = [("Arms", "Fat", 3), (None, "Lean", 15), (None, "BMC", 1), (None, "BF%", 0.15),
                ("Legs", "Fat", 7), (None, "Lean", 40), (None, "BMC", 2.5),
                ("Trunk", "Fat", 11), (None, "Lean", 55), (None, "BMC", 1.5),
                ("Android\n(Waist)", "Fat", 1.5), (None, "Lean", 8), (None, "BMC", None),
                ("Gynoid\n(Hips)", "Fat", 3.5), (None, "Lean", 18), (None, "BMC", 0.5),
                ("BMD", "BMD", 1.25), (None, "T-Score", -0.5), (None, "Z-Score", 1.5), (None, "Z %", 0.9),
                ("Other", "A/G", 0.43), (None, "Visceral", 0)]
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            path = self.workbook(directory, "130")
            self.with_scan_sheet(path, rows)
            log = extract(path)
        first, second = log["scans"]
        self.assertEqual(first["date"], "2020-06-18")
        self.assertEqual((first["weight"], first["leanMass"], first["fatMass"], first["boneMineralContent"]), (150, 120, 24, 6))
        self.assertEqual(first["bodyFatPercent"], 16)
        self.assertEqual(first["conditions"], "7:00am. Fasted")
        self.assertEqual((first["armsFat"], first["armsLean"], first["armsBoneMineralContent"]), (3, 15, 1))
        self.assertEqual((first["legsFat"], first["trunkLean"], first["gynoidBoneMineralContent"]), (7, 55, 0.5))
        self.assertIsNone(first["androidBoneMineralContent"])
        self.assertEqual((first["boneMineralDensity"], first["tScore"], first["zScore"]), (1.25, -0.5, 1.5))
        self.assertEqual((first["androidGynoidRatio"], first["visceralFat"]), (0.43, 0))
        # A scan without a regional column still carries every key, as null.
        self.assertIsNone(second["conditions"])
        self.assertIsNone(second["armsFat"])
        self.assertIsNone(second["visceralFat"])
        self.assertEqual(sorted(first), sorted(second))

    def test_regional_column_must_match_a_scan(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            path = self.workbook(directory, "130")
            self.with_scan_sheet(path, [("Arms", "Fat", 3)], regional_date=44001)
            with self.assertRaises(ValueError):
                extract(path)

    def test_unknown_regional_row_fails(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stderr(io.StringIO()):
            path = self.workbook(directory, "130")
            self.with_scan_sheet(path, [("Arms", "Fat", 3), ("Neck", "Fat", 1)])
            with self.assertRaises(ValueError):
                extract(path)


if __name__ == "__main__":
    unittest.main()
