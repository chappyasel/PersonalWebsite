import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const modelPath = path.resolve(
  process.cwd(),
  "public/models/vision-ride-lamborghini.glb",
);

function parseGlb() {
  const bytes = fs.readFileSync(modelPath);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    extensionsRequired?: string[];
    nodes: Array<{
      name?: string;
      mesh?: number;
      scale?: [number, number, number];
    }>;
    meshes: Array<{ primitives: Array<{ indices?: number }> }>;
    accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
    images: Array<{ bufferView: number }>;
    bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
  };
  const binHeader = 20 + jsonLength;
  const binStart = binHeader + 8;
  return { bytes, json, binStart };
}

describe("Vision ride Lamborghini", () => {
  it("fits the lazy ride budget and keeps compressed named parts", () => {
    const { bytes, json } = parseGlb();
    expect(bytes.byteLength).toBeLessThanOrEqual(300_000);
    expect(json.extensionsRequired).toEqual(
      expect.arrayContaining([
        "EXT_meshopt_compression",
        "KHR_mesh_quantization",
      ]),
    );
    const names = json.nodes.map((node) => node.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Lamborghini_Aventador_Body",
        "Lamborghini_Aventador_Glass",
        "Lamborghini_Aventador_Wheel_FL",
        "Lamborghini_Aventador_Wheel_FR",
        "Lamborghini_Aventador_Wheel_RL",
        "Lamborghini_Aventador_Wheel_RR",
      ]),
    );
    const triangles = json.meshes.reduce(
      (sum, mesh) =>
        sum +
        mesh.primitives.reduce(
          (meshSum, primitive) =>
            meshSum +
            (primitive.indices === undefined
              ? 0
              : json.accessors[primitive.indices]!.count / 3),
          0,
        ),
      0,
    );
    expect(triangles).toBeGreaterThan(7_000);
    expect(triangles).toBeLessThanOrEqual(10_252);
  });

  it("uses the official length and a texture no larger than 512 px", async () => {
    const { bytes, json, binStart } = parseGlb();
    const body = json.nodes.find(
      (node) => node.name === "Lamborghini_Aventador_Body",
    );
    expect((body?.scale?.[2] ?? 0) * 2).toBeCloseTo(4.797, 2);

    const imageView = json.bufferViews[json.images[0]!.bufferView]!;
    const imageStart = binStart + (imageView.byteOffset ?? 0);
    const metadata = await sharp(
      bytes.subarray(imageStart, imageStart + imageView.byteLength),
    ).metadata();
    expect(metadata.width).toBeLessThanOrEqual(512);
    expect(metadata.height).toBeLessThanOrEqual(512);
  });

  it("records the required Creative Commons attribution", () => {
    const licenses = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), "public/models/LICENSES.json"),
        "utf8",
      ),
    ) as { models: Array<Record<string, string>> };
    expect(
      licenses.models.find(
        (model) => model.file === "vision-ride-lamborghini.glb",
      ),
    ).toMatchObject({
      title: "CAR Model",
      author: "Ignition Labs",
      license: "CC-BY 3.0",
      source: "https://poly.pizza/m/5zUWP5UsLg-",
    });
  });
});
