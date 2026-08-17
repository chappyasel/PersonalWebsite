import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCENE_AUDIO_MIX,
  SceneAudioRuntime,
  spatialGain,
  windGainForMotion,
} from "./sceneAudio";

class FakeParam {
  value = 1;
  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
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

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;
  static decodeImpl:
    | ((data: ArrayBuffer) => Promise<{ duration: number }>)
    | null = null;
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
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
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
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

  it("keeps wind inaudible until the grass reaches its windiest few percent", () => {
    expect(SCENE_AUDIO_MIX.windAudibleThreshold).toBeGreaterThanOrEqual(0.94);
    expect(windGainForMotion(0.56)).toBe(0);
    expect(windGainForMotion(0.9)).toBe(0);
    expect(windGainForMotion(0.98)).toBeGreaterThan(0);
    expect(windGainForMotion(1)).toBeLessThanOrEqual(0.012);
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
    expect(runtime.play("golf-win", { x: 0, y: 0, z: -20 }, 0.28)).toBe(
      true,
    );
    await vi.waitFor(() =>
      expect(FakeAudioContext.latest?.sources.length).toBeGreaterThan(0),
    );
    runtime.teardown();
  });
});
