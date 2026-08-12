// Homepage 3D scene floating-prop detector — finds every prop whose base does not sit
// on the thing it is supposed to be sitting on, with no GPU and no browser.
//
//   node scripts/stacks-floaters.mjs                 # ranked table, worst first
//   node scripts/stacks-floaters.mjs --all           # + everything that PASSED
//   node scripts/stacks-floaters.mjs --filtered      # + what was filtered, and why
//   node scripts/stacks-floaters.mjs --unresolved    # + placements the walker
//                                                    #   could not pin down
//   node scripts/stacks-floaters.mjs --verbose       # + transform chain and
//                                                    #   contact-set detail
//   node scripts/stacks-floaters.mjs --selftest      # prove the four rules
//                                                    #   below are still live
//   node scripts/stacks-floaters.mjs --check         # exit 1 if anything is
//                                                    #   flagged (for CI)
//   node scripts/stacks-floaters.mjs --tol 0.004     # flag threshold, world units
//   node scripts/stacks-floaters.mjs --no-crosscheck # skip the stacks-render pass
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// A prop floating above its shelf, or sunk into it, is the most-reported bug in
// this scene and it has recurred every round. The cause is always the same: a
// placement `y` was tuned by eye against a bounding box whose origin is not the
// object's base. The pothos is the canonical one — the model pipeline seats
// every prop bottom-at-origin, and that prop's lowest vertex is a trailing VINE
// TIP, so y=0 stood the vine on the wood and carried the pot 0.109 into the air.
// Nothing in the source looked wrong. Only geometry can tell you.
//
// ---------------------------------------------------------------------------
// HOW IT WORKS — three passes.
//
// 1. PLACEMENT. The seven unit files are parsed with the TypeScript compiler and
//    the JSX is INTERPRETED: every `<group>`, and every component that is really
//    a transform in a costume (Lift, PropLink, HoverProp, PhotoMount, Grabbable,
//    ShelfUnit, EggLamp, Sway, SpinProp, …) is inlined from its own definition
//    rather than described here. That matters more than it sounds: a table of
//    "what ShelfUnit does to its children" in this file would be a second copy
//    of a convention that has already moved twice. Inlining means this script
//    cannot drift from the scene — if `SHELF.top` changes, this reads the new
//    number, because it reads the same `<group position={[0, SHELF.top, 0]}>`
//    the renderer does.
//    A component the walker cannot find a definition for degrades to a
//    pass-through (identity transform) and is reported under --unresolved, so a
//    silently-dropped prop is impossible.
//
// 2. GEOMETRY. Each placement is reduced to a world-space contact height.
//    - GLB props: the .glb is loaded, its triangles are pushed through the
//      accumulated matrix, and the CONTACT PLANE is found in world space by the
//      connected-island rule (see the note below).
//    - Primitives: box/cylinder/sphere/plane/circle/torus half-extents are
//      rotated by the accumulated basis, which is exact for a box and
//      conservative for the rest.
//    Heights that still carry an unknown are NOT abandoned. Placement formulas
//    are linear in their unknowns, so the unknowns are carried as symbols and
//    cancelled: a packed-row spine drawn `item.h` tall at `item.h / 2` proves
//    out at exactly zero without the walker ever running packRow. What refuses
//    to cancel becomes an interval (symbols are lengths on a 3.2-unit plank, so
//    they lie in [0, 1]), and a verdict is only issued when the whole interval
//    agrees. Anything else is printed as indeterminate rather than guessed.
//
// 3. SUPPORT. What each prop is meant to rest on is resolved structurally, never
//    by proximity: a leaf that descended through `ShelfUnit`'s children slot
//    belongs to the top plank, one that descended through `lower` belongs to the
//    lower plank, and one that never entered a ShelfUnit is on the ground. Both
//    plank heights and the ground height are read out of the source. On top of
//    that, a prop whose base sits ON another prop's top face is supported by
//    that prop, and one whose base sits INSIDE another prop's volume is MOUNTED
//    on it (pinned photo, wall board, soil disc) and is deliberately off-plane —
//    filtered by that structural relation, never by name.
//
// ---------------------------------------------------------------------------
// CONTACT PLANE — the part that is easy to get wrong.
// The naive test is "does the lowest vertex touch the support", and it is wrong
// in both directions. A pothos's lowest vertex is a vine tip hanging in free
// air; a chair's four legs are four SEPARATE connected islands, so a per-island
// rule rejects every leg on its own. So: weld coincident positions, union-find
// the triangles into islands, and take as candidate planes the heights at which
// islands BOTTOM OUT. Islands that bottom out together are hulled TOGETHER —
// that is what gets the chair right.
// And a real contact can enclose ZERO area: a barbell rests on two plates and
// headphones on two earcups, hulls that are a line. An area-only rule wanted to
// lift the barbell 0.27 into the air. Hence two tests, either of which passes.
// Thresholds are calibrated on props whose answer was known independently and
// are copied verbatim from scripts/stacks-render.mjs — that script is the
// reference implementation, this is its world-space twin, and the --crosscheck
// pass (on by default) runs it as a subprocess and asserts the two agree on
// every prop placed without an X/Z tilt. If you change a threshold here, change
// it there, and re-check barbell + headphones (must read SITS ON 0) against
// pothos (must read OVERHANG).
//
// ---------------------------------------------------------------------------
// KNOWN LIMITS, so nobody has to rediscover them.
// - A `<mesh geometry={someHelper()}>` cannot be measured, so it is recorded as
//   OPAQUE and everything written beside it in the same group is reported as
//   part of it rather than as a floating prop. That is why the bumper plates'
//   steel hub rings are not in the table.
// - "Rests on another prop" and "is mounted inside another prop" are decided
//   from world bounding boxes. Two props leaning past each other at the same
//   spot on a plank can be mis-assigned; the gap printed is then measured from
//   the wrong surface, never invented. Both of the current mis-assignments are
//   prints leaning beside something rather than on it.
// - A dynamic `.map` is walked once with its index pinned to 0 — the instance
//   that touches the shelf. Higher members of a stack are not checked.
//
// ---------------------------------------------------------------------------
// SCALE — the room has TWO legitimate conversions and this does not average
// them: shelf props ~2.00 world units per metre, furniture ~0.96 (ground to top
// plank is 1.115 units). Centimetres in the table are quoted at 2.00 u/m, the
// house scale, so 0.02 world = 1 cm. On a floor prop that reads about 2× harsh,
// which is the safe direction for a gap report.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// three-stdlib's GLTFLoader expects a DOM (same stubs as stacks-render.mjs).
globalThis.Image = class { constructor() { setTimeout(() => this.onload && this.onload(), 0); } set src(v) {} addEventListener(t, f) { if (t === "load") setTimeout(f, 0); } removeEventListener() {} };
globalThis.document = { createElementNS: () => ({ getContext: () => ({}), style: {} }), createElement: () => ({ getContext: () => ({}), style: {} }) };
globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => "blob:stub";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const STACKS = path.join(SRC, "app", "components", "stacks");
const UNITS = path.join(STACKS, "scene", "units");
const MODELS = path.join(ROOT, "public", "models");
const UNITS_PER_METRE = 2.0;
/** Upper bound assumed for any symbol left in a contact height. Every one of
 * them is a LENGTH of an object standing on a 3.2-unit-wide plank, so 1.0 world
 * unit is generous by a factor of several and the interval it produces is
 * conservative in the only direction that matters. */
const SYMBOL_BOUND = 1.0;

const [ts, THREE, { GLTFLoader, MeshoptDecoder }] = await Promise.all([
  import("typescript").then((m) => m.default ?? m),
  import("three"),
  import("three-stdlib"),
]);

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const OPT = {
  all: argv.includes("--all"),
  filtered: argv.includes("--filtered"),
  unresolved: argv.includes("--unresolved"),
  verbose: argv.includes("--verbose"),
  selftest: argv.includes("--selftest"),
  check: argv.includes("--check"),
  crosscheck: !argv.includes("--no-crosscheck"),
  // 4 mm world = 2 mm real at the house scale. Below that a gap is inside the
  // bevel radius the RoundedBox props already carry and nobody can see it.
  tol: Number(flag("--tol", 0.004)),
};

// ===========================================================================
// Linear expressions: c + Σ k·symbol.
//
// Half the placement arithmetic in this scene is written against values the
// walker cannot see — `item.h` comes out of packRow at runtime. It does not
// have to see them. A spine is positioned at `item.h / 2` and drawn `item.h`
// tall, so its base is `0.5·h − 0.5·h`, and that is ZERO for every h there has
// ever been. Carrying unknowns as symbols and cancelling them is what turns
// "cannot evaluate" into a proof.
// ===========================================================================
const K = (c) => ({ c, t: new Map() });
const SYMBOL = (name) => ({ c: 0, t: new Map([[name, 1]]) });
const ZERO = K(0);
const isConst = (l) => l && l.t.size === 0;
const linAdd = (a, b) => {
  const t = new Map(a.t);
  for (const [k, v] of b.t) {
    const n = (t.get(k) ?? 0) + v;
    if (Math.abs(n) < 1e-12) t.delete(k);
    else t.set(k, n);
  }
  return { c: a.c + b.c, t };
};
const linScale = (a, s) => {
  if (s === 0) return K(0);
  const t = new Map();
  for (const [k, v] of a.t) t.set(k, v * s);
  return { c: a.c * s, t };
};
const linSub = (a, b) => linAdd(a, linScale(b, -1));
const linText = (l) => {
  const parts = [];
  if (l.c !== 0 || l.t.size === 0) parts.push(l.c.toFixed(4));
  for (const [k, v] of l.t) parts.push(`${v >= 0 && parts.length ? "+" : ""}${v.toFixed(3)}·${k}`);
  return parts.join(" ");
};

