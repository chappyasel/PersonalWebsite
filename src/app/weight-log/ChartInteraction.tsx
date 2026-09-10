"use client";

import { type PointerEvent, useEffect, useState } from "react";

import { dayString } from "~/lib/weight-log/chart";

type Drag = { pointerId: number; start: number; end: number; clientX: number };
type Payload = { dataKey?: string; value?: number | null };

// Customized injects the resolved plot geometry and tooltip state from Recharts.
export function ChartInteraction({
  bounds,
  onZoom,
  onDraggingChange,
  offset,
  activePayload,
  activeCoordinate,
  isTooltipActive,
  yAxisMap,
}: {
  bounds: [number, number];
  onZoom: (start: string, end: string) => void;
  onDraggingChange: (dragging: boolean) => void;
  offset?: { left?: number; top?: number; width?: number; height?: number };
  activePayload?: Payload[];
  activeCoordinate?: { x?: number; y?: number };
  isTooltipActive?: boolean;
  yAxisMap?: Record<string, { scale: (value: number) => number }>;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [start, end] = bounds;
  useEffect(() => {
    setDrag(null);
    onDraggingChange(false);
  }, [start, end, onDraggingChange]);
  useEffect(() => {
    if (!drag) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrag(null);
        onDraggingChange(false);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drag, onDraggingChange]);

  const { left = 0, top = 0, width = 0, height = 0 } = offset ?? {};
  if (width <= 0 || height <= 0) return null;
  function fraction(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0
      ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      : null;
  }
  function cancel() {
    setDrag(null);
    onDraggingChange(false);
  }
  function finish(event: PointerEvent<SVGRectElement>) {
    if (event.pointerId !== drag?.pointerId) return;
    const position = fraction(event);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (position === null || Math.abs(event.clientX - drag.clientX) < 6) return;
    const low = start + Math.min(drag.start, position) * (end - start);
    const high = start + Math.max(drag.start, position) * (end - start);
    // Include the calendar days touched by the selection, in either direction.
    const from = Math.max(start, Math.floor(low / 86_400_000) * 86_400_000);
    const to = Math.min(end, Math.ceil(high / 86_400_000) * 86_400_000);
    if (from < to) onZoom(dayString(from), dayString(to));
  }

  // Snap the horizontal guide to the closest visible series at the hovered date.
  // Each series uses its own axis, so percentages never get mapped as pounds.
  const candidates = (activePayload ?? []).flatMap((item) => {
    if (item.value == null || !Number.isFinite(item.value)) return [];
    const bodyFat = item.dataKey?.startsWith("bodyFat") ?? false;
    const axis = yAxisMap?.[bodyFat ? "bodyFat" : "0"];
    if (!axis) return [];
    const y = axis.scale(item.value);
    return Number.isFinite(y) && y >= top && y <= top + height
      ? [{ y, label: `${item.value.toFixed(1)}${bodyFat ? "%" : " lb"}` }]
      : [];
  });
  const hoverY = activeCoordinate?.y ?? top;
  const guide = candidates.reduce<(typeof candidates)[number] | undefined>(
    (nearest, item) =>
      !nearest || Math.abs(item.y - hoverY) < Math.abs(nearest.y - hoverY)
        ? item
        : nearest,
    undefined,
  );
  return (
    <g>
      {isTooltipActive && !drag && guide && (
        <g className="weight-chart-hover-guide" pointerEvents="none">
          <line
            x1={left}
            x2={left + width}
            y1={guide.y}
            y2={guide.y}
            stroke="currentColor"
            strokeOpacity={0.65}
            strokeDasharray="4 4"
          />
          <rect
            x={left + width - 64}
            y={Math.max(top, guide.y - 21)}
            width={62}
            height={19}
            rx={4}
            fill="hsl(var(--background))"
          />
          <text
            x={left + width - 6}
            y={Math.max(top, guide.y - 21) + 13}
            textAnchor="end"
            fill="currentColor"
            fontSize={11}
          >
            {guide.label}
          </text>
        </g>
      )}
      {drag && (
        <rect
          className="weight-chart-zoom-selection"
          x={left + Math.min(drag.start, drag.end) * width}
          y={top}
          width={Math.abs(drag.end - drag.start) * width}
          height={height}
          fill="currentColor"
          fillOpacity={0.12}
          stroke="currentColor"
          strokeOpacity={0.4}
          pointerEvents="none"
        />
      )}
      <rect
        className="weight-chart-drag-area cursor-crosshair"
        x={left}
        y={top}
        width={width}
        height={height}
        fill="transparent"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            event.pointerType === "touch" ||
            event.isPrimary === false
          )
            return;
          const position = fraction(event);
          if (position === null) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({
            pointerId: event.pointerId,
            start: position,
            end: position,
            clientX: event.clientX,
          });
          onDraggingChange(true);
        }}
        onPointerMove={(event) => {
          if (event.pointerId !== drag?.pointerId) return;
          const position = fraction(event);
          if (position !== null) setDrag({ ...drag, end: position });
        }}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      />
    </g>
  );
}
