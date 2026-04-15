"use client";

export type TimeRange = "30d" | "90d" | "1y" | "3y" | "all";

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "3y", label: "3y" },
  { value: "all", label: "All" },
];

export function TimeRangeToggle({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
              : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
