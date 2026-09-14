/** @param {{ Records?: Array<{eventSource?: string, eventName?: string, s3?: {bucket?: {name?: string}, object?: {key?: string}}}> }} event */
exports.handler = async (event) => {
  const matching = event.Records?.some((record) => {
    const key = record.s3?.object?.key;
    return (
      record.eventSource === "aws:s3" &&
      record.eventName?.startsWith("ObjectCreated:") &&
      record.s3?.bucket?.name === process.env.WORKOUT_BUCKET &&
      typeof key === "string" &&
      decodeURIComponent(key.replace(/\+/g, " ")) === process.env.WORKOUT_KEY
    );
  });
  if (!matching) return { ignored: true };
  const endpoint = process.env.SYNC_ENDPOINT;
  const secret = process.env.SYNC_SECRET;
  if (!endpoint || !secret)
    throw new Error("Workout sync configuration missing");

  // Never log the event, credentials, or upstream response body.
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${secret}`,
        "x-workout-sync-source": "s3",
      },
      signal: AbortSignal.timeout(195_000),
    });
  } catch {
    throw new Error("Workout sync request failed or timed out");
  }
  if (!response.ok)
    throw new Error(`Workout sync returned HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Workout sync returned invalid JSON");
  }
  if (body.success !== true)
    throw new Error("Workout sync did not report success");
  console.log(
    JSON.stringify({ synced: true, skipped: body.result?.skipped === true }),
  );
  return { synced: true, skipped: body.result?.skipped === true };
};
