import { describe, expect, it } from "vitest";

import {
  calibrationEdgeBuckets,
  isLikelyHighLearning,
  isLikelyNearTen,
  selectCalibrationVideos,
  selectEdgeCalibrationVideos,
  selectNearTenStressVideos,
  selectToneValueStressVideos,
  toneValueStressBucket,
} from "./calibration";

describe("calibration selection", () => {
  const candidates = Array.from({ length: 500 }, (_, index) => ({
    videoId: `video-${index}`,
    channelKey: `channel-${index % 80}`,
    watchedAt: new Date(Date.UTC(2016 + (index % 10), index % 12, 1)),
    durationSeconds: [300, 1800, 7200][index % 3]!,
    preliminaryScore: index % 11,
  }));

  it("selects a deterministic unique 200-video set", () => {
    const first = selectCalibrationVideos(candidates);
    const second = selectCalibrationVideos(candidates);
    expect(first).toEqual(second);
    expect(first).toHaveLength(200);
    expect(new Set(first).size).toBe(200);
  });

  it("gracefully returns every candidate when fewer than requested", () => {
    expect(selectCalibrationVideos(candidates.slice(0, 12), 200)).toHaveLength(
      12,
    );
  });

  it("selects a deterministic 15/5 edge-weighted batch", () => {
    const edgeCandidates = candidates.map((candidate, index) => ({
      ...candidate,
      edgeBuckets: index < 100 ? [`edge-${index % 6}`] : [],
    }));
    const selected = selectEdgeCalibrationVideos(edgeCandidates, 20);
    const selectedAgain = selectEdgeCalibrationVideos(edgeCandidates, 20);
    const byId = new Map(
      edgeCandidates.map((candidate) => [candidate.videoId, candidate]),
    );
    expect(selected).toEqual(selectedAgain);
    expect(selected).toHaveLength(20);
    expect(new Set(selected).size).toBe(20);
    expect(
      selected.filter((videoId) => byId.get(videoId)!.edgeBuckets.length > 0),
    ).toHaveLength(15);
  });

  it("recognizes the main ambiguous content categories", () => {
    expect(
      calibrationEdgeBuckets({
        title: "Evolution Simulator Explained",
        description: "A science experiment",
        categoryId: 20,
      }),
    ).toEqual(
      expect.arrayContaining([
        "science-simulation",
        "explainer-list",
        "gaming-instruction",
      ]),
    );
  });

  it("requires substantive topic and format signals for high-learning candidates", () => {
    expect(
      isLikelyHighLearning({
        title: "Deep Dive: How AI Agents Actually Work",
        description: null,
        categoryId: 28,
      }),
    ).toBe(true);
    expect(
      isLikelyHighLearning({
        title: "This AI Gadget Is WILD",
        description: null,
        categoryId: 28,
      }),
    ).toBe(false);
  });

  it("detects and balances tone-versus-value stress cases", () => {
    expect(
      toneValueStressBucket({
        title: "Why the Economic Crisis Keeps Getting Worse",
        description: "A research-backed analysis",
        categoryId: 25,
      }),
    ).toBe("serious-learning");
    expect(
      toneValueStressBucket({
        title: "The Most Amazing Minecraft Comeback",
        description: null,
        categoryId: 20,
      }),
    ).toBe("positive-entertainment");

    const stressCandidates = Array.from({ length: 40 }, (_, index) => ({
      ...candidates[index]!,
      toneValueBucket:
        index < 20
          ? ("serious-learning" as const)
          : ("positive-entertainment" as const),
    }));
    const selected = selectToneValueStressVideos(stressCandidates, 20);
    const selectedSet = new Set(selected);
    expect(selected).toHaveLength(20);
    expect(
      stressCandidates.filter(
        (candidate) =>
          selectedSet.has(candidate.videoId) &&
          candidate.toneValueBucket === "serious-learning",
      ),
    ).toHaveLength(10);
  });

  it("strictly selects diverse near-10 candidates", () => {
    expect(
      isLikelyNearTen({
        title: "Complete AI Agent Systems Design Course",
        description: "A".repeat(300),
        categoryId: 27,
        durationSeconds: 3600,
        preliminaryScore: 9,
      }),
    ).toBe(true);
    expect(
      isLikelyNearTen({
        title: "Complete AI Agent Systems Design Course",
        description: "Short clip",
        categoryId: 27,
        durationSeconds: 90,
        preliminaryScore: 9,
      }),
    ).toBe(false);

    const nearTenCandidates = candidates.slice(0, 30).map((candidate) => ({
      ...candidate,
      channelKey: `channel-${Number(candidate.videoId.split("-")[1]) % 8}`,
      preliminaryScore: 9,
      likelyNearTen: true,
    }));
    const selected = selectNearTenStressVideos(nearTenCandidates, 20);
    expect(selected).toHaveLength(20);
    expect(new Set(selected).size).toBe(20);
  });
});