// ===========================================================================
// Values the interpreter passes around.
// ===========================================================================
const NUM = (lin) => ({ k: "num", lin });
const UNK = (why) => ({ k: "unknown", why });
const asLin = (v) => (v && v.k === "num" ? v.lin : null);

/** theme.ts's `rand` — a pure sine hash, so the walker can evaluate the scene's
 * deterministic jitter EXACTLY rather than bounding it. FrameRow's per-frame
 * roll and the spine wobble both feed contact heights; without this they would
 * all read "unresolved". Must stay identical to src/app/components/stacks/theme.ts. */
function rand(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ===========================================================================
// Module graph. Files are parsed once and indexed by top-level declaration so a
// component can be inlined from wherever it actually lives.
// ===========================================================================
const modules = new Map();

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("~/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // node_modules — handled by the builtin tables
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return fs.existsSync(base) ? base : null;
}

function loadModule(file) {
  const hit = modules.get(file);
  if (hit) return hit;
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const mod = { file, source, decls: new Map(), imports: new Map() };
  modules.set(file, mod);

  for (const stmt of source.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const spec = stmt.moduleSpecifier.text;
      const target = resolveImport(file, spec);
      const { name, namedBindings } = stmt.importClause;
      if (name) mod.imports.set(name.text, { file: target, exported: "default", spec });
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const el of namedBindings.elements) {
          mod.imports.set(el.name.text, {
            file: target,
            exported: (el.propertyName ?? el.name).text,
            spec,
          });
        }
      }
      continue;
    }
    const node = ts.isExportDeclaration(stmt) ? null : stmt;
    if (!node) continue;
    if (ts.isFunctionDeclaration(node) && node.name) {
      mod.decls.set(node.name.text, node);
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        mod.decls.set("default", node);
      }
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) mod.decls.set(d.name.text, d);
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      mod.decls.set(node.name.text, node);
    }
  }
  return mod;
}

/** A name, in the module it was written in — following imports. */
function lookupDecl(mod, name) {
  const local = mod.decls.get(name);
  if (local) return { mod, node: local };
  const imp = mod.imports.get(name);
  if (!imp || !imp.file) return null;
  const target = loadModule(imp.file);
  const node = target.decls.get(imp.exported);
  return node ? { mod: target, node } : null;
}

// ===========================================================================
// Expression evaluation.
// `env` is a Map name → value, where a value may be a thunk carrying its own
// env (a JSX attribute is evaluated in the CALLER's scope, not the callee's).
// ===========================================================================
function evalNode(node, ctx) {
  if (!node) return UNK("missing");
  const { env, mod } = ctx;

  if (ts.isParenthesizedExpression(node)) return evalNode(node.expression, ctx);
  if (ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node)) {
    return evalNode(node.expression, ctx);
  }
  if (ts.isNumericLiteral(node)) return NUM(K(Number(node.text)));
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { k: "str", v: node.text };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { k: "bool", v: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { k: "bool", v: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { k: "null" };
  if (ts.isIdentifier(node) && node.text === "undefined") return { k: "undef" };

  if (ts.isPrefixUnaryExpression(node)) {
    const v = evalNode(node.operand, ctx);
    const l = asLin(v);
    if (node.operator === ts.SyntaxKind.MinusToken && l) return NUM(linScale(l, -1));
    if (node.operator === ts.SyntaxKind.PlusToken && l) return NUM(l);
    if (node.operator === ts.SyntaxKind.ExclamationToken && v.k === "bool") {
      return { k: "bool", v: !v.v };
    }
    return UNK("unary");
  }

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    const a = evalNode(node.left, ctx);
    const b = evalNode(node.right, ctx);
    const la = asLin(a);
    const lb = asLin(b);
    if (la && lb) {
      if (op === ts.SyntaxKind.PlusToken) return NUM(linAdd(la, lb));
      if (op === ts.SyntaxKind.MinusToken) return NUM(linSub(la, lb));
      // A product or quotient stays linear only while one side is a constant —
      // which every placement formula in this scene happens to satisfy.
      if (op === ts.SyntaxKind.AsteriskToken) {
        if (isConst(lb)) return NUM(linScale(la, lb.c));
        if (isConst(la)) return NUM(linScale(lb, la.c));
        return UNK("nonlinear product");
      }
      if (op === ts.SyntaxKind.SlashToken) {
        if (isConst(lb) && lb.c !== 0) return NUM(linScale(la, 1 / lb.c));
        return UNK("nonlinear quotient");
      }
      if (isConst(la) && isConst(lb)) {
        if (op === ts.SyntaxKind.LessThanToken) return { k: "bool", v: la.c < lb.c };
        if (op === ts.SyntaxKind.GreaterThanToken) return { k: "bool", v: la.c > lb.c };
      }
    }
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      const eq = sameValue(a, b);
      if (eq === null) return UNK("comparison");
      return { k: "bool", v: op === ts.SyntaxKind.EqualsEqualsEqualsToken ? eq : !eq };
    }
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      return a.k === "undef" || a.k === "null" ? b : a;
    }
    return UNK("binary");
  }

  if (ts.isConditionalExpression(node)) {
    const test = evalNode(node.condition, ctx);
    if (test.k === "bool") return evalNode(test.v ? node.whenTrue : node.whenFalse, ctx);
    // Unresolved test: take the consequent and say so. In this scene the
    // undecidable ones are all `dark ? colorA : colorB`, which no contact
    // height depends on — but a branch that DID matter would show up as a
    // divergence between the two sides, so flag it rather than hide it.
    ctx.notes.add("branch assumed (unresolved ternary)");
    return evalNode(node.whenTrue, ctx);
  }

  if (ts.isArrayLiteralExpression(node)) {
    return { k: "arr", items: node.elements.map((e) => evalNode(e, ctx)) };
  }

  if (ts.isObjectLiteralExpression(node)) {
    const props = new Map();
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        props.set(p.name.text, evalNode(p.initializer, ctx));
      } else if (ts.isShorthandPropertyAssignment(p)) {
        props.set(p.name.text, evalNode(p.name, ctx));
      } else if (ts.isSpreadAssignment(p)) {
        const src = evalNode(p.expression, ctx);
        if (src.k === "obj") for (const [k2, v2] of src.props) props.set(k2, v2);
      }
    }
    return { k: "obj", props };
  }

  if (ts.isIdentifier(node)) {
    const bound = env.get(node.text);
    if (bound) return forceValue(bound);
    const decl = lookupDecl(mod, node.text);
    if (decl && ts.isVariableDeclaration(decl.node) && decl.node.initializer) {
      return evalNode(decl.node.initializer, { ...ctx, mod: decl.mod, env: new Map() });
    }
    return SYMBOLIC(node.text);
  }

  if (ts.isPropertyAccessExpression(node)) {
    const objText = node.expression.getText();
    if (objText === "Math") {
      if (node.name.text === "PI") return NUM(K(Math.PI));
      return UNK("Math member");
    }
    const obj = evalNode(node.expression, ctx);
    if (obj.k === "obj") {
      const v = obj.props.get(node.name.text);
      return v ? forceValue(v) : { k: "undef" };
    }
    if (obj.k === "arr" && node.name.text === "length") return NUM(K(obj.items.length));
    // Anything else — `frames.length` on a memo the walker cannot run — becomes
    // a symbol rather than a hole. A hole here reads as "no value", and the
    // transform code would then silently skip the attribute holding it, which
    // is how a whole FrameRow lost its 0.2445 of contact height.
    return SYMBOLIC(`${objText}.${node.name.text}`);
  }

  if (ts.isElementAccessExpression(node)) {
    const obj = evalNode(node.expression, ctx);
    const idx = asLin(evalNode(node.argumentExpression, ctx));
    if (obj.k === "arr" && idx && isConst(idx)) return obj.items[idx.c] ?? { k: "undef" };
    return SYMBOLIC(`${node.getText()}`);
  }

  if (ts.isCallExpression(node)) return evalCall(node, ctx);

  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return { k: "jsx", node, env, mod };
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { k: "fn", node, env, mod };
  }

  return UNK(ts.SyntaxKind[node.kind]);
}

const SYMBOLIC = (name) => NUM(SYMBOL(name));

function sameValue(a, b) {
  if (a.k === "undef" || b.k === "undef") return (a.k === "undef") === (b.k === "undef");
  if (a.k === "str" && b.k === "str") return a.v === b.v;
  const la = asLin(a);
  const lb = asLin(b);
  if (la && lb && isConst(la) && isConst(lb)) return la.c === lb.c;
  return null;
}

function forceValue(v) {
  if (v && v.k === "thunk") {
    if (!("cached" in v)) v.cached = evalNode(v.node, v.ctx);
    return v.cached;
  }
  return v;
}

