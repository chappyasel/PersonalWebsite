import { sql } from "drizzle-orm";
import { ImageResponse } from "next/og";

import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";
import { DAYLIGHT, skyBand } from "~/lib/og/daylight";
import { db } from "~/server/db";
import { wlSets, wlWorkouts } from "~/server/db/schema";

export const runtime = "nodejs";

export const alt = "Chappy's Weightlifting Dashboard";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const KEY_LIFTS = ["Bench Press", "Squat", "Deadlift"];

async function getStats() {
  const [workoutCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(wlWorkouts);

  const [setCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(wlSets);

  const [totalVolume] = await db
    .select({ total: sql<number>`COALESCE(SUM(volume), 0)` })
    .from(wlSets);

  const [earliest] = await db
    .select({ earliest: sql<string>`MIN(${wlWorkouts.date})` })
    .from(wlWorkouts);

  return {
    totalWorkouts: Number(workoutCount?.count ?? 0),
    totalSets: Number(setCount?.count ?? 0),
    totalVolume: Number(totalVolume?.total ?? 0),
    earliestWorkout: earliest?.earliest ?? null,
  };
}

async function getTopPRs() {
  const rows = await db.execute<{
    exercise_name: string;
    best_one_rm: number;
    best_reps: number;
    best_weight: number;
  }>(sql`
    SELECT DISTINCT ON (e.name)
      e.name AS exercise_name,
      s.one_rm AS best_one_rm,
      s.reps AS best_reps,
      s.weight AS best_weight
    FROM wl_sets s
    INNER JOIN wl_exercises e ON s.exercise_id = e.id
    WHERE s.one_rm IS NOT NULL AND s.one_rm > 0
    ORDER BY e.name, s.one_rm DESC
  `);

  // For each key lift, pick the variant with the highest 1RM
  return KEY_LIFTS.map((lift) => {
    const matches = rows.filter((r) => r.exercise_name.includes(lift));
    const best = matches.sort(
      (a, b) => Number(b.best_one_rm) - Number(a.best_one_rm),
    )[0];
    return best
      ? {
          name: lift,
          oneRM: Math.round(Number(best.best_one_rm)),
          weight: Math.round(Number(best.best_weight)),
          reps: Number(best.best_reps),
        }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

function formatVolume(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M`;
  if (lbs >= 1_000) return `${Math.round(lbs / 1_000)}K`;
  return lbs.toLocaleString();
}

function getYearsTraining(earliest: string | null): string {
  if (!earliest) return "0";
  const start = new Date(earliest);
  const now = new Date();
  return (
    (now.getTime() - start.getTime()) /
    (1000 * 60 * 60 * 24 * 365.25)
  ).toFixed(1);
}

export default async function Image() {
  try {
    const [stats, prs, fontBold] = await Promise.all([
      getStats(),
      getTopPRs(),
      loadGeorgiaProBold(),
    ]);

    const statItems = [
      { label: "Workouts", value: stats.totalWorkouts.toLocaleString() },
      { label: "Sets", value: stats.totalSets.toLocaleString() },
      { label: "Volume", value: `${formatVolume(stats.totalVolume)} lbs` },
      {
        label: "Years",
        value: getYearsTraining(stats.earliestWorkout),
      },
    ];

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: `linear-gradient(180deg, ${DAYLIGHT.arc0} 0%, ${DAYLIGHT.arc1} 55%, ${DAYLIGHT.arc2} 100%)`,
            fontFamily: '"Georgia Pro"',
            color: DAYLIGHT.fg,
          }}
        >
          {skyBand(1200, 196)}
          {/* Title */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: "60px",
              fontWeight: 700,
              color: DAYLIGHT.fg,
              letterSpacing: "-0.02em",
              marginTop: "26px",
              marginBottom: "40px",
            }}
          >
            Weightlifting ~ Chappy Asel
          </div>

          {/* Stats Row */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "64px",
              marginBottom: "40px",
            }}
          >
            {statItems.map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "50px",
                    fontWeight: 700,
                    color: DAYLIGHT.fg,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: "21px",
                    color: DAYLIGHT.label,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* PRs Row */}
          {prs.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "80px",
                borderTop: "1px solid hsl(20, 6%, 82%)",
                margin: "0 80px",
                paddingTop: "32px",
              }}
            >
              {prs.map((pr) => (
                <div
                  key={pr.name}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "21px",
                      color: DAYLIGHT.label,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {pr.name}
                  </div>
                  <div
                    style={{
                      fontSize: "42px",
                      fontWeight: 700,
                      color: DAYLIGHT.am,
                    }}
                  >
                    {`${pr.oneRM} lbs`}
                  </div>
                  <div style={{ display: "flex", fontSize: "20px", color: DAYLIGHT.subtitle }}>
                    {`${pr.weight} x ${pr.reps} est. 1RM`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      {
        ...size,
        fonts: [
          {
            name: "Georgia Pro",
            data: fontBold,
            weight: 700,
            style: "normal",
          },
        ],
      },
    );
  } catch (error) {
    console.error("Error generating weightlifting OG image:", error);
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "hsl(46, 30%, 95.5%)",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Georgia, serif",
            fontSize: "64px",
            fontWeight: 700,
            color: "hsl(25, 6%, 32%)",
          }}
        >
          Weightlifting ~ Chappy Asel
        </div>
      ),
      { ...size },
    );
  }
}
