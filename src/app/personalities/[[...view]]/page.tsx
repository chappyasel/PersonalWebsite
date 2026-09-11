import { notFound } from "next/navigation";

import { views } from "~/lib/personalities/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view = [] } = await params;
  const pathname = `/personalities${view.length ? "/" + view.join("/") : ""}`;
  if (!views.some((v) => v.href === pathname)) notFound();
  return null;
}
