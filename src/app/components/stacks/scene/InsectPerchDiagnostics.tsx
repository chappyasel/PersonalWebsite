"use client";

import { UNIT_COUNT } from "../data";
import { useStacks } from "../store";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";

import {
  type InsectFlightVolume,
  createInsectFlightVolume,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import { diagnoseInsectPerch } from "./insectFlightWorld";
import {
  type InsectDiagnosticsSnapshot,
  insectDiagnosticsController,
  insectDiagnosticsEnabled,
} from "./insectPerchDiagnostic";
import { getInsectPerches } from "./insectPerches";
import { unitPose } from "./worldLayout";

const NO_RAYCAST = () => null;
/** One colour per resident slot, so a shared line between two residents of the
 * same shelf is visible as two colours running together rather than one. */
const TRAIL_COLORS = ["#ffd65a", "#7ddcff", "#ff9ad5"] as const;

/** The twelve edges of one Flight Volume, drawn as a single stroke so the
 * overlay costs one Line per Unit. Duplicated corners in the walk are what let
 * one polyline close every edge. */
function flightVolumeOutline(volume: InsectFlightVolume) {
  const extent = volume.extent;
  const local = (x: number, y: number, z: number) => {
    const out = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(volume, { x, y, z }, out);
    return [out.x, out.y, out.z] as const;
  };
  const [w, minY, maxY, minZ, maxZ] = [
    extent.halfWidth,
    extent.minY,
    extent.maxY,
    extent.minZ,
    extent.maxZ,
  ];
  return [
    local(-w, minY, minZ),
    local(w, minY, minZ),
    local(w, minY, maxZ),
    local(-w, minY, maxZ),
    local(-w, minY, minZ),
    local(-w, maxY, minZ),
    local(w, maxY, minZ),
    local(w, minY, minZ),
    local(w, maxY, minZ),
    local(w, maxY, maxZ),
    local(w, minY, maxZ),
    local(w, maxY, maxZ),
    local(-w, maxY, maxZ),
    local(-w, minY, maxZ),
    local(-w, maxY, maxZ),
    local(-w, maxY, minZ),
  ];
}

const FLIGHT_VOLUMES = Array.from({ length: UNIT_COUNT }, (_, unitIndex) => ({
  unitIndex,
  corners: flightVolumeOutline(createInsectFlightVolume(unitPose(unitIndex))),
}));
const DISPOSITION_COLOR = {
  ready: "#55d98b",
  waiting: "#f0bd4f",
  rejected: "#ff5964",
} as const;

/** Keep review helpers visually distinct from the wildlife they measure. A
 * previous 2.5–3.2 cm sphere plus the full wire envelope made a rejected site
 * look like a motionless red insect from the shelf camera. These deliberately
 * geometric markers are smaller than the rendered animal and hidden by
 * default. */
export const INSECT_PERCH_GLYPH_STYLE = {
  authored: { shape: "diamond", size: 0.009 },
  contact: { shape: "box", size: 0.012 },
  envelope: { defaultVisible: false, opacity: 0.12 },
} as const;

export function insectPerchGlyphIsVisible(
  snapshot: Pick<
    InsectDiagnosticsSnapshot,
    "hoveredPerchId" | "showEnvelopes" | "showRoutes"
  >,
  perchId: string,
) {
  return (
    snapshot.showEnvelopes ||
    snapshot.showRoutes ||
    snapshot.hoveredPerchId === perchId
  );
}

function PerchGlyph({
  diagnostic,
  showEnvelope,
  showRoutes,
}: {
  diagnostic: ReturnType<typeof diagnoseInsectPerch>;
  showEnvelope: boolean;
  showRoutes: boolean;
}) {
  const authored = diagnostic.authoredAnchor;
  const contact = diagnostic.resolvedContact;
  const normal = diagnostic.normal;
  const color = DISPOSITION_COLOR[diagnostic.disposition];
  return (
    <group name={`perch-diagnostic:${diagnostic.perchId}`}>
      {/* The authored anchor is coloured by the same disposition as everything
        else on the glyph. It used to be hardcoded red and drawn through
        geometry, which put a red marker on every valid Perch and made the HUD
        read as a wall of rejections that was never there. */}
      <mesh
        position={[authored.x, authored.y, authored.z]}
        raycast={NO_RAYCAST}
      >
        <octahedronGeometry
          args={[INSECT_PERCH_GLYPH_STYLE.authored.size, 0]}
        />
        <meshBasicMaterial color={color} />
      </mesh>
      {contact ? (
        <>
          <mesh
            position={[contact.x, contact.y, contact.z]}
            raycast={NO_RAYCAST}
          >
            <boxGeometry
              args={[
                INSECT_PERCH_GLYPH_STYLE.contact.size,
                INSECT_PERCH_GLYPH_STYLE.contact.size,
                INSECT_PERCH_GLYPH_STYLE.contact.size,
              ]}
            />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
          <Line
            points={[
              [authored.x, authored.y, authored.z],
              [contact.x, contact.y, contact.z],
            ]}
            color={color}
            lineWidth={1}
            depthTest={false}
            raycast={NO_RAYCAST}
          />
          {normal ? (
            <Line
              points={[
                [contact.x, contact.y, contact.z],
                [
                  contact.x + normal.x * 0.08,
                  contact.y + normal.y * 0.08,
                  contact.z + normal.z * 0.08,
                ],
              ]}
              color="#7ddcff"
              lineWidth={2}
              depthTest={false}
              raycast={NO_RAYCAST}
            />
          ) : null}
          {showEnvelope ? (
            <mesh
              position={[contact.x, contact.y, contact.z]}
              raycast={NO_RAYCAST}
            >
              <sphereGeometry
                args={[diagnostic.envelope.sweepRadius, 16, 10]}
              />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={INSECT_PERCH_GLYPH_STYLE.envelope.opacity}
                wireframe
                depthTest={false}
              />
            </mesh>
          ) : null}
        </>
      ) : null}
      {showRoutes
        ? diagnostic.routes
            .filter((route) => route.points.length >= 2)
            .map((route) => (
              <Line
                key={route.phase}
                points={route.points.map(
                  (point) => [point.x, point.y, point.z] as const,
                )}
                color={route.clear ? "#66e3a1" : "#ff5964"}
                lineWidth={1}
                depthTest={false}
                raycast={NO_RAYCAST}
              />
            ))
        : null}
    </group>
  );
}

/** Development-only scene overlay. It is mounted beside SceneContent, never
 * below a collision-indexed Unit root, and every helper opts out of raycasts. */
export default function InsectPerchDiagnostics() {
  const snapshot = useSyncExternalStore(
    insectDiagnosticsController.subscribe,
    insectDiagnosticsController.getSnapshot,
    insectDiagnosticsController.getSnapshot,
  );
  const activeUnit = useStacks((state) => state.activeUnit);
  const lastTick = useRef(-1);
  useFrame(({ clock }) => {
    const tick = Math.floor(clock.elapsedTime * 4);
    if (lastTick.current === tick) return;
    lastTick.current = tick;
    const filter = insectDiagnosticsController.getSnapshot().filter;
    const diagnostics = [...getInsectPerches().values()]
      .filter((perch) => filter === "all" || perch.unitIndex === activeUnit)
      .map((perch) =>
        diagnoseInsectPerch(
          perch.id,
          perch.kind === "lamp" ? "moth" : "butterfly",
          clock.elapsedTime,
          false,
        ),
      );
    insectDiagnosticsController.update({ diagnostics });
    // Development-only bridge for offline review. The HUD shows a Perch's
    // rejection code but not its geometry, and "the marker is on the hull, not
    // the sail" is a question about coordinates. Publishing the same evaluated
    // snapshot the HUD renders lets an audit read resolved contacts and
    // normals without anyone having to patch instrumentation into the tree.
    if (process.env.NODE_ENV === "development")
      (window as unknown as Record<string, unknown>).__stacksInsects = {
        diagnostics,
        flights: insectDiagnosticsController.getSnapshot().flightStates,
      };
  });

  if (!insectDiagnosticsEnabled(process.env.NODE_ENV)) return null;
  const visibleDiagnostics = snapshot.diagnostics.filter((diagnostic) =>
    insectPerchGlyphIsVisible(snapshot, diagnostic.perchId),
  );
  return (
    <group name="insect-perch-diagnostics">
      {snapshot.showFlightVolumes
        ? FLIGHT_VOLUMES.map(({ unitIndex, corners }) =>
            snapshot.filter === "all" || unitIndex === activeUnit ? (
              <Line
                key={`flight-volume:${unitIndex}`}
                name={`flight-volume:${unitIndex}`}
                points={corners}
                color="#50c8ff"
                transparent
                opacity={0.32}
                lineWidth={1}
                depthTest={false}
                raycast={NO_RAYCAST}
              />
            ) : null,
          )
        : null}
      {snapshot.showFlightTrails
        ? snapshot.flightStates
            .filter(
              ({ telemetry }) =>
                snapshot.filter === "all" || telemetry.unitIndex === activeUnit,
            )
            .map(({ telemetry, trail }) =>
              trail.length >= 2 ? (
                <Line
                  key={`trail:${telemetry.occupantId}`}
                  points={trail.map(
                    (point) => [point.x, point.y, point.z] as const,
                  )}
                  color={TRAIL_COLORS[telemetry.residentIndex % 3]}
                  transparent
                  opacity={0.75}
                  lineWidth={1}
                  depthTest={false}
                  raycast={NO_RAYCAST}
                />
              ) : null,
            )
        : null}
      {visibleDiagnostics.map((diagnostic) => (
        <PerchGlyph
          key={`${diagnostic.species}:${diagnostic.perchId}`}
          diagnostic={diagnostic}
          showEnvelope={snapshot.showEnvelopes}
          showRoutes={snapshot.showRoutes}
        />
      ))}
    </group>
  );
}
