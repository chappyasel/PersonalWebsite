import type { GolfVec3 } from "../scene/golf/golfTypes";
import { VISION_RIDE_TIMELINE } from "../visionRide/visionRideTransitionTimeline";

export type SceneSoundEvent =
  | "coordination-boom"
  | "golf-strike"
  | "golf-turf"
  | "golf-cup"
  | "golf-win"
  | "flagstick";

export type SceneAudioState = {
  unlocked: boolean;
  ambienceRequested: boolean;
  suspended: boolean;
  muted: boolean;
  voices: number;
  windLevel: number;
  rideRequested: boolean;
  rideStatus: "idle" | "loading" | "ready" | "playing" | "failed";
};

const VOICE_CAP = 12;
export const SCENE_AUDIO_MIX = {
  windAudibleThreshold: 0.4,
  windMotionRange: 0.034,
  windCrossfadeFloor: 0.44,
  meadow: 0.07,
} as const;

export function windGainForMotion(motion: number) {
  const level = Math.min(1, Math.max(0, motion));
  if (level <= SCENE_AUDIO_MIX.windAudibleThreshold) return 0;
  const audible =
    (level - SCENE_AUDIO_MIX.windAudibleThreshold) /
    (1 - SCENE_AUDIO_MIX.windAudibleThreshold);
  const eased = audible * audible * (3 - 2 * audible);
  return eased * SCENE_AUDIO_MIX.windMotionRange;
}
const EVENT_COOLDOWN_MS: Partial<Record<SceneSoundEvent, number>> = {
  "coordination-boom": 900,
  "golf-turf": 80,
  flagstick: 100,
};

const FILES = {
  windA: "/audio/stacks/wind-meadow-a.ogg",
  windB: "/audio/stacks/wind-meadow-b.ogg",
  meadow: "/audio/stacks/spring-birds-meadow.ogg",
  "coordination-boom": "/audio/stacks/coordination-boom.ogg",
  "golf-strike": "/audio/stacks/golf-strike.ogg",
  golfStrikeB: "/audio/stacks/golf-strike-b.ogg",
  golfStrikeC: "/audio/stacks/golf-strike-c.ogg",
  golfStrikeD: "/audio/stacks/golf-strike-d.ogg",
  "golf-turf": "/audio/stacks/golf-turf.ogg",
  "golf-cup": "/audio/stacks/golf-cup.ogg",
  "golf-win": "/audio/stacks/golf-win.ogg",
  flagstick: "/audio/stacks/flagstick.ogg",
} as const;

type SoundName = keyof typeof FILES;
type ActiveVoice = { source: AudioBufferSourceNode; started: number };
type PendingPlay = {
  soundName: SoundName;
  position: GolfVec3;
  gain: number;
  requestedAt: number;
};
type Subscriber = (state: SceneAudioState) => void;

const FIRST_STRIKE: SoundName = "golf-strike";
const COORDINATION_BOOM: SoundName = "coordination-boom";
const CORE_AMBIENCE: SoundName[] = ["windA", "windB", "meadow"];
const DEFERRED_SOUNDS = (Object.keys(FILES) as SoundName[]).filter(
  (name) =>
    name !== FIRST_STRIKE &&
    name !== COORDINATION_BOOM &&
    !CORE_AMBIENCE.includes(name),
);
const MAX_PENDING_PLAY_MS = 600;
export const VISION_RIDE_SOUNDTRACK =
  "/audio/vision-ride/synthwave-loop.ogg" as const;

// Whoosh envelope lengths, exported so the transition timeline test can pin
// the audio/visual sync: the donning whoosh resolves as the headset seats,
// while the removal whoosh spans the CRT flicker + collapse.
// Each whoosh opens with a short attack from silence to peak rather than
// slamming in at full gain, then releases over the remainder.
export const VISION_RIDE_ENTRY_WHOOSH_SECONDS = 1.5;
/** Flicker + vertical collapse + line hold + dot shrink of the exit. */
export const VISION_RIDE_EXIT_WHOOSH_SECONDS = 1.4;
export const VISION_RIDE_WHOOSH_ATTACK_SECONDS = 0.12;
// Broadcast static hiss under the set switching on and off. Entry begins only
// after the headset is seated and follows the visible snow through the CRT
// aperture opening. Exit spans the removal whoosh. Both are band-passed noise
// that ends when the matching picture noise disappears.
export const VISION_RIDE_ENTRY_STATIC_SECONDS =
  VISION_RIDE_TIMELINE.entry.flickerSeconds +
  VISION_RIDE_TIMELINE.entry.apertureSeconds;
