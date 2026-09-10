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


if __name__ == "__main__":
    unittest.main()
