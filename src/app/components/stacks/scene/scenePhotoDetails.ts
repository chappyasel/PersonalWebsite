import * as THREE from "three";

type Disposable = Readonly<{ dispose: () => void }>;

export type DetailResourceLease<Resource> = Readonly<{
  promise: Promise<Resource>;
  /** Flips synchronously before the final resource can be disposed. */
  released: boolean;
  release: () => void;
}>;

export function createDetailResourceLoader<Resource extends Disposable>(
  load: (url: string, signal: AbortSignal) => Promise<Resource>,
) {
  type Entry = {
    controller: AbortController;
    references: number;
    promise: Promise<Resource>;
    resource?: Resource;
  };

  const entries = new Map<string, Entry>();

  return Object.freeze({
    request(url: string): DetailResourceLease<Resource> {
      let entry = entries.get(url);
      if (entry) entry.references += 1;
      else {
        const controller = new AbortController();
        entry = {
          controller,
          references: 1,
          promise: Promise.resolve(undefined as never),
        };
        const current = entry;
        current.promise = load(url, controller.signal)
          .then((resource) => {
            if (
              controller.signal.aborted ||
              current.references === 0 ||
              entries.get(url) !== current
            ) {
              resource.dispose();
              throw new DOMException("Detail request aborted", "AbortError");
            }
            current.resource = resource;
            return resource;
          })
          .catch((error: unknown) => {
            if (entries.get(url) === current) entries.delete(url);
            throw error;
          });
        entries.set(url, current);
      }

      const leased = entry;
      let released = false;
      return Object.freeze({
        promise: leased.promise,
        get released() {
          return released;
        },
        release() {
          if (released) return;
          released = true;
          leased.references -= 1;
          if (leased.references > 0) return;
          if (entries.get(url) === leased) entries.delete(url);
          leased.controller.abort();
          leased.resource?.dispose();
          leased.resource = undefined;
        },
      });
    },

    has(url: string) {
      return entries.has(url);
    },
  });
}

async function loadDetailTexture(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Failed to load scene photo detail: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "flipY",
  });
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException("Detail request aborted", "AbortError");
  }
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  const dispose = texture.dispose.bind(texture);
  texture.dispose = () => {
    dispose();
    bitmap.close();
  };
  return texture;
}

export const scenePhotoDetailTextures =
  createDetailResourceLoader(loadDetailTexture);