export const VISION_RIDE_EXIT_STATIC_SECONDS =
  VISION_RIDE_TIMELINE.exit.flickerSeconds +
  VISION_RIDE_TIMELINE.exit.collapseSeconds +
  VISION_RIDE_TIMELINE.exit.lineHoldSeconds +
  VISION_RIDE_TIMELINE.exit.dotSeconds;
export const VISION_RIDE_SOUNDTRACK_GAIN = 0.22;
export const VISION_RIDE_STATIC_PEAK = 0.07;
const VISION_RIDE_STATIC_ATTACK_SECONDS = 0.015;

export function spatialGain(distance: number, maxDistance = 42) {
  if (distance <= 1) return 1;
  if (distance >= maxDistance) return 0;
  const normalized = Math.max(1, distance) / maxDistance;
  return Math.min(1, 1 / (1 + 7 * normalized * normalized));
}

export class SceneAudioRuntime {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private ambienceBus: GainNode | null = null;
  private rideBus: GainNode | null = null;
  private rideSoundtrack: AudioBuffer | null = null;
  private rideSoundtrackSource: AudioBufferSourceNode | null = null;
  private rideOscillators: OscillatorNode[] = [];
  private rideStaticSources: AudioBufferSourceNode[] = [];
  private rideLoad: Promise<void> | null = null;
  private rideStopTimer = 0;
  private rideEntryEffectsAllowed = false;
  private rideReducedMotion = false;
  private rideExitSoundPlayed = false;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private loadComplete = false;
  private pendingPlays: PendingPlay[] = [];
  private ambience: AudioBufferSourceNode[] = [];
  private ambienceGains: GainNode[] = [];
  private crossfadeTimer = 0;
  private suspendTimer = 0;
  private voices: ActiveVoice[] = [];
  private cooldowns = new Map<SceneSoundEvent, number>();
  // The tiny base strike is decoded first. Begin there deterministically so
  // the first physical impact can never select a deferred variant.
  private strikeCursor = 0;
  private subscribers = new Set<Subscriber>();
  private listener = {
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
  };
  private state: SceneAudioState = {
    unlocked: false,
    ambienceRequested: false,
    suspended: false,
    muted: false,
    voices: 0,
    windLevel: 0.56,
    rideRequested: false,
    rideStatus: "idle",
  };

  snapshot = () => ({ ...this.state });

  subscribe = (subscriber: Subscriber) => {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  };

  unlock = () => {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    if (
      typeof window === "undefined" ||
      !(window.AudioContext || window.webkitAudioContext)
    )
      return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 14;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    // One-shots must be audible immediately. Only the ambience bus fades in;
    // fading this master also faded the first club strike almost to silence.
    master.gain.value = this.state.muted ? 0 : 1;
    master.connect(limiter).connect(context.destination);
    this.context = context;
    this.master = master;
    this.limiter = limiter;
    this.state.unlocked = true;
    this.publish();
    this.loadComplete = false;
    this.loading = this.loadBuffers();
    if (this.state.rideRequested && !this.state.muted)
      this.ensureVisionRideAudio();
    void this.loading.finally(() => {
      this.loadComplete = true;
      this.pendingPlays = [];
    });
  };

  startAmbience = () => {
    this.state.ambienceRequested = true;
    if (this.buffers.size) this.ensureAmbience();
    this.publish();
  };

  setWindLevel = (level: number) => {
    const next = Math.min(1, Math.max(0, level));
    if (Math.abs(next - this.state.windLevel) < 0.015) return;
    this.state.windLevel = next;
    const [a, b] = this.ambienceGains;
    if (a && b) this.rampWindBeds(a.gain.value >= b.gain.value, 0.45);
  };

  stopAmbience = () => {
    this.state.ambienceRequested = false;
    this.stopAmbientSources();
    this.publish();
  };

  setMuted = (muted: boolean) => {
    if (this.state.muted === muted) return;
    this.state.muted = muted;
    if (this.context?.state === "suspended" && !muted)
      void this.context.resume();
    this.fadeMaster(muted ? 0 : 1, muted ? 0.08 : 0.25);
    if (!muted && this.state.rideRequested) this.ensureVisionRideAudio();
    this.publish();
  };

