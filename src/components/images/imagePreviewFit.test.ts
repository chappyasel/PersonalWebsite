import { expect, it } from "vitest";

import { fitImagePreview } from "./imagePreviewFit";

it("enlarges small images while reserving space for the viewer controls", () => {
  expect(
    fitImagePreview(
      { width: 400, height: 400 },
      { width: 1024, height: 768 },
      { upscale: true, verticalInset: 80 },
    ),
  ).toEqual({ width: 608, height: 608 });
  expect(
    fitImagePreview(
      { width: 400, height: 200 },
      { width: 1024, height: 768 },
      { upscale: true, verticalInset: 80 },
    ),
  ).toEqual({ width: 901, height: 451 });
});
it("contains portraits on phones and preserves the home viewer's default size limit", () => {
  const phone = fitImagePreview(
    { width: 800, height: 1600 },
    { width: 390, height: 844 },
    { upscale: true, verticalInset: 130 },
  );
  expect(phone).toEqual({ width: 292, height: 584 });
  expect(
    fitImagePreview({ width: 200, height: 100 }, { width: 1920, height: 1080 }),
  ).toEqual({ width: 200, height: 100 });
});
