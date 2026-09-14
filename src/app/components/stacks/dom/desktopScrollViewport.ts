import { HUD_MOUSE_MAX_PX } from "../scene/hudCameraDriftControl";
import type { CSSProperties } from "react";

// Keep the native scroll clip beyond either viewport edge at full mouse
// drift, with two spare pixels for fractional positioning. Equal padding
// preserves content placement, centring, and the native scroll range.
const bleed = HUD_MOUSE_MAX_PX + 2;

export const desktopScrollViewportStyle = {
  top: -bleed,
  height: `calc(100% + ${bleed * 2}px)`,
  paddingTop: `calc(5rem + ${bleed}px)`,
  paddingBottom: `calc(5rem + ${bleed}px)`,
} satisfies CSSProperties;
