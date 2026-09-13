/** A small abstract marker for a Golf URL's initial loading view. */
export function GolfIllustration() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="room-golf-illustration"
      viewBox="0 0 240 180"
      role="img"
      aria-label="Golf green and flag"
    >
      <ellipse
        cx="120"
        cy="137"
        rx="76"
        ry="25"
        fill="var(--room-golf-green, #9caf89)"
      />
      <path
        d="M116 135V39"
        fill="none"
        stroke="var(--room-golf-pole, #e9e4d6)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        className="room-golf-flag"
        d="M117 40Q133 35 151 42L147 66Q131 59 117 64Z"
        fill="var(--room-golf-flag, #846293)"
      />
    </svg>
  );
}
