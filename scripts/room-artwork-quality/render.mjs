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

import { canvasPixels } from "./pixels.mjs";
import { cropProjection } from "./projection.mjs";

const w = window;
async function digest(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function material(source, mode, map) {
  const m = new T.MeshBasicMaterial({
    color: source.color ?? 16777215,
    map: map ?? null,
    alphaMap: source.alphaMap ?? null,
    side: source.side,
    vertexColors: source.vertexColors ?? false,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite,
    polygonOffset: source.polygonOffset,
    polygonOffsetFactor: source.polygonOffsetFactor,
    polygonOffsetUnits: source.polygonOffsetUnits,
    fog: false,
    toneMapped: false,
  });
  m.visible = source.visible;
  if (mode === "depth") {
    m.colorWrite = false;
    m.depthWrite = true;
  }
  if (mode === "mask") {
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <alphatest_fragment>",
        "#include <alphatest_fragment>\n diffuseColor.rgb=vec3(1.0);",
      );
    };
    m.customProgramCacheKey = () => "quality-mask-v1";
  }
  return m;
}
w.__qualityCapture = async function (contract, specs, scale = 4) {
  const state = w.__qualityState();
  const { scene, gl } = state;
  const unit = scene.getObjectByName(`room-unit:${contract.index}`);
  if (!unit) throw Error("Unit missing");
  let booksData = null;
  if (contract.requiresDataIdentity) {
    for (const root of w.__qualityRoots.values()) {
      const q = [root.current];
      while (q.length) {
        const f = q.pop();
        const props = f.memoizedProps;
        const data = props?.data ?? props;
        if (data?.featuredBooks && data?.spineBooks) booksData = data;
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
    }
    if (
      !booksData ||
      (await digest(
        JSON.parse(serializeRoomBooksArtworkIdentity(booksData)),
      )) !== contract.capturedDataSha256
    )
      throw Error("Books data identity mismatch");
  }
  const resources = /* @__PURE__ */ new Set();
  const oldLoop = state.frameloop;
  state.setFrameloop("never");
  try {
    let restoredWind = 0;
    for (const root of w.__qualityRoots.values()) {
      const q = [root.current];
      while (q.length) {
        const f = q.pop();
        if (f.type?.name === "ActivePlantWind") {
          let h = f.memoizedState;
          while (h) {
            const b = h.memoizedState?.current;
            if (b?.restore && b?.dispose && b?.update) {
              b.restore();
              restoredWind++;
            }
            h = h.next;
          }
        }
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
    }
    scene.updateMatrixWorld(true);
    const rotations = new Map(
      contract.liveRotations.map((v) => [v.name, v.rotation]),
    );
    const cache = /* @__PURE__ */ new Map();
    const inv = restWorldMatrix(unit, cache, rotations).clone().invert();
    const paths = /* @__PURE__ */ new Map();
    unit.traverse((n) => {
      if (n.isMesh) {
        paths.set(capturedMeshPath(n, unit), n);
        paths.set(capturedMeshPath(n, unit, true), n);
      }
    });
    const savedUnit = new T.Matrix4().fromArray(contract.unitWorld);
    const ownerMeshes = /* @__PURE__ */ new Map();
    for (const owner of contract.owners) {
      const local = [];
      const ids = [];
      const meshes = [];
      for (const path of owner.paths) {
        const m = paths.get(path);
        if (!m) throw Error("Missing " + path);
        const matrix = inv
          .clone()
          .multiply(restWorldMatrix(m, cache, rotations));
        local.push(matrix.toArray().map((v) => Number(v.toFixed(6))));
        ids.push({ path, node: m.name, type: m.geometry.type });
        meshes.push({ m, matrix: savedUnit.clone().multiply(matrix) });
      }
      const pose = await digest(local),
        geometry = await digest(ids);
      if (
        pose !== owner.poseSha256 ||
        geometry !== owner.geometryIdentitySha256
      )
        throw Error(
          "Identity mismatch " +
            owner.id +
            " " +
            JSON.stringify({ pose, geometry, expected: owner.poseSha256 }),
        );
      ownerMeshes.set(owner.id, meshes);
    }
    const old = {
      target: gl.getRenderTarget(),
      clear: gl.getClearColor(new T.Color()),
      alpha: gl.getClearAlpha(),
      viewport: gl.getViewport(new T.Vector4()),
      scissor: gl.getScissor(new T.Vector4()),
      scissorTest: gl.getScissorTest(),
      tone: gl.toneMapping,
      output: gl.outputColorSpace,
      auto: gl.autoClear,
      xr: gl.xr.enabled,
    };
    const outputs = [];
    gl.xr.enabled = false;
    gl.autoClear = true;
    gl.toneMapping = T.NoToneMapping;
    gl.outputColorSpace = T.SRGBColorSpace;
    try {
      for (const spec of specs) {
        if (spec.id === "shelf") continue;
        const privateScene = new T.Scene();
        const owned = [];
        const textures = [];
        const entries = ownerMeshes.get(spec.id);
        if (!entries) throw Error("Unknown " + spec.id);
        const proxies = entries.map(({ m, matrix }, i) => {
          if (m.isSkinnedMesh || m.morphTargetInfluences?.some((v) => v !== 0))
            throw Error("Unsupported deformation " + spec.id);
          const source = Array.isArray(m.material) ? m.material : [m.material];
          if (
            source.some(
              (s) =>
                s.visible &&
                s.opacity !== 0 &&
                (s.isShaderMaterial || s.blending !== T.NormalBlending),
            )
          )
            throw Error("Unsupported visible material " + spec.id);
          const maps = source.map((s) => {
            if (!s.map) return null;
            const image = s.map.image;
            if (!image?.width || !image.height)
              throw Error("Texture not ready " + spec.id);
            if (
              spec.id === "mac" &&
              image instanceof HTMLCanvasElement &&
              image.width > 1
            ) {
              const c = document.createElement("canvas");
              c.width = image.width;
              c.height = image.height;
              paintMacAutomaton(c.getContext("2d"), createIconicRuleStill());
              const tex = s.map.clone();
              tex.image = c;
              tex.needsUpdate = true;
              textures.push(tex);
              resources.add(tex);
              return tex;
            }
            return s.map;
          });
          const mats = {};
          for (const mode of ["colour", "mask", "depth"])
            mats[mode] = source.map((s, j) => {
              const mat = material(s, mode, maps[j]);
              owned.push(mat);
              resources.add(mat);
              if (mode === "colour" && spec.treatment === "trophy") {
                mat.onBeforeCompile = (shader) => {
                  shader.vertexShader =
                    "varying vec3 illustrationNormal;\n" + shader.vertexShader;
                  shader.vertexShader = shader.vertexShader.replace(
                    "#include <begin_vertex>",
                    "#include <begin_vertex>\n illustrationNormal=normalize(normalMatrix*normal);",
                  );
                  shader.fragmentShader =
                    "varying vec3 illustrationNormal;\n" +
                    shader.fragmentShader;
                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <color_fragment>",
                    "#include <color_fragment>\n float facet=dot(normalize(illustrationNormal),normalize(vec3(-0.6,0.8,1.0)));diffuseColor.rgb*=0.52+floor(max(0.0,facet)*4.0)*0.16;",
                  );
                };
                mat.customProgramCacheKey = () => "projects-trophy-facets-v1";
              }
              return mat;
            });
          const proxy = m.isInstancedMesh
            ? new T.InstancedMesh(m.geometry, mats.colour, m.count)
            : new T.Mesh(m.geometry, mats.colour);
          if (m.isInstancedMesh) {
            proxy.instanceMatrix.copy(m.instanceMatrix);
            if (m.instanceColor) proxy.instanceColor = m.instanceColor.clone();
          }
          proxy.matrixAutoUpdate = false;
          proxy.matrix.copy(matrix);
          proxy.matrixWorld.copy(matrix);
          proxy.frustumCulled = false;
          proxy.renderOrder = m.renderOrder;
          privateScene.add(proxy);
          return { proxy, mats, detail: spec.details[i] };
        });
        const [, , width, height] = spec.box;
        const target = new T.WebGLRenderTarget(width * scale, height * scale, {
          samples: 4,
        });
        resources.add(target);
        target.texture.colorSpace = T.SRGBColorSpace;
        const camera = new T.PerspectiveCamera();
        camera.matrixAutoUpdate = false;
        camera.matrixWorldAutoUpdate = false;
        camera.matrixWorld.fromArray(contract.camera.world);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        camera.projectionMatrix.copy(
          cropProjection(contract.camera.projection, contract.raster, spec.box),
        );
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        const output = {
          id: spec.id,
          box: spec.box,
          scale,
          images: {},
          textures: entries.flatMap(({ m }) =>
            (Array.isArray(m.material) ? m.material : [m.material])
              .filter((v) => v.map)
              .map((v) => ({
                width: v.map.image.width,
                height: v.map.image.height,
                src: v.map.image.src ?? null,
              })),
          ),
        };
        for (const pass of ["mask", "colour", "detail"]) {
          if (pass === "detail" && !spec.details.some(Boolean)) continue;
          for (const p of proxies) {
            let mode = pass === "mask" ? "mask" : "colour";
            if (
              (pass === "detail" && !p.detail) ||
              (pass === "colour" && p.detail)
            )
              mode = "depth";
            p.proxy.material =
              p.mats[mode].length === 1 ? p.mats[mode][0] : p.mats[mode];
          }
          gl.setRenderTarget(target);
          gl.setViewport(0, 0, width * scale, height * scale);
          gl.setScissorTest(false);
          gl.setClearColor(0, 0);
          gl.clear(true, true, true);
          gl.render(privateScene, camera);
          const bytes = new Uint8Array(width * height * scale * scale * 4);
          gl.readRenderTargetPixels(
            target,
            0,
            0,
            width * scale,
            height * scale,
            bytes,
          );
          if (pass === "mask") {
            const rw = width * scale,
              rh = height * scale;
            for (let i = 0; i < rw; i++)
              if (
                bytes[i * 4 + 3] >= 128 ||
                bytes[((rh - 1) * rw + i) * 4 + 3] >= 128
              )
                throw Error("Crop clips " + spec.id);
            for (let j = 0; j < rh; j++)
              if (
                bytes[j * rw * 4 + 3] >= 128 ||
                bytes[(j * rw + rw - 1) * 4 + 3] >= 128
              )
                throw Error("Crop clips " + spec.id);
          }
          const c = document.createElement("canvas");
          c.width = width * scale;
          c.height = height * scale;
          const ctx = c.getContext("2d");
          const data = ctx.createImageData(c.width, c.height);
          data.data.set(canvasPixels(bytes, c.width, c.height));
          ctx.putImageData(data, 0, 0);
          output.images[pass] = c.toDataURL("image/png");
        }
        outputs.push(output);
        for (const item of [target, ...owned, ...textures]) {
          item.dispose();
          resources.delete(item);
        }
        console.log("QUALITY_OWNER", spec.id);
      }
      return {
        version: 1,
        readback:
          "bottom-up premultiplied RGBA explicitly unpremultiplied before Canvas ImageData (archive capture.ts contract)",
        scale,
        restoredWind,
        owners: outputs,
        source:
          "live geometry at saved camera and validated unit-local rest transforms",
      };
    } finally {
      gl.setRenderTarget(old.target);
      gl.setClearColor(old.clear, old.alpha);
      gl.setViewport(old.viewport);
      gl.setScissor(old.scissor);
      gl.setScissorTest(old.scissorTest);
      gl.toneMapping = old.tone;
      gl.outputColorSpace = old.output;
      gl.autoClear = old.auto;
      gl.xr.enabled = old.xr;
    }
  } finally {
    for (const resource of resources) resource.dispose();
    state.setFrameloop(oldLoop);
  }
};
