/**
 * What counts as proof that Google queued an export.
 *
 * Clicking "Create export" proves nothing: Google can silently drop the
 * submission behind a reauth gate and leave the button looking successful, and
 * the URL it lands on says only where the browser went. A zip in Drive proves
 * even less — Drive is delivery, the file can be any product's archive from any
 * attempt, and a fresh one may well be last week's finishing. The only
 * observation that names the queue is the /manage summary, where Google lists
 * each export it is building.
 *
 * Two predicates run in opposite directions here, and keeping them apart is the
 * whole point of this module:
 *
 *   - Suppression is generous. A row that might be a YouTube export — including
 *     one whose products Google did not print — is reason enough not to queue a
 *     second one. The cost of being wrong is a skipped week.
 *   - Confirmation is strict. Flipping a request to `queued` requires a row that
 *     says YouTube, carries an identity, and was not already there before the
 *     attempt started. The cost of being wrong is a week of silence while
 *     everyone believes an export is coming.
 */

/** One export row read off takeout.google.com/manage. */
export type ManageExportObservation = {
  /** Google's export id from the row's link, or null when the DOM hid it. */
  exportId: string | null;
  status: "in_progress" | "complete" | "unknown";
  /** Products the row names, lowercased. Empty when the row does not say. */
  products: string[];
  /** The row's own created-at text, kept verbatim for operator triage. */
  createdAtText: string | null;
};

export type QueueObservation = {
  source: "takeout_manage_queue";
  observedAt: string;
  exports: ManageExportObservation[];
};

/** Delivery, not the queue. Recorded for triage; never proof on its own. */
export type DriveObservation = {
  source: "drive_archive";
  observedAt: string;
  fileId: string;
  name: string;
  createdAt: string;
};

/**
 * The queue could not be read. This exists so that "we did not see the list"
 * can never be mistaken for "the list was empty" — an empty array of exports is
 * a finding, and only a parsed Takeout list is allowed to produce one.
 */
export type UnknownObservation = {
  source: "unknown";
  observedAt: string;
  reason: "unreadable" | "auth_gate" | "not_takeout" | "missing";
};

export type Observation = QueueObservation | DriveObservation | UnknownObservation;

/** The one shape allowed to flip a request to `queued`. */
export type QueueEvidence = {
  source: "takeout_manage_queue";
  exportId: string | null;
  createdAtText: string | null;
  observedAt: string;
};

export type QueueUnconfirmedReason =
  | "no_observation"
  | "not_a_queue_source"
  | "no_baseline"
  | "no_in_progress_export"
  | "product_mismatch"
  | "product_unknown"
  | "pre_existing_export"
  | "ambiguous_unidentified";

export type QueueVerdict =
  | { confirmed: true; evidence: QueueEvidence }
  | { confirmed: false; reason: QueueUnconfirmedReason };

export function manageQueueObservation(
  exports: ManageExportObservation[],
  observedAt: string,
): QueueObservation {
  return { source: "takeout_manage_queue", observedAt, exports };
}

export function driveArchiveObservation(
  file: { fileId: string; name: string; createdAt: string },
  observedAt: string,
): DriveObservation {
  return { source: "drive_archive", observedAt, ...file };
}

export function unknownObservation(
  reason: UnknownObservation["reason"],
  observedAt: string,
): UnknownObservation {
  return { source: "unknown", observedAt, reason };
}

/** Strict: the row has to say YouTube. Used for confirmation. */
function namesYouTube(card: ManageExportObservation): boolean {
  return (
    card.products.length > 0 &&
    card.products.some((product) => product.includes("youtube"))
  );
}

/** Generous: silence about products is not evidence of another product. */
function couldBeYouTube(card: ManageExportObservation): boolean {
  return card.products.length === 0 || namesYouTube(card);
}

/**
 * Rows that might be a YouTube export Google is still building. Used for the
 * pre-attempt baseline, and for deciding whether an old `queued` record still
 * corresponds to something real — age alone never settles that.
 */
export function pendingPossiblyYouTubeExports(
  exports: ManageExportObservation[],
): ManageExportObservation[] {
  return exports.filter(
    (card) => card.status === "in_progress" && couldBeYouTube(card),
  );
}

/**
 * The exports from an observation, but only when the observation is a parsed
 * Takeout queue. Anything else returns null, because a Drive listing, an auth
 * gate and an unreadable page all have zero rows without the queue being empty.
 */
export function trustedQueueExports(
  observation: Observation | null,
): ManageExportObservation[] | null {
  if (observation?.source !== "takeout_manage_queue") return null;
  return observation.exports;
}

function sameExport(
  a: ManageExportObservation,
  b: ManageExportObservation,
): boolean {
  if (a.exportId && b.exportId) return a.exportId === b.exportId;
  return false;
}

/**
 * Decide whether `observation` proves the attempt queued an export.
 *
 * `pendingBefore` is the snapshot taken before the attempt touched the form.
 * `null` means no snapshot exists, and then nothing can be confirmed at all: a
 * row's id distinguishes it from other rows, not from its own earlier self, so
 * without a baseline there is no way to say the row is this attempt's work.
 */
export function confirmQueueEvidence(input: {
  observation: Observation | null;
  pendingBefore: ManageExportObservation[] | null;
}): QueueVerdict {
  const { observation, pendingBefore } = input;
  if (!observation) return { confirmed: false, reason: "no_observation" };
  if (observation.source !== "takeout_manage_queue") {
    return { confirmed: false, reason: "not_a_queue_source" };
  }
  if (pendingBefore === null) return { confirmed: false, reason: "no_baseline" };

  const building = observation.exports.filter(
    (card) => card.status === "in_progress",
  );
  if (building.length === 0) {
    return { confirmed: false, reason: "no_in_progress_export" };
  }

  const ours = building.filter(namesYouTube);
  if (ours.length === 0) {
    // Distinguish "this is someone else's export" from "Google did not say",
    // because only the second one is worth looking at again later.
    return building.some((card) => card.products.length === 0)
      ? { confirmed: false, reason: "product_unknown" }
      : { confirmed: false, reason: "product_mismatch" };
  }

  const beforeBuilding = pendingBefore.filter(
    (card) => card.status === "in_progress",
  );
  const fresh = ours.filter(
    (card) => !beforeBuilding.some((earlier) => sameExport(card, earlier)),
  );
  if (fresh.length === 0) {
    return { confirmed: false, reason: "pre_existing_export" };
  }

  const identified = fresh.find((card) => card.exportId);
  if (identified) {
    return { confirmed: true, evidence: evidenceFrom(identified, observation) };
  }

  // Every candidate is unidentified. It can only be this attempt's export if
  // the baseline was empty of anything that could have been it.
  if (pendingPossiblyYouTubeExports(pendingBefore).length > 0) {
    return { confirmed: false, reason: "ambiguous_unidentified" };
  }
  return { confirmed: true, evidence: evidenceFrom(fresh[0]!, observation) };
}

function evidenceFrom(
  card: ManageExportObservation,
  observation: QueueObservation,
): QueueEvidence {
  return {
    source: "takeout_manage_queue",
    exportId: card.exportId,
    createdAtText: card.createdAtText,
    observedAt: observation.observedAt,
  };
}