  startVisionRide = (reducedMotion = false) => {
    this.state.rideRequested = true;
    this.rideReducedMotion = reducedMotion;
    this.rideExitSoundPlayed = false;
    this.rideEntryEffectsAllowed = true;
    this.fadeAmbience(0.0001, 0.5);
    if (!this.state.muted) this.ensureVisionRideAudio();
    this.publish();
  };

  /** Start the television hiss when the black visor switches on. Keeping this
   * separate from startVisionRide prevents static from playing while the
   * physical headset is still flying in from the shelf. */
  beginVisionRideSwitchOn = () => {
    if (
      !this.context ||
      !this.rideBus ||
      this.state.muted ||
      this.rideReducedMotion ||
      !this.rideEntryEffectsAllowed
    )
      return;
    this.startVisionRideStatic(
      VISION_RIDE_ENTRY_STATIC_SECONDS,
      VISION_RIDE_TIMELINE.entry.apertureSeconds,
    );
  };

  /** End the one-shot switch-on noise independently of the continuous
   * soundtrack and engine layers. The gate also prevents a delayed sound
   * unlock from replaying entry static after the road is already visible. */
  finishVisionRideEntry = () => {
    this.rideEntryEffectsAllowed = false;
    this.stopVisionRideStaticSources();
  };

