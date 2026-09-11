export const views = [
  { id: "A", name: "One curve", href: "/personalities" },
  { id: "B", name: "All five traits", href: "/personalities/all-traits" },
  { id: "C", name: "Comparison matrix", href: "/personalities/matrix" },
  { id: "D", name: "Overall distance", href: "/personalities/distance" },
  { id: "E", name: "Closest people", href: "/personalities/closest" },
  { id: "history", name: "People & history", href: "/personalities/history" },
] as const;

export function viewForPath(pathname: string, legacyVariant?: string | null) {
  const path = pathname.replace(/\/$/, "");
  if (path === "/personalities" && legacyVariant) {
    return views.find((v) => v.id === legacyVariant) ?? views[0];
  }
  return views.find((v) => v.href === path) ?? views[0];
}
