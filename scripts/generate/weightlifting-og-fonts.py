"""Subset the installed app fonts for server-rendered weightlifting share images.

Run with a Python environment containing fontTools. Output stays under src/
and is embedded into PNGs, not served as browser fonts.
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "src/fonts/weightlifting"
FONTS = (
    "SF-Pro-Display-Regular.otf",
    "SF-Pro-Display-Semibold.otf",
    "SF-Pro-Rounded-Bold.otf",
)

OUTPUT.mkdir(parents=True, exist_ok=True)
for name in FONTS:
    font = TTFont(Path("/Library/Fonts") / name)
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[*range(0x20, 0x250), *range(0x2000, 0x2070)])
    subsetter.subset(font)
    # Satori's OpenType reader needs direct lookups rather than extension
    # wrappers. Unwrap them while preserving the font's shaping rules.
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
