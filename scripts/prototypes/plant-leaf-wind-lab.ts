// Isolated rendering fixture, bundled only by the Node verification script.
import {
  PLANT_KINDS,
  type PlantKind,
  createPlantWindBinding,
} from "../../src/app/components/stacks/scene/plantWind";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#d8dfd4");
const camera = new THREE.PerspectiveCamera(36, 1200 / 800, 0.1, 30);
camera.position.set(1, 4.5, 13);
camera.lookAt(0, 0.95, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1200, 800);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7b856b, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(-3, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: "#b3b9a2" }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const pedestal = new THREE.Mesh(
  new THREE.BoxGeometry(0.85, 0.5, 0.85),
  new THREE.MeshStandardMaterial({ color: "#c8ae87" }),
);
pedestal.position.set(-2.4, 0.25, 0);
pedestal.receiveShadow = pedestal.castShadow = true;
scene.add(pedestal);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texture = await new THREE.TextureLoader().loadAsync(
  "/models/tiny-treats-light.png",
);
texture.flipY = false;
texture.colorSpace = THREE.SRGBColorSpace;
const material = new THREE.MeshStandardMaterial({
  map: texture,
  roughness: 0.7,
  vertexColors: true,
});
const smallAtlas = await new THREE.TextureLoader().loadAsync(
  "/models/atlas-light.png",
);
smallAtlas.flipY = false;
smallAtlas.colorSpace = THREE.SRGBColorSpace;
const smallMaterial = material.clone();
smallMaterial.map = smallAtlas;
const plants: Array<{
  kind: PlantKind;
  root: THREE.Group;
  mesh: THREE.Mesh;
  source: THREE.BufferGeometry;
  binding: ReturnType<typeof createPlantWindBinding> | null;
}> = [];
for (const [index, kind] of PLANT_KINDS.entries()) {
  const root = (await loader.loadAsync(`/models/${kind}.glb`)).scene;
  root.position.set(-4 + index * 1.6, kind === "pothos" ? 0.5 : 0, 0);
  root.scale.setScalar([0.55, 1, 4, 0.45, 0.8, 1.5][index]!);
  root.rotation.y = index === 0 ? -0.25 : 2.3;
  scene.add(root);
  let mesh!: THREE.Mesh;
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      mesh = node as THREE.Mesh;
      mesh.material = kind === "potted-plant" ? smallMaterial : material;
      if (!mesh.geometry.getAttribute("color"))
        mesh.geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(
            new Float32Array(
              mesh.geometry.getAttribute("position").count * 3,
            ).fill(1),
            3,
          ),
        );
      mesh.castShadow = true;
    }
  });
  plants.push({
    kind,
    root,
    mesh,
    source: mesh.geometry,
    binding: null as ReturnType<typeof createPlantWindBinding> | null,
  });
}
const snapshot = () => ({
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
});
const setEnabled = (enabled: boolean) => {
  for (const plant of plants) {
    if (enabled && !plant.binding)
      plant.binding = createPlantWindBinding(
        plant.mesh,
        plant.root,
        plant.kind,
      );
    if (!enabled) {
      plant.binding?.dispose();
      plant.binding = null;
    }
  }
};
const renderAt = (time: number, power = 1) => {
  for (const plant of plants)
    plant.binding?.update(time, -0.2 * power, -0.16 * power, 1);
  renderer.render(scene, camera);
  return snapshot();
};
renderAt(0);
Object.assign(window, {
  plantWindLab: {
    setEnabled,
    renderAt,
    snapshot,
    measure: () => {
      const results = [];
      for (const enabled of [false, true, false, true, false]) {
        setEnabled(enabled);
        const samples = [];
        for (let frame = 0; frame < 180; frame++) {
          const at = performance.now();
          renderAt(frame / 60);
          if (frame >= 60) samples.push(performance.now() - at);
        }
        samples.sort((a, b) => a - b);
        results.push({
          enabled,
          ...snapshot(),
          cpuSubmitMs: { p50: samples[60], p95: samples[114] },
        });
      }
      return results;
    },
  },
});
