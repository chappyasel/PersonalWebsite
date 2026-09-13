/** The archived shelf uses average face depth, which puts an end cap's
 * inner wall over the plank that should hide it. Paint the two solid top
 * planes after the narrow fittings. Keep every projected corner, finish,
 * outline and exterior face from the approved drawing.
 *
 * These are the two top finishes in the frozen light/dark templates, not
 * sampled prop colors. Fail if that template contract changes.
 */
export function correctShelfFaceOrder(svg) {
  const shelf = svg.match(/<g data-part="shelf"[^>]*>([\s\S]*?)<\/g>/);
  if (!shelf) throw Error("Missing shelf owner");
  const faces = [...shelf[1].matchAll(/<polygon\b[^>]*\/>/g)].map((m) => m[0]);
  if (faces.join("") !== shelf[1])
    throw Error("Expected the archived shelf's polygon faces");
  const top = faces.filter((face) => /fill="#(?:bea17e|8d765e)"/.test(face));
  if (top.length !== 2) throw Error("Expected two solid plank top planes");
  const ordered = faces.filter((face) => !top.includes(face)).concat(top);
  return svg.replace(shelf[0], shelf[0].replace(shelf[1], ordered.join("")));
}
