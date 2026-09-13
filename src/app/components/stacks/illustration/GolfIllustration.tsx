import {
  GOLF_CUP,
  GOLF_FLAG_LOCAL,
  GOLF_GREEN,
  GOLF_GREEN_CENTER_LOCAL,
} from "../scene/golf/golfCourse";

/** A quiet course overview for the fractional stop, which has no shelf.
 * Its dimensions and cup position come from the playable course. This is
 * deliberately not registered as a camera-matched shelf image. */
export function GolfIllustration() {
  const scale = 84;
  const rx = (GOLF_GREEN.width * scale) / 2;
  const ry = (GOLF_GREEN.depth * scale) / 4;
  const cupX = 250 + (GOLF_FLAG_LOCAL[0] - GOLF_GREEN_CENTER_LOCAL[0]) * scale;
  const cupY =
    220 + ((GOLF_FLAG_LOCAL[1] - GOLF_GREEN_CENTER_LOCAL[1]) * scale) / 2;
  return (
    <svg
      className="room-golf-illustration"
      viewBox="0 0 500 350"
      role="img"
      aria-label="Golf putting green"
    >
      <ellipse
        cx="250"
        cy="223"
        rx={rx + GOLF_GREEN.fringe * scale}
        ry={ry + (GOLF_GREEN.fringe * scale) / 2}
        fill="var(--room-golf-fringe, #7d9d72)"
      />
      <ellipse
        cx="250"
        cy="220"
        rx={rx}
        ry={ry}
        fill="var(--room-golf-green, #b5cca1)"
      />
      <ellipse
        cx={cupX}
        cy={cupY}
        rx={GOLF_CUP.radius * scale}
        ry={(GOLF_CUP.radius * scale) / 2}
        fill="#3e5745"
      />
      <path
        d={`M${cupX} ${cupY}V${cupY - 116}`}
        fill="none"
        stroke="#ede9d9"
        strokeWidth="3"
      />
      <path
        d={`M${cupX + 2} ${cupY - 116}q26 -7 52 5l-15 17q-16 -9 -37 -3z`}
        fill="var(--room-golf-flag, #b7736c)"
      />
      <circle cx="213" cy="245" r="5" fill="#f4f2e8" />
      <text
        x="250"
        y="322"
        textAnchor="middle"
        fill="currentColor"
        fontSize="17"
        fontFamily="var(--font-selected), Georgia, serif"
      >
        A little time on the green.
      </text>
    </svg>
  );
}
