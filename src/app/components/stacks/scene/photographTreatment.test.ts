import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PHOTOGRAPH_TREATMENT,
  clonePhotographTexture,
  photographTreatmentController,
} from "./photographTreatment";

describe("photograph treatment controller", () => {
  afterEach(() => photographTreatmentController.reset());

  it("publishes one bounded session treatment", () => {
    let notifications = 0;
    const unsubscribe = photographTreatmentController.subscribe(() => {
      notifications += 1;
    });

    photographTreatmentController.update({
      chromaProtection: false,
      warmthMultiplier: 9,
      contrast: -2,
    });

    expect(photographTreatmentController.getSnapshot()).toEqual({
      chromaProtection: false,
      warmthMultiplier: 3,
      contrast: -1,
      coverShadowLift: true,
    });
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it("restores the production treatment", () => {
    photographTreatmentController.update({ contrast: -0.4, coverShadowLift: false });
    expect(photographTreatmentController.getSnapshot().coverShadowLift).toBe(false);
    photographTreatmentController.reset();

    expect(photographTreatmentController.getSnapshot()).toBe(
      DEFAULT_PHOTOGRAPH_TREATMENT,
    );
  });

  it("isolates the treated image source from the cached source texture", () => {
    const sourceImage = { width: 100, height: 50 };
    const source = new THREE.Texture(sourceImage);
    const treated = clonePhotographTexture(source);

    expect(treated.source).not.toBe(source.source);
    expect(treated.image).toBe(sourceImage);

    treated.image = { width: 20, height: 10 };
    expect(source.image).toBe(sourceImage);
  });
});
