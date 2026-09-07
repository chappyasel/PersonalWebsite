"use client";

// The Mac's flight to the camera: PropApproach bound to the Mac's controller.
// The wrapper keeps the Mac's name at its call site; everything it does lives
// in PropApproach.tsx now that the About globe flies too.
import React from "react";

import PropApproach from "./PropApproach";
import { macApproach } from "./macApproachState";

type PropApproachProps = React.ComponentProps<typeof PropApproach>;

export default function MacApproach(
  props: Omit<PropApproachProps, "controller">,
) {
  return <PropApproach controller={macApproach} {...props} />;
}
