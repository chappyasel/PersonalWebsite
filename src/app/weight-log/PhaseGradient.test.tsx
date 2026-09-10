import { renderToStaticMarkup } from "react-dom/server";
import { ComposedChart, Customized, Line, XAxis, YAxis } from "recharts";
import { expect, it } from "vitest";

import { PHASE_COLORS, dayTime } from "~/lib/weight-log/chart";

import { PhaseGradient } from "./PhaseGradient";

it("uses the actual chart axis to color even a flat line across a phase boundary", () => {
  const bounds: [number, number] = [
    dayTime("2020-01-01"),
    dayTime("2020-01-03"),
  ];
  const html = renderToStaticMarkup(
    <ComposedChart
      width={600}
      height={300}
      data={[
        { time: bounds[0], weight: 100 },
        { time: bounds[1], weight: 100 },
      ]}
      margin={{ left: 0, right: 20 }}
    >
      <XAxis type="number" dataKey="time" domain={bounds} />
      <YAxis width={50} />
      <Customized
        component={
          <PhaseGradient
            id="test-phase"
            bounds={bounds}
            phases={[
              {
                id: "a",
                label: "A",
                kind: "bulk",
                start: "2020-01-01",
                end: "2020-01-01",
              },
              {
                id: "b",
                label: "B",
                kind: "cut",
                start: "2020-01-02",
                end: "2020-01-03",
              },
            ]}
          />
        }
      />
      <Line
        dataKey="weight"
        stroke="url(#test-phase)"
        isAnimationActive={false}
      />
    </ComposedChart>,
  );
  expect(html).toContain('gradientUnits="userSpaceOnUse" x1="50" x2="580"');
  expect(html).toContain(`offset="0.5" stop-color="${PHASE_COLORS.bulk}"`);
  expect(html).toContain(`offset="0.5" stop-color="${PHASE_COLORS.cut}"`);
  expect(html).toContain('stroke="url(#test-phase)"');
});