  beginVisionRideExit = () => {
    if (
      !this.context ||
      !this.rideBus ||
      this.state.muted ||
      this.rideExitSoundPlayed
    )
      return;
    this.rideExitSoundPlayed = true;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      58,
      now + VISION_RIDE_EXIT_WHOOSH_SECONDS * 0.94,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      this.rideReducedMotion ? 0.004 : 0.022,
      now + VISION_RIDE_WHOOSH_ATTACK_SECONDS,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + VISION_RIDE_EXIT_WHOOSH_SECONDS,
    );
    oscillator.connect(gain).connect(this.rideBus);
    oscillator.start();
    oscillator.stop(now + VISION_RIDE_EXIT_WHOOSH_SECONDS + 0.01);
    this.rideOscillators.push(oscillator);
    if (!this.rideReducedMotion)
      this.startVisionRideStatic(
        VISION_RIDE_EXIT_STATIC_SECONDS,
        VISION_RIDE_TIMELINE.exit.dotSeconds,
      );
    // The soundtrack sinks under the static and the collapse; the last of
    // it goes with the curtain in stopVisionRide.
    this.fadeRide(0.3, VISION_RIDE_EXIT_WHOOSH_SECONDS);
  };

  stopVisionRide = () => {
    if (!this.state.rideRequested && !this.rideBus) return;
    this.state.rideRequested = false;
    this.rideEntryEffectsAllowed = false;
    this.fadeRide(0.0001, 0.5);
    this.fadeAmbience(1, 0.9);
    window.clearTimeout(this.rideStopTimer);
    this.rideStopTimer = window.setTimeout(() => {
      this.stopVisionRideSources();
      this.state.rideStatus = this.rideSoundtrack ? "ready" : "idle";
      this.publish();
    }, 520);
    this.publish();
  };

  updateListener = (position: GolfVec3, forward: GolfVec3) => {
    this.listener = { position: { ...position }, forward: { ...forward } };
    const listener = this.context?.listener;
    if (!listener || !this.context) return;
    const now = this.context.currentTime;
    listener.positionX?.setValueAtTime(position.x, now);
    listener.positionY?.setValueAtTime(position.y, now);
    listener.positionZ?.setValueAtTime(position.z, now);
    listener.forwardX?.setValueAtTime(forward.x, now);
    listener.forwardY?.setValueAtTime(forward.y, now);
    listener.forwardZ?.setValueAtTime(forward.z, now);
    listener.upX?.setValueAtTime(0, now);
    listener.upY?.setValueAtTime(1, now);
    listener.upZ?.setValueAtTime(0, now);
  };

  play = (event: SceneSoundEvent, position: GolfVec3, gain = 1) => {
    const context = this.context;
    const master = this.master;
    const strikes: SoundName[] = [
      "golf-strike",
      "golfStrikeB",
      "golfStrikeC",
      "golfStrikeD",
    ];
    const soundName =
      event === "golf-strike"
        ? strikes[this.strikeCursor++ % strikes.length]!
        : event;
    if (!context || !master || context.state !== "running" || this.state.muted)
      return false;
    const nowMs = performance.now();
    const cooldown = EVENT_COOLDOWN_MS[event] ?? 0;
    if (nowMs - (this.cooldowns.get(event) ?? -Infinity) < cooldown)
      return false;
    this.cooldowns.set(event, nowMs);
    const buffer = this.buffers.get(soundName);
    if (!buffer) {
      if (this.loadComplete) return false;
      this.pendingPlays.push({
        soundName,
        position: { ...position },
        gain,
        requestedAt: nowMs,
      });
      // Accepted for playback as soon as the priority decode completes.
      return true;
    }
    this.startVoice(buffer, position, gain);
    return true;
  };

  private startVoice(buffer: AudioBuffer, position: GolfVec3, gain: number) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== "running") return;
    this.pruneVoices();
    if (this.voices.length >= VOICE_CAP) {
      this.voices.sort((a, b) => a.started - b.started);
      this.voices.shift()?.source.stop();
    }
    const source = context.createBufferSource();
    const panner = context.createPanner();
    const voiceGain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    // The cup is roughly 23 scene metres from the standing camera. A normal
    // close-room inverse curve made every cup, flag and win recording nearly
    // inaudible; this field-scale curve retains direction without erasing the
    // event at the far green.
    panner.refDistance = 3.5;
    panner.maxDistance = 42;
    panner.rolloffFactor = 0.7;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    voiceGain.gain.value = Math.min(1, Math.max(0, gain));
    source.connect(panner).connect(voiceGain).connect(master);
    const voice = { source, started: context.currentTime };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((candidate) => candidate !== voice);
      this.state.voices = this.voices.length;
      this.publish();
    };
    source.start();
    this.state.voices = this.voices.length;
    this.publish();
  }

  visibility = (hidden: boolean) => {
    if (!this.context) return;
    window.clearTimeout(this.suspendTimer);
    this.state.suspended = hidden;
    if (hidden) {
      this.fadeMaster(0, 0.12);
      this.suspendTimer = window.setTimeout(
        () => void this.context?.suspend(),
        150,
      );
    } else {
      void this.context
        .resume()
        .then(() => this.fadeMaster(this.state.muted ? 0 : 1, 1));
    }
    this.publish();
  };

  teardown = () => {
    window.clearTimeout(this.suspendTimer);
    window.clearTimeout(this.rideStopTimer);
    this.stopVisionRideSources();
    this.stopAmbientSources();
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {}
    }
    this.voices = [];
    const context = this.context;
    this.context = null;
    this.master = null;
    this.limiter = null;
    this.ambienceBus = null;
    this.rideBus = null;
    this.rideSoundtrack = null;
    this.rideLoad = null;
    this.rideExitSoundPlayed = false;
    this.rideEntryEffectsAllowed = false;
    this.buffers.clear();
    this.loading = null;
    this.loadComplete = false;
    this.pendingPlays = [];
    this.state = {
      ...this.state,
      unlocked: false,
      ambienceRequested: false,
      suspended: false,
      voices: 0,
      rideRequested: false,
      rideStatus: "idle",
    };
    if (context) void context.close();
    this.publish();
  };

  private async loadBuffers() {
    // The interaction-critical strike wins the decode queue. The orb boom is
    // next so a first visit to About does not wait behind the ambient beds;
    // effect variants never hold either path hostage.
    await this.loadBuffer(FIRST_STRIKE);
    await this.loadBuffer(COORDINATION_BOOM);
    await Promise.all(CORE_AMBIENCE.map((name) => this.loadBuffer(name)));
    if (this.state.ambienceRequested) this.ensureAmbience();
    await Promise.all(DEFERRED_SOUNDS.map((name) => this.loadBuffer(name)));
  }

  private async loadBuffer(name: SoundName) {
    const context = this.context;
    if (!context) return;
    try {
      const response = await fetch(FILES[name]);
      if (!response.ok) return;
      const buffer = await context.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (this.context !== context) return;
      this.buffers.set(name, buffer);
      this.flushPending(name);
    } catch {
      // Audio is enhancement-only; a missing codec or asset never affects the
      // scene or interactions.
    }
  }

  private ensureVisionRideAudio() {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.state.muted || !this.state.rideRequested)
      return;
    window.clearTimeout(this.rideStopTimer);
    if (!this.rideBus) {
      const bus = context.createGain();
      bus.gain.value = 0.0001;
      bus.connect(master);
      this.rideBus = bus;
      this.startVisionRideEntryWhoosh();
      this.fadeRide(1, 0.7);
    }
    if (this.rideSoundtrack) {
      this.startVisionRideSoundtrack();
      return;
    }
    if (this.rideLoad) return;
    this.state.rideStatus = "loading";
    this.publish();
    this.rideLoad = fetch(VISION_RIDE_SOUNDTRACK)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        if (this.context !== context) return;
        this.rideSoundtrack = buffer;
        this.state.rideStatus = "ready";
        if (this.state.rideRequested && !this.state.muted)
          this.startVisionRideSoundtrack();
      })
      .catch(() => {
        if (this.context === context) this.state.rideStatus = "failed";
      })
      .finally(() => {
        this.rideLoad = null;
        this.publish();
      });
  }

  private startVisionRideSoundtrack() {
    if (
      !this.context ||
      !this.rideBus ||
      !this.rideSoundtrack ||
      this.rideSoundtrackSource
    )
      return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.rideSoundtrack;
    source.loop = true;
    const now = this.context.currentTime;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(
      VISION_RIDE_SOUNDTRACK_GAIN,
      now + 0.85,
    );
    source.connect(gain).connect(this.rideBus);
    source.start();
    this.rideSoundtrackSource = source;
    this.state.rideStatus = "playing";
  }

  private startVisionRideEntryWhoosh() {
    if (!this.context || !this.rideBus || this.rideOscillators.length) return;
    if (this.rideEntryEffectsAllowed) {
      const whoosh = this.context.createOscillator();
      const whooshGain = this.context.createGain();
      const now = this.context.currentTime;
      whoosh.type = "sine";
      whoosh.frequency.setValueAtTime(90, now);
      whoosh.frequency.exponentialRampToValueAtTime(
        440,
        now + VISION_RIDE_ENTRY_WHOOSH_SECONDS * 0.93,
      );
      whooshGain.gain.setValueAtTime(0.0001, now);
      whooshGain.gain.exponentialRampToValueAtTime(
        this.rideReducedMotion ? 0.004 : 0.018,
        now + VISION_RIDE_WHOOSH_ATTACK_SECONDS,
      );
      whooshGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + VISION_RIDE_ENTRY_WHOOSH_SECONDS,
      );
      whoosh.connect(whooshGain).connect(this.rideBus);
      whoosh.start();
      whoosh.stop(now + VISION_RIDE_ENTRY_WHOOSH_SECONDS + 0.01);
      this.rideOscillators.push(whoosh);
    }
  }

  /**
   * Broadband noise with a near-instant gate, a steady hold, then a release
   * that follows the visual aperture or dot. Lives on the ride bus so mute and
   * ride fades govern it. Noise buffers and filters are optional on the audio
   * context this runtime is handed; without them the hiss is skipped.
   */
  private startVisionRideStatic(seconds: number, releaseSeconds: number) {
    const context = this.context;
    if (
      !context ||
      !this.rideBus ||
      typeof context.createBuffer !== "function" ||
      typeof context.createBiquadFilter !== "function"
    )
      return;
    const length = Math.max(1, Math.floor(context.sampleRate * 0.5));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x2545f491;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      data[index] = seed / 0x8000_0000 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 320;
    highpass.Q.value = 0.55;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 10_500;
    lowpass.Q.value = 0.4;
    const gain = context.createGain();
    const now = context.currentTime;
    const holdUntil = Math.max(
      VISION_RIDE_STATIC_ATTACK_SECONDS,
      seconds - releaseSeconds,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(
      VISION_RIDE_STATIC_PEAK,
      now + VISION_RIDE_STATIC_ATTACK_SECONDS,
    );
    gain.gain.setValueAtTime(VISION_RIDE_STATIC_PEAK, now + holdUntil);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(gain)
      .connect(this.rideBus);
    source.start();
    source.stop(now + seconds + 0.02);
    this.rideStaticSources.push(source);
  }

  private stopVisionRideSources() {
    try {
      this.rideSoundtrackSource?.stop();
    } catch {}
    this.rideSoundtrackSource = null;
    this.stopVisionRideStaticSources();
    for (const oscillator of this.rideOscillators) {
      try {
        oscillator.stop();
      } catch {}
    }
    this.rideOscillators = [];
    this.rideBus = null;
  }

  private stopVisionRideStaticSources() {
    for (const source of this.rideStaticSources) {
      try {
        source.stop();
      } catch {}
    }
    this.rideStaticSources = [];
  }

  private fadeAmbience(target: number, seconds: number) {
    if (!this.context || !this.ambienceBus) return;
    const gain = this.ambienceBus.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.exponentialRampToValueAtTime(Math.max(0.0001, target), now + seconds);
  }

  private fadeRide(target: number, seconds: number) {
    if (!this.context || !this.rideBus) return;
    const gain = this.rideBus.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.exponentialRampToValueAtTime(Math.max(0.0001, target), now + seconds);
  }

  private flushPending(name: SoundName) {
    const now = performance.now();
    const ready = this.pendingPlays.filter(
      (pending) =>
        pending.soundName === name &&
        now - pending.requestedAt <= MAX_PENDING_PLAY_MS,
    );
    this.pendingPlays = this.pendingPlays.filter(
      (pending) => pending.soundName !== name,
    );
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    for (const pending of ready)
      this.startVoice(buffer, pending.position, pending.gain);
  }

  private ensureAmbience() {
    if (
      !this.context ||
      !this.master ||
      this.ambience.length ||
      !this.state.ambienceRequested
    )
      return;
    const ambienceBus = this.context.createGain();
    ambienceBus.gain.value = 0.0001;
    ambienceBus.connect(this.master);
    this.ambienceBus = ambienceBus;
    const now = this.context.currentTime;
    ambienceBus.gain.exponentialRampToValueAtTime(1, now + 2);
    const windGain = windGainForMotion(this.state.windLevel);
    const beds: Array<[SoundName, number, number]> = [
      ["windA", windGain, -4],
      ["windB", windGain * SCENE_AUDIO_MIX.windCrossfadeFloor, 4],
      ["meadow", SCENE_AUDIO_MIX.meadow, 0],
    ];
    for (const [name, gain, x] of beds) {
      const buffer = this.buffers.get(name);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      const bedGain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      bedGain.gain.value = gain;
      if (name === "meadow") {
        // This field recording is already stereo and should read as the broad
        // world bed. Sending it through a PannerNode would collapse that image
        // into a single point and make the birds seem attached to the camera.
        source.connect(bedGain).connect(ambienceBus);
      } else {
        const panner = this.context.createPanner();
        panner.panningModel = "equalpower";
        panner.distanceModel = "linear";
        panner.refDistance = 1;
        panner.maxDistance = 60;
        panner.rolloffFactor = 0.4;
        panner.positionX.value = x;
        panner.positionY.value = 0;
        panner.positionZ.value = -8;
        source.connect(panner).connect(bedGain).connect(ambienceBus);
      }
      source.start(0, Math.random() * Math.max(0.01, buffer.duration - 0.1));
      this.ambience.push(source);
      this.ambienceGains.push(bedGain);
    }
    this.crossfadeBeds();
  }

  private crossfadeBeds() {
    if (!this.context || this.ambienceGains.length < 2) return;
    const a = this.ambienceGains[0]!.gain;
    const bValue = this.ambienceGains[1]!.gain.value;
    this.rampWindBeds(!(a.value > bValue), 8);
    window.clearTimeout(this.crossfadeTimer);
    this.crossfadeTimer = window.setTimeout(() => this.crossfadeBeds(), 8_000);
  }

  private rampWindBeds(aHigh: boolean, seconds: number) {
    if (!this.context || this.ambienceGains.length < 2) return;
    const now = this.context.currentTime;
    const windGain = windGainForMotion(this.state.windLevel);
    const a = this.ambienceGains[0]!.gain;
    const b = this.ambienceGains[1]!.gain;
    a.cancelScheduledValues(now);
    b.cancelScheduledValues(now);
    a.linearRampToValueAtTime(
      windGain * (aHigh ? 1 : SCENE_AUDIO_MIX.windCrossfadeFloor),
      now + seconds,
    );
    b.linearRampToValueAtTime(
      windGain * (aHigh ? SCENE_AUDIO_MIX.windCrossfadeFloor : 1),
      now + seconds,
    );
  }

  private stopAmbientSources() {
    window.clearTimeout(this.crossfadeTimer);
    for (const source of this.ambience) {
      try {
        source.stop();
      } catch {}
    }
    this.ambience = [];
    this.ambienceGains = [];
    this.ambienceBus = null;
  }

  private fadeMaster(target: number, seconds: number) {
    if (!this.context || !this.master) return;
    const gain = this.master.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.exponentialRampToValueAtTime(
      Math.max(0.0001, target),
      now + Math.max(0.01, seconds),
    );
    if (target === 0)
      gain.setValueAtTime(0, now + Math.max(0.01, seconds) + 0.001);
  }

  private pruneVoices() {
    this.voices = this.voices.filter((voice) => voice.source.buffer != null);
  }

  private publish() {
    for (const subscriber of this.subscribers) subscriber(this.snapshot());
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export const sceneAudio = new SceneAudioRuntime();