function evalCall(node, ctx) {
  const callee = node.expression;
  const calleeText = callee.getText();

  if (ts.isPropertyAccessExpression(callee) && callee.expression.getText() === "Math") {
    const args = node.arguments.map((a) => asLin(evalNode(a, ctx)));
    if (args.some((a) => !a || !isConst(a))) return UNK("Math of symbol");
    const n = args.map((a) => a.c);
    const fn = { cos: Math.cos, sin: Math.sin, abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, round: Math.round, max: Math.max, min: Math.min, tan: Math.tan, hypot: Math.hypot }[callee.name.text];
    return fn ? NUM(K(fn(...n))) : UNK("Math fn");
  }

  // theme.ts's deterministic jitter, evaluated for real.
  if (calleeText === "rand") {
    const args = node.arguments.map((a) => asLin(evalNode(a, ctx)));
    if (args.length === 2 && args.every((a) => a && isConst(a))) {
      return NUM(K(rand(args[0].c, args[1].c)));
    }
    return SYMBOLIC("rand()");
  }

  // `.map` over an array. Literal arrays are unrolled; a dynamic array
  // (`items.map`, where items came out of packRow) is walked ONCE with its
  // element left symbolic and its index pinned to 0 — the index is a loop
  // counter and 0 is the instance that touches the shelf, which is the one
  // this tool is about. Cancellation does the rest: a spine drawn `item.h`
  // tall at `item.h / 2` proves out at exactly 0 without ever knowing h.
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "map") {
    const src = evalNode(callee.expression, ctx);
    const fn = evalNode(node.arguments[0], ctx);
    if (fn.k !== "fn") return UNK("map callback");
    const out = [];
    const run = (elem, index) => {
      const env = new Map(fn.env);
      const defaults = { ...ctx, mod: fn.mod, env };
      bindParam(fn.node.parameters[0], elem, env, ctx, defaults);
      if (fn.node.parameters[1]) bindParam(fn.node.parameters[1], NUM(K(index)), env, ctx, defaults);
      const body = fn.node.body;
      const inner = { ...ctx, env, mod: fn.mod };
      if (ts.isBlock(body)) {
        hoistBlock(body, inner);
        const ret = lastReturn(body);
        return ret ? evalNode(ret.expression, inner) : UNK("map body");
      }
      return evalNode(body, inner);
    };
    if (src.k === "arr") {
      src.items.forEach((item, i) => out.push(run(item, i)));
    } else {
      ctx.notes.add(`dynamic .map over ${callee.expression.getText()} — index pinned to 0`);
      out.push(run(SYMBOLIC(`${callee.expression.getText()}[0]`), 0));
    }
    return { k: "arr", items: out };
  }

  // `createElement(Type, props, ...children)`. Not every wrapper in the scene
  // is written as JSX — InteractionClaim is a context provider built by hand —
  // and a walker that stops at a CallExpression here loses EVERY prop below it.
  // That is not hypothetical: this one sat between Lift and its children, and
  // until it was handled the six props wrapped in PropLink, every photograph
  // and every book in every packed row went missing without a word. Hence the
  // loud reporting at the end of `walk`.
  if (calleeText === "createElement" || calleeText === "React.createElement") {
    passthroughs.set(`createElement(${node.arguments[0]?.getText() ?? "?"})`, (passthroughs.get(`createElement(${node.arguments[0]?.getText() ?? "?"})`) ?? 0) + 1);
    return { k: "arr", items: node.arguments.slice(2).map((a) => evalNode(a, ctx)) };
  }

  // A plain helper that returns one expression — `deskFrameHeight(0.22)`.
  // Inlining is tried FIRST because it is exact and free, but it only counts
  // when it lands on a real value: `polaroidSeat` inlines into a matrix read
  // this evaluator has no business attempting, and a half-evaluated answer
  // ("unknown") must fall through to the subprocess below rather than be
  // returned as if it were the truth.
  const decl = ts.isIdentifier(callee) ? lookupDecl(ctx.mod, callee.text) : null;
  let inlined = null;
  if (decl) {
    const fnNode = ts.isVariableDeclaration(decl.node) ? decl.node.initializer : decl.node;
    if (fnNode && (ts.isArrowFunction(fnNode) || ts.isFunctionDeclaration(fnNode) || ts.isFunctionExpression(fnNode))) {
      const env = new Map();
      const defaults = { ...ctx, mod: decl.mod, env: new Map() };
      fnNode.parameters.forEach((p, i) => bindParam(p, node.arguments[i] ? evalNode(node.arguments[i], ctx) : undefined, env, ctx, defaults));
      const inner = { ...ctx, env, mod: decl.mod };
      const body = fnNode.body;
      if (body && ts.isBlock(body)) {
        hoistBlock(body, inner);
        const ret = lastReturn(body);
        if (ret) inlined = evalNode(ret.expression, inner);
      } else if (body) {
        inlined = evalNode(body, inner);
      }
    }
  }
  if (inlined) {
    const l = asLin(inlined);
    if (l ? isConst(l) : inlined.k !== "unknown") return inlined;
  }

  // A call this walker cannot do the arithmetic for, but which the PROJECT can.
  // The scene now derives placement numbers instead of writing them down —
  // `position={[x, polaroidSeat(TILT_BEACH), z]}` — which is exactly what was
  // asked for and exactly what a static reader cannot follow: the helper builds
  // a rotation matrix and reads its y row. Guessing would be worse than
  // useless here, and hardcoding the helper's name would rot on the first
  // rename. So: if the callee is a real exported function in a project module
  // and every argument reduces to plain numbers, defer it, run the real thing
  // once through `tsx`, and walk again with the answers in hand. See
  // `runDeferredHelpers`.
  if (decl && decl.mod.file.startsWith(SRC)) {
    const args = node.arguments.map((a) => plainValue(evalNode(a, ctx)));
    if (args.every((a) => a !== undefined)) {
      const importPath = "~/" + path.relative(SRC, decl.mod.file).replace(/\.(tsx?|mts)$/, "").split(path.sep).join("/");
      const key = `${importPath}|${callee.text}|${JSON.stringify(args)}`;
      if (helperValues.has(key)) return NUM(K(helperValues.get(key)));
      helperWanted.set(key, { importPath, fn: callee.text, args });
      return SYMBOLIC(key);
    }
  }
  return SYMBOLIC(`${calleeText}()`);
}

/** A value as plain JSON, or undefined if it still carries an unknown. */
function plainValue(v) {
  if (!v) return undefined;
  const l = asLin(v);
  if (l) return isConst(l) ? l.c : undefined;
  if (v.k === "str") return v.v;
  if (v.k === "bool") return v.v;
  if (v.k === "arr") {
    const out = v.items.map(plainValue);
    return out.every((x) => x !== undefined) ? out : undefined;
  }
  return undefined;
}

/** Bind one parameter, honouring destructuring patterns and their defaults —
 * every component in this scene destructures its props in the signature, and
 * the defaults there (`lift = PHOTO_LIFT`, `scale = 1.49`) are load-bearing.
 *
 * A passed value and a DEFAULT value are written in different files and must be
 * evaluated in different scopes: `<Polaroid size={x} />` names an `x` in the
 * caller, while `size = POLAROID_SIZE` names a const in the component's own
 * module. Evaluating a default against the caller's scope resolves it to a
 * symbol — the same "right number, wrong frame" mistake this whole tool exists
 * to catch. It cost ten Polaroids the moment `0.176` was hoisted into a named
 * export. */
function bindParam(param, value, env, ctx, defaultCtx = ctx) {
  if (!param) return;
  if (ts.isIdentifier(param.name)) {
    let v = value;
    if ((!v || v.k === "undef") && param.initializer) {
      v = { k: "thunk", node: param.initializer, ctx: defaultCtx };
    }
    env.set(param.name.text, v ?? { k: "undef" });
    return;
  }
  if (ts.isObjectBindingPattern(param.name)) {
    const src = value && value.k === "obj" ? value.props : new Map();
    for (const el of param.name.elements) {
      if (!ts.isIdentifier(el.name)) continue;
      const key = (el.propertyName ?? el.name).getText().replace(/^["']|["']$/g, "");
      let v = src.get(key);
      v = v ? forceValue(v) : undefined;
      if ((!v || v.k === "undef") && el.initializer) {
        v = { k: "thunk", node: el.initializer, ctx: defaultCtx };
      }
      env.set(el.name.text, v ?? { k: "undef" });
    }
  }
}

/** Pull `const` declarations out of a function body into scope, so a component
 * that builds its pose in a local (`const pose = { base: position, … }`) and
 * then spreads it is followed correctly. */
function hoistBlock(block, ctx) {
  for (const stmt of block.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) {
        ctx.env.set(d.name.text, { k: "thunk", node: d.initializer, ctx });
      }
    }
  }
}

/** The LAST return in a body. Components here guard with an early return for
 * the un-linked case and fall through to the wrapped one; the wrapped one is
 * the superset, and taking it is what keeps `base` in the transform chain. */
function lastReturn(block) {
  let found = null;
  const visit = (n) => {
    if (ts.isReturnStatement(n) && n.expression) found = n;
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(block, visit);
  return found;
}

// ===========================================================================
// Transform frames. Only the vertical axis has to be symbolic, but x and z are
// carried the same way so a prop's world footprint is available for the
// "supported by another prop" test.
// ===========================================================================
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function eulerMatrix(rx, ry, rz) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  const e = m.elements; // column-major
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}
function matMul(a, b) {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += a[r * 3 + k] * b[k * 3 + c];
    o[r * 3 + c] = s;
  }
  return o;
}

const newFrame = () => ({
  p: [ZERO, ZERO, ZERO],
  R: IDENTITY,
  s: 1,
  slot: null,        // "top" | "lower" | null — which ShelfUnit surface
  inShelfUnit: false,
  chain: [],
  key: 0,
  bad: [],           // attributes the walker could not read — see readRot
});
let frameSeq = 0;

/** A position attribute as three Lins. An attribute that is PRESENT but
 * unreadable becomes three fresh symbols, never null: null means "no
 * attribute", and conflating the two silently discards a real offset. */
function readPos(attrs, key, ctx, where) {
  const v = attr(attrs, key);
  if (!v) return null;
  const t = triple(v, `${where}.${key}`);
  if (t) return t;
  return ["x", "y", "z"].map((ax) => SYMBOL(`${where}.${key}.${ax}`));
}

/** Rotation and scale have to be numeric — they multiply extents rather than
 * adding to them, so there is no symbolic form that survives. An unreadable one
 * poisons the frame, and every placement under it reports as unresolved. */
