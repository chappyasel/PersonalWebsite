import { roomResidency } from "./roomResidency";

type Listener = EventListenerOrEventListenerObject;
type Registration = {
  type: string;
  listener: Listener;
  wrapped: EventListener;
  options?: boolean | AddEventListenerOptions;
  capture: boolean;
};

/** Window-level scene gestures must not observe clicks/keys on reading pages.
 * Detach their listeners while parked without tearing down the scene graph. */
export function roomEventTarget<T extends Window | Document>(target: () => T) {
  const registrations: Registration[] = [];
  let unsubscribe: (() => void) | null = null;
  let active = roomResidency.getSnapshot().active;
  const remove = (
    type: string,
    listener: Listener | null,
    options?: boolean | EventListenerOptions,
  ) => {
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    const index = registrations.findIndex(
      (entry) =>
        entry.type === type &&
        entry.listener === listener &&
        entry.capture === capture,
    );
    if (index < 0) return;
    const [entry] = registrations.splice(index, 1);
    target().removeEventListener(type, entry!.wrapped, capture);
    if (registrations.length === 0) {
      unsubscribe?.();
      unsubscribe = null;
    }
  };
  const add = (
    type: string,
    listener: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!listener) return;
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    if (
      registrations.some(
        (entry) =>
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === capture,
      )
    )
      return;
    if (!unsubscribe) {
      active = roomResidency.getSnapshot().active;
      unsubscribe = roomResidency.subscribe(() => {
        const next = roomResidency.getSnapshot().active;
        if (next === active) return;
        active = next;
        for (const entry of registrations) {
          if (active)
            target().addEventListener(entry.type, entry.wrapped, entry.options);
          else {
            target().removeEventListener(
              entry.type,
              entry.wrapped,
              entry.capture,
            );
            // Leaving the room releases held keys and carried props just as
            // leaving the window does. Do not send a blur to the reading page.
            if (entry.type === "blur") {
              const event = new Event("blur");
              if (typeof entry.listener === "function")
                entry.listener.call(target(), event);
              else entry.listener.handleEvent(event);
            }
          }
        }
      });
    }
    const wrapped: EventListener = (event) => {
      if (!roomResidency.getSnapshot().active) return;
      if (typeof options === "object" && options.once)
        remove(type, listener, options);
      if (typeof listener === "function") listener.call(target(), event);
      else listener.handleEvent(event);
    };
    registrations.push({ type, listener, wrapped, options, capture });
    if (active) target().addEventListener(type, wrapped, options);
  };
  return { addEventListener: add, removeEventListener: remove } as Pick<
    T,
    "addEventListener" | "removeEventListener"
  >;
}

export const roomWindowEvents = roomEventTarget(() => window);
export const roomDocumentEvents = roomEventTarget(() => document);
