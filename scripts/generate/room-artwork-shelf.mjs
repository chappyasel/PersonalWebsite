/**
 * @typedef {{name:string, opening:string, start:number, end:number,
 *   parent:SvgElement|null, children:SvgElement[], attributes:Map<string,string>}} SvgElement
 */

/** Read element ranges so extraction never reserializes the approved geometry.
 * @param {string} svg
 */
function elements(svg) {
  /** @type {SvgElement[]} */
  const result = [];
  /** @type {SvgElement[]} */
  const stack = [];
  for (const match of svg.matchAll(
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[\w:-]+(?:[^"'<>]|"[^"]*"|'[^']*')*>/g,
  )) {
    const tag = match[0];
    if (tag.startsWith("<!") || tag.startsWith("<?")) continue;
    if (tag.startsWith("</")) {
      const node = stack.pop();
      if (!node || tag !== `</${node.name}>`)
        throw new Error("Unbalanced approved SVG");
      node.end = match.index + tag.length;
      continue;
    }
    const name = tag.match(/^<([\w:-]+)/)?.[1];
    if (!name) throw new Error("Missing SVG element name");
    /** @type {SvgElement} */
    const node = {
      name,
      opening: tag,
      start: match.index,
      end: match.index + tag.length,
      parent: stack.at(-1) ?? null,
      children: [],
      attributes: new Map(
        [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
          (attribute) => [
            attribute[1] ?? "",
            attribute[2] ?? attribute[3] ?? "",
          ],
        ),
      ),
    };
    node.parent?.children.push(node);
    result.push(node);
    if (!tag.endsWith("/>")) stack.push(node);
  }
  if (stack.length) throw new Error("Unclosed approved SVG");
  return result;
}

/** @param {string} markup */
function references(markup) {
  return [
    ...[...markup.matchAll(/url\(\s*["']?#([^\s"')]+)["']?\s*\)/g)].map(
      (match) => match[1] ?? "",
    ),
    ...[...markup.matchAll(/\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/g)].map(
      (match) => match[1] ?? "",
    ),
  ];
}

/** Extract the root shelf owner plus only its referenced root definitions.
 * @param {string} svg Self-contained approved drawing.
 */
export function extractShelfArtwork(svg) {
  const nodes = elements(svg);
  const root = nodes[0];
  if (
    !root ||
    root.name !== "svg" ||
    !root.attributes.has("viewBox") ||
    nodes.filter((node) => !node.parent).length !== 1
  )
    throw new Error("Shelf extraction requires an SVG viewBox");
  if (
    nodes.some((node) =>
      ["style", "script", "foreignObject"].includes(node.name),
    )
  )
    throw new Error("Shelf extraction requires static, inline-styled SVG");
  const shelves = root.children.filter(
    (node) => node.name === "g" && node.attributes.get("data-part") === "shelf",
  );
  const shelf = shelves[0];
  if (shelves.length !== 1 || !shelf)
    throw new Error("Expected one root shelf owner");
  /** @param {SvgElement} node */
  const markup = (node) => svg.slice(node.start, node.end);
  /** @type {Map<string, SvgElement>} */
  const ids = new Map();
  for (const node of nodes) {
    const id = node.attributes.get("id");
    if (!id) continue;
    if (ids.has(id)) throw new Error(`Duplicate SVG id: ${id}`);
    ids.set(id, node);
  }
  /** @type {Set<SvgElement>} */
  const included = new Set();
  const pending = references(root.opening + markup(shelf));
  for (const id of pending) {
    /** @type {SvgElement|undefined} */
    const referenced = ids.get(id);
    if (!referenced) throw new Error(`Missing shelf dependency: ${id}`);
    if (referenced.start >= shelf.start && referenced.end <= shelf.end)
      continue;
    let definition = referenced;
    while (definition.parent && definition.parent.name !== "defs")
      definition = definition.parent;
    if (definition.parent?.name !== "defs" || definition.parent.parent !== root)
      throw new Error(`Shelf dependency is outside root definitions: ${id}`);
    if (included.has(definition)) continue;
    included.add(definition);
    pending.push(...references(definition.parent.opening + markup(definition)));
  }
  const definitions = root.children
    .filter((node) => node.name === "defs")
    .map((node) => {
      const children = node.children.filter((child) => included.has(child));
      return children.length
        ? node.opening + children.map(markup).join("") + "</defs>"
        : "";
    })
    .join("");
  const content = definitions + markup(shelf);
  if (
    [...content.matchAll(/\bdata-part=["']([^"']+)["']/g)].some(
      (match) => match[1] !== "shelf",
    )
  )
    throw new Error("Shelf extraction included another owner");
  return root.opening + content + "</svg>\n";
}
