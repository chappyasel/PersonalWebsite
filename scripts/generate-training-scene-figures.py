#!/usr/bin/env python3
"""Export committed data and full-size images for the Training scene figures."""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
from pathlib import Path

ANALYSIS_ROOT = Path("/Users/chappyasel/Desktop/Repos/WeightliftingApp-AnalyzeData")
LIFT_TABLE_PATH = Path("/Users/chappyasel/Desktop/Lift Table.pdf")
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
IMAGE_OUTPUT_DIR = REPOSITORY_ROOT / "public/images/stacks/training-figures"
ARTIFACT_IMAGE_DIR = REPOSITORY_ROOT / "public/images/stacks/artifacts"
DOCUMENT_OUTPUT_DIR = REPOSITORY_ROOT / "public/documents"

def notebook_png(notebook_path: Path, title: str) -> bytes:
    """Read the reviewed PNG embedded in the analysis notebook's chart cell."""
    notebook = json.loads(notebook_path.read_text())
    for cell in notebook["cells"]:
        if title not in "".join(cell.get("source", [])):
            continue
        for output in cell.get("outputs", []):
            encoded = output.get("data", {}).get("image/png")
            if encoded:
                payload = "".join(encoded) if isinstance(encoded, list) else encoded
                return base64.b64decode(payload)
    raise RuntimeError(f"No rendered figure titled {title!r} in {notebook_path}")


def write_figure_images() -> None:
    IMAGE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (IMAGE_OUTPUT_DIR / "aggregate-strength.png").write_bytes(
        notebook_png(
            ANALYSIS_ROOT / "src" / "analyze_pr_szn.ipynb",
            "Next July projection from annual checkpoints",
        )
    )
    (IMAGE_OUTPUT_DIR / "big-three.png").write_bytes(
        notebook_png(
            ANALYSIS_ROOT / "src" / "analyze_big_three.ipynb",
            "Big Three Strength Progression (1RMe)",
        )
    )
    shutil.copyfile(
        ANALYSIS_ROOT / "outputs" / "dexa-lean-mass-vs-bodyweight.png",
        IMAGE_OUTPUT_DIR / "dexa-lean-mass-vs-bodyweight.png",
    )


def write_lift_table_artifact() -> None:
    ARTIFACT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    DOCUMENT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(LIFT_TABLE_PATH, DOCUMENT_OUTPUT_DIR / "lift-table.pdf")
    subprocess.run(
        [
            "pdftoppm",
            "-png",
            "-singlefile",
            "-r",
            "150",
            str(LIFT_TABLE_PATH),
            str(ARTIFACT_IMAGE_DIR / "lift-table"),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--figures-only",
        action="store_true",
        help="Copy the three reviewed analysis-repository figures only.",
    )
    args = parser.parse_args()
    if args.figures_only:
        write_figure_images()
        print(f"Wrote figure images to {IMAGE_OUTPUT_DIR}")
        return

    write_figure_images()
    write_lift_table_artifact()
    print(f"Wrote figure images to {IMAGE_OUTPUT_DIR}")
    print(f"Wrote Lift Table artifact to {ARTIFACT_IMAGE_DIR}")


if __name__ == "__main__":
    main()
