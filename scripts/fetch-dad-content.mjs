import crypto from "crypto";
import fs from "fs";
import { execSync } from "child_process";

const BUCKET = "chappy-dad-journal";
const OBJECT = "dad-content.tar.gz";
const OUT_DIR = "content/dad";
const TMP_FILE = "/tmp/dad-content.tar.gz";

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_only",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    { key: serviceAccount.private_key, padding: crypto.constants.RSA_PKCS1_PADDING },
  );
  const jwt = `${header}.${payload}.${signature.toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  const keyBase64 = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!keyBase64) throw new Error("GCS_SERVICE_ACCOUNT_KEY not set");

  console.log("Fetching dad content from GCS...");

  const serviceAccount = JSON.parse(Buffer.from(keyBase64, "base64").toString());
  const token = await getAccessToken(serviceAccount);

  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(OBJECT)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(TMP_FILE, buffer);
  console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  execSync(`tar -xzf ${TMP_FILE} -C ${OUT_DIR}/`);
  fs.unlinkSync(TMP_FILE);

  console.log("Dad content fetched successfully");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
