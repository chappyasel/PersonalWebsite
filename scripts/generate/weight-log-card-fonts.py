"""Subset SF Pro Display for the Log Weight Shortcut's week card.

The editor's Weeks table is SF Pro Display with tabular figures. Satori
can't turn on an OpenType feature, so this bakes `tnum` into the subset:
each digit's character maps straight to its tabular glyph. The subset also
keeps U+2212, the minus sign the table prints, which the weightlifting
subset lacks.

Run with a Python environment containing fontTools, on a Mac with SF Pro
installed:

    /opt/homebrew/opt/python@3.11/bin/python3.11 scripts/generate/weight-log-card-fonts.py

Output stays under src/ and is embedded into PNGs, not served as browser
fonts.
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "src/fonts/weight-log"
FONTS = ("SF-Pro-Display-Regular.otf", "SF-Pro-Display-Medium.otf")
UNICODES = [
    *range(0x20, 0x7F),
    *range(0xA0, 0x100),
    *range(0x2010, 0x2028),
    0x2212,
]


def tabular_figures(font: TTFont) -> dict[str, str]:
    """The `tnum` feature's single substitutions, glyph to glyph."""
    gsub = font["GSUB"].table
    mapping: dict[str, str] = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "tnum":
            continue
        for index in record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for table in lookup.SubTable:
                if lookup.LookupType == 7:
                    table = table.ExtSubTable
                mapping.update(getattr(table, "mapping", {}) or {})
    return mapping


OUTPUT.mkdir(parents=True, exist_ok=True)
for name in FONTS:
    font = TTFont(Path("/Library/Fonts") / name)
    tabular = tabular_figures(font)
    for table in font["cmap"].tables:
        for code, glyph in list(table.cmap.items()):
            if chr(code).isdigit() and glyph in tabular:
                table.cmap[code] = tabular[glyph]
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    # Satori's OpenType reader needs direct lookups rather than extension
    # wrappers, as in weightlifting-og-fonts.py.
    for tag, extension_type in (("GSUB", 7), ("GPOS", 9)):
        if tag not in font:
            continue
        for lookup in font[tag].table.LookupList.Lookup:
            if lookup.LookupType != extension_type:
                continue
            types = {table.ExtensionLookupType for table in lookup.SubTable}
            if len(types) != 1:
                raise ValueError(f"Mixed extension lookup types in {name}")
            lookup.LookupType = types.pop()
            lookup.SubTable = [table.ExtSubTable for table in lookup.SubTable]
            lookup.SubTableCount = len(lookup.SubTable)
    font.save(OUTPUT / name)
