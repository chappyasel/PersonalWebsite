import { serializeRoomBooksArtworkIdentity } from "../../src/app/components/stacks/illustration/artwork/booksIdentity";
import {
  capturedMeshPath,
  restWorldMatrix,
} from "../../src/app/components/stacks/illustration/restTransforms";
import {
  createIconicRuleStill,
  paintMacAutomaton,
} from "../../src/app/components/stacks/scene/macScreen";
import * as T from "three";

// Inject only into the disposable headless page created by capture-display.
// The page closes after readback, releasing its renderer and frozen scene.

async function digest(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
const ownerCode = (i) => (i * 1234567) & 0xffffff;

window.__captureDisplay = async function (contract) {
  const state = window.__qualityState();
  const { scene, camera, gl } = state;
  const fibers = [];
  for (const root of window.__qualityRoots.values()) {
    const q = [root.current];
    while (q.length) {
      const f = q.pop();
      fibers.push(f);
      if (f.child) q.push(f.child);
      if (f.sibling) q.push(f.sibling);
    }
  }
  const composers = new Set(
    fibers
      .map((f) => f.memoizedProps?.value)
      .filter(
        (v) =>
          v?.scene === scene &&
          v?.camera === camera &&
          v?.composer?.getRenderer?.() === gl,
      )
      .map((v) => v.composer),
  );
  if (composers.size !== 1)
    throw Error(`Expected one live composer, found ${composers.size}`);
  const composer = [...composers][0];
  const passes = composer.passes.map((p) => ({
    name: p.name,
    enabled: p.enabled,
    renderToScreen: p.renderToScreen,
    effects: p.effects?.map((e) => e.name),
  }));
  const effectSettings = composer.passes
    .flatMap((p) => p.effects ?? [])
    .map((e) => ({
      name: e.name,
      uniforms: Object.fromEntries(
        [...e.uniforms]
          .filter(
            ([, u]) =>
              typeof u.value === "number" || typeof u.value === "boolean",
          )
          .map(([key, u]) => [key, u.value]),
      ),
    }));
  if (
    !passes.some((p) => p.enabled && p.renderToScreen) ||
    !passes.some((p) => p.enabled && p.effects?.includes("GradeEffect")) ||
    !scene.environment
  )
    throw Error("Finished display chain is not ready");
  if (contract.requiresDataIdentity) {
    const data = fibers
      .map((f) => f.memoizedProps?.data ?? f.memoizedProps)
      .find((p) => p?.featuredBooks && p?.spineBooks);
    if (
      !data ||
      (await digest(JSON.parse(serializeRoomBooksArtworkIdentity(data)))) !==
        contract.capturedDataSha256
    )
      throw Error("Books data identity mismatch");
  }
  const liveCamera = {
    world: camera.matrixWorld.toArray(),
    projection: camera.projectionMatrix.toArray(),
  };
  state.setFrameloop("never");
  const diagnostics = window.__stacks?.state?.();
  if (
    diagnostics?.activeUnit !== contract.index ||
    diagnostics?.dragging ||
    diagnostics?.quality?.moving
  )
    throw Error("Room is not settled at the selected unit");
  const geometries = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
  });
  const restored = new Set();
  for (const f of fibers)
    for (let h = f.memoizedState; h; h = h.next) {
      const b = h.memoizedState?.current;
      if (
        b?.restore &&
        b?.dispose &&
        b?.update &&
        geometries.has(b.geometry) &&
        !restored.has(b)
      ) {
        b.restore();
        restored.add(b);
      }
    }
  scene.updateMatrixWorld(true);
  const unit = scene.getObjectByName(`room-unit:${contract.index}`);
  const rotations = new Map(
    contract.liveRotations.map((v) => [v.name, v.rotation]),
  );
  const cache = new Map();
  const inv = restWorldMatrix(unit, cache, rotations).clone().invert();
  const paths = new Map();
  unit.traverse((n) => {
    if (n.isMesh) {
      paths.set(capturedMeshPath(n, unit), n);
      paths.set(capturedMeshPath(n, unit, true), n);
    }
  });
  const ownerOf = new Map();
  const savedUnit = new T.Matrix4().fromArray(contract.unitWorld);
  for (const [i, owner] of contract.owners.entries()) {
    const local = [],
      ids = [],
      nodes = [];
    for (const path of owner.paths) {
      const mesh = paths.get(path);
      if (!mesh) throw Error("Missing " + path);
      for (const mat of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        if (mat.map && (!mat.map.image?.width || !mat.map.image?.height))
          throw Error("Texture not ready: " + owner.id);
      const matrix = inv
        .clone()
        .multiply(restWorldMatrix(mesh, cache, rotations));
      local.push(matrix.toArray().map((v) => Number(v.toFixed(6))));
      ids.push({ path, node: mesh.name, type: mesh.geometry.type });
      nodes.push([mesh, savedUnit.clone().multiply(matrix)]);
    }
    if (
      (await digest(local)) !== owner.poseSha256 ||
      (await digest(ids)) !== owner.geometryIdentitySha256
    )
      throw Error("Rest identity changed: " + owner.id);
    for (const [mesh, matrix] of nodes) {
      mesh.matrixWorldAutoUpdate = false;
      mesh.matrixWorld.copy(matrix);
      ownerOf.set(mesh, ownerCode(i + 1));
      if (owner.id === "mac")
        for (const mat of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          const canvas = mat.map?.image;
          if (canvas instanceof HTMLCanvasElement && canvas.width > 1) {
            paintMacAutomaton(canvas.getContext("2d"), createIconicRuleStill());
            mat.map.needsUpdate = true;
          }
        }
    }
  }
  if (Math.abs(camera.position.x - contract.camera.world[12]) > 0.02)
    throw Error(
      "Camera-following lighting has not settled at the selected shelf",
    );
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  camera.matrixWorld.fromArray(contract.camera.world);
  camera.matrixWorld.decompose(
    camera.position,
    camera.quaternion,
    camera.scale,
  );
  camera.matrix.copy(camera.matrixWorld);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.projectionMatrix.fromArray(contract.camera.projection);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const ratio = contract.raster[0] / contract.browserViewport[0];
  gl.setPixelRatio(ratio);
  composer.setSize(...contract.browserViewport);
  let autoClear = true;
  for (const f of fibers)
    if (f.memoizedProps?.value?.composer === composer) {
      for (let p = f.return; p; p = p.return)
        if (typeof p.memoizedProps?.autoClear === "boolean") {
          autoClear = p.memoizedProps.autoClear;
          break;
        }
    }
  const oldAuto = gl.autoClear;
  gl.autoClear = autoClear;
  if (!autoClear) gl.clearStencil();
  composer.render(0);
  const images = { live: gl.domElement.toDataURL("image/png") };
  // Match the full scene's visibility, including non-artwork occluders. Keep
  // each original vertex shader so instanced grass is not turned into planes.
  const materials = [];
  scene.traverse((o) => {
    if (!o.material) return;
    const id = ownerOf.get(o) ?? 0;
    const rgb = [(id >> 16) & 255, (id >> 8) & 255, id & 255].map((v) =>
      (v / 255).toFixed(8),
    );
    const replace = (source) => {
      const mat = source.clone();
      materials.push(mat);
      const prior = source.onBeforeCompile;
      const inject = (shader) => {
        const end = shader.fragmentShader.lastIndexOf("}");
        shader.fragmentShader =
          shader.fragmentShader.slice(0, end) +
          `\ngl_FragColor.rgb=vec3(${rgb.join(",")});\n` +
          shader.fragmentShader.slice(end);
      };
      if (mat.isShaderMaterial) inject(mat);
      else
        mat.onBeforeCompile = (shader, renderer) => {
          prior.call(source, shader, renderer);
          inject(shader);
        };
      mat.customProgramCacheKey = () =>
        `display-owner-${id}-${source.customProgramCacheKey()}`;
      mat.needsUpdate = true;
      return mat;
    };
    o.material = Array.isArray(o.material)
      ? o.material.map(replace)
      : replace(o.material);
  });
  scene.background = new T.Color(0);
  gl.autoClear = true;
  gl.setRenderTarget(null);
  gl.render(scene, camera);
  images.owners = gl.domElement.toDataURL("image/png");
  for (const m of materials) m.dispose();
  gl.autoClear = oldAuto;
  return {
    images,
    metadata: {
      liveCamera,
      savedCamera: contract.camera,
      renderer: {
        toneMapping: gl.toneMapping,
        exposure: gl.toneMappingExposure,
        outputColorSpace: gl.outputColorSpace,
      },
      canvas: [gl.domElement.width, gl.domElement.height],
      dpr: gl.getPixelRatio(),
      environment: !!scene.environment,
      passes,
      effectSettings,
      autoClear,
      restoredWind: restored.size,
      owners: contract.owners.map((o, i) => ({
        id: o.id,
        code: ownerCode(i + 1),
      })),
      diagnostics,
      lights: scene.children
        .filter((o) => o.isLight)
        .map((o) => ({
          type: o.type,
          position: o.position.toArray(),
          intensity: o.intensity,
        })),
    },
  };
};
