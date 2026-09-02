import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCENE_AUDIO_MIX,
  SceneAudioRuntime,
  VISION_RIDE_ENTRY_WHOOSH_SECONDS,
  VISION_RIDE_EXIT_WHOOSH_SECONDS,
  VISION_RIDE_SOUNDTRACK_GAIN,
  VISION_RIDE_STATIC_PEAK,
  VISION_RIDE_WHOOSH_ATTACK_SECONDS,
  spatialGain,
  windGainForMotion,
} from "./sceneAudio";

class FakeParam {
  value = 1;
  schedule: Array<{ method: "set" | "ramp"; value: number; time?: number }> =
    [];
  setValueAtTime(value: number, time?: number) {
    this.value = value;
    this.schedule.push({ method: "set", value, time });
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  exponentialRampToValueAtTime(value: number, time?: number) {
    this.value = value;
    this.schedule.push({ method: "ramp", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time?: number) {
    this.value = value;
    this.schedule.push({ method: "ramp", value, time });
    return this;
  }
}

class FakeNode {
  connect<T>(target: T): T {
    return target;
  }
}

class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  playbackRate = new FakeParam();
  loop = false;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = "sine";
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakePanner extends FakeNode {
  panningModel = "HRTF";
  distanceModel = "inverse";
  refDistance = 1;
  maxDistance = 30;
  rolloffFactor = 1;
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = "lowpass";
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;
  static decodeImpl:
    | ((data: ArrayBuffer) => Promise<{ duration: number }>)
    | null = null;
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  oscillators: FakeOscillator[] = [];
  filters: FakeFilter[] = [];
  listener = {
    positionX: new FakeParam(),
    positionY: new FakeParam(),
    positionZ: new FakeParam(),
    forwardX: new FakeParam(),
    forwardY: new FakeParam(),
    forwardZ: new FakeParam(),
    upX: new FakeParam(),
    upY: new FakeParam(),
    upZ: new FakeParam(),
  };
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  constructor() {
    FakeAudioContext.latest = this;
  }
  gains: Array<{ gain: FakeParam }> = [];
  createGain() {
    const gain = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.gains.push(gain);
    return gain;
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const channel = new Float32Array(length);
    return {
      duration: length / sampleRate,
      getChannelData: () => channel,
    };
  }
  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createPanner() {
    return new FakePanner();
  }
  async decodeAudioData(data: ArrayBuffer) {
    if (FakeAudioContext.decodeImpl)
      return await FakeAudioContext.decodeImpl(data);
    return { duration: 2 };
  }
}

function installAudioBrowser(
  arrayBufferForPath: (path: string) => ArrayBuffer = () => new ArrayBuffer(1),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => ({
      ok: true,
      arrayBuffer: async () => arrayBufferForPath(path),
    })),
  );
  vi.stubGlobal("window", {
    AudioContext: FakeAudioContext,
    webkitAudioContext: undefined,
    setTimeout,
    clearTimeout,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeAudioContext.latest = null;
  FakeAudioContext.decodeImpl = null;
});

describe("scene audio policy", () => {
  it("keeps the ambient beds subordinate to physical scene sounds", () => {
    const loudestWindSum =
      windGainForMotion(1) * (1 + SCENE_AUDIO_MIX.windCrossfadeFloor);
    expect(loudestWindSum).toBeLessThan(0.05);
    expect(SCENE_AUDIO_MIX.meadow).toBeLessThan(0.1);
  });

  it("makes normal grass motion audible and gives stronger gusts more presence", () => {
    const baseline = windGainForMotion(0.56);
    const revealGust = windGainForMotion(0.7);
    expect(windGainForMotion(0.4)).toBe(0);
    expect(baseline).toBeGreaterThan(0);
    expect(revealGust).toBeGreaterThan(baseline * 2);
    expect(windGainForMotion(1)).toBeLessThanOrEqual(0.034);
  });

  it("uses a bounded spatial falloff", () => {
    expect(spatialGain(0)).toBe(1);
    expect(spatialGain(5)).toBeGreaterThan(spatialGain(15));
    expect(spatialGain(42)).toBe(0);
  });

  it("unlocks enabled, suspends while hidden and tears down", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    runtime.startAmbience();
    runtime.setWindLevel(0.2);
    expect(runtime.snapshot()).toMatchObject({
      unlocked: true,
      ambienceRequested: true,
      windLevel: 0.2,
    });

    runtime.visibility(true);
    await vi.advanceTimersByTimeAsync(151);
    expect(FakeAudioContext.latest?.suspend).toHaveBeenCalledOnce();
    expect(runtime.snapshot().suspended).toBe(true);

    runtime.visibility(false);
    await Promise.resolve();
    expect(FakeAudioContext.latest?.resume).toHaveBeenCalledOnce();
    const context = FakeAudioContext.latest;
    runtime.teardown();
    expect(context?.close).toHaveBeenCalledOnce();
    expect(runtime.snapshot()).toMatchObject({
      unlocked: false,
      ambienceRequested: false,
      voices: 0,
    });
  });

  it("mutes the authoritative mix without accepting hidden one-shots", () => {
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.setMuted(true);
    runtime.unlock();

    expect(runtime.snapshot().muted).toBe(true);
    expect(runtime.play("golf-strike", { x: 0, y: 0, z: 0 })).toBe(false);

    runtime.setMuted(false);
    expect(runtime.snapshot().muted).toBe(false);
    expect(runtime.play("golf-strike", { x: 0, y: 0, z: 0 })).toBe(true);
    runtime.teardown();
  });

  it("does not fetch the ride soundtrack while muted and starts it after unmute", async () => {
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.setMuted(true);
    runtime.unlock();
    runtime.startVisionRide();
    await Promise.resolve();
    const fetchMock = vi.mocked(fetch);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        (typeof url === "string"
          ? url
          : url instanceof URL
            ? url.href
            : url.url
        ).includes("synthwave"),
      ),
    ).toBe(false);

    runtime.setMuted(false);
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          (typeof url === "string"
            ? url
            : url instanceof URL
              ? url.href
              : url.url
          ).includes("synthwave"),
        ),
      ).toBe(true),
    );
    await vi.waitFor(() =>
      expect(runtime.snapshot().rideStatus).toBe("playing"),
    );
    runtime.teardown();
  });

  it("never replays entry static when audio unlocks after the road is visible", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.setMuted(true);
    runtime.unlock();
    runtime.startVisionRide();

    // The visual transition has finished before the user enables sound.
    runtime.finishVisionRideEntry();
    await vi.advanceTimersByTimeAsync(1);
    runtime.setMuted(false);
    await vi.advanceTimersByTimeAsync(1);

    await vi.waitFor(() =>
      expect(runtime.snapshot().rideStatus).toBe("playing"),
    );
    // The decoded soundtrack loops, but no second looping source (static)
    // may appear after the picture is already open.
    expect(
      FakeAudioContext.latest!.sources.filter((source) => source.loop),
    ).toHaveLength(1);
    runtime.teardown();
  });

  it("stops opening static synchronously at the visual boundary", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    await vi.advanceTimersByTimeAsync(1);
    runtime.startVisionRide(false);
    await vi.advanceTimersByTimeAsync(1);

    const loopsBeforeSwitchOn = FakeAudioContext.latest!.sources.filter(
      (source) => source.loop,
    );
    expect(loopsBeforeSwitchOn).toHaveLength(1); // soundtrack only
    runtime.beginVisionRideSwitchOn();
    const staticSource = FakeAudioContext.latest!.sources.find(
      (source) => source.loop && !loopsBeforeSwitchOn.includes(source),
    );
    expect(staticSource).toBeDefined();
    runtime.finishVisionRideEntry();
    expect(staticSource!.stop).toHaveBeenCalled();
    runtime.teardown();
  });

  it("crossfades the ride bus, softens reduced-motion transitions, and tears down", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    runtime.startAmbience();
    await vi.advanceTimersByTimeAsync(1);
    runtime.startVisionRide(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.snapshot().rideRequested).toBe(true);
    expect(FakeAudioContext.latest?.oscillators).toHaveLength(1);

    runtime.beginVisionRideExit();
    expect(FakeAudioContext.latest?.oscillators).toHaveLength(2);
    runtime.stopVisionRide();
    // The ride bus fades over 0.5 s under the return curtain; sources stop
    // once the fade has landed.
    await vi.advanceTimersByTimeAsync(521);
    expect(runtime.snapshot().rideRequested).toBe(false);
    expect(
      FakeAudioContext.latest?.oscillators.every(
        (oscillator) => oscillator.stop.mock.calls.length > 0,
      ),
    ).toBe(true);
    runtime.teardown();
  });

  it("does not leave synthesized engine noise running under the drive", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    await vi.advanceTimersByTimeAsync(1);
    runtime.startVisionRide(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(
      FakeAudioContext.latest!.oscillators.filter(
        (oscillator) => oscillator.stop.mock.calls.length === 0,
      ),
    ).toHaveLength(0);
    runtime.teardown();
  });

  it("keeps transition static audible over the soundtrack without overpowering it", () => {
    expect(VISION_RIDE_STATIC_PEAK).toBeGreaterThanOrEqual(
      VISION_RIDE_SOUNDTRACK_GAIN * 0.25,
    );
    expect(VISION_RIDE_STATIC_PEAK).toBeLessThan(
      VISION_RIDE_SOUNDTRACK_GAIN * 0.5,
    );
  });

  it("gates broadband television static instead of swelling like a puff", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    await vi.advanceTimersByTimeAsync(1);
    runtime.startVisionRide(false);
    await vi.advanceTimersByTimeAsync(1);
    runtime.beginVisionRideSwitchOn();

    expect(FakeAudioContext.latest!.filters.map((filter) => filter.type)).toEqual([
      "highpass",
      "lowpass",
    ]);
    const staticEnvelope = FakeAudioContext.latest!.gains
      .map((node) => node.gain.schedule)
      .find((schedule) =>
        schedule.some((event) => event.value === VISION_RIDE_STATIC_PEAK),
      );
    expect(staticEnvelope).toBeDefined();
    expect(staticEnvelope![1]!.time).toBeLessThanOrEqual(0.02);
    expect(staticEnvelope).toHaveLength(4);
    expect(staticEnvelope![2]).toMatchObject({
      method: "set",
      value: VISION_RIDE_STATIC_PEAK,
    });
    expect(staticEnvelope![2]!.time).toBeCloseTo(0.5, 5);
    runtime.teardown();
  });

  it("shapes both ride whooshes with a short attack before the release", async () => {
    vi.useFakeTimers();
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    await vi.advanceTimersByTimeAsync(1);
    runtime.startVisionRide(false);
    await vi.advanceTimersByTimeAsync(1);
    const whooshSchedule = (peak: number) =>
      FakeAudioContext.latest!.gains.map((node) => node.gain.schedule).find(
        (schedule) =>
          schedule.length === 3 &&
          schedule[0]!.method === "set" &&
          schedule[0]!.value === 0.0001 &&
          schedule[1]!.method === "ramp" &&
          schedule[1]!.value === peak &&
          schedule[2]!.method === "ramp" &&
          schedule[2]!.value === 0.0001,
      );
    const entry = whooshSchedule(0.018);
    expect(entry).toBeDefined();
    expect(entry![1]!.time).toBeCloseTo(VISION_RIDE_WHOOSH_ATTACK_SECONDS, 5);
    expect(entry![2]!.time).toBeCloseTo(VISION_RIDE_ENTRY_WHOOSH_SECONDS, 5);

    runtime.beginVisionRideExit();
    const exit = whooshSchedule(0.022);
    expect(exit).toBeDefined();
    expect(exit![1]!.time).toBeCloseTo(VISION_RIDE_WHOOSH_ATTACK_SECONDS, 5);
    expect(exit![2]!.time).toBeCloseTo(VISION_RIDE_EXIT_WHOOSH_SECONDS, 5);
    expect(VISION_RIDE_WHOOSH_ATTACK_SECONDS).toBeLessThan(
      Math.min(
        VISION_RIDE_ENTRY_WHOOSH_SECONDS,
        VISION_RIDE_EXIT_WHOOSH_SECONDS,
      ) * 0.25,
    );
    runtime.teardown();
  });

  it("rate-limits impacts and caps simultaneous positional voices", async () => {
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    const position = { x: 0, y: 0, z: 0 };
    expect(runtime.play("golf-turf", position)).toBe(true);
    await vi.waitFor(() =>
      expect(FakeAudioContext.latest?.sources.length).toBeGreaterThan(0),
    );
    expect(runtime.play("golf-turf", position)).toBe(false);
    for (let voice = 0; voice < 16; voice += 1)
      expect(runtime.play("golf-strike", position)).toBe(true);
    expect(runtime.snapshot().voices).toBe(12);
    const strikeSources = FakeAudioContext.latest!.sources.slice(-16);
    expect(
      new Set(strikeSources.slice(0, 4).map((source) => source.buffer)).size,
    ).toBe(4);
    runtime.teardown();
  });

  it("does not drop the first strike while its priority sample is decoding", async () => {
    let finishDecode!: (buffer: { duration: number }) => void;
    const decode = new Promise<{ duration: number }>((resolve) => {
      finishDecode = resolve;
    });
    FakeAudioContext.decodeImpl = async () => await decode;
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();

    expect(runtime.play("golf-strike", { x: 0, y: 0, z: 0 })).toBe(true);
    expect(FakeAudioContext.latest?.sources).toHaveLength(0);

    finishDecode({ duration: 2 });
    await vi.waitFor(() =>
      expect(
        FakeAudioContext.latest?.sources.some(
          (source) => source.start.mock.calls.length > 0,
        ),
      ).toBe(true),
    );
    runtime.teardown();
  });

  it("starts core ambience without waiting for unrelated one-shots", async () => {
    let finishCup!: (buffer: { duration: number }) => void;
    const cupDecode = new Promise<{ duration: number }>((resolve) => {
      finishCup = resolve;
    });
    FakeAudioContext.decodeImpl = async (data) =>
      data.byteLength === 2 ? await cupDecode : { duration: 2 };
    installAudioBrowser((path) =>
      path.includes("golf-cup") ? new ArrayBuffer(2) : new ArrayBuffer(1),
    );
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    runtime.startAmbience();

    await vi.waitFor(() =>
      expect(
        FakeAudioContext.latest?.sources.filter((source) => source.loop),
      ).toHaveLength(3),
    );
    finishCup({ duration: 2 });
    runtime.teardown();
  });

  it("keeps the cup woo accepted as a quiet positional celebration", async () => {
    installAudioBrowser();
    const runtime = new SceneAudioRuntime();
    runtime.unlock();
    expect(runtime.play("golf-win", { x: 0, y: 0, z: -20 }, 0.28)).toBe(true);
    await vi.waitFor(() =>
      expect(FakeAudioContext.latest?.sources.length).toBeGreaterThan(0),
    );
    runtime.teardown();
  });
});
