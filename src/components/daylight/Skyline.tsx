/**
 * The east-facing traverse from the main 3D site's dome shader
 * (SceneEnvironment.tsx), left to right: Twin Peaks / Mt Davidson -> Sutro on
 * its hill -> Coit on Telegraph Hill -> Transamerica with its wings ->
 * downtown cluster -> Salesforce crown -> Jasper -> the Bay Bridge's western
 * suspension span, with a Yerba Buena hint at the edge. The hero's ember glow
 * sits between Salesforce and the bridge.
 *
 * `preserveAspectRatio="none"` stretches the survey across any hero width;
 * color comes from the parent via currentColor.
 */
export default function Skyline() {
  return (
    <svg
      viewBox="0 0 640 60"
      preserveAspectRatio="none"
      fill="currentColor"
      aria-hidden
    >
      {/* Twin Peaks / Mt Davidson ridgeline */}
      <path d="M0 36 Q28 26 56 31 Q78 34 96 30 Q120 25 144 40 Q160 48 176 52 L176 60 L0 60 Z" />
      {/* Sutro Tower: splayed legs to a waist, then the three-mast candelabra
          flaring wider than the waist; tallest thing on the skyline, as it is
          from the room's vantage */}
      <path d="M90 29 L96.5 10.5 L103.5 10.5 L110 29 Z" />
      <rect x="92" y="2.5" width="1.7" height="9" />
      <rect x="99.15" y="0.5" width="1.7" height="11" />
      <rect x="106.3" y="2.5" width="1.7" height="9" />
      <rect x="91" y="10.5" width="18" height="1.7" />
      <rect x="92" y="5.6" width="16" height="1.2" />
      {/* Telegraph Hill + Coit */}
      <path d="M184 60 Q200 47 216 52 L216 60 Z" />
      <rect x="197" y="34" width="6" height="16" />
      <rect x="196" y="32" width="8" height="3" />
      <rect x="197.5" y="30" width="5" height="2" />
      {/* low downtown before Transamerica */}
      <rect x="228" y="46" width="14" height="14" />
      <rect x="244" y="42" width="10" height="18" />
      <rect x="256" y="48" width="18" height="12" />
      <rect x="276" y="44" width="12" height="16" />
      {/* Transamerica Pyramid: spire + wings breaking from the sloped faces */}
      <path d="M292 50 L300 17 L308 50 L308 60 L292 60 Z" />
      <rect x="299.3" y="13" width="1.4" height="5" />
      <rect x="291.4" y="32" width="3" height="10" />
      <rect x="305.6" y="32" width="3" height="10" />
      {/* downtown cluster */}
      <rect x="316" y="40" width="12" height="20" />
      <rect x="330" y="36" width="9" height="24" />
      <rect x="341" y="44" width="16" height="16" />
      <rect x="359" y="38" width="11" height="22" />
      <rect x="372" y="46" width="14" height="14" />
      <rect x="388" y="41" width="10" height="19" />
      <rect x="400" y="47" width="18" height="13" />
      {/* Salesforce Tower: broad shaft, decisive upper taper, flat crown at
          ~56% base width */}
      <path d="M429 60 L429 36 C429 24 431 17 434.5 13 L447.5 13 C451 17 452 24 452 36 L452 60 Z" />
      {/* Jasper, 45 Lansing: quiet rectangular mass */}
      <rect x="464" y="38" width="12" height="22" />
      {/* Bay Bridge, western suspension span: portal towers to the water,
          deck, cables */}
      <rect x="505" y="46" width="135" height="2.4" />
      <rect x="542" y="22" width="2.2" height="38" />
      <rect x="549" y="22" width="2.2" height="38" />
      <rect x="541" y="24" width="11" height="2" />
      <rect x="541" y="32" width="11" height="1.6" />
      <rect x="541" y="40" width="11" height="1.6" />
      <rect x="607" y="22" width="2.2" height="38" />
      <rect x="614" y="22" width="2.2" height="38" />
      <rect x="606" y="24" width="11" height="2" />
      <rect x="606" y="32" width="11" height="1.6" />
      <rect x="606" y="40" width="11" height="1.6" />
      <path
        d="M546.5 23 Q579 41 610.5 23"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M546.5 23 Q526 38 507 46"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M610.5 23 Q627 36 640 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {/* Yerba Buena hint at the right edge */}
      <path d="M626 60 Q636 50 640 51 L640 60 Z" />
    </svg>
  );
}
