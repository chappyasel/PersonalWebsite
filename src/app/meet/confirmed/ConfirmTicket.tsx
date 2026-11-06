"use client";

import { DateText } from "../DateText";
import { PressButton } from "../PressButton";
import { tick as haptic } from "../haptics";
import styles from "../meet.module.css";
import {
  ArrowUpRightIcon,
  MapPinIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import portrait from "public/images/about/profile.jpg";
import { useId, useLayoutEffect, useRef } from "react";

import { callLabel } from "~/lib/booking/page";
import { ordinalSuffix } from "~/lib/booking/zones";
import { cn } from "~/lib/utils";

import { BackSkyline, type BackSkylineHandle } from "./BackSkyline";
import { type VariantProps, dateParts } from "./Confirmation";
import c from "./confirmed.module.css";
import {
  GLINTS,
  type Point,
  between,
  blues,
  canAnimate,
  centreOf,
  curl,
  offerTicketRing,
  overlay,
  palette,
  sampleTicket,
  sprite,
  trackPointer,
} from "./dust";

/*
 * Pass. The Book button bursts into a puff of blue dust, which swirls and
 * springs into a line: the slot. The ticket prints up out of it in three
 * quick feeds, dust puffing from the slot as it goes, and some of the
 * dust that made the slot peels away and wraps round the ticket as a
 * ring, like a planet's. The ticket lifts free and a "Booked" stamp lands
 * on it with a thunk, a ring of dust, and a jolt to the ring.
 *
 * Then it's a thing to hold. It tilts toward the pointer on a spring (or
 * with the phone itself, once tapped), its layers sliding a little apart
 * as it does. A glare slides over it, and its blue foil, printed with a
 * fine security pattern, is full of dust that glints as the light
 * catches it. Drag it sideways, or tap it, and it flips over: on its back
 * is San Francisco at night under a sky of the same dust, and a tap there
 * goes to the rest of the site.
 *
 * The ring is truly round it: tilted with the ticket, passing behind it
 * and in front, spinning up and swelling as the pointer comes near.
 * Hover "Book another time" and the whole ring glides down, still round
 * and still in depth, to circle the button instead. Tap anywhere off the
 * ticket and the dust near the tap is drawn in for a moment, then thrown
 * out and left to fall, before it finds its way back to the ring.
 *
 * Every grain is a shade of the one blue. The timing here matches
 * confirmed.module.css's delays on the ticket.
 */

const SLOT_AT = 380;
const PRINT_AT = 760;
const PRINT_MS = 1050;
const STAMP_AT = 2150;
const PUFF = 680;
const RING = 420;
const FOIL = 340;
const STARS = 230;
/** The ticket's own perspective, as its CSS transform has it. */
const PERSPECTIVE = 900;
/** The card's thickness, in pixels, and the slices that make its edge:
 * strictly between the faces, never level with one, or Safari can't tell
 * which is in front and the edge shows through the face. */
const THICK = 5;
const EDGE = Array.from(
  { length: 8 },
  (_, i) =>
    Math.round((-THICK / 2 + 0.4 + ((THICK - 0.8) * i) / 7) * 100) / 100,
);
/** A tap's pull, then its burst: how long it pulls, how far it reaches. */
const PULL_MS = 170;
const BLAST = 230;
/** A drag this far sideways turns the ticket all the way over. */
const DRAG_PER_TURN = 420;
/** How far a drag carries the ticket: with the finger at first, then
 * less and less, never past LEASH. */
const LEASH = 46;
const leash = (d: number) =>
  Math.sign(d) * LEASH * (1 - Math.exp(-Math.abs(d) / (LEASH * 2.2)));

type Grain = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where on the slot it springs to. */
  sx: number;
  start: number;
  size: number;
  peak: number;
  tint: number;
  phase: number;
  /** How tightly it follows the ring: some lag, some lead. */
  follow: number;
  /** Thrown by a tap: falling until then, then easing home. */
  free: number;
  back: number;
  /** Whether it was last drawn in front of the ticket, and the side a
   * tap's throw keeps it on till it's home: a grain behind the ticket
   * stays behind, never jumping over it. */
  ahead?: boolean;
  /** Form dust holds the form's shape until then, in ms; and it's at full
   * strength from the start, since it's the form itself. */
  release: number;
  seeded: boolean;
  /** Ring grains only: when it leaves the slot, and its place on the ring. */
  ring?: { at: number; a: number; r: number; w: number; dy: number };
};

type Blast = { x: number; y: number; at: number; popped: boolean };

/** The seal's notched rim: a ring of small scallops, each bulging out. */
const SEAL = (() => {
  const n = 30;
  const r = 44.5;
  const bump = 2 * r * Math.sin(Math.PI / n) * 0.56;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = (50 + r * Math.cos(a)).toFixed(2);
    const y = (50 + r * Math.sin(a)).toFixed(2);
    d +=
      i === 0
        ? `M${x} ${y}`
        : `A${bump.toFixed(2)} ${bump.toFixed(2)} 0 0 1 ${x} ${y}`;
  }
  return `${d}Z`;
})();

/** The Booked stamp, inked: one filter roughens every edge a little and
 * leaves a few dry spots where the rubber didn't take. */
function Stamp() {
  const ink = `ink${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 100 100">
      <defs>
        <filter id={ink} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="4"
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale="1.4"
            xChannelSelector="R"
            yChannelSelector="G"
            result="rough"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.22"
            numOctaves="3"
            seed="11"
            result="blots"
          />
          <feColorMatrix
            in="blots"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.2 0 0 0 3.4"
            result="dry"
          />
          <feComposite in="rough" in2="dry" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${ink})`} fill="none" stroke="currentColor">
        <path d={SEAL} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="50" cy="50" r="37.5" strokeWidth="1.3" />
        <path
          d="M6.5 12.5 10.2 16 17.5 8.5"
          transform="translate(30.8 21) scale(1.6)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="50.7"
          y="65.5"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
        >
          BOOKED
        </text>
      </g>
    </svg>
  );
}

