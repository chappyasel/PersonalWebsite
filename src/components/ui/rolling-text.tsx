"use client";

/**
 * Text that changes as SwiftUI's `.contentTransition(.numericText())` does,
 * ported from the Companion app's motion.tsx (CR/agent,
 * apps/companion/src/renderer/motion.tsx), which fitted it frame by frame to
 * the iOS simulator. When only a line's numbers change, such as 2:30 turning
 * to 2:45 or "Nov 3 - 9" to "Nov 10 - 16", the changed digits roll and the
 * words stay still. When the words change, the characters both texts share
 * at the start and end stay, and the ones between roll into the new ones
 * left to right. The old character rises, shrinks, blurs and fades while the
 * new one rises into its place from below (both go down when a number
 * shrinks), and the characters after them and the width ease to their new
 * places. The first paint is still, Reduce motion changes it at once, and a
 * screen reader reads only the new text.
 *
 * Rolling draws every character on one line, so this is for short lines
 * that don't wrap: a time, a label, a button.
 */
import {
  type AnimationPlaybackControls,
  type MotionValue,
  animate,
  motion,
  motionValue,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/** A spring in SwiftUI's terms: one swing's length and the damping fraction. */
const swiftSpring = (response: number, dampingFraction: number) => ({
  type: "spring" as const,
  stiffness: ((2 * Math.PI) / response) ** 2,
  damping: (4 * Math.PI * dampingFraction) / response,
  mass: 1,
});

/** SwiftUI's .snappy, which the width and the characters' places ease on. */
const SNAPPY = {
  type: "spring" as const,
  stiffness: 157.91,
  damping: 21.37,
  mass: 1,
};

/**
 * Each changing character's motion. Lengths are in em, so a 13px label and a
 * 17px heading move alike. The one leaving travels and shrinks on one spring
 * while it fades and blurs on quicker ones; the one arriving starts small,
 * blurred and clear below, rises, and sharpens last.
 */
export const ROLL = {
  leave: {
    y: 0.48,
    scale: 0.35,
    blur: 0.105,
    move: swiftSpring(0.35, 0.85),
    fade: swiftSpring(0.26, 1),
    blurring: swiftSpring(0.2, 1),
  },
  arrive: {
    y: 0.42,
    scale: 0.3,
    blur: 0.11,
    move: swiftSpring(0.32, 0.85),
    grow: swiftSpring(0.28, 1),
    fade: swiftSpring(0.33, 1),
    sharpen: swiftSpring(0.32, 1),
  },
  tickWidth: swiftSpring(0.35, 0.85),
  /** Seconds between one changing character and the next: a tenth, squeezed
   * so five or more spread over a fifth of a second. */
  stagger: (changed: number) =>
    changed > 1 ? Math.min(0.1, 0.2 / (changed - 1)) : 0,
};

/** A line longer than this crossfades instead of rolling. */
const ROLL_MAX = 120;

/**
 * Scripts whose letters join or reorder, which drawn one by one would come
 * apart, scripts that run right to left, and a keycap's mark.
 */
const UNROLLABLE = /[֐-ࣿऀ-෿฀-࿿က-႟ក-᢯‏‫‮⁧⃣יִ-﷿ﹰ-﻿]/;

const rolls = (from: string, to: string) =>
  from !== "" &&
  to !== "" &&
  Math.max(from.length, to.length) <= ROLL_MAX &&
  !UNROLLABLE.test(from) &&
  !UNROLLABLE.test(to);

/**
 * A short line whose changes roll, or crossfade where rolling would break
 * it: from or to no text, a long line, or a joined or right-to-left script.
 * `tick` is for a line that changes on its own every so often, such as a
 * clock: its width settles quicker.
 */
export function SwapText({
  text,
  className,
  tick = false,
}: {
  text: string;
  className?: string;
  tick?: boolean;
}) {
  const [shown, setShown] = useState({ text, id: 0 });
  let id = shown.id;
  if (text !== shown.text) {
    id = rolls(shown.text, text) ? shown.id : shown.id + 1;
    setShown({ text, id });
  }
  return (
    <FadeIn key={id} fades={id > 0} className={className}>
      <RollingText text={text} value={null} tick={tick} />
    </FadeIn>
  );
}

/** A number whose changed digits roll, keyed on the formatted text. */
export function Count({
  value,
  format = (n) => n.toLocaleString("en-US"),
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  return (
    <RollingText text={format(value)} value={value} className={className} />
  );
}

/**
 * Fades its content up from faint as it mounts, never on the first paint.
 * Keyed by its parent, so new content that can't roll comes in this way.
 */
export function FadeIn({
  fades,
  className,
  children,
}: {
  fades: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.span
      className={className}
      initial={fades && !reducedMotion ? { opacity: 0.3 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.span>
  );
}

// ---------------------------------------------------------------- the roll

type GlyphState = { y: number; scale: number; opacity: number; blur: number };
/**
 * `x` is the character's left edge in the box, in px; `done` settles once its
 * last motion has. `placed` once `x` holds a measured place, `motion` the
 * role whose motion it last started, `gone` once it has finished leaving, and
 * `shape` the measured widths of the unseen neighbour before it and its own.
 */
type GlyphValues = Record<keyof GlyphState | "x", MotionValue<number>> & {
  done?: Promise<unknown>;
  placed?: boolean;
  motion?: "arrive" | "leave";
  gone?: boolean;
  shape?: { pre: number; own: number };
};
const AT_REST: GlyphState = { y: 0, scale: 1, opacity: 1, blur: 0 };
const arriving = (direction: 1 | -1): GlyphState => ({
  y: direction * ROLL.arrive.y,
  scale: ROLL.arrive.scale,
  opacity: 0,
  blur: ROLL.arrive.blur,
});

/**
 * One change. `glyphs` draw the new text in order, and `leaving` are still
 * fading out, from this change or an earlier one. `from` is the text last
 * drawn still and `was` a character's place in it. A leaving character keeps
 * the neighbours it had, `around`, to draw between.
 */
type Glyph = {
  key: string;
  char: string;
  role: "still" | "arrive" | "leave";
  delay: number;
  was?: number;
  around?: [string, string];
};
type Roll = {
  direction: 1 | -1;
  from: string;
  glyphs: Glyph[];
  leaving: Glyph[];
};
type Shown = { value: number | null; text: string; roll: Roll | null };

/** RollingText's characters. `value` sets which way a number rolls; null
 * reads it from the text. */
function RollingText({
  text,
  value,
  tick = false,
  className,
}: {
  text: string;
  value: number | null;
  tick?: boolean;
  className?: string;
}) {
  const reduceNow = useReduceMotionNow();
  const reduceAtOpen = useReducedMotion();
  const reducedMotion = reduceNow || !!reduceAtOpen;
  const [shown, setShown] = useState<Shown>({ value, text, roll: null });
  const values = useRef(new Map<string, GlyphValues>());
  if (text !== shown.text)
    setShown(
      nextRoll(
        shown,
        value,
        text,
        reducedMotion,
        (key) => values.current.get(key)?.gone === true,
      ),
    );
  else if (shown.roll && reducedMotion) setShown({ ...shown, roll: null });
  const roll = shown.roll;
  if (roll)
    for (const glyph of [...roll.glyphs, ...roll.leaving])
      glyphFor(
        values.current,
        glyph.key,
        glyph.role === "arrive" ? arriving(roll.direction) : AT_REST,
      );
  const box = useRef<HTMLSpanElement>(null);
  const from = useRef<HTMLSpanElement>(null);
  const to = useRef<HTMLSpanElement>(null);
  // 'auto' until a change's first write, so the box takes the old width.
  const width = useMotionValue<number | "auto">("auto");
  // The change on show, so the next carries on from where it is.
  const showing = useRef<Roll | null>(null);

  useLayoutEffect(() => {
    if (!roll) {
      showing.current = null;
      stopAll(values.current, width);
      values.current.clear();
      width.jump("auto");
      return;
    }
    let live = true;
    measureThenWrite(() => {
      const boxSpan = box.current;
      const toSpan = to.current;
      const fromSpan = from.current;
      if (!live || !boxSpan || !toSpan || !fromSpan) return () => undefined;
      // Rects shrink under an ancestor's scale, such as a pressed button's,
      // while styles don't, so the rect over the laid-out width divides it out.
      const bounds = boxSpan.getBoundingClientRect();
      const laidOut = Number.parseFloat(getComputedStyle(boxSpan).width);
      const scale =
        laidOut > 0 && bounds.width > 0 ? bounds.width / laidOut : 1;
      const places = offsets(toSpan, bounds.left, scale);
      const toWidth = toSpan.getBoundingClientRect().width / scale;
      const fresh = !showing.current;
      const before = fresh ? offsets(fromSpan, bounds.left, scale) : [];
      const fromWidth = fresh
        ? fromSpan.getBoundingClientRect().width / scale
        : pixels(width);
      return () => {
        if (!live) return;
        const spring = tick ? ROLL.tickWidth : SNAPPY;
        const drawn = new Set(
          [...roll.glyphs, ...roll.leaving].map((glyph) => glyph.key),
        );
        for (const [key, glyphValues] of values.current)
          if (!drawn.has(key)) {
            stopGlyph(glyphValues);
            values.current.delete(key);
          }
        // Punctuation draws between its unseen neighbours, so the font shapes
        // it as the plain text does (a colon between digits sits higher).
        const shape = (
          { key, char }: Glyph,
          lefts: number[],
          at: number,
          end: number,
        ) => {
          const glyphValues = values.current.get(key);
          const left = lefts[at];
          if (!glyphValues || left === undefined) return;
          glyphValues.shape = {
            pre: at > 0 && shapedByNeighbours(char) ? left - lefts[at - 1]! : 0,
            own: (lefts[at + 1] ?? end) - left,
          };
          const span = boxSpan.querySelector<HTMLElement>(
            `[data-glyph="${key}"]`,
          );
          if (span) {
            span.style.marginLeft = `${-glyphValues.shape.pre}px`;
            span.style.transformOrigin = `${glyphValues.shape.pre + glyphValues.shape.own / 2}px 50%`;
          }
        };
        roll.glyphs.forEach((glyph, index) =>
          shape(glyph, places, index, toWidth),
        );
        if (fresh)
          for (const glyph of roll.leaving)
            if (glyph.was !== undefined)
              shape(glyph, before, glyph.was, fromWidth);
        // Written to the element too, so this frame draws it there.
        const place = (key: string, left: number) => {
          const glyphValues = values.current.get(key);
          if (!glyphValues) return;
          glyphValues.x.jump(left);
          glyphValues.placed = true;
          const span = boxSpan.querySelector<HTMLElement>(
            `[data-glyph="${key}"]`,
          );
          if (span) span.style.left = `${left}px`;
        };
        // From still text, each character starts where the old text drew it.
        if (fresh) {
          for (const glyph of [...roll.glyphs, ...roll.leaving])
            if (glyph.was !== undefined)
              place(glyph.key, before[glyph.was] ?? 0);
          width.jump(fromWidth);
          boxSpan.style.width = `${fromWidth}px`;
        }
        showing.current = roll;
        const runs: AnimationPlaybackControls[] = [];
        const move = (motion: MotionValue<number>, target: number) => {
          if (Math.abs(motion.get() - target) > 0.01 || motion.isAnimating())
            runs.push(animate(motion, target, spring));
        };
        move(width as MotionValue<number>, toWidth);
        roll.glyphs.forEach((glyph, index) => {
          const glyphValues = values.current.get(glyph.key);
          if (!glyphValues) return;
          if (glyphValues.placed) move(glyphValues.x, places[index] ?? 0);
          else place(glyph.key, places[index] ?? 0);
        });
        // A character from a change that never reached the screen was never
        // seen, so it has nothing to leave from.
        for (const glyph of roll.leaving) {
          const glyphValues = values.current.get(glyph.key);
          if (glyphValues && !glyphValues.placed) {
            glyphValues.opacity.jump(0);
            glyphValues.placed = true;
          }
        }
        for (const glyph of [...roll.glyphs, ...roll.leaving]) {
          const glyphValues = values.current.get(glyph.key);
          if (
            !glyphValues ||
            glyph.role === "still" ||
            glyphValues.motion === glyph.role
          )
            continue;
          glyphValues.motion = glyph.role;
          const moving =
            glyph.role === "leave"
              ? leave(glyphValues, roll.direction, glyph.delay)
              : arrive(glyphValues, glyph.delay);
          glyphValues.done = Promise.all(moving.map((run) => run.finished));
          if (glyph.role === "leave")
            void moving[FADE]!.finished.then(() => {
              glyphValues.gone = true;
            });
        }
        void Promise.all([
          ...runs.map((run) => run.finished),
          ...[...values.current.values()].map((v) => v.done),
        ]).then(() => {
          if (live)
            setShown((now) =>
              now.roll === roll ? { ...now, roll: null } : now,
            );
        });
      };
    });
    return () => {
      live = false;
    };
    // `roll` is the whole change; the refs and motion values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll]);

  useEffect(() => {
    const all = values.current;
    return () => stopAll(all, width);
  }, [width]);

  // The text stays one element through every change, so a live region hears
  // the new text once. While a change runs it steps out of the flow into a
  // clipped pixel, still read and selectable, and the moving characters draw
  // where it was.
  return (
    <span className={className} style={roll ? ROLLING : AT_REST_BOX}>
      <span style={roll ? TEXT_BEHIND : TEXT_AT_REST}>{text}</span>
      {roll && (
        <RollingCharacters
          roll={roll}
          text={text}
          values={values.current}
          box={box}
          from={from}
          to={to}
          width={width}
        />
      )}
    </span>
  );
}

const AT_REST_BOX = { display: "inline-grid", clipPath: "inset(0)" } as const;
const ROLLING = { display: "inline-grid" } as const;
const TEXT_AT_REST = { gridArea: "1 / 1", whiteSpace: "pre" } as const;
const TEXT_BEHIND = {
  gridArea: "1 / 1",
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
} as const;

function glyphFor(
  values: Map<string, GlyphValues>,
  key: string,
  start: GlyphState,
): GlyphValues {
  let glyph = values.get(key);
  if (!glyph)
    values.set(
      key,
      (glyph = {
        x: motionValue(0),
        y: motionValue(start.y),
        scale: motionValue(start.scale),
        opacity: motionValue(start.opacity),
        blur: motionValue(start.blur),
      }),
    );
  return glyph;
}

/** leave() and arrive() start the opacity spring third. */
const FADE = 2;
function leave(values: GlyphValues, direction: 1 | -1, delay: number) {
  const { y, scale, blur, move, fade, blurring } = ROLL.leave;
  return [
    animate(values.y, -direction * y, { ...move, delay }),
    animate(values.scale, scale, { ...move, delay }),
    animate(values.opacity, 0, { ...fade, delay }),
    animate(values.blur, blur, { ...blurring, delay }),
  ];
}
function arrive(values: GlyphValues, delay: number) {
  const { move, grow, fade, sharpen } = ROLL.arrive;
  return [
    animate(values.y, 0, { ...move, delay }),
    animate(values.scale, 1, { ...grow, delay }),
    animate(values.opacity, 1, { ...fade, delay }),
    animate(values.blur, 0, { ...sharpen, delay }),
  ];
}
function stopGlyph(glyph: GlyphValues) {
  for (const value of [
    glyph.x,
    glyph.y,
    glyph.scale,
    glyph.opacity,
    glyph.blur,
  ])
    value.stop();
}
const pixels = (width: MotionValue<number | "auto">) => {
  const now = width.get();
  return typeof now === "number" ? now : 0;
};
function stopAll(
  values: Map<string, GlyphValues>,
  width: MotionValue<number | "auto">,
) {
  width.stop();
  for (const glyph of values.values()) stopGlyph(glyph);
}

/** Framer Motion's useReducedMotion reads the setting once; this follows it. */
const reduceMotionQuery =
  typeof window === "undefined"
    ? undefined
    : window.matchMedia?.("(prefers-reduced-motion: reduce)");
const followReduceMotion = (notify: () => void) => {
  reduceMotionQuery?.addEventListener?.("change", notify);
  return () => reduceMotionQuery?.removeEventListener?.("change", notify);
};
const useReduceMotionNow = () =>
  useSyncExternalStore(
    followReduceMotion,
    () => reduceMotionQuery?.matches ?? false,
    () => false,
  );

/**
 * Every roll that changes in one render measures, and only then do they all
 * write, in a microtask before the frame paints, so one layout serves them.
 */
const measuring: (() => () => void)[] = [];
function measureThenWrite(read: () => () => void) {
  if (!measuring.length)
    queueMicrotask(() => {
      for (const write of measuring.splice(0).map((job) => job())) write();
    });
  measuring.push(read);
}

/** A text's characters as a reader sees them, so an emoji stays whole. */
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const graphemes = (text: string): string[] =>
  segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : Array.from(text);

/** Each character's left edge in a span of plain text, from the browser's
 * own layout of it. Empty where the browser can't measure a range (jsdom). */
function offsets(span: HTMLElement, origin: number, scale: number): number[] {
  const node = span.firstChild;
  if (!(node instanceof Text)) return [];
  const range = document.createRange();
  if (typeof range.getBoundingClientRect !== "function") return [];
  const lefts: number[] = [];
  let at = 0;
  for (const char of graphemes(node.data)) {
    range.setStart(node, at);
    range.setEnd(node, at + char.length);
    lefts.push((range.getBoundingClientRect().left - origin) / scale);
    at += char.length;
  }
  return lefts;
}

/** A number, with the separators inside it: 1,000 or 4.5. A time is a number
 * per part, so 9:59 to 10:00 keeps its colon still. */
const DIGITS = /\d+(?:[.,]\d+)*/g;
const DIGITS_PART = /(\d+(?:[.,]\d+)*)/;
const wordsKey = (text: string) => text.replace(DIGITS, "\u0000");
const sameWords = (from: string, to: string) => wordsKey(from) === wordsKey(to);

/** Up when the first number that differs grew, down when it shrank. */
function textDirection(from: string, to: string): 1 | -1 {
  const before = from.match(DIGITS) ?? [];
  const after = to.match(DIGITS) ?? [];
  const amount = (run: string) => Number(run.replace(/,/g, ""));
  for (let i = 0; i < Math.min(before.length, after.length); i++)
    if (before[i] !== after[i])
      return amount(after[i]!) < amount(before[i]!) ? -1 : 1;
  return 1;
}

/**
 * The characters both texts share at the start and end stay put, and the
 * ones between pair up from the left, as SwiftUI pairs them. When both texts
 * say the same words around their numbers, each number pairs on its own, so
 * "9 of 12" to "10 of 13" moves only digits. When the words change, every
 * character between the shared start and end turns.
 */
let rollCount = 0;
function nextRoll(
  shown: Shown,
  value: number | null,
  text: string,
  reducedMotion: boolean,
  gone: (key: string) => boolean,
): Shown {
  if (reducedMotion) return { value, text, roll: null };
  const id = ++rollCount;
  const current: Glyph[] =
    shown.roll?.glyphs ??
    graphemes(shown.text).map((char, was) => ({
      key: `${id}s${was}`,
      char,
      role: "still",
      delay: 0,
      was,
    }));
  const before = current.map((glyph) => glyph.char).join("");
  const pairs = pairUp(
    current.map((glyph) => glyph.char),
    graphemes(text),
  );
  const turns = ([at, char, always]: Pair) =>
    at === undefined || always === true || current[at]!.char !== char;
  const gap = ROLL.stagger(pairs.filter(turns).length);
  const glyphs: Glyph[] = [];
  const leaving = (shown.roll?.leaving ?? []).filter(
    (glyph) => !gone(glyph.key),
  );
  let order = 0;
  for (const [i, pair] of pairs.entries()) {
    const [at, char] = pair;
    const old = at === undefined ? undefined : current[at];
    if (old && !turns(pair)) {
      glyphs.push(old);
      continue;
    }
    const delay = order++ * gap;
    if (old)
      leaving.push({
        ...old,
        role: "leave",
        delay,
        around: [current[at! - 1]?.char ?? "", current[at! + 1]?.char ?? ""],
      });
    if (char !== undefined)
      glyphs.push({ key: `${id}a${i}`, char, role: "arrive", delay });
  }
  // New words roll up whatever their numbers do, as time goes up.
  const direction =
    value !== null && shown.value !== null
      ? value < shown.value
        ? -1
        : 1
      : sameWords(before, text)
        ? textDirection(before, text)
        : 1;
  return {
    value,
    text,
    roll: {
      direction,
      from: shown.roll?.from ?? shown.text,
      glyphs,
      leaving,
    },
  };
}

/** `always` turns the pair even when its characters match. */
type Pair = [at: number | undefined, char: string | undefined, always?: true];
function pairUp(before: string[], after: string[]): Pair[] {
  const from = before.join("");
  const to = after.join("");
  if (!sameWords(from, to)) return pairRun(before, after, 0, true);
  const toParts = to.split(DIGITS_PART);
  const pairs: Pair[] = [];
  let at = 0;
  let arrived = 0;
  for (const [i, part] of from.split(DIGITS_PART).entries()) {
    const chars = graphemes(part);
    const next = graphemes(toParts[i] ?? "");
    pairs.push(...pairRun(chars, next, at));
    at += chars.length;
    arrived += next.length;
  }
  // A combining mark split from its digit no longer adds up: pair whole.
  return at === before.length && arrived === after.length
    ? pairs
    : pairRun(before, after, 0, true);
}
function pairRun(
  before: string[],
  after: string[],
  offset: number,
  always = false,
): Pair[] {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  const pairs: Pair[] = [];
  for (let i = 0; i < start; i++) pairs.push([offset + i, after[i]]);
  for (let i = start; i < Math.max(before.length, after.length) - end; i++) {
    const at = i < before.length - end ? offset + i : undefined;
    const char = i < after.length - end ? after[i] : undefined;
    pairs.push(always ? [at, char, true] : [at, char]);
  }
  for (let i = end; i > 0; i--)
    pairs.push([offset + before.length - i, after[after.length - i]]);
  return pairs;
}

/**
 * The characters while a change runs, hidden from screen readers and the
 * pointer: a box whose width springs from the old text's to the new one's,
 * and every character drawn on its own over it. Until the first write the
 * old text, unseen in its flow, gives the box its width and baseline.
 */
const UNSEEN = { visibility: "hidden" } as const;
function RollingCharacters({
  roll,
  text,
  values,
  box,
  from,
  to,
  width,
}: {
  roll: Roll;
  text: string;
  values: Map<string, GlyphValues>;
  box: React.Ref<HTMLSpanElement>;
  from: React.Ref<HTMLSpanElement>;
  to: React.Ref<HTMLSpanElement>;
  width: MotionValue<number | "auto">;
}) {
  return (
    <span
      style={{ gridArea: "1 / 1", pointerEvents: "none", userSelect: "none" }}
      aria-hidden="true"
      data-rolling=""
    >
      <motion.span
        ref={box}
        style={{
          display: "inline-block",
          position: "relative",
          whiteSpace: "pre",
          textAlign: "left",
          width,
        }}
      >
        <span ref={from} style={UNSEEN}>
          {roll.from || "​"}
        </span>
        <span
          ref={to}
          style={{ ...UNSEEN, position: "absolute", left: 0, top: 0 }}
        >
          {text}
        </span>
        {roll.glyphs.map((glyph, index) => (
          <RollingGlyph
            key={glyph.key}
            glyph={glyph}
            values={values}
            around={[
              roll.glyphs[index - 1]?.char ?? "",
              roll.glyphs[index + 1]?.char ?? "",
            ]}
          />
        ))}
        {roll.leaving.map((glyph) => (
          <RollingGlyph
            key={glyph.key}
            glyph={glyph}
            values={values}
            around={glyph.around ?? ["", ""]}
          />
        ))}
      </motion.span>
    </span>
  );
}

const NEIGHBOUR = { color: "transparent" } as const;
/** Only punctuation and symbols, such as a clock's colon or a dash between
 * numbers, draw between their neighbours. */
const shapedByNeighbours = (char: string) => !/^[\p{L}\p{N}\s]+$/u.test(char);

function RollingGlyph({
  glyph,
  values: all,
  around,
}: {
  glyph: Glyph;
  values: Map<string, GlyphValues>;
  around: [string, string];
}) {
  const values = all.get(glyph.key)!;
  // Settled, the character draws with no transform or filter.
  const y = useTransform(values.y, (offset) =>
    Math.abs(offset) < 0.0005 ? 0 : `${offset}em`,
  );
  const filter = useTransform(values.blur, (blur) =>
    blur > 0.001 ? `blur(${blur}em)` : "none",
  );
  const shape = values.shape;
  const neighbours = shapedByNeighbours(glyph.char);
  return (
    <motion.span
      data-glyph={glyph.key}
      style={{
        position: "absolute",
        top: 0,
        left: values.x,
        marginLeft: shape ? -shape.pre : undefined,
        transformOrigin: shape
          ? `${shape.pre + shape.own / 2}px 50%`
          : undefined,
        y,
        scale: values.scale,
        opacity: values.opacity,
        filter,
      }}
    >
      <span style={NEIGHBOUR}>{neighbours ? around[0] : ""}</span>
      <span>{glyph.char}</span>
      <span style={NEIGHBOUR}>{neighbours ? around[1] : ""}</span>
    </motion.span>
  );
}
