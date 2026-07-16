/** Keep server-prefetched data fresh past the first window focus */
export const QUERY_STALE_TIME = 30 * 60 * 1000; // 30 minutes

// ── Category colors from WeightliftingApp ────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  "Abs / Core": "#F44336",
  Back: "#3F51B5",
  Biceps: "#8E24AA",
  Cardio: "#E91E63",
  Chest: "#039BE5",
  Legs: "#DAC400",
  Olympic: "#009688",
  Shoulders: "#EF6C00",
  Triceps: "#4CAF50",
  Other: "#6885AB",
};

export function categoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? "#6885AB";
}

export function formatVolume(lbs: number) {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M lbs`;
  if (lbs >= 1_000) return `${(lbs / 1_000).toFixed(0)}K lbs`;
  return `${lbs.toLocaleString()} lbs`;
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatRelativeTime(date: Date | string) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}
