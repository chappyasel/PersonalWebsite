import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { isSceneLayoutDraft } from "~/app/components/stacks/scene/sceneLayoutDraft";

export const runtime = "nodejs";

const draftPath = () =>
  path.join(process.cwd(), ".next", "stacks-layout-draft.json");

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new NextResponse(null, { status: 404 });

  const body: unknown = await request.json().catch(() => null);
  if (!isSceneLayoutDraft(body))
    return NextResponse.json({ saved: false }, { status: 400 });

  const destination = draftPath();
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  await rename(temporary, destination);

  return NextResponse.json({ saved: true });
}