function readRot(attrs, key, where) {
  const v = attr(attrs, key);
  if (!v) return { value: null, bad: null };
  const n = numericTriple(v);
  return n ? { value: n, bad: null } : { value: null, bad: `${where}.${key}` };
}
function readScale(attrs, where) {
  const v = attr(attrs, "scale");
  if (!v) return { value: null, bad: null };
  const l = asLin(v);
  if (l && isConst(l)) return { value: l.c, bad: null };
  const t = numericTriple(v);
  if (t && t[0] === t[1] && t[1] === t[2]) return { value: t[0], bad: null };
  return { value: null, bad: `${where}.scale` };
}

function descend(frame, pos, rot, scl, label, bad) {
  let p = frame.p;
  if (pos) {
    const d = [0, 1, 2].map((row) => {
      let acc = ZERO;
      for (let c = 0; c < 3; c++) {
        const k = frame.R[row * 3 + c];
        if (k !== 0) acc = linAdd(acc, linScale(pos[c], k));
      }
      return linScale(acc, frame.s);
    });
    p = [0, 1, 2].map((i) => linAdd(frame.p[i], d[i]));
  }
  return {
    ...frame,
    p,
    R: rot ? matMul(frame.R, eulerMatrix(rot[0], rot[1], rot[2])) : frame.R,
    s: scl == null ? frame.s : frame.s * scl,
    chain: label ? [...frame.chain, label] : frame.chain,
    key: ++frameSeq,
    bad: bad?.filter(Boolean).length ? [...frame.bad, ...bad.filter(Boolean)] : frame.bad,
  };
}

/** A triple of Lins from an attribute, or null. `scale` may be a scalar.
 * Axes resolve INDEPENDENTLY: one unreadable component becomes a symbol on its
 * own axis rather than discarding the other two. FrameRow's x is built from a
 * list length the walker cannot know, and taking the whole attribute down with
 * it dropped 0.2445 of real contact height off every framed picture. */
function triple(value, label) {
  if (!value) return null;
  if (value.k === "num") return [value.lin, value.lin, value.lin];
  if (value.k !== "arr" || value.items.length < 3) return null;
  return ["x", "y", "z"].map((ax, i) => asLin(value.items[i]) ?? SYMBOL(`${label ?? "?"}.${ax}`));
}
function numericTriple(value) {
  const t = triple(value);
  if (!t || !t.every(isConst)) return null;
  return t.map((l) => l.c);
}

// ===========================================================================
// Primitive half-extents, in the mesh's own frame.
// ===========================================================================
const GEOMETRY = {
  boxGeometry: (a) => [half(a[0]), half(a[1]), half(a[2])],
  planeGeometry: (a) => [half(a[0]), half(a[1]), ZERO],
  circleGeometry: (a) => [a[0], a[0], ZERO],
  ringGeometry: (a) => [a[1], a[1], ZERO],
  sphereGeometry: (a) => [a[0], a[0], a[0]],
  cylinderGeometry: (a) => [maxLin(a[0], a[1]), half(a[2]), maxLin(a[0], a[1])],
  coneGeometry: (a) => [a[0], half(a[1]), a[0]],
  torusGeometry: (a) => [linAdd(a[0], a[1]), linAdd(a[0], a[1]), a[1]],
  capsuleGeometry: (a) => [a[0], linAdd(half(a[1]), a[0]), a[0]],
};
const half = (l) => (l ? linScale(l, 0.5) : ZERO);
const maxLin = (a, b) => {
  if (!a) return b ?? ZERO;
  if (!b) return a;
  if (isConst(a) && isConst(b)) return K(Math.max(a.c, b.c));
  return a;
};

// ===========================================================================
// GLB geometry — triangles, welded islands, and the world-space contact plane.
// Copied from scripts/stacks-render.mjs (the reference implementation) and kept
// numerically identical; the --crosscheck pass proves it.
// ===========================================================================
const loader = new GLTFLoader();
loader.setMeshoptDecoder(typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder);
const glbCache = new Map();

async function loadTriangles(name) {
  const hit = glbCache.get(name);
  if (hit) return hit;
  const file = path.join(MODELS, `${name}.glb`);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const gltf = await new Promise((res, rej) =>
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej),
  );
  gltf.scene.updateMatrixWorld(true);
  const tris = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      tris.push([[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]]);
    }
  });
  glbCache.set(name, tris);
  return tris;
}

/** A prop's contact SET, found in its own upright frame.
 *
 * Running the island rule in world space looks tidier and is wrong the moment
 * a prop is tilted: a leaning corkboard touches its shelf along a LINE, only
 * two of its four bottom corners land inside the slab, `feet.length < 3` skips
 * the real contact, and the rule happily reports the board floating 47 cm in
 * the air on the strength of some decorative island half way up it. Contacts
 * are a property of the OBJECT, not of the pose. So: find the contact set
 * upright — where the thresholds were calibrated and where stacks-render.mjs
 * agrees — then push that set through the placement and take its lowest point.
 * For an untilted prop this reduces exactly to origin + scale × contact. */
const contactCache = new Map();
async function modelContact(name) {
  const hit = contactCache.get(name);
  if (hit !== undefined) return hit;
  const tris = await loadTriangles(name);
  if (!tris) { contactCache.set(name, null); return null; }
  const pts = tris.flat();
  const { min, max } = bounds(pts);
  const isles = islandSplit(tris, Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]));
  const contact = contactPlane(isles, min, max);
  const out = { pts, min, max, contact };
  contactCache.set(name, out);
  return out;
}

const bounds = (pts) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) {
    if (p[k] < min[k]) min[k] = p[k];
    if (p[k] > max[k]) max[k] = p[k];
  }
  return { min, max };
};

function hull(points) {
  if (points.length < 3) return points.slice();
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cross = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const halfHull = (src) => {
    const out = [];
    for (const q of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...halfHull(p), ...halfHull([...p].reverse())];
}

function spread(points) {
  const h = hull(points);
  let best = 0;
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++)
      best = Math.max(best, Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]));
  return best;
}

