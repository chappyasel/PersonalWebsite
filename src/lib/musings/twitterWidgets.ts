export type TwitterWidgets = {
  widgets: {
    createTweet(
      id: string,
      target: HTMLElement,
      options: { theme: "light" | "dark"; align: "center"; dnt: boolean },
    ): Promise<HTMLElement | undefined>;
  };
};
type TwitterBootstrap = Partial<TwitterWidgets> & {
  ready?: (callback: (api: TwitterWidgets) => void) => void;
};
const current = () => (window as Window & { twttr?: TwitterBootstrap }).twttr;
let pending: Promise<TwitterWidgets> | undefined;

/** One official widgets.js load, shared by all tweets on an article. */
export function loadTwitterWidgets(): Promise<TwitterWidgets> {
  const api = current();
  if (api?.widgets) return Promise.resolve(api as TwitterWidgets);
  if (pending) return pending;
  pending = new Promise<TwitterWidgets>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.dataset.musingTwitterWidgets = "";
    let settled = false;
    const finish = (ready?: TwitterWidgets) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (ready?.widgets) resolve(ready);
      else {
        script.remove();
        pending = undefined;
        reject(new Error("X embeds could not load"));
      }
    };
    const timeout = setTimeout(() => finish(), 15000);
    script.onload = () => {
      const loaded = current();
      if (loaded?.ready) loaded.ready((api) => finish(api));
      else if (loaded?.widgets) finish(loaded as TwitterWidgets);
      else finish();
    };
    script.onerror = () => finish();
    document.head.appendChild(script);
  });
  return pending;
}
