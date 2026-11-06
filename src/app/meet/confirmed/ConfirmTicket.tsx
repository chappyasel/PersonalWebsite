"use client";

import { DateText } from "../DateText";
import { PressButton } from "../PressButton";
import { tick as haptic } from "../haptics";
import styles from "../meet.module.css";
import Image from "next/image";
import portrait from "public/images/about/profile.jpg";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

import { type VariantProps, callTail, dateParts } from "./Confirmation";
import c from "./confirmed.module.css";
import {
  type Point,
  aroundRect,
  between,
  canAnimate,
  centreOf,
  curl,
  overlay,
  palette,
  sprite,
  trackPointer,
} from "./dust";

/*
 * Pass. The Book button bursts into a puff of dust, as Gather's does,
 * which swirls and springs into a line: the slot. The ticket prints up
 * out of it in three quick feeds, dust puffing from the slot as it goes,
 * and some of the dust that made the slot peels away and wraps round the
 * ticket as a ring, like a planet's. The ticket lifts free and a "Booked"
 * stamp lands on it with a thunk, a ring of dust, and a jolt to the ring.
 *
 * Then it's a thing to hold. It tilts toward the pointer on a spring (or
 * with the phone itself, once tapped), its layers sliding a little apart
 * as it does. A glare slides over it, and its blue foil, printed with a
 * fine security pattern, is full of dust that glints in different
 * colours as the light catches it. The ring is truly round it: tilted
 * with the ticket, passing behind it and in front, spinning up and
 * swelling as the pointer comes near. Hover "Book another time" and the
 * ring runs round the button instead. Tap the stamp to stamp it again.
 * Left alone, it floats.
 *
 * The timing here matches confirmed.module.css's delays on the ticket.
 */

