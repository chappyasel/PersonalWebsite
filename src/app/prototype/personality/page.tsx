import { notFound, redirect } from "next/navigation";

import { views } from "~/lib/personalities/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { variant } = await searchParams;
  redirect(views.find((v) => v.id === variant)?.href ?? "/personalities");
}