export function ConfirmTicket({
  booked,
  email,
  host,
  slot,
  call,
  headingRef,
  onAnother,
  bookerZone,
  from,
}: VariantProps) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const slotLine = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const foil = useRef<HTMLCanvasElement>(null);
  const sky = useRef<HTMLCanvasElement>(null);
  const city = useRef<BackSkylineHandle>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const perf = useRef<HTMLDivElement>(null);
  const again = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);
  const restamp = useRef(0);
  const blasts = useRef<Blast[]>([]);
  const gyro = useRef<{ rx: number; ry: number; at: number } | null>(null);
  // The flip: where it's headed, and the drag turning it by hand.
  const flip = useRef({ angle: 0, v: 0, target: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    from: number;
    moved: boolean;
    last: number;
    at: number;
    v: number;
  } | null>(null);
  const dragged = useRef(false);
  // A drag held as the window loses focus (a tab switched, an app switched
  // to) never hears its release: it lets go then, and on any release at
  // all, wherever it lands.
  const letGo = useRef<(tap?: boolean) => void>(() => undefined);
  useLayoutEffect(() => {
    const drop = () => letGo.current(false);
    const hidden = () => document.hidden && drop();
    window.addEventListener("blur", drop);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", drop);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  // A drag also carries the ticket a little way with it, on a leash, and
  // it springs home when let go.
  const carry = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
  const { weekday, month, day } = dateParts(booked.start, bookerZone);
  const CallIcon = call.kind === "place" ? MapPinIcon : VideoCameraIcon;

  // The notches sit on the perforation, wherever the text puts it.
  useLayoutEffect(() => {
    const card = ticket.current;
    const line = perf.current;
    if (!card || !line) return;
    const place = () =>
      card.style.setProperty("--perf", `${line.offsetTop + 1}px`);
    place();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(place);
    watch.observe(card);
    return () => watch.disconnect();
  }, []);

  // Before the first paint, so the form's dust is on the screen in the
  // same frame the form leaves it.
  useLayoutEffect(() => {
    const box = stage.current;
    const card = ticket.current;
    const mark = stamp.current;
    const line = slotLine.current;
    const glitter = foil.current;
    const night = sky.current;
    const under = backdrop.current;
    if (
      !canAnimate() ||
      !box ||
      !card ||
      !mark ||
      !line ||
      !glitter ||
      !night ||
      !under
    )
      return;
    const fctx = glitter.getContext("2d");
    const sctx = night.getContext("2d");
    const bctx = under.getContext("2d");
    const layer = overlay();
    if (!fctx || !sctx || !bctx || !layer) return;
    const { ctx } = layer;
    const { accent, dark } = palette();
    const { sprites: tints, pick } = blues(accent, dark);
    const nightBlues = blues(accent, true);
    const glints = GLINTS.map((rgb) => sprite(rgb, true));
    const pointer = trackPointer();
    const dpr = Math.min(2, devicePixelRatio || 1);

    // The canvases on the ticket's faces and behind everything.
    let fw = 0;
    let fh = 0;
    let skyW = 0;
    let skyH = 0;
    let underW = 0;
    let underH = 0;
    const size = () => {
      fw = glitter.offsetWidth;
      fh = glitter.offsetHeight;
      glitter.width = fw * dpr;
      glitter.height = fh * dpr;
      skyW = night.offsetWidth;
      skyH = night.offsetHeight;
      night.width = skyW * dpr;
      night.height = skyH * dpr;
      underW = under.offsetWidth;
      underH = under.offsetHeight;
      under.width = underW * dpr;
      under.height = underH * dpr;
    };
    size();
    window.addEventListener("resize", size);

    // The foil's dust, each grain a tiny facet facing its own way,
    // glinting when the light lines up with it; the back's, stars.
    const facet = () => {
      const a = Math.random() * Math.PI * 2;
      return {
        x: Math.random(),
        y: Math.random(),
        nx: Math.cos(a),
        ny: Math.sin(a),
        size: between(1.2, 3.4),
        hue: Math.floor(Math.random() * GLINTS.length),
        tint: pick(),
        phase: Math.random() * 7,
      };
    };
    const facets = Array.from({ length: FOIL }, facet);
    // The back's stars at their own depths: most far off, tiny, dim and
    // all but still; a few near, bigger and brighter, sliding farther as
    // the ticket tilts and drifting faster across. Each twinkles at its own
    // rate, and the near ones now and then flare.
    const stars = Array.from({ length: STARS }, () => {
      const depth = Math.random() ** 1.8;
      return {
        ...facet(),
        y: Math.random() ** 1.25 * 0.8,
        depth,
        size: 0.55 + depth * 3.3,
        glow: 0.3 + depth * 0.65,
        rate: between(0.7, 3.4),
        swing: between(0.15, 0.5),
        white: Math.random() < 0.35,
        flare: between(1.5, 14),
      };
    });
    // Now and then a shooting star, the daylight sky's own: a short bright
    // streak, steeply down across the top of the back.
    let meteor: {
      x: number;
      y: number;
      a: number;
      at: number;
      dist: number;
    } | null = null;
    let nextMeteor = between(1.2, 3);

    // The puff, from the Book button, or low on the screen without one.
    const origin: Point = from ?? {
      x: scrollX + innerWidth / 2,
      y: scrollY + innerHeight * 0.85,
    };
    // Or, booked just now, the form itself: the ring that circled its Book
    // button and the dust of the form, where they were on the screen, all
    // in a shuffled order so each part of the form feeds the slot and the
    // ring alike.
    const seeds = [...(from?.seeds ?? [])];
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeds[i], seeds[j]] = [seeds[j]!, seeds[i]!];
    }
    const count = seeds.length ? Math.max(seeds.length, RING) : PUFF;
    // It wraps on in order round the ring as the ticket feeds.
    const ringPlace = (i: number) => ({
      a: (i / RING) * Math.PI * 2 + between(-0.08, 0.08),
      at: PRINT_AT + (i / RING) * PRINT_MS * 0.85 + between(0, 60),
      r: Math.random() < 0.82 ? between(1, 1.1) : between(1.1, 1.32),
      w: between(0.32, 0.5),
      dy: between(-5, 5),
    });
    let nextPrune = 1200;
    const grains: Grain[] = Array.from({ length: count }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const speed = between(120, 760);
      const sx = Math.random();
      const seed = seeds.length ? seeds[i % seeds.length] : undefined;
      const start = SLOT_AT + sx * 180 + between(0, 80);
      if (seed) {
        // Let go, it drifts up and away from the button before it's drawn
        // into the slot; the ring's grains go on as they were going.
        const x = seed.x + scrollX + (i < seeds.length ? 0 : between(-3, 3));
        const y = seed.y + scrollY + (i < seeds.length ? 0 : between(-3, 3));
        const away = Math.atan2(y - origin.y, x - origin.x);
        const loose = seed.vx === 0 && seed.vy === 0;
        return {
          x,
          y,
          vx: loose
            ? Math.cos(away) * between(40, 160) + between(-50, 50)
            : seed.vx,
          vy: loose
            ? Math.sin(away) * between(40, 160) - between(40, 170)
            : seed.vy,
          sx,
          start: Math.max(start, seed.delay + between(150, 280)),
          release: seed.delay,
          seeded: true,
          size: seed.size,
          peak: between(0.75, 1),
          tint: seed.tint ?? pick(),
          phase: Math.random() * 7,
          follow: between(0.65, 1.35),
          free: 0,
          back: 1,
          ...(i < RING ? { ring: ringPlace(i) } : {}),
        };
      }
      return {
        x: origin.x + between(-30, 30),
        y: origin.y + between(-10, 10),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 220,
        sx,
        start,
        release: 0,
        seeded: false,
        size: between(1.8, 3.4),
        peak: between(0.6, 1),
        tint: pick(),
        phase: Math.random() * 7,
        follow: between(0.65, 1.35),
        free: 0,
        back: 1,
        ...(i < RING ? { ring: ringPlace(i) } : {}),
      };
    });

    // For "Book another time": the ring as it is, on the screen.
    offerTicketRing(() =>
      grains
        .filter((g) => g.ring && performance.now() - began > g.ring.at)
        .map((g) => ({
          x: g.x - scrollX,
          y: g.y - scrollY,
          vx: g.vx,
          vy: g.vy,
          size: g.size,
          tint: g.tint,
          delay: 0,
        })),
    );

    type Mote = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      age: number;
      size: number;
      drag: number;
      fall: number;
      tint: number;
    };
    const motes: Mote[] = [];
    const puff = (
      x: number,
      y: number,
      n: number,
      speed: [number, number],
      spread: [number, number],
      fall: number,
      drag = 3,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = between(spread[0], spread[1]);
        const s = between(speed[0], speed[1]);
        motes.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: between(500, 1100),
          age: 0,
          size: between(1.6, 3.4),
          drag,
          fall,
          tint: pick(),
        });
      }
    };
    const kick = (cx: number, cy: number) => {
      for (const g of grains) {
        if (!g.ring) continue;
        const a = Math.atan2(g.y - cy, g.x - cx) + between(-0.4, 0.4);
        const s = between(300, 900);
        g.vx += Math.cos(a) * s;
        g.vy += Math.sin(a) * s;
      }
    };

    // Tilting the phone tilts the ticket, once a tap has allowed it: the
    // side tipped toward you comes toward you.
    let level: { beta: number; gamma: number } | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      level ??= { beta: e.beta, gamma: e.gamma };
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      gyro.current = {
        rx: clamp((e.beta - level.beta) * 0.6, 12),
        ry: clamp((level.gamma - e.gamma) * 0.7, 16),
        at: performance.now(),
      };
    };
    window.addEventListener("deviceorientation", onTilt);

    let rx = 0;
    let ry = 0;
    let vrx = 0;
    let vry = 0;
    let excited = 0;
    let spin = 0;
    let toButton = 0;
    let toButtonV = 0;
    let side: "front" | "back" = "front";
    let stamped = false;
    let seen = restamp.current;
    const began = performance.now();
    let last = began;
    let raf = 0;

    const frame = (now: number) => {
      const ms = now - began;
      const t = ms / 1000;
      const dt = Math.max(0, Math.min(1 / 30, (now - last) / 1000));
      last = now;
      const p = pointer.p;

      // Carried by a drag, or springing back with a little bounce.
      const cr = carry.current;
      cr.vx += (210 * (cr.tx - cr.x) - 17 * cr.vx) * dt;
      cr.vy += (210 * (cr.ty - cr.y) - 17 * cr.vy) * dt;
      cr.x += cr.vx * dt;
      cr.y += cr.vy * dt;
      card.style.translate =
        Math.abs(cr.x) + Math.abs(cr.y) > 0.05
          ? `${cr.x.toFixed(2)}px ${cr.y.toFixed(2)}px`
          : "";

      // The ticket's centre and size, untouched by its tilt; the ring
      // goes where it's carried.
      const stageBox = box.getBoundingClientRect();
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const cx = stageBox.left + scrollX + w / 2 + cr.x;
      const cy = stageBox.top + scrollY + h / 2 + cr.y;
      const slotBox = line.getBoundingClientRect();

      // Dust from the slot while the ticket feeds through it.
      if (ms > PRINT_AT && ms < PRINT_AT + PRINT_MS)
        for (let i = 0; i < 3; i++)
          puff(
            slotBox.left + scrollX + Math.random() * slotBox.width,
            slotBox.top + scrollY + slotBox.height / 2,
            1,
            [60, 260],
            [Math.PI * 1.1, Math.PI * 1.9],
            320,
          );
      if (!stamped && ms > STAMP_AT + 160) {
        stamped = true;
        const at = centreOf(mark);
        puff(at.x, at.y, 90, [180, 620], [0, Math.PI * 2], 0, 5);
        kick(at.x, at.y);
        excited = 1;
      }
      if (restamp.current !== seen) {
        seen = restamp.current;
        const at = centreOf(mark);
        setTimeout(() => {
          puff(at.x, at.y, 70, [160, 560], [0, Math.PI * 2], 0, 5);
          kick(at.x, at.y);
          excited = 1;
        }, 140);
      }

      // The tilt: toward the pointer when it's around, with the phone
      // when it's tilted, a slow float otherwise. Springy, so a flick
      // wobbles.
      const tilt = gyro.current;
      const recent = p.inside && now - p.at < 2600 && ms > STAMP_AT;
      let tx: number;
      let ty: number;
      if (tilt && now - tilt.at < 500 && !recent) {
        tx = tilt.rx;
        ty = tilt.ry;
      } else if (recent) {
        const nx = (p.x - cx) / (innerWidth / 2);
        const ny = (p.y - cy) / (innerHeight / 2);
        tx = -Math.max(-1, Math.min(1, ny)) * 12;
        ty = Math.max(-1, Math.min(1, nx)) * 16;
      } else {
        tx = Math.sin(t * 0.9) * 3.5;
        ty = Math.sin(t * 0.6 + 1) * 6;
      }
      vrx += (90 * (tx - rx) - 11 * vrx) * dt;
      vry += (90 * (ty - ry) - 11 * vry) * dt;
      rx += vrx * dt;
      ry += vry * dt;

      // The flip: by hand while dragged, else sprung to its side, with a
      // little overshoot as it lands.
      const f = flip.current;
      if (!drag.current?.moved) {
        f.v += (130 * (f.target - f.angle) - 15 * f.v) * dt;
        f.angle += f.v * dt;
      }
      const turned = Math.abs(Math.round(f.angle / 180)) % 2 === 1;
      const nowSide = turned ? "back" : "front";
      if (nowSide !== side) {
        side = nowSide;
        card.dataset.side = side;
      }
      card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--ry", `${(ry + f.angle).toFixed(2)}deg`);
      card.style.setProperty("--tx", (ry / 16).toFixed(3));
      card.style.setProperty("--ty", (rx / 12).toFixed(3));
      // Where the light hits: opposite the tilt.
      card.style.setProperty("--gx", `${(50 + (ry / 32) * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(50 - (rx / 24) * 100).toFixed(1)}%`);

      // The faces' dust: the foil's glints, the back's stars.
      const light = Math.hypot(ry, rx) / 12 + 0.15;
      const la = Math.atan2(-rx, ry);
      const lnx = Math.cos(la);
      const lny = Math.sin(la);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, fw, fh);
      for (const g of facets) {
        const facing = Math.max(0, g.nx * lnx + g.ny * lny);
        const glint = facing ** 10 * Math.min(1, light);
        const a = Math.min(
          1,
          0.12 + 0.08 * Math.sin(t * 2 + g.phase) + glint * 1.4,
        );
        if (a < 0.02) continue;
        fctx.globalAlpha = a;
        const s = g.size * (1 + glint * 1.6);
        fctx.drawImage(
          glint > 0.2 ? glints[g.hue]! : glints[0]!,
          g.x * fw - s,
          g.y * fh - s,
          s * 2,
          s * 2,
        );
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, skyW, skyH);
      // Depth: the tilt slides near stars farther than far ones (the
      // canvas overhangs the back to have room), and the sky drifts.
      const slideX = -(ry / 16);
      const slideY = -(rx / 12);
      for (const g of stars) {
        const facing = Math.max(0, g.nx * lnx + g.ny * lny);
        // A glint brightens a star more than it grows it, so no star swells
        // into a second moon.
        const glint = facing ** 8 * Math.min(1, light);
        if (t > g.flare + 0.7)
          g.flare = t + between(4, 14) / Math.max(0.3, g.depth);
        const flaring =
          g.depth > 0.5 && t > g.flare
            ? Math.sin(((t - g.flare) / 0.7) * Math.PI)
            : 0;
        const twinkle =
          1 - g.swing * (0.5 + 0.5 * Math.sin(t * g.rate + g.phase));
        const a = Math.min(1, g.glow * twinkle + glint * 0.5 + flaring * 0.6);
        if (a < 0.02) continue;
        const x =
          ((((g.x + t * 0.0035 * (0.15 + g.depth)) % 1) + 1) % 1) * skyW +
          slideX * (4 + 24 * g.depth);
        const y = g.y * skyH + slideY * (3 + 15 * g.depth);
        const s = g.size * (1 + glint * 0.3 + flaring * 0.5);
        sctx.globalAlpha = a;
        sctx.drawImage(
          g.white ? glints[0]! : nightBlues.sprites[g.tint]!,
          x - s,
          y - s,
          s * 2,
          s * 2,
        );
        if (flaring > 0.05) {
          // A flare's four points.
          const r = (4 + g.depth * 8) * flaring;
          sctx.globalAlpha = flaring * 0.7;
          sctx.strokeStyle = "rgb(225 236 255)";
          sctx.lineWidth = 0.8;
          sctx.beginPath();
          sctx.moveTo(x - r, y);
          sctx.lineTo(x + r, y);
          sctx.moveTo(x, y - r);
          sctx.lineTo(x, y + r);
          sctx.stroke();
        }
      }
      if (!meteor && t > nextMeteor && side === "back") {
        const right = Math.random() < 0.6;
        meteor = {
          x: skyW * (right ? between(0.1, 0.55) : between(0.45, 0.9)),
          y: skyH * between(0.04, 0.3),
          a: ((right ? between(24, 40) : between(140, 156)) * Math.PI) / 180,
          at: t,
          dist: between(140, 220),
        };
      }
      if (meteor) {
        const u = (t - meteor.at) / 0.8;
        if (u >= 1) {
          meteor = null;
          nextMeteor = t + between(3, 8);
        } else {
          const ease = 1 - (1 - u) ** 2;
          const hx = meteor.x + Math.cos(meteor.a) * meteor.dist * ease;
          const hy = meteor.y + Math.sin(meteor.a) * meteor.dist * ease;
          const tail = 46 + 30 * Math.sin(u * Math.PI);
          const tx = hx - Math.cos(meteor.a) * tail;
          const ty = hy - Math.sin(meteor.a) * tail;
          const a = Math.min(1, u / 0.1) * (1 - u) ** 0.7;
          const streak = sctx.createLinearGradient(tx, ty, hx, hy);
          streak.addColorStop(0, "rgba(255,255,255,0)");
          streak.addColorStop(1, `rgba(255,255,255,${(0.95 * a).toFixed(3)})`);
          sctx.globalAlpha = 1;
          sctx.strokeStyle = streak;
          sctx.lineWidth = 1.6;
          sctx.lineCap = "round";
          sctx.beginPath();
          sctx.moveTo(tx, ty);
          sctx.lineTo(hx, hy);
          sctx.stroke();
          sctx.globalAlpha = a;
          sctx.drawImage(glints[0]!, hx - 4, hy - 4, 8, 8);
        }
      }

      layer.clear();
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, underW, underH);
      const underBox = under.getBoundingClientRect();
      const ux = underBox.left + scrollX;
      const uy = underBox.top + scrollY;
      // The card's footprint on the page: no grain changes sides inside it.
      const cardBox = card.getBoundingClientRect();
      const cardL = cardBox.left + scrollX - 8;
      const cardR = cardBox.right + scrollX + 8;
      const cardT = cardBox.top + scrollY - 8;
      const cardB = cardBox.bottom + scrollY + 8;

      // The ring glides down to the button while it's hovered, the whole
      // of it, round and in depth the way there.
      const button = again.current?.getBoundingClientRect();
      const wantButton = hovering.current && button ? 1 : 0;
      toButtonV += (34 * (wantButton - toButton) - 9.5 * toButtonV) * dt;
      toButton += toButtonV * dt;
      const k = Math.max(0, Math.min(1, toButton));
      const bx = button ? button.left + scrollX + button.width / 2 : cx;
      const by = button ? button.top + scrollY + button.height / 2 : cy;
      const ringX = cx + (bx - cx) * toButton;
      const ringY = cy + (by - cy) * toButton;
      const stir = Math.min(1, Math.abs(toButtonV)) * 30;

      // The ring's excitement and spin.
      const near = Math.hypot(p.x - ringX, p.y - ringY);
      const reach = w / 2 + (button ? button.width / 2 - w / 2 : 0) * k;
      const want = Math.max(0, Math.min(1, 1 - (near - reach) / 260));
      excited += (want - excited) * Math.min(1, dt * 3);
      spin += dt * (1 + excited * 2.6 + k * 0.8);

      // The ring in the ticket's own space: round it, tipped toward the
      // eye, turned a little, then through the ticket's tilt and
      // perspective onto the page. Round the button, smaller, level.
      const round = Math.min((w / 2) * 1.28, innerWidth / 2 - 6);
      const small = button ? button.width / 2 + 24 : round;
      const R = (round + (small - round) * k) * (1 + excited * 0.08);
      const inc = 0.36 + 0.06 * k;
      const roll = -0.2 * (1 - k);
      const tiltX = ((rx * Math.PI) / 180) * (1 - k);
      const tiltY = ((ry * Math.PI) / 180) * (1 - k);
      const cRy = Math.cos(tiltY);
      const sRy = Math.sin(tiltY);
      const cRx = Math.cos(tiltX);
      const sRx = Math.sin(tiltX);
      const project = (lx: number, ly: number, lz: number) => {
        const x1 = lx * cRy + lz * sRy;
        const z1 = -lx * sRy + lz * cRy;
        const y2 = ly * cRx - z1 * sRx;
        const z2 = ly * sRx + z1 * cRx;
        const s = PERSPECTIVE / (PERSPECTIVE - z2);
        return { x: ringX + x1 * s, y: ringY + y2 * s, s };
      };

      // A tap off the ticket: a pull toward it, then a burst away.
      const live = blasts.current.filter((b) => now - b.at < 1400);
      blasts.current = live;
      for (const b of live) {
        if (!b.popped && now - b.at > PULL_MS) {
          b.popped = true;
          puff(b.x, b.y, 40, [120, 520], [0, Math.PI * 2], 500, 2.5);
          for (const g of grains) {
            const d = Math.hypot(g.x - b.x, g.y - b.y);
            if (d > BLAST) continue;
            const a = Math.atan2(g.y - b.y, g.x - b.x) + between(-0.3, 0.3);
            const s = between(380, 980) * (1.25 - d / BLAST);
            g.vx += Math.cos(a) * s;
            g.vy += Math.sin(a) * s - 160;
            g.free = now + between(420, 820);
            g.back = 0;
          }
          excited = 1;
        }
      }

      // The slot's dust, sunk into it, is done with: let it go.
      if (ms > nextPrune) {
        nextPrune = ms + 500;
        for (let i = grains.length - 1; i >= 0; i--) {
          const g = grains[i]!;
          if (!g.ring && ms > Math.max(PRINT_AT, g.start + 320) + 400)
            grains.splice(i, 1);
        }
      }
      for (const g of grains) {
        // The form's dust holds the form's shape until it lets go.
        const held = ms < g.release;
        const hold = held ? [g.x, g.y, g.vx, g.vy] : null;
        let gx = g.x;
        let gy = g.y;
        let pull = 240;
        let damp = 12.5;
        let front = true;
        let scale = 1;
        let fade = 1;
        const onRing = g.ring && ms > g.ring.at;
        if (ms < g.start) {
          // The puff: thrown out, slowing, stirred.
          const [fx, fy] = curl(g.x, g.y, t);
          g.vx += fx * 420 * dt - g.vx * 2.4 * dt;
          g.vy += fy * 420 * dt - g.vy * 2.4 * dt + 60 * dt;
          pull = 0;
        } else if (!onRing) {
          // Springing into the slot; the slot's own dust then sinks into
          // it as the ticket starts to feed.
          gx = slotBox.left + scrollX + g.sx * slotBox.width;
          gy = slotBox.top + scrollY + slotBox.height / 2;
          // Once the ticket prints up through it, the slot's dust is
          // behind it.
          front = ms < PRINT_AT;
          // (The form's dust, let go later, gets there first.)
          const sinks = Math.max(PRINT_AT, g.seeded ? g.start + 320 : 0);
          if (!g.ring && ms > sinks) fade = Math.max(0, 1 - (ms - sinks) / 360);
        } else {
          const r = g.ring!;
          const a = r.a + spin * r.w;
          const rr = R * r.r;
          // On the ring's plane, then tipped and turned.
          const px = Math.cos(a) * rr;
          const pz = Math.sin(a) * rr;
          const py = r.dy * (1 - k * 0.4) + pz * Math.sin(inc);
          const qz = pz * Math.cos(inc);
          const qx = px * Math.cos(roll) - py * Math.sin(roll);
          const qy = px * Math.sin(roll) + py * Math.cos(roll);
          const at = project(qx, qy, qz);
          gx = at.x;
          gy = at.y;
          if (stir > 0.5) {
            const [fx, fy] = curl(gx, gy, t);
            gx += fx * stir * g.follow;
            gy += fy * stir * g.follow;
          }
          scale = at.s;
          front = qz >= 0;
          const into = Math.min(1, (ms - r.at) / 500);
          pull = (40 + 50 * into) * g.follow;
          damp = 9 * Math.sqrt(g.follow);
        }
        if (now < g.free) {
          // Thrown: falling, with air.
          g.vy += 1500 * dt;
          g.vx -= g.vx * 1.1 * dt;
          g.vy -= g.vy * 1.1 * dt;
        } else {
          if (g.back < 1) g.back = Math.min(1, g.back + dt * 1.8);
          const kk = pull * g.back * g.back;
          if (kk > 0) {
            g.vx += (kk * (gx - g.x) - damp * g.vx) * dt;
            g.vy += (kk * (gy - g.y) - damp * g.vy) * dt;
          }
        }
        for (const b of live) {
          if (b.popped) continue;
          const dx = b.x - g.x;
          const dy = b.y - g.y;
          const d = Math.hypot(dx, dy);
          if (d > BLAST * 1.1 || d < 1) continue;
          const pullIn = (1 - d / (BLAST * 1.1)) * 2600 * dt;
          g.vx += (dx / d) * pullIn;
          g.vy += (dy / d) * pullIn;
        }
        // Out of the pointer's way.
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 3600 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (1 - d / 60) * 2600 * dt;
          g.vx += (dx / d) * push;
          g.vy += (dy / d) * push;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        if (hold)
          [g.x, g.y, g.vx, g.vy] = hold as [number, number, number, number];
        if (fade <= 0) continue;
        let ahead = front;
        // A grain lags its place on the ring (on its way from the slot, or
        // thrown by a tap), so its place can be behind the ticket while the
        // grain is still over the face. It may go behind anywhere, but comes
        // out in front only off the ticket, so nothing that belongs behind
        // is ever drawn over the face.
        if (
          g.ahead === false &&
          ahead &&
          g.x > cardL &&
          g.x < cardR &&
          g.y > cardT &&
          g.y < cardB
        )
          ahead = false;
        g.ahead = ahead;
        const twinkle = 0.75 + 0.25 * Math.sin(t * (3 + excited * 6) + g.phase);
        const s = g.size * scale * (1 + excited * 0.2) * (ahead ? 1 : 0.85);
        const alpha =
          (g.seeded ? 1 : Math.min(1, ms / 120)) *
          g.peak *
          fade *
          twinkle *
          (ahead ? 1 : 0.55) *
          (dark ? 1 : 0.85);
        const target = ahead ? ctx : bctx;
        target.globalAlpha = alpha;
        const ox = ahead ? 0 : ux;
        const oy = ahead ? 0 : uy;
        target.drawImage(
          tints[g.tint]!,
          g.x - ox - s,
          g.y - oy - s,
          s * 2,
          s * 2,
        );
      }

      // The loose dust.
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]!;
        m.age += dt * 1000;
        if (m.age > m.life) {
          motes.splice(i, 1);
          continue;
        }
        m.vx -= m.vx * m.drag * dt;
        m.vy += m.fall * dt - m.vy * m.drag * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const left = 1 - m.age / m.life;
        ctx.globalAlpha = left * (dark ? 0.9 : 0.75);
        const s = m.size * (0.5 + left * 0.5);
        ctx.drawImage(tints[m.tint]!, m.x - s, m.y - s, s * 2, s * 2);
      }
      raf = requestAnimationFrame(frame);
    };
    frame(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("deviceorientation", onTilt);
      offerTicketRing(null);
      pointer.stop();
      layer.remove();
    };
  }, [from]);

  /** iOS asks before it shares the phone's tilt, and only from a tap. */
  const askTilt = () => {
    const orientation = globalThis.DeviceOrientationEvent as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    void orientation?.requestPermission?.().catch(() => undefined);
  };

  const turnTo = (target: number) => {
    flip.current.target = target;
    haptic();
  };
  const showingFront = () =>
    Math.abs(Math.round(flip.current.angle / 180)) % 2 === 0;

  // Dragged sideways, the ticket turns under the finger; let go, it
  // settles on the nearer side, or the far one if flicked.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-stamp]")) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      from: flip.current.angle,
      moved: false,
      last: e.clientX,
      at: performance.now(),
      v: 0,
    };
    dragged.current = false;
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The button came up somewhere this never heard of.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      onUp(false);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // Sideways on a phone (up and down scrolls the page); any way with a
    // mouse.
    if (
      !d.moved &&
      (e.pointerType === "touch" ? Math.abs(dx) > 8 : Math.hypot(dx, dy) > 8)
    ) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const now = performance.now();
    d.v = ((e.clientX - d.last) / Math.max(8, now - d.at)) * 1000;
    d.last = e.clientX;
    d.at = now;
    const f = flip.current;
    f.angle = d.from + (dx / DRAG_PER_TURN) * 180;
    f.target = f.angle;
    f.v = 0;
    carry.current.tx = leash(dx);
    carry.current.ty = leash(dy);
  };
  // `tap` is false when the drag ends without a release on the ticket (the
  // window lost focus, say): then it only settles, flick and tap ignored.
  const onUp = (tap = true) => {
    const d = drag.current;
    drag.current = null;
    carry.current.tx = carry.current.ty = 0;
    if (!d) return;
    const f = flip.current;
    if (!tap) d.v = 0;
    if (!d.moved) {
      if (!tap) return;
      // A tap on the front turns it over; on the back, the link goes.
      if (showingFront()) turnTo(f.target + 180);
      return;
    }
    dragged.current = true;
    // Past halfway, or flicked, it goes over one way or the other; never
    // more than once a drag.
    const flick = Math.max(
      -120,
      Math.min(120, (d.v / DRAG_PER_TURN) * 180 * 0.15),
    );
    const turns = Math.max(
      -1,
      Math.min(1, Math.round((f.angle - d.from + flick) / 180)),
    );
    turnTo(Math.round(d.from / 180) * 180 + turns * 180);
  };

  letGo.current = onUp;

  const stampAgain = () => {
    haptic();
    restamp.current++;
    stamp.current?.animate?.(
      [
        { transform: "rotate(-14deg) scale(1)" },
        { transform: "rotate(-24deg) scale(1.9)", opacity: 0.4, offset: 0.4 },
        { transform: "rotate(-14deg) scale(0.92)", opacity: 1, offset: 0.75 },
        { transform: "rotate(-14deg) scale(1)" },
      ],
      { duration: 360, easing: "cubic-bezier(0.5, 0, 0.75, 0)" },
    );
    ticket.current?.parentElement?.animate?.(
      [
        { translate: "0 0" },
        { translate: "0 3px", offset: 0.72 },
        { translate: "0 0" },
      ],
      { duration: 420 },
    );
  };

  // A tap on the page itself, off the ticket and the button.
  const onScreenDown = (e: React.PointerEvent<HTMLElement>) => {
    const target = e.target as Element;
    if (target.closest("button, a, [data-ticket]")) return;
    haptic();
    blasts.current.push({
      x: e.pageX,
      y: e.pageY,
      at: performance.now(),
      popped: false,
    });
  };

  return (
    <section
      ref={section}
      data-confirmed
      className={cn(c.screen, c.pass)}
      onPointerDown={onScreenDown}
    >
      <canvas ref={backdrop} aria-hidden className={c.passBehind} />
      <div ref={stage} className={c.passStage}>
        <div className={c.ticketShadow}>
          {/* Turned by a drag or a tap; its back is a link, and the
              keyboard reaches it there, turning the ticket to show it. */}
          <div
            ref={ticket}
            data-ticket
            data-side="front"
            className={c.ticket}
            onClick={askTilt}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => onUp()}
            onPointerCancel={() => onUp(false)}
            onLostPointerCapture={() => onUp(false)}
            onDragStart={(e) => e.preventDefault()}
          >
            {/* Its thickness: slices between the faces, an edge when
                it's turned side on. Each face's notches and rounding are
                cut on a wrapper inside it (faceInner): WebKit flattens a
                masked element out of the 3D, painting the faces in
                page order whichever way the ticket faces. */}
            {EDGE.map((z) => (
              <div
                key={z}
                aria-hidden
                className={c.ticketEdge}
                style={{ transform: `translateZ(${z}px)` }}
              />
            ))}
            <div className={cn(c.face, c.ticketFront)}>
              <div className={cn(c.faceInner, c.frontInner)}>
                <div className={c.ticketFoil}>
                  <canvas ref={foil} aria-hidden className={c.ticketGlitter} />
                  <div className={c.ticketFoilBody}>
                    <div className={c.ticketEyebrow}>
                      <Image
                        src={portrait}
                        alt=""
                        width={36}
                        height={36}
                        className={c.ticketFace}
                        priority
                      />
                      <span>Confirmed</span>
                    </div>
                    <h2
                      ref={headingRef}
                      tabIndex={-1}
                      className={c.ticketHeading}
                    >
                      You&apos;re meeting {host}
                    </h2>
                  </div>
                </div>
                <div className={c.ticketBody}>
                  <div
                    ref={stamp}
                    aria-hidden
                    data-stamp
                    onPointerDown={stampAgain}
                    className={c.ticketStamp}
                  >
                    <Stamp />
                  </div>
                  <div className={c.ticketLayer}>
                    <div className={c.ticketDate}>
                      <span className={c.ticketDay}>
                        {day}
                        <span className={c.ticketOrdinal}>
                          {ordinalSuffix(Number(day))}
                        </span>
                      </span>
                      <span className={c.ticketMonth}>
                        {weekday}
                        <span className={styles.dot}> · </span>
                        {month}
                      </span>
                    </div>
                    <p className={c.ticketTime}>
                      <DateText text={slot.booker.short.start} />
                      <span className={styles.dash}>-</span>
                      <DateText text={slot.booker.short.end} />{" "}
                      <span className={cn(styles.secondary, styles.zone)}>
                        {slot.booker.zone}
                      </span>
                    </p>
                    {!slot.sameClock && (
                      <p
                        className={cn(
                          styles.secondary,
                          "mt-0.5 text-[13px] tabular-nums",
                        )}
                      >
                        <DateText text={slot.host.short.start} />
                        <span className={styles.dash}>-</span>
                        <DateText text={slot.host.short.end} />{" "}
                        <span className={styles.zone}>{slot.host.zone}</span>{" "}
                        for {host}
                        {slot.dateDiffers && `, ${slot.host.day}`}
                      </p>
                    )}
                  </div>
                  <span className="sr-only">{slot.booker.day}, your time.</span>
                </div>
                <div ref={perf} aria-hidden className={c.ticketPerf} />
                <div className={cn(c.ticketStub, c.ticketLayer)}>
                  <p>
                    Invite sent to{" "}
                    <span className="font-semibold [overflow-wrap:anywhere]">
                      {email}
                    </span>
                  </p>
                  {/* Where it happens and what it's called, as the booking
                      form's last line said it. */}
                  <p
                    className={cn(
                      styles.secondary,
                      "mt-1 flex items-center gap-1.5 text-[13px]",
                    )}
                  >
                    <CallIcon size={15} aria-hidden className="shrink-0" />
                    <span className="min-w-0 truncate">
                      {callLabel(call)}
                      <span className={styles.dot}> · </span>
                      {booked.title}
                    </span>
                  </p>
                </div>
                <div className={c.ticketGlare} aria-hidden />
              </div>
            </div>
            <div className={cn(c.face, c.ticketBack)}>
              <div className={cn(c.faceInner, c.backInner)}>
                <canvas ref={sky} aria-hidden className={c.backSky} />
                <BackSkyline ref={city} />
                {/* The top of the back goes to the site; the rest is the
                    bridge's, and fires it. */}
                <Link
                  href="/"
                  draggable={false}
                  className={c.backLink}
                  onFocus={() => {
                    if (showingFront()) turnTo(flip.current.target + 180);
                  }}
                  onClick={(e) => {
                    // The end of a drag isn't a tap on the link.
                    if (dragged.current) e.preventDefault();
                    dragged.current = false;
                  }}
                >
                  <span className={c.backTitle}>
                    <Image
                      src={portrait}
                      alt=""
                      width={28}
                      height={28}
                      className={c.backFace}
                    />
                    chappyasel.com
                    <ArrowUpRightIcon
                      aria-hidden
                      weight="bold"
                      className={c.backArrow}
                    />
                  </span>
                </Link>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Fireworks over the Golden Gate"
                  className={c.backFire}
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false;
                      return;
                    }
                    haptic();
                    city.current?.fire();
                  }}
                />
                <div className={c.ticketGlare} aria-hidden />
              </div>
            </div>
          </div>
        </div>
        <div ref={slotLine} aria-hidden className={c.passSlot} />
      </div>
      <div className={c.passAfter}>
        <PressButton
          ref={again}
          type="button"
          onClick={() =>
            // The ticket goes back to dust, and the dust to the booking
            // screen (MeetBooking).
            onAnother(
              canAnimate() && ticket.current
                ? sampleTicket(
                    ticket.current,
                    ticket.current.querySelector(
                      showingFront() ? `.${c.ticketFront}` : `.${c.ticketBack}`,
                    ),
                    showingFront()
                      ? ticket.current.querySelector(`.${c.ticketFoil}`)
                      : null,
                    again.current,
                  )
                : undefined,
            )
          }
          onPointerEnter={() => (hovering.current = true)}
          onPointerLeave={() => (hovering.current = false)}
          onFocus={() => (hovering.current = true)}
          onBlur={() => (hovering.current = false)}
          quiet
          className={c.passAgain}
        >
          Book another time
        </PressButton>
      </div>
    </section>
  );
}
