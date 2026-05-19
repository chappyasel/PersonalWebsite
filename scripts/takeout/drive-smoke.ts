import { getDrive } from "./drive";

async function main() {
  const d = getDrive();
  const r = await d.files.list({
    pageSize: 5,
    fields: "files(name, mimeType, createdTime)",
    orderBy: "createdTime desc",
  });
  console.log("Drive auth OK. Last 5 files:");
  for (const f of r.data.files ?? []) {
    console.log(`  ${f.createdTime}  ${f.mimeType}  ${f.name}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
