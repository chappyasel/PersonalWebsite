// Node-only CPU cost and geometry budget. This is not a browser/GPU benchmark.
import { sampleMeadowWind } from "../../src/app/components/stacks/scene/meadowMotion";
import {
  PLANT_KINDS,
  createPlantWindBinding,
} from "../../src/app/components/stacks/scene/plantWind";
import { MeshoptDecoder } from "meshoptimizer";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

for (const kind of PLANT_KINDS) {
  const bytes = fs.readFileSync(`public/models/${kind}.glb`);
  const root = (
    await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      )
  ).scene;
  let mesh!: THREE.Mesh;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) mesh = node as THREE.Mesh;
  });
  const source = mesh.geometry;
  const start = performance.now();
  const binding = createPlantWindBinding(mesh, root, kind);
  const prepareMs = performance.now() - start;
  const position = source.getAttribute("position");
  const rest = Array.from({ length: position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, i),
  );
  const samples: number[] = [];
  for (let i = 0; i < 2500; i++) {
    const wind = sampleMeadowWind(2.2, -1.72, i / 60);
    const at = performance.now();
    binding.update(i / 60, wind.x, wind.z, 1);
    if (i >= 500) samples.push(performance.now() - at);
  }
  samples.sort((a, b) => a - b);
  let maxDisplacement = 0;
  let maxPotDisplacement = 0;
  const current = new THREE.Vector3();
  const vector = new THREE.Vector3();
  for (let frame = 0; frame < 600; frame++) {
    const wind = sampleMeadowWind(2.2, -1.72, frame / 10);
    binding.update(frame / 10, wind.x, wind.z, 1);
    for (let i = 0; i < position.count; i++) {
      current.fromBufferAttribute(mesh.geometry.getAttribute("position"), i);
      vector.copy(current).sub(rest[i]!);
      vector.applyMatrix3(new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld));
      maxDisplacement = Math.max(maxDisplacement, vector.length());
      if (binding.parts.pot.vertices.includes(i))
        maxPotDisplacement = Math.max(maxPotDisplacement, vector.length());
    }
  }
  const motionRanges = [];
  const rootLinear = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld);
  for (const [label, speed, power] of [
    ["ordinary", 1, 1],
    ["maximum", 4, 10],
  ] as const) {
    let travel = 0;
    let peak = 0;
    let previous: THREE.Vector3[] | undefined;
    for (let frame = 0; frame < 600; frame++) {
      const time = frame / 60;
      const wind = sampleMeadowWind(
        2.2,
        -1.72,
        time,
        0.21 * power,
        1.608 * speed,
      );
      binding.update(time * speed, wind.x, wind.z, 1);
      const current = Array.from({ length: position.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(
          mesh.geometry.getAttribute("position"),
          i,
        ),
      );
      let step = 0;
      for (let i = 0; i < current.length; i++) {
        peak = Math.max(
          peak,
          vector
            .copy(current[i]!)
            .sub(rest[i]!)
            .applyMatrix3(rootLinear)
            .length(),
        );
        if (previous)
          step = Math.max(
            step,
            vector
              .copy(current[i]!)
              .sub(previous[i]!)
              .applyMatrix3(rootLinear)
              .length(),
          );
      }
      travel += step;
      previous = current;
    }
    motionRanges.push({
      label,
      peakRootMeters: peak,
      travelRootMetersPerSecond: travel / 10,
    });
  }
  console.log(
    JSON.stringify(
      {
        kind,
        motionRanges,
        prepareMs,
        cpuUpdateMs: { p50: samples[1000], p95: samples[1900] },
        vertices: position.count,
        triangles: (source.index?.count ?? position.count) / 3,
        extraDraws: 0,
        extraTextures: 0,
        extraRenderTargets: 0,
        dynamicUploadBytes: position.count * 3 * 4 * 2,
        maxDisplacementMeters: maxDisplacement,
        maxPotFloat32RoundingMeters: maxPotDisplacement,
        leaves: binding.parts.leaves.length,
        stems: binding.parts.stems.length,
        maxAttachmentGapMeters: Math.max(
          ...binding.parts.leaves.map((leaf) =>
            leaf.attachment.distanceTo(leaf.stemAttachment),
          ),
        ),
      },
      null,
      2,
    ),
  );
  binding.dispose();
}