const SLOT_AT = 380;
const PRINT_AT = 760;
const PRINT_MS = 1050;
const STAMP_AT = 2150;
const PUFF = 680;
const RING = 420;
const FOIL = 340;
/** The ticket's own perspective, as its CSS transform has it. */
const PERSPECTIVE = 900;
/** How far round the canvas behind the ticket reaches past it. */
const REACH = 170;

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
  /** Ring grains only: when it leaves the slot, and its place on the ring. */
  ring?: { at: number; a: number; r: number; w: number; dy: number };
};

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
  const stage = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const slotLine = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const foil = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const perf = useRef<HTMLDivElement>(null);
  const again = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);
  const restamp = useRef(0);
  const gyro = useRef<{ rx: number; ry: number; at: number } | null>(null);
  const { weekday, month, day } = dateParts(booked.start, bookerZone);

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

  useEffect(() => {
    const box = stage.current;
    const card = ticket.current;
    const mark = stamp.current;
    const line = slotLine.current;
    const glitter = foil.current;
    const under = backdrop.current;
    if (!canAnimate() || !box || !card || !mark || !line || !glitter || !under)
      return;
    const fctx = glitter.getContext("2d");
    const bctx = under.getContext("2d");
    const layer = overlay();
    if (!fctx || !bctx || !layer) return;
    const { ctx } = layer;
    const { accent, dark } = palette();
    const tints = [
      sprite(accent, dark),
      sprite(dark ? "100 210 255" : "50 173 230", dark),
      sprite(dark ? "191 90 242" : "88 86 214", dark),
    ];
    const hues = [
      "255 255 255",
      "100 210 255",
      "191 90 242",
      "255 214 10",
      "255 105 180",
      "48 209 88",
    ].map((rgb) => sprite(rgb, true));
    const pointer = trackPointer();
    const dpr = Math.min(2, devicePixelRatio || 1);

    // The canvases on the ticket and behind it, sized to their boxes.
    let foilBox = glitter.getBoundingClientRect();
    let underBox = under.getBoundingClientRect();
    const size = () => {
      foilBox = glitter.getBoundingClientRect();
      glitter.width = foilBox.width * dpr;
      glitter.height = foilBox.height * dpr;
      underBox = under.getBoundingClientRect();
      under.width = underBox.width * dpr;
      under.height = underBox.height * dpr;
    };
    size();
    window.addEventListener("resize", size);

    // The foil's dust, each grain a tiny facet facing its own way,
    // glinting when the light lines up with it.
    const facets = Array.from({ length: FOIL }, () => {
      const a = Math.random() * Math.PI * 2;
      return {
        x: Math.random(),
        y: Math.random(),
        nx: Math.cos(a),
        ny: Math.sin(a),
        size: between(1.2, 3.4),
        hue: Math.floor(Math.random() * hues.length),
        phase: Math.random() * 7,
      };
    });

    // The puff, from the Book button, or low on the screen without one.
    const origin: Point = from ?? {
      x: scrollX + innerWidth / 2,
      y: scrollY + innerHeight * 0.85,
    };
    const grains: Grain[] = Array.from({ length: PUFF }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const speed = between(120, 760);
      const sx = Math.random();
      return {
        x: origin.x + between(-30, 30),
        y: origin.y + between(-10, 10),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 220,
        sx,
        start: SLOT_AT + sx * 180 + between(0, 80),
        size: between(1.8, 3.4),
        peak: between(0.6, 1),
        tint: Math.random() < 0.72 ? 0 : Math.random() < 0.7 ? 1 : 2,
        phase: Math.random() * 7,
        ...(i < RING
          ? {
              ring: {
                // It wraps on in order round the ring as the ticket feeds.
                a: (i / RING) * Math.PI * 2 + between(-0.08, 0.08),
                at: PRINT_AT + (i / RING) * PRINT_MS * 0.85 + between(0, 60),
                r: Math.random() < 0.82 ? between(1, 1.1) : between(1.1, 1.32),
                w: between(0.32, 0.5),
                dy: between(-5, 5),
              },
            }
          : {}),
      };
    });

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
          tint: Math.random() < 0.75 ? 0 : 1,
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

    // Tilting the phone tilts the ticket, once a tap has allowed it.
    let level: { beta: number; gamma: number } | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      level ??= { beta: e.beta, gamma: e.gamma };
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      gyro.current = {
        rx: clamp((level.beta - e.beta) * 0.6, 12),
        ry: clamp((e.gamma - level.gamma) * 0.7, 16),
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
    let stamped = false;
    let seen = restamp.current;
    const began = performance.now();
    let last = began;
    let raf = 0;

    const frame = (now: number) => {
      const ms = now - began;
      const t = ms / 1000;
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const p = pointer.p;

      // The ticket's centre and size at rest, untouched by its tilt.
      const stageBox = box.getBoundingClientRect();
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const cx = stageBox.left + scrollX + w / 2;
      const cy = stageBox.top + scrollY + h / 2;
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
      card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      card.style.setProperty("--tx", (ry / 16).toFixed(3));
      card.style.setProperty("--ty", (rx / 12).toFixed(3));
      // Where the light hits: opposite the tilt.
      card.style.setProperty("--gx", `${(50 + (ry / 32) * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(50 - (rx / 24) * 100).toFixed(1)}%`);

      // The foil.
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, foilBox.width, foilBox.height);
      const light = Math.hypot(ry, rx) / 12 + 0.15;
      const la = Math.atan2(-rx, ry);
      const lnx = Math.cos(la);
      const lny = Math.sin(la);
      for (const f of facets) {
        const facing = Math.max(0, f.nx * lnx + f.ny * lny);
        const glint = facing ** 10 * Math.min(1, light);
        const a = Math.min(
          1,
          0.12 + 0.08 * Math.sin(t * 2 + f.phase) + glint * 1.4,
        );
        if (a < 0.02) continue;
        fctx.globalAlpha = a;
        const s = f.size * (1 + glint * 1.6);
        fctx.drawImage(
          glint > 0.2 ? hues[f.hue]! : hues[0]!,
          f.x * foilBox.width - s,
          f.y * foilBox.height - s,
          s * 2,
          s * 2,
        );
      }

      layer.clear();
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, underBox.width, underBox.height);
      const ux = stageBox.left + scrollX - REACH;
      const uy = stageBox.top + scrollY - REACH;

      // The ring's excitement and spin.
      const near = Math.hypot(p.x - cx, p.y - cy);
      const want = Math.max(0, Math.min(1, 1 - (near - w / 2) / 260));
      excited += (want - excited) * Math.min(1, dt * 3);
      spin += dt * (1 + excited * 2.6);

      // The ring in the ticket's own space: round it, tipped toward the
      // eye, turned a little, then through the ticket's tilt and
      // perspective onto the page.
      const R =
        Math.min((w / 2) * 1.28, innerWidth / 2 - 6) * (1 + excited * 0.08);
      const inc = 0.36;
      const roll = -0.2;
      const cRy = Math.cos((ry * Math.PI) / 180);
      const sRy = Math.sin((ry * Math.PI) / 180);
      const cRx = Math.cos((rx * Math.PI) / 180);
      const sRx = Math.sin((rx * Math.PI) / 180);
      const project = (lx: number, ly: number, lz: number) => {
        const x1 = lx * cRy + lz * sRy;
        const z1 = -lx * sRy + lz * cRy;
        const y2 = ly * cRx - z1 * sRx;
        const z2 = ly * sRx + z1 * cRx;
        const k = PERSPECTIVE / (PERSPECTIVE - z2);
        return { x: cx + x1 * k, y: cy + y2 * k, k };
      };
      const button = again.current?.getBoundingClientRect();

      for (const [i, g] of grains.entries()) {
        let gx = g.x;
        let gy = g.y;
        let k = 240;
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
          k = 0;
        } else if (!onRing) {
          // Springing into the slot; the slot's own dust then sinks into
          // it as the ticket starts to feed.
          gx = slotBox.left + scrollX + g.sx * slotBox.width;
          gy = slotBox.top + scrollY + slotBox.height / 2;
          if (!g.ring && ms > PRINT_AT)
            fade = Math.max(0, 1 - (ms - PRINT_AT) / 360);
        } else if (hovering.current && button) {
          const r = g.ring!;
          const at = aroundRect(
            {
              left: button.left + scrollX - r.dy * 0.6,
              top: button.top + scrollY - r.dy * 0.6,
              width: button.width + r.dy * 1.2,
              height: button.height + r.dy * 1.2,
            },
            10,
            i / RING + t * 0.09,
          );
          gx = at.x;
          gy = at.y;
          k = 70;
          damp = 9;
        } else {
          const r = g.ring!;
          const a = r.a + spin * r.w;
          const rr = R * r.r;
          // On the ring's plane, then tipped and turned.
          const px = Math.cos(a) * rr;
          const pz = Math.sin(a) * rr;
          const py = r.dy + pz * Math.sin(inc);
          const qz = pz * Math.cos(inc);
          const qx = px * Math.cos(roll) - py * Math.sin(roll);
          const qy = px * Math.sin(roll) + py * Math.cos(roll);
          const at = project(qx, qy, qz);
          gx = at.x;
          gy = at.y;
          scale = at.k;
          front = qz >= 0;
          const into = Math.min(1, (ms - r.at) / 500);
          k = 40 + 50 * into;
          damp = 9;
        }
        if (k > 0) {
          g.vx += (k * (gx - g.x) - damp * g.vx) * dt;
          g.vy += (k * (gy - g.y) - damp * g.vy) * dt;
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
        if (fade <= 0) continue;
        const twinkle = 0.75 + 0.25 * Math.sin(t * (3 + excited * 6) + g.phase);
        const s = g.size * scale * (1 + excited * 0.2) * (front ? 1 : 0.85);
        const alpha =
          Math.min(1, ms / 120) *
          g.peak *
          fade *
          twinkle *
          (front ? 1 : 0.55) *
          (dark ? 1 : 0.85);
        const target = front ? ctx : bctx;
        target.globalAlpha = alpha;
        const ox = front ? 0 : ux;
        const oy = front ? 0 : uy;
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
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("deviceorientation", onTilt);
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

  return (
    <section data-confirmed className={cn(c.screen, c.pass)}>
      <div
        ref={stage}
        className={c.passStage}
        style={{ ["--reach" as string]: `${REACH}px` }}
      >
        <canvas ref={backdrop} aria-hidden className={c.passBehind} />
        <div className={c.ticketShadow}>
          {/* A tap asks for the phone's tilt; the ticket isn't a control. */}
          <div ref={ticket} className={c.ticket} onClick={askTilt}>
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
                <h2 ref={headingRef} tabIndex={-1} className={c.ticketHeading}>
                  You&apos;re meeting {host}
                </h2>
              </div>
            </div>
            <div className={c.ticketBody}>
              <div
                ref={stamp}
                aria-hidden
                onPointerDown={stampAgain}
                className={c.ticketStamp}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M6.5 12.5 10.2 16 17.5 8.5" />
                </svg>
                <span>Booked</span>
              </div>
              <div className={c.ticketLayer}>
                <div className={c.ticketDate}>
                  <span className={c.ticketDay}>{day}</span>
                  <span className={c.ticketMonth}>
                    {weekday}
                    <br />
                    {month}
                  </span>
                </div>
                <p className={c.ticketTime}>
                  <DateText text={slot.booker.short.start} />
                  <span className={styles.dash}>-</span>
                  <DateText text={slot.booker.short.end} />{" "}
                  <span className={styles.secondary}>
                    {slot.booker.zone}
                    {!slot.sameClock && ", your time"}
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
                    <DateText text={slot.host.short.end} /> {slot.host.zone} for{" "}
                    {host}
                    {slot.dateDiffers && `, ${slot.host.day}`}
                  </p>
                )}
              </div>
              <span className="sr-only">{slot.booker.day}, your time.</span>
            </div>
            <div ref={perf} aria-hidden className={c.ticketPerf} />
            <div className={cn(c.ticketStub, c.ticketLayer)}>
              <p>
                The invite is in your inbox at{" "}
                <span className="font-semibold">{email}</span>
                {callTail(call)}
              </p>
              <p className={cn(styles.secondary, "mt-1 text-[12px]")}>
                {booked.title}
              </p>
            </div>
            <div className={c.ticketGlare} aria-hidden />
          </div>
        </div>
        <div ref={slotLine} aria-hidden className={c.passSlot} />
      </div>
      <div className={c.passAfter}>
        <PressButton
          ref={again}
          type="button"
          onClick={onAnother}
          onPointerEnter={() => (hovering.current = true)}
          onPointerLeave={() => (hovering.current = false)}
          onFocus={() => (hovering.current = true)}
          onBlur={() => (hovering.current = false)}
          className={c.passAgain}
        >
          Book another time
        </PressButton>
      </div>
    </section>
  );
}
