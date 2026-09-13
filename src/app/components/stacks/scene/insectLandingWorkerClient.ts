import type { InsectCollisionIndex } from "./insectCollision";
import type { InsectLandingPlanResult } from "./insectLanding";
import type { LandingSnapshot } from "./insectLandingSnapshot";

export type LandingWorkerRequest = {
  generation: number;
  snapshot: Omit<LandingSnapshot, "index">;
  index?: InsectCollisionIndex;
};
export type LandingWorkerResponse = {
  generation: number;
  result: InsectLandingPlanResult;
  workerMs: number;
};
export type LandingTicket = {
  result: InsectLandingPlanResult | null;
  cancel: () => void;
  onReady: (callback: () => void) => void;
};
export type LandingWorkerPort = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<LandingWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
const unavailable: InsectLandingPlanResult = {
  ok: false,
  rejectionCode: "collision-index-unavailable",
};
type Job = {
  owner: object;
  generation: number;
  snapshot: LandingSnapshot;
  ticket: LandingTicket;
  submittedAt: number;
  notify: () => void;
};

/** One worker, one message in flight, at most one job per insect and 32 total.
 * Queued indexes are immutable cache references; structured cloning happens
 * only at dispatch, and only when the worker's index changes. */
export class InsectLandingWorkerClient {
  private worker: LandingWorkerPort | null = null;
  private owners = new Set<object>();
  private queue: Job[] = [];
  private active: Job | null = null;
  private generation = 0;
  private sentIndex: InsectCollisionIndex | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failed = false;
  private enabled = false;
  readonly timings = {
    requests: 0,
    completed: 0,
    workerMs: 0,
    maxWorkerMs: 0,
    planned: 0,
    roundTripMs: 0,
    dispatchMs: 0,
    failures: 0,
  };

  constructor(private readonly createWorker: () => LandingWorkerPort) {}

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.stop();
    this.failed = false;
  }

  canRequest() {
    return this.enabled && !this.failed && this.queue.length < 31;
  }

  request(owner: object, snapshot: LandingSnapshot): LandingTicket {
    let notify: (() => void) | undefined;
    const ticket: LandingTicket = {
      onReady: (callback) => {
        notify = callback;
      },
      result: null,
      cancel: () => {
        ticket.result = unavailable;
        this.queue = this.queue.filter((job) => job.ticket !== ticket);
      },
    };
    if (
      !this.enabled ||
      this.failed ||
      this.queue.length >= 31 ||
      snapshot.index.boxes.length > 8192 ||
      this.active?.owner === owner ||
      this.queue.some((job) => job.owner === owner)
    ) {
      ticket.result = unavailable;
      return ticket;
    }
    this.owners.add(owner);
    this.queue.push({
      owner,
      snapshot,
      ticket,
      generation: ++this.generation,
      submittedAt: performance.now(),
      notify: () => notify?.(),
    });
    this.timings.requests++;
    this.dispatch();
    return ticket;
  }

  release(owner: object) {
    this.owners.delete(owner);
    for (const job of [...this.queue, ...(this.active ? [this.active] : [])])
      if (job.owner === owner) job.ticket.cancel();
    if (this.owners.size === 0) this.stop();
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const job of this.queue) job.ticket.result = unavailable;
    if (this.active) this.active.ticket.result = unavailable;
    this.queue = [];
    this.active = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = null;
    this.sentIndex = null;
  }

  private fail = () => {
    this.failed = true;
    this.timings.failures++;
    this.stop();
  };

  private dispatch() {
    if (this.active || !this.queue.length || this.failed) return;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onerror = this.fail;
        this.worker.onmessageerror = this.fail;
        this.worker.onmessage = ({ data }) => {
          const job = this.active;
          if (data.generation !== job?.generation) return;
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          job.ticket.result ??= data.result;
          this.timings.completed++;
          this.timings.workerMs += data.workerMs;
          this.timings.maxWorkerMs = Math.max(
            this.timings.maxWorkerMs,
            data.workerMs,
          );
          if (data.result.ok) this.timings.planned++;
          this.timings.roundTripMs += performance.now() - job.submittedAt;
          this.active = null;
          job.notify();
          this.dispatch();
        };
      }
      const job = this.queue.shift()!;
      this.active = job;
      const { index, ...snapshot } = job.snapshot;
      const started = performance.now();
      this.worker.postMessage({
        generation: job.generation,
        snapshot,
        ...(this.sentIndex === index ? {} : { index }),
      } satisfies LandingWorkerRequest);
      this.timings.dispatchMs += performance.now() - started;
      this.sentIndex = index;
      // Includes startup. A broken worker stays failed until the switch cycles.
      this.timer = setTimeout(this.fail, 5000);
    } catch {
      this.fail();
    }
  }
}
