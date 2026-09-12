export const views = [
  { id: "A", name: "All traits", href: "/personalities", group: "main" },
  {
    id: "compare",
    name: "Compare",
    href: "/personalities/compare",
    group: "main",
  },
  {
    id: "E",
    name: "Closest to…",
    href: "/personalities/closest",
    group: "main",
  },
  {
    id: "changes",
    name: "Changes",
    href: "/personalities/changes",
    group: "main",
  },
  {
    id: "history",
    name: "People & history",
    href: "/personalities/history",
    group: "main",
  },
  { id: "C", name: "Matrix", href: "/personalities/matrix", group: "advanced" },
  {
    id: "D",
    name: "Distance",
    href: "/personalities/distance",
    group: "advanced",
  },
  {
    id: "pca",
    name: "PCA & clusters",
    href: "/personalities/pca",
    group: "advanced",
  },
] as const;

export const mainViews = views.filter((view) => view.group === "main");
export const advancedViews = views.filter((view) => view.group === "advanced");

export function viewForPath(pathname: string, legacyVariant?: string | null) {
  const path = pathname.replace(/\/$/, "");
  if (path === "/personalities/all-traits") return views[0];
  if (path === "/personalities" && legacyVariant) {
    return views.find((v) => v.id === legacyVariant) ?? views[0];
  }
  return views.find((v) => v.href === path) ?? views[0];
}
