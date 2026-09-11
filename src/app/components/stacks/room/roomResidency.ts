import { type ReactNode } from "react";

export const ROOM_RETURN_WINDOW_MS = 3 * 60_000;

type Snapshot = {
  generation: number;
  enabled: boolean;
  active: boolean;
  content: ReactNode;
  expiresAt: number | null;
  returnHash: string | null;
};

type Clock = {
  now: () => number;
  schedule: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
};

/** One room per document. Only a completed room earns a timed return window;
 * changing reading routes never renews it. The deadline uses wall time so a
 * throttled background tab cannot revive an expired renderer. */
export class RoomResidency {
  private snapshot: Snapshot = {
    generation: 0,
    enabled: true,
    active: true,
    content: null,
    expiresAt: null,
    returnHash: null,
  };
  private listeners = new Set<() => void>();
  private owner: symbol | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retire: (() => void) | null = null;

  constructor(
    private clock: Clock = {
      now: () => Date.now(),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer),
    },
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private cancelTimer() {
    if (this.timer !== null) this.clock.cancel(this.timer);
    this.timer = null;
  }

  hasReadyRoom = () =>
    this.snapshot.content !== null &&
    this.snapshot.expiresAt !== null &&
    this.snapshot.expiresAt > this.clock.now();

  enter(owner: symbol, content: ReactNode) {
    if (this.snapshot.expiresAt !== null && !this.hasReadyRoom()) this.evict();
    this.cancelTimer();
    this.retire = null;
    this.owner = owner;
    this.publish({ content, active: true, expiresAt: null });
  }

  update(owner: symbol, content: ReactNode) {
    if (this.owner === owner && this.snapshot.content !== content)
      this.publish({ content });
  }

  leave(owner: symbol, ready: boolean, returnHash: string, retire: () => void) {
    if (this.owner !== owner) return;
    this.owner = null;
    this.retire = retire;
    this.publish({ active: false, returnHash });
    if (!ready || !this.snapshot.enabled) {
      this.evict();
      return;
    }
    const expiresAt = this.clock.now() + ROOM_RETURN_WINDOW_MS;
    this.publish({ expiresAt });
    this.timer = this.clock.schedule(() => this.evict(), ROOM_RETURN_WINDOW_MS);
  }

  setEnabled = (enabled: boolean) => {
    this.publish({ enabled });
    if (!enabled && !this.snapshot.active) this.evict();
  };

  /** Used for expiry, context loss while parked, and the diagnostic off path. */
  evict = () => {
    this.cancelTimer();
    const retire = this.retire;
    this.retire = null;
    this.publish({
      content: null,
      expiresAt: null,
      generation:
        this.snapshot.generation + (this.snapshot.content === null ? 0 : 1),
    });
    retire?.();
  };
}

export const roomResidency = new RoomResidency();
