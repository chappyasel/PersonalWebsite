// Where each Daybreak Booking link lives on the site. Plain JavaScript, since
// next.config.js reads it for its rewrites and redirects.
//
// /meet, /meet/15, and /meet/60 are the main calendar's links, `meet`, `15`,
// and `60`. Each other calendar has its own address, /aic and /personal,
// with the same lengths under it: /aic is Daybreak's `aic` link and /aic/15
// its `aic-15`. They are served by /meet/[slug] through a rewrite, and the
// old /meet/aic-style addresses redirect to them.

/** The calendars with their own address, as Daybreak slugs begin. */
export const MEET_GROUPS = /** @type {const} */ (["aic", "personal"]);

/** The lengths under each address besides its own 30 minutes. */
export const MEET_LENGTHS = /** @type {const} */ (["15", "60"]);

/**
 * The site path of a Booking link's page: `meet` is /meet, `aic` is /aic,
 * `aic-15` is /aic/15, and any other slug is /meet/<slug>.
 *
 * @param {string} slug
 * @returns {string}
 */
export function meetPath(slug) {
  if (slug === "meet") return "/meet";
  for (const group of MEET_GROUPS) {
    if (slug === group) return `/${group}`;
    for (const length of MEET_LENGTHS) {
      if (slug === `${group}-${length}`) return `/${group}/${length}`;
    }
  }
  return `/meet/${slug}`;
}

/** Each group's addresses, as /meet/[slug] serves them. */
function groupPaths() {
  return MEET_GROUPS.flatMap((group) => [
    { path: `/${group}`, slug: group },
    ...MEET_LENGTHS.map((length) => ({
      path: `/${group}/${length}`,
      slug: `${group}-${length}`,
    })),
  ]);
}

/** next.config.js rewrites: /aic/15 shows /meet/aic-15. */
export function meetRewrites() {
  return groupPaths().map(({ path, slug }) => ({
    source: path,
    destination: `/meet/${slug}`,
  }));
}

/**
 * next.config.js redirects: the old /meet/aic-15-style addresses go to
 * their own, and /meet/cr, the main calendar's old link, to /meet. A
 * redirect matches only the address asked for, never a rewrite's, so these
 * don't loop with `meetRewrites`.
 */
export function meetRedirects() {
  return [
    ...groupPaths().map(({ path, slug }) => ({
      source: `/meet/${slug}`,
      destination: path,
      permanent: false,
    })),
    { source: "/meet/cr", destination: "/meet", permanent: false },
  ];
}