function hullArea(points) {
  const h = hull(points);
  if (h.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < h.length; i++) {
    const [x1, z1] = h[i];
    const [x2, z2] = h[(i + 1) % h.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

function islandSplit(tris, scale) {
  const eps = Math.max(scale * 1e-3, 1e-6);
  const ids = new Map();
  const key = (p) => `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)},${Math.round(p[2] / eps)}`;
  const vid = (p) => {
    const k = key(p);
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    return v;
  };
  const parent = [];
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (x, y) => { const a = find(x), b = find(y); if (a !== b) parent[a] = b; };
  const triVerts = tris.map((t) => t.map(vid));
  for (const v of triVerts) for (const x of v) parent[x] = parent[x] ?? x;
  for (const [v0, v1, v2] of triVerts) { union(v0, v1); union(v1, v2); }
  const groups = new Map();
  tris.forEach((t, i) => {
    const root = find(triVerts[i][0]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  });
  return [...groups.values()]
    .map((group) => {
      const pts = group.flat();
      const { min, max } = bounds(pts);
      return { tris: group.length, min, max, pts };
    })
    .sort((a, b) => a.min[1] - b.min[1]);
}

/** The lowest height this solid could actually rest on, in whatever frame the
 * triangles are already in. Thresholds are stacks-render.mjs's, verbatim. */
function contactPlane(isles, min, max) {
  const height = max[1] - min[1] || 1;
  const flatAll = isles.flatMap((i) => i.pts).map((p) => [p[0], p[2]]);
  const full = hullArea(flatAll) || 1;
  const fullWidth = spread(flatAll) || 1;
  const slab = height * 0.015;
  const tol = height * 0.01;
  const planes = [...new Set(isles.map((i) => i.min[1]))].sort((a, b) => a - b);
  for (const plane of planes) {
    const resting = isles.filter((i) => Math.abs(i.min[1] - plane) <= tol);
    const feet = resting.flatMap((i) => i.pts).filter((p) => p[1] <= plane + slab);
    if (feet.length < 3) continue;
    const flat = feet.map((p) => [p[0], p[2]]);
    const area = hullArea(flat);
    const width = spread(flat);
    if (area >= full * 0.03 || width >= fullWidth * 0.3) {
      return { y: plane, area, full, width, islands: resting.length, feet };
    }
  }
  // Nothing qualifies: the whole silhouette is the contact set, which is the
  // safe answer — it can only under-report a float, never invent one.
  return { y: min[1], area: 0, full, width: 0, islands: 0, feet: isles.flatMap((i) => i.pts) };
}

// ===========================================================================
// The JSX walker.
// ===========================================================================
const PASSTHROUGH = new Set(["React.Suspense", "Suspense", "React.Fragment", "Fragment"]);
/** Not props: shadow decals painted on the floor and the wood. They are sprites
 * and planes with no volume, and a shadow that "floats" is a shadow drawn at
 * the height it is supposed to be drawn at. */
const DECALS = new Set(["ContactShade", "FootPool", "GroundPool"]);
/** Not props: emitters. A light or a glow sprite has no base to sit on. */
const EMITTERS = new Set(["GlowSprite", "sprite", "pointLight", "spotLight", "directionalLight", "ambientLight", "hemisphereLight", "object3D", "primitive"]);

function tagName(el) {
  const t = ts.isJsxSelfClosingElement(el) ? el.tagName : el.openingElement.tagName;
  return t.getText();
}
function attributes(el) {
  return ts.isJsxSelfClosingElement(el) ? el.attributes : el.openingElement.attributes;
}
function childrenOf(el) {
  return ts.isJsxElement(el) ? el.children : ts.isJsxFragment(el) ? el.children : [];
}

/** Attribute map for a JSX element, spreads included. Values are thunks — a
 * component's prop is evaluated in the scope it was WRITTEN in. */
function attrMap(el, ctx) {
  const out = new Map();
  for (const a of attributes(el).properties) {
    if (ts.isJsxSpreadAttribute(a)) {
      const v = evalNode(a.expression, ctx);
      if (v.k === "obj") for (const [k, val] of v.props) out.set(k, val);
      continue;
    }
    if (!ts.isJsxAttribute(a)) continue;
    const name = a.name.getText();
    if (!a.initializer) { out.set(name, { k: "bool", v: true }); continue; }
    if (ts.isStringLiteral(a.initializer)) { out.set(name, { k: "str", v: a.initializer.text }); continue; }
    if (ts.isJsxExpression(a.initializer) && a.initializer.expression) {
      out.set(name, { k: "thunk", node: a.initializer.expression, ctx });
    }
  }
  return out;
}
const attr = (map, name) => {
  const v = map.get(name);
  const out = v ? forceValue(v) : undefined;
  // `<group rotation={rest}>` with `rest` unset is not an unreadable rotation,
  // it is no rotation. Conflating the two poisoned every prop under a Lift.
  return !out || out.k === "undef" || out.k === "null" ? undefined : out;
};

const helperWanted = new Map();
const helperValues = new Map();
const placements = [];
const unresolved = [];
const passthroughs = new Map();

function note(ctx, el, what) {
  const { line } = ctx.mod.source.getLineAndCharacterOfPosition(el.getStart());
  unresolved.push({ what, where: `${path.relative(ROOT, ctx.mod.file)}:${line + 1}`, unit: ctx.unit });
}

function record(kind, extra, frame, ctx, el, parentKey) {
  const { line } = ctx.mod.source.getLineAndCharacterOfPosition(el.getStart());
  placements.push({
    kind,
    parentKey,
    site: frame.site,
    siteTag: frame.siteTag,
    ...extra,
    frame,
    file: path.relative(ROOT, ctx.mod.file),
    line: line + 1,
    unit: ctx.unit,
    notes: [...ctx.notes],
  });
}

async function walk(node, frame, ctx) {
  if (ts.isJsxText(node)) return;
  if (ts.isJsxExpression(node)) {
    if (!node.expression) return;
    const v = evalNode(node.expression, ctx);
    await walkValue(v, frame, ctx);
    return;
  }
  if (ts.isJsxFragment(node)) {
    for (const c of node.children) await walk(c, frame, ctx);
    return;
  }
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;

  const name = tagName(node);
  const attrs = attrMap(node, ctx);
  const kids = childrenOf(node);
  // The line worth quoting is the one someone would go and edit: the call site
  // in the unit file, not the `<RoundedBox>` three components down in
  // objects.tsx that eight units share. Both are reported; this is the one
  // that gets the first column.
  if (ctx.mod.file.startsWith(UNITS)) {
    const { line } = ctx.mod.source.getLineAndCharacterOfPosition(node.getStart());
    frame = { ...frame, site: `${path.relative(ROOT, ctx.mod.file)}:${line + 1}`, siteTag: name };
  }

  if (DECALS.has(name) || EMITTERS.has(name)) {
    const { line } = ctx.mod.source.getLineAndCharacterOfPosition(node.getStart());
    filtered.push({ name, reason: DECALS.has(name) ? "shadow decal — no volume" : "emitter — no base", file: path.relative(ROOT, ctx.mod.file), line: line + 1, unit: ctx.unit });
    return;
  }
  if (name.endsWith("Material") || name.endsWith("material")) return;
  if (PASSTHROUGH.has(name)) {
    for (const c of kids) await walk(c, frame, ctx);
    return;
  }

  // ---- the GLB props ----------------------------------------------------
  if (name === "ModelProp") {
    const url = attr(attrs, "url");
    const pos = readPos(attrs, "position", ctx, name);
    const rot = readRot(attrs, "rotation", name);
    const scl = readScale(attrs, name);
    const inner = descend(frame, pos, rot.value, scl.value, name, [rot.bad, scl.bad]);
    if (url?.k !== "str") { note(ctx, node, "ModelProp with a non-literal url"); return; }
    record("glb", { model: path.basename(url.v, ".glb"), label: path.basename(url.v, ".glb") }, inner, ctx, node, frame.key);
    return;
  }

  // ---- primitives -------------------------------------------------------
  if (name === "RoundedBox" || name === "Box") {
    const args = attr(attrs, "args");
    const dims = args?.k === "arr" ? args.items.map(asLin) : null;
    const pos = readPos(attrs, "position", ctx, name);
    const rot = readRot(attrs, "rotation", name);
    const inner = descend(frame, pos, rot.value, null, name, [rot.bad]);
    if (!dims || dims.length < 3 || !dims.every(Boolean)) {
      note(ctx, node, `<${name}> args unreadable`);
      return;
    }
    record("box", { label: name, ext: dims.map(half) }, inner, ctx, node, frame.key);
    return;
  }
  if (name === "mesh" || name === "instancedMesh") {
    const pos = readPos(attrs, "position", ctx, name);
    const rot = readRot(attrs, "rotation", name);
    const scl = readScale(attrs, name);
    const inner = descend(frame, pos, rot.value, scl.value, name, [rot.bad, scl.bad]);
    // An emissive, un-tone-mapped disc is a light source wearing a mesh — the
    // two lamp mouths and the shade openings. It has no base and must never be
    // seated on anything. Checked before the geometry is read, because the
    // material is a SIBLING of the geometry and usually the later one.
    // A zero-opacity mesh is a click target, not an object. The ladder and the
    // golf ball both carry one, deliberately bigger than the thing it stands
    // in for, so seating it would report a float that nobody can see.
    const invisible = kids.some(
      (c) => (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) && /[Mm]aterial$/.test(tagName(c)) &&
        (() => { const m = attrMap(c, ctx); const o = attr(m, "opacity"); const l = o && asLin(o); return (l && isConst(l) && l.c === 0) || attr(m, "visible")?.v === false; })(),
    );
    if (invisible) {
      const { line } = ctx.mod.source.getLineAndCharacterOfPosition(node.getStart());
      filtered.push({ name: "zero-opacity mesh", reason: "invisible hit proxy", file: path.relative(ROOT, ctx.mod.file), line: line + 1, unit: ctx.unit });
      return;
    }
    const emissive = kids.some(
      (c) => (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) &&
        /[Mm]aterial$/.test(tagName(c)) && attrMap(c, ctx).has("emissive"),
    );
    if (emissive) {
      const { line } = ctx.mod.source.getLineAndCharacterOfPosition(node.getStart());
      filtered.push({ name: "emissive mesh", reason: "light source, not a prop", file: path.relative(ROOT, ctx.mod.file), line: line + 1, unit: ctx.unit });
      return;
    }
    if (attrs.has("geometry")) {
      record("opaque", { label: "mesh(geometry=…)", ext: null }, inner, ctx, node, frame.key);
      return;
    }
    for (const c of kids) {
      if (!ts.isJsxSelfClosingElement(c) && !ts.isJsxElement(c)) continue;
      const g = tagName(c);
      const make = GEOMETRY[g];
      if (!make) continue;
      const args = attr(attrMap(c, ctx), "args");
      const nums = args?.k === "arr" ? args.items.map(asLin) : [];
      if (!nums.length || !nums[0]) { note(ctx, c, `<${g}> args unreadable`); continue; }
      record("prim", { label: g, ext: make(nums) }, inner, ctx, c, frame.key);
    }
    return;
  }

  // ---- lowercase r3f nodes that are pure transforms ----------------------
  if (name[0] === name[0].toLowerCase()) {
    const pos = readPos(attrs, "position", ctx, name);
    const rot = readRot(attrs, "rotation", name);
    const scl = readScale(attrs, name);
    const inner = descend(frame, pos, rot.value, scl.value, name, [rot.bad, scl.bad]);
    for (const c of kids) await walk(c, inner, ctx);
    return;
  }

  // ---- a component: inline it from its own definition --------------------
  const decl = lookupDecl(ctx.mod, name.split(".")[0]);
  const fnNode = decl && (ts.isVariableDeclaration(decl.node) ? decl.node.initializer : decl.node);
  const isFn = fnNode && (ts.isArrowFunction(fnNode) || ts.isFunctionDeclaration(fnNode) || ts.isFunctionExpression(fnNode));
  if (!isFn) {
    // Unknown or class component: treat as a pass-through so its children are
    // still followed, and say so rather than pretending it was understood.
    passthroughs.set(name, (passthroughs.get(name) ?? 0) + 1);
    for (const c of kids) await walk(c, frame, ctx);
    return;
  }

  const props = new Map(attrs);
  // Children (and any JSX-valued prop, e.g. ShelfUnit's `lower`) keep the
  // CALLER's scope, which is what makes inlining sound.
  if (kids.length) props.set("children", { k: "jsxlist", items: kids.map((c) => ({ node: c, env: ctx.env, mod: ctx.mod, notes: ctx.notes })) });
  if (name === "ShelfUnit") {
    // The one structural fact the walker has to know by name: which of a
    // bookcase's two surfaces a subtree landed on. Everything else about the
    // unit — both plank heights included — is read from its own source.
    const c = props.get("children");
    if (c) props.set("children", { ...c, slot: "top" });
    const l = props.get("lower");
    if (l) props.set("lower", { ...forceValue(l), slot: "lower" });
  }

  const env = new Map();
  bindParam(fnNode.parameters[0], { k: "obj", props }, env, ctx, {
    ...ctx,
    mod: decl.mod,
    env: new Map(),
  });
  const inner = {
    ...ctx,
    env,
    mod: decl.mod,
    notes: ctx.notes,
    component: name,
  };
  const body = fnNode.body;
  let ret = null;
  if (ts.isBlock(body)) {
    hoistBlock(body, inner);
    const r = lastReturn(body);
    ret = r?.expression ?? null;
  } else {
    ret = body;
  }
  if (!ret) { unresolved.push({ what: `${name}: no return statement` }); return; }
  const childFrame = name === "ShelfUnit" ? { ...frame, inShelfUnit: true } : frame;
  const value = evalNode(ret, inner);
  // A component whose return does not evaluate to something walkable is a
  // whole subtree dropped on the floor. Say so — every prop this tool has ever
  // missed, it missed here.
  if (!["jsx", "jsxlist", "arr", "null", "undef"].includes(value.k)) {
    unresolved.push({ what: `<${name}> return evaluated to ${value.k}${value.why ? ` (${value.why})` : ""} — subtree not walked`, file: path.relative(ROOT, decl.mod.file) });
  }
  await walkValue(value, childFrame, inner);
}

async function walkValue(v, frame, ctx) {
  if (!v) return;
  if (v.k === "thunk") return walkValue(forceValue(v), frame, ctx);
  if (v.k === "arr") { for (const item of v.items) await walkValue(item, frame, ctx); return; }
  if (v.k === "jsxlist") {
    for (const item of v.items) {
      const f = v.slot ? { ...frame, slot: v.slot } : frame;
      await walk(item.node, f, { ...ctx, env: item.env, mod: item.mod });
    }
    return;
  }
  if (v.k === "jsx") {
    const f = v.slot ? { ...frame, slot: v.slot } : frame;
    await walk(v.node, f, { ...ctx, env: v.env, mod: v.mod });
    return;
  }
}

// ===========================================================================
// Resolve each placement to a world contact height and a support.
// ===========================================================================
const filtered = [];

const SUPPORT_PLANES = {}; // filled from source below

function readSourceConstants() {
  const prims = loadModule(path.join(STACKS, "scene", "primitives.tsx"));
  const shelf = prims.decls.get("SHELF");
  const ctx = { env: new Map(), mod: prims, notes: new Set() };
  const v = evalNode(shelf.initializer, ctx);
  SUPPORT_PLANES.top = asLin(forceValue(v.props.get("top"))).c;
  SUPPORT_PLANES.lower = asLin(forceValue(v.props.get("lower"))).c;
  // The ground is where the bookcase's straps end: their RoundedBox is
  // args [0.07, H, 0.07] at y −H/2, so the foot is at −H. Read H rather than
  // repeating −1.115 here.
  const text = fs.readFileSync(prims.file, "utf8");
  const m = text.match(/args=\{\[0\.07,\s*([0-9.]+),\s*0\.07\]\}/);
  SUPPORT_PLANES.ground = m ? -Number(m[1]) : -1.115;
}

async function resolve(placement) {
  let pl = placement;
  let f = pl.frame;
  if (f.bad.length) {
    return { ...pl, status: "unresolved", why: `unreadable ${[...new Set(f.bad)].join(", ")} above it` };
  }
  // x and z are only needed for the "supported by another prop" test. A prop
  // whose lateral position is symbolic still has an answerable HEIGHT, and
  // that is what this tool is for — so lose the footprint, not the prop.
  const footprint = isConst(f.p[0]) && isConst(f.p[2]);
  const origin = [footprint ? f.p[0].c : 0, null, footprint ? f.p[2].c : 0];

  if (pl.kind === "glb") {
    if (!isConst(f.p[1])) return { ...pl, status: "unresolved", why: `symbolic height ${linText(f.p[1])}` };
    origin[1] = f.p[1].c;
    const model = await modelContact(pl.model);
    if (!model) return { ...pl, status: "unresolved", why: `no ${pl.model}.glb` };
    const toWorld = (p) => {
      const x = f.R[0] * p[0] + f.R[1] * p[1] + f.R[2] * p[2];
      const y = f.R[3] * p[0] + f.R[4] * p[1] + f.R[5] * p[2];
      const z = f.R[6] * p[0] + f.R[7] * p[1] + f.R[8] * p[2];
      return [origin[0] + f.s * x, origin[1] + f.s * y, origin[2] + f.s * z];
    };
    const { min, max } = bounds(model.pts.map(toWorld));
    const feet = model.contact.feet.map(toWorld).map((p) => p[1]);
    const contactY = Math.min(...feet);
    return {
      ...pl, status: "ok", min, max, footprint,
      contactY, contactHi: Math.max(...feet), lowestY: min[1],
      contactIslands: model.contact.islands,
      contactArea: model.contact.area / model.contact.full,
      modelContactY: model.contact.y,
      tilted: Math.abs(f.R[3]) > 1e-6 || Math.abs(f.R[5]) > 1e-6,
    };
  }

  if (pl.kind === "opaque") {
    if (!isConst(f.p[1])) return { ...pl, status: "unresolved", why: "opaque solid at a symbolic height" };
    return { ...pl, status: "opaque", contactY: f.p[1].c, footprint: false };
  }

  // Primitive: rotate the half-extents. Exact for a box, conservative for the
  // rest (a rotated cylinder's silhouette is inside its rotated bbox).
  if (!pl.ext.every(Boolean)) return { ...pl, status: "unresolved", why: "unreadable extents" };
  const axis = (row) => {
    let acc = ZERO;
    for (let c = 0; c < 3; c++) {
      const k = Math.abs(f.R[row * 3 + c]);
      if (k > 1e-12) acc = linAdd(acc, linScale(pl.ext[c], k));
    }
    return linScale(acc, f.s);
  };
  const drop = axis(1);
  // THE POINT OF THE SYMBOLIC MACHINERY. A packed-row spine is positioned at
  // `item.h / 2` and drawn `item.h` tall; neither number is knowable here and
  // neither has to be, because the difference is exactly zero for every h.
  const contact = linSub(f.p[1], drop);
  // A residual that does not cancel is not automatically a dead end. Every
  // symbol left standing here is a LENGTH of something on a 3.2-unit shelf, so
  // it lies in [0, SYMBOL_BOUND], and that turns the residual into an interval.
  // A packed-row spine comes out at 0.0290 − 0.008·item.w against a plank at
  // 0.0350: the whole interval is below the wood whatever item.w turns out to
  // be, which settles "does the book row float?" without ever running packRow.
  let lo = contact.c;
  let hi = contact.c;
  for (const v of contact.t.values()) {
    if (v < 0) lo += v * SYMBOL_BOUND;
    else hi += v * SYMBOL_BOUND;
  }
  const spanX = axis(0);
  const spanZ = axis(2);
  const up = linAdd(f.p[1], drop);
  const known = footprint && isConst(spanX) && isConst(spanZ) && isConst(up);
  return {
    ...pl, status: "ok", footprint: known,
    min: [origin[0] - (known ? spanX.c : 0), lo, origin[2] - (known ? spanZ.c : 0)],
    max: [origin[0] + (known ? spanX.c : 0), known ? up.c : hi, origin[2] + (known ? spanZ.c : 0)],
    contactY: lo,
    contactYHi: hi,
    symbolic: isConst(contact) ? null : linText(contact),
    lowestY: lo,
    tilted: Math.abs(f.R[3]) > 1e-6 || Math.abs(f.R[5]) > 1e-6,
  };
}

const overlapsXZ = (a, b) =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[2] < b.max[2] && a.max[2] > b.min[2];

function assignSupport(item, all) {
  const plane =
    item.frame.slot === "top" ? { y: SUPPORT_PLANES.top, what: "top plank" }
      : item.frame.slot === "lower" ? { y: SUPPORT_PLANES.lower, what: "lower plank" }
        : { y: SUPPORT_PLANES.ground, what: "ground" };

  // Another prop, resolved structurally rather than by name. A base swallowed
  // INSIDE another prop's volume is MOUNTED on it — a pin in a corkboard, soil
  // in a pot, a print inside its own frame — and is deliberately off-plane. A
  // base resting on another prop's TOP face is supported by it, and the gap is
  // measured from there, not from the distant plank.
  let host = null;
  let stand = null;
  for (const other of all) {
    if (other === item || other.status !== "ok") continue;
    if (other.unit !== item.unit) continue;
    if (!item.footprint || !other.footprint) continue;
    if (!overlapsXZ(item, other)) continue;
    const cx = (item.min[0] + item.max[0]) / 2;
    const cz = (item.min[2] + item.max[2]) / 2;
    const over = cx >= other.min[0] && cx <= other.max[0] && cz >= other.min[2] && cz <= other.max[2];
    // MOUNTED: the base is swallowed inside another prop's height AND the item
    // is laterally enclosed by it. Exact containment is a hair too strict — a
    // book's page block is deliberately proud of its covers at the fore-edge,
    // and demanding it be wholly enclosed reported it as floating inside its
    // own book — so a protrusion of a tenth of the item's own span is allowed.
    // Anything looser and a print leaning IN FRONT of a book pile reads as
    // being mounted inside it.
    const slackX = (item.max[0] - item.min[0]) * 0.1;
    const slackZ = (item.max[2] - item.min[2]) * 0.1;
    const enclosed = item.min[0] > other.min[0] - slackX && item.max[0] < other.max[0] + slackX
      && item.min[2] > other.min[2] - slackZ && item.max[2] < other.max[2] + slackZ;
    const inside = over && enclosed
      && item.contactY > other.min[1] + 1e-4 && item.contactY < other.max[1] - 1e-4;
    if (inside && !host) host = other;
    // A surface only counts as a stand if it is above the plank and NOT above
    // the base it is supposed to be carrying. Two ways this was wrong: a full
    // centimetre of required height threw a 6 mm stack of calling cards back
    // onto the plank and called every card above the bottom one a floater;
    // and allowing a surface 12 mm PROUD of the base let a print lying flat
    // beside the Mac get nominated as the thing the Mac stands on.
    // A stand also has to be UNDER the thing standing on it: bounding boxes
    // touch for objects side by side, and without the centre test a print
    // leaning next to the calling cards gets nominated as standing on them.
    if (over && other.max[1] > plane.y + 1e-4 && other.max[1] <= item.contactY + OPT.tol) {
      if (!stand || other.max[1] > stand.max[1]) stand = other;
    }
  }
  if (host) return { support: { y: null, what: `mounted on ${host.label}` }, mounted: true, host };
  if (stand) return { support: { y: stand.max[1], what: `on ${stand.label}` }, mounted: false };
  return { support: plane, mounted: false };
}

// ===========================================================================
// Run.
// ===========================================================================
readSourceConstants();

const UNIT_FILES = fs.readdirSync(UNITS).filter((f) => /^Unit.*\.tsx$/.test(f)).sort();

async function walkAllUnits() {
  placements.length = 0;
  unresolved.length = 0;
  filtered.length = 0;
  passthroughs.clear();
  frameSeq = 0;
  for (const file of UNIT_FILES) {
    const mod = loadModule(path.join(UNITS, file));
    const decl = mod.decls.get("default");
    if (!decl) { unresolved.push({ what: `${file}: no default export`, where: file }); continue; }
    const ctx = { env: new Map(), mod, notes: new Set(), unit: file.replace(/\.tsx$/, "") };
    hoistBlock(decl.body, ctx);
    const ret = lastReturn(decl.body);
    // The unit's own pose (worldLayout.unitPose) is a pure x/z translation plus
    // a yaw, so unit-local y IS world y. Nothing here has to model it.
    await walkValue(evalNode(ret.expression, ctx), newFrame(), ctx);
  }
}

/**
 * Execute the project's own placement helpers, for real, through `tsx`.
 *
 * The alternative was to reimplement `polaroidSeat` in this file, which is the
 * same mistake as the constants it replaced — two copies of one number, drifting
 * quietly. One subprocess, one module import, every deferred call answered by
 * the code that actually ships.
 */
async function runDeferredHelpers() {
  if (!helperWanted.size) return false;
  const byModule = new Map();
  for (const [key, call] of helperWanted) {
    if (!byModule.has(call.importPath)) byModule.set(call.importPath, []);
    byModule.get(call.importPath).push([key, call]);
  }
  const lines = [];
  let n = 0;
  for (const [importPath, calls] of byModule) {
    const fns = [...new Set(calls.map(([, c]) => c.fn))];
    lines.push(`import { ${fns.join(", ")} } from ${JSON.stringify(importPath)};`);
    for (const [key, c] of calls) {
      lines.push(`out.push([${JSON.stringify(key)}, ${c.fn}(${c.args.map((a) => JSON.stringify(a)).join(", ")})]);`);
      n++;
    }
  }
  const script = `const out = [];\n${lines.filter((l) => l.startsWith("import")).join("\n")}\n${lines.filter((l) => !l.startsWith("import")).join("\n")}\nconsole.log(JSON.stringify(out));`;
  const file = path.join(os.tmpdir(), `stacks-floaters-helpers-${process.pid}.mts`);
  fs.writeFileSync(file, script);
  try {
    const out = execFileSync("npx", ["tsx", "--tsconfig", path.join(ROOT, "tsconfig.json"), file], { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    for (const [key, value] of JSON.parse(out.trim().split("\n").pop())) {
      if (typeof value === "number" && Number.isFinite(value)) helperValues.set(key, value);
    }
  } catch (e) {
    console.error(`  helper evaluation failed (${n} call(s)); they will report as unresolved:\n  ${String(e.message).split("\n").slice(0, 3).join("\n  ")}`);
    return false;
  } finally {
    fs.rmSync(file, { force: true });
  }
  helperWanted.clear();
  return true;
}

await walkAllUnits();
// Second pass, only if the scene asked the walker to run something.
const helperCount = helperWanted.size;
if (await runDeferredHelpers()) await walkAllUnits();

const resolvedAll = [];
for (const pl of placements) resolvedAll.push(await resolve(pl));

const opaqueParents = new Set(resolvedAll.filter((r) => r.status === "opaque").map((r) => r.parentKey));
const ok = resolvedAll.filter((r) => r.status === "ok");
for (const item of ok) {
  if (opaqueParents.has(item.parentKey)) {
    item.supportInfo = { y: null, what: "part of an unmeasurable solid" };
    item.mounted = true;
    item.gap = null;
    continue;
  }
  const { support, mounted, host } = assignSupport(item, ok);
  item.supportInfo = support;
  item.mounted = mounted;
  item.host = host;
  item.gap = support.y === null ? null : item.contactY - support.y;
  item.gapHi = support.y === null ? null : (item.contactYHi ?? item.contactY) - support.y;
}

// Structure vs props: the bookcase's own planks, straps and cleats are emitted
// by ShelfUnit before either surface slot is entered. They ARE the support.
const structure = ok.filter((r) => r.frame.inShelfUnit && !r.frame.slot);
const props = ok.filter((r) => !(r.frame.inShelfUnit && !r.frame.slot));
const mountedProps = props.filter((r) => r.mounted);
const seated = props.filter((r) => !r.mounted);

// A symbolic contact is flagged only when the WHOLE interval sits outside the
// tolerance — i.e. the verdict holds for every value the unknown could take.
// One that straddles the wood is reported separately rather than guessed at.
const verdict = (r) => {
  const lo = r.gap;
  const hi = r.gapHi ?? r.gap;
  if (lo > OPT.tol) return "float";
  if (hi < -OPT.tol) return "sink";
  if (lo >= -OPT.tol && hi <= OPT.tol) return "pass";
  return "indeterminate";
};
const worst = (r) => (Math.abs(r.gap) > Math.abs(r.gapHi ?? r.gap) ? r.gap : r.gapHi ?? r.gap);
// Split every gap into the part the TILT is responsible for and the part a
// stale mount constant is responsible for. Without this the two are
// indistinguishable in a single number, and they want opposite fixes: a tilt
// error is a pivot in the wrong place (fix the component), a constant error is
// a literal that outlived the geometry it was measured against (fix the call
// site). The eleven floating prints looked like a pivot bug and were not — the
// tilt term is a NEGATIVE 0.2-0.7 cm against a positive 3.6 cm constant.
for (const r of seated) {
  if (r.kind === "glb" || !r.ext || !r.ext.every((e) => e && isConst(e))) continue;
  const upright = r.ext[1].c * r.frame.s;      // half-height, unrotated
  const tilted = r.frame.p[1].c - r.contactY;  // half-height, as posed
  r.pivotTerm = upright - tilted;
  r.constantTerm = (r.gap ?? 0) - r.pivotTerm;
}

const flagged = seated
  .filter((r) => verdict(r) === "float" || verdict(r) === "sink")
  .sort((a, b) => Math.abs(worst(b)) - Math.abs(worst(a)));
const passing = seated.filter((r) => verdict(r) === "pass");
const straddling = seated.filter((r) => verdict(r) === "indeterminate");

// ---------------------------------------------------------------------------
// Cross-check against scripts/stacks-render.mjs — the reference contact plane.
// Any prop placed without an X/Z tilt must reproduce its model-space number.
// ---------------------------------------------------------------------------
let crosscheck = null;
if (OPT.crosscheck) {
  try {
    const out = execFileSync("node", [path.join(ROOT, "scripts", "stacks-render.mjs"), "--all", "--report"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const ref = new Map();
    let current = null;
    for (const line of out.split("\n")) {
      const head = line.match(/^(\S+)\s+[\d.]+ KB/);
      if (head) { current = head[1]; continue; }
      const c = line.match(/^\s+contact\s+y\s+([-\d.]+)/);
      if (c && current) ref.set(current, Number(c[1]));
    }
    const rows = [];
    for (const item of props) {
      if (item.kind !== "glb" || item.tilted) continue;
      const expect = ref.get(item.model);
      if (expect === undefined) continue;
      // World contact = frame origin + scale × model-space contact.
      const mine = (item.contactY - item.frame.p[1].c) / item.frame.s;
      rows.push({ model: item.model, expect, mine, delta: Math.abs(mine - expect) });
    }
    crosscheck = { rows, worst: rows.reduce((m, r) => Math.max(m, r.delta), 0) };
  } catch (e) {
    crosscheck = { error: String(e.message).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// SELF TEST — four rules that have each been broken at least once, pinned so
// that "simplifying" this file fails loudly instead of quietly reintroducing a
// bug the scene already paid for.
// ---------------------------------------------------------------------------
async function selftest() {
  const checks = [];
  const record = (name, pass, detail) => checks.push({ name, pass, detail });

  // 1. The island rule is live. A prop's contact is NOT its bounding-box
  //    minimum: pothos's lowest vertex is a trailing vine tip in free air and
  //    its pot sits 0.2182 above it. Replace the island split with a bbox-min
  //    shortcut and this is the prop that goes back to floating.
  const pothos = await modelContact("pothos");
  record(
    "island rule: pothos contact is above its bbox minimum",
    pothos && pothos.contact.y - pothos.min[1] > 0.2,
    pothos ? `contact ${pothos.contact.y.toFixed(4)} vs bbox min ${pothos.min[1].toFixed(4)}` : "pothos.glb missing",
  );

  // 2. A contact may enclose ZERO area. A barbell rests on two plates and
  //    headphones on two earcups; their contact hulls are lines. An area-only
  //    test rejects both and wants to lift the barbell 0.27 into the air.
  for (const name of ["barbell", "headphones"]) {
    const m = await modelContact(name);
    record(
      `zero-area contact accepted: ${name} sits on 0`,
      m && Math.abs(m.contact.y - m.min[1]) < 1e-3,
      m ? `contact ${m.contact.y.toFixed(4)}, hull encloses ${((m.contact.area / m.contact.full) * 100).toFixed(1)}% of the footprint` : `${name}.glb missing`,
    );
  }

  // 3. A TILTED prop's contact comes from transforming the model-space contact
  //    SET, never from re-running the plane finder in world space. A leaning
  //    board touches along a line, only two of its four bottom corners land in
  //    the slab, the plane finder skips them and reports the board floating on
  //    some decorative island half way up it. This asserts the two methods are
  //    genuinely distinguishable AND that the right one is in use — if someone
  //    moves the island split back into world space, the second half fails.
  let divergent = 0;
  let agreed = 0;
  for (const item of props) {
    if (item.kind !== "glb" || item.status !== "ok") continue;
    const f = item.frame;
    const model = await modelContact(item.model);
    const toWorld = (p) => [
      f.p[0].c + f.s * (f.R[0] * p[0] + f.R[1] * p[1] + f.R[2] * p[2]),
      f.p[1].c + f.s * (f.R[3] * p[0] + f.R[4] * p[1] + f.R[5] * p[2]),
      f.p[2].c + f.s * (f.R[6] * p[0] + f.R[7] * p[1] + f.R[8] * p[2]),
    ];
    const world = model.pts.map(toWorld);
    const { min, max } = bounds(world);
    const tris = [];
    for (let i = 0; i + 2 < world.length; i += 3) tris.push([world[i], world[i + 1], world[i + 2]]);
    const naive = contactPlane(
      islandSplit(tris, Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])),
      min, max,
    ).y;
    const mine = Math.min(...model.contact.feet.map(toWorld).map((p) => p[1]));
    if (Math.abs(mine - item.contactY) > 1e-9) agreed = -1e9; // ours must be in use
    if (Math.abs(naive - mine) > 0.05) divergent++;
    agreed++;
  }
  record(
    "tilt: contact set is transformed, not re-derived in world space",
    agreed > 0 && divergent > 0,
    `${divergent} placement(s) where the world-space plane finder disagrees by >0.05 — and the transformed set is the one reported`,
  );

  // 4. Hung objects stay hung. Corkboard pins, soil discs and prints inside
  //    their own frames are supported by another prop, not by a plank, and
  //    "fixing" them onto a shelf is a worse bug than the one being hunted.
  const mountedOnProp = mountedProps.filter((r) => /^mounted on /.test(r.supportInfo.what));
  record(
    "mounted props stay filtered",
    mountedOnProp.length >= 4,
    `${mountedOnProp.length} filtered, e.g. ${mountedOnProp.slice(0, 3).map((r) => `${r.label}→${r.supportInfo.what.replace("mounted on ", "")}`).join(", ")}`,
  );

  console.log("\nSELF TEST");
  for (const c of checks) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${pad(c.name, 62)} ${c.detail}`);
  return checks.every((c) => c.pass);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
const cm = (world) => (world / UNITS_PER_METRE) * 100;
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 4) => (v >= 0 ? "+" : "") + v.toFixed(n);

console.log(`\nHomepage 3D scene — floating-prop report`);
console.log(`  planes   top plank ${SUPPORT_PLANES.top}   lower plank ${SUPPORT_PLANES.lower}   ground ${SUPPORT_PLANES.ground}`);
const glbCount = resolvedAll.filter((r) => r.kind === "glb").length;
const glbFiles = new Set(resolvedAll.filter((r) => r.kind === "glb").map((r) => r.model)).size;
console.log(`  walked   ${UNIT_FILES.length} units → ${placements.length} placements: ${props.length} props, ${structure.length} bookcase parts, ${resolvedAll.length - ok.length} unresolved`);
console.log(`  GLB      ${glbCount} model placements across ${glbFiles} distinct .glb files`);
if (helperCount) console.log(`  derived  ${helperCount} placement height(s) computed by running the scene's own helpers`);
console.log(`  flagging |gap| > ${OPT.tol} world (${cm(OPT.tol).toFixed(2)} cm at ${UNITS_PER_METRE.toFixed(2)} u/m)\n`);

if (crosscheck?.rows) {
  console.log(`  crosscheck vs stacks-render.mjs: ${crosscheck.rows.length} untilted GLB props, worst disagreement ${crosscheck.worst.toExponential(1)}` +
    // stacks-render prints `contact y` to four decimals, so half an ulp of the
    // printed value — 5e-5 — is the floor of any agreement test against it.
    (crosscheck.worst <= 5e-5 ? "  ✓ (agreement is limited by its 4-decimal print)" : "  ← INVESTIGATE"));
} else if (crosscheck?.error) {
  console.log(`  crosscheck skipped: ${crosscheck.error}`);
}

const shortSite = (r) => (r.site ?? `${r.file}:${r.line}`).replace("src/app/components/stacks/scene/", "");
const shortDef = (r) => `${r.file}:${r.line}`.replace("src/app/components/stacks/scene/", "");
const label = (r) => (r.kind === "glb" ? r.label : `${r.siteTag ?? r.label}`);

console.log(`${pad("#", 3)}${pad("PROP", 17)}${pad("PLACED AT", 26)}${pad("GEOMETRY FROM", 24)}${pad("SUPPORT", 22)}${pad("CONTACT", 19)}${pad("SUPPORT", 10)}${pad("GAP", 9)}${pad("cm", 8)}`);
console.log("-".repeat(138));
flagged.forEach((r, i) => {
  console.log(
    pad(i + 1, 3) + pad(label(r), 17) + pad(shortSite(r), 26) + pad(shortDef(r), 24) +
    pad(r.supportInfo.what, 22) +
    pad(r.symbolic ? `${num(r.contactY)}…${num(r.contactYHi).trim()}` : num(r.contactY), 19) +
    pad(num(r.supportInfo.y), 10) +
    pad(num(worst(r)), 9) + pad(num(cm(worst(r)), 2), 8) +
    (r.tilted ? " tilted" : "") + (r.symbolic ? "  symbolic" : ""),
  );
  if (OPT.verbose && r.symbolic) console.log(`      contact height = ${r.symbolic}  (symbols bounded to [0, ${SYMBOL_BOUND}])`);
  if (OPT.verbose) {
    console.log(`      chain ${r.frame.chain.join(" > ")}`);
    if (r.pivotTerm !== undefined) {
      console.log(`      gap = ${num(r.constantTerm)} stale constant  ${num(r.pivotTerm)} tilt`);
    }
    if (r.kind === "glb") console.log(`      model contact y ${r.modelContactY.toFixed(4)} on ${r.contactIslands} island(s), ${(r.contactArea * 100).toFixed(1)}% of footprint; world contact spans ${num(r.contactY)}..${num(r.contactHi)}`);
  }
});
if (!flagged.length) console.log("  (nothing above threshold)");

console.log(`\n${flagged.length} flagged · ${passing.length} seated within tolerance · ${straddling.length} indeterminate · ${mountedProps.length} filtered as mounted`);
if (straddling.length) {
  console.log("\nINDETERMINATE — a symbolic contact whose interval straddles the surface");
  for (const r of straddling) {
    console.log(`  ${pad(label(r), 17)}${pad(shortSite(r), 26)}${pad(r.supportInfo.what, 22)}gap ${num(r.gap)}…${num(r.gapHi).trim()}   ${r.symbolic ?? ""}`);
  }
}

if (OPT.all) {
  console.log("\nPASSED (|gap| within tolerance)");
  for (const r of passing.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))) {
    console.log(`  ${pad(label(r), 17)}${pad(shortSite(r), 26)}${pad(r.supportInfo.what, 22)}gap ${num(r.gap)}  (${num(cm(r.gap), 2)} cm)`);
  }
}

if (OPT.filtered) {
  console.log("\nFILTERED — deliberately off-plane, by support type");
  for (const r of mountedProps) {
    console.log(`  ${pad(label(r), 17)}${pad(shortSite(r), 26)}${r.supportInfo.what}`);
  }
  console.log("\nFILTERED — not props");
  const byName = new Map();
  for (const f of filtered) byName.set(`${f.name} — ${f.reason}`, (byName.get(`${f.name} — ${f.reason}`) ?? 0) + 1);
  for (const [k, n] of [...byName].sort()) console.log(`  ${pad(k, 46)} ×${n}`);
  console.log("\nFILTERED — bookcase structure (it IS the support)");
  console.log(`  ${structure.length} planks, straps, cleats and end-grain strips`);
}

if (OPT.unresolved) {
  console.log("\nUNRESOLVED placements");
  for (const r of resolvedAll.filter((x) => x.status !== "ok" && x.status !== "opaque")) {
    console.log(`  ${pad(r.label ?? r.kind, 20)}${pad(shortSite(r), 26)}${r.why}`);
  }
  console.log("\nCOMPONENTS treated as pass-through (no definition found / class component)");
  for (const [name, n] of [...passthroughs].sort()) console.log(`  ${pad(name, 30)} ×${n}`);
  if (unresolved.length) {
    console.log("\nWALKER could not read");
    for (const u of unresolved) console.log(`  ${pad(u.where ?? "", 42)}${u.what}`);
  }
}
let selftestOk = true;
if (OPT.selftest) selftestOk = await selftest();
console.log("");
if (OPT.check && (flagged.length || !selftestOk)) process.exitCode = 1;
