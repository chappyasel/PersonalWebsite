import type { BooksShelfDrawing } from "./booksShelfDrawing";

export function BooksShelfSvg({
  drawing,
  className,
}: {
  drawing: BooksShelfDrawing;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      aria-hidden="true"
    >
      {drawing.layers.map((layer) => (
        <g
          key={layer.key}
          data-shelf-cover={layer.cover?.id}
          data-shelf-background={layer.cover ? undefined : ""}
        >
          {layer.polygons.map((polygon, i) => (
            <polygon
              key={i}
              points={polygon.points
                .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
                .join(" ")}
              fill={polygon.color}
              stroke={polygon.color}
              strokeWidth="0.3"
            />
          ))}
          {layer.cover
            ? (() => {
                const [a, b, c] = layer.cover.corners;
                return (
                  <image
                    href={layer.cover.src}
                    width="1"
                    height="1"
                    preserveAspectRatio="none"
                    transform={`matrix(${[b!.x - a!.x, b!.y - a!.y, c!.x - a!.x, c!.y - a!.y, a!.x, a!.y].map((value) => value.toFixed(3)).join(" ")})`}
                  />
                );
              })()
            : null}
        </g>
      ))}
    </svg>
  );
}
