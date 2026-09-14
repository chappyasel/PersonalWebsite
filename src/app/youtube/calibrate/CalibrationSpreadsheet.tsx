"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import {
  CheckCircleIcon,
  FloppyDiskIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "~/trpc/react";

import { Skeleton } from "~/components/ui/skeleton";

type Scores = Record<
  string,
  { learningValue: number | null; positivity: number | null }
>;

export function CalibrationSpreadsheet() {
  const { data, isLoading } = api.youtube.getCalibrationVideos.useQuery();
  const [scores, setScores] = useState<Scores>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!data) return;
    setScores(
      Object.fromEntries(
        data.map((video) => [
          video.videoId,
          {
            learningValue: video.learningValue,
            positivity: video.positivity,
          },
        ]),
      ),
    );
  }, [data]);
  const save = api.youtube.saveCalibrationScores.useMutation({
    onSuccess: () => setSaved(true),
  });
  if (isLoading) return <Skeleton className="h-[75vh] w-full rounded-xl" />;
  if (!data?.length) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <p className="text-lg font-medium">No calibration set yet</p>
        <p className="mt-2 text-sm text-neutral-500">
          Run the calibration preparation and scoring commands first.
        </p>
      </div>
    );
  }
  const update = (
    videoId: string,
    field: "learningValue" | "positivity",
    value: string,
  ) => {
    const number =
      value === ""
        ? null
        : Math.max(0, Math.min(10, Math.round(Number(value))));
    setSaved(false);
    setScores((current) => ({
      ...current,
      [videoId]: { ...current[videoId]!, [field]: number },
    }));
  };
  const saveAll = () => {
    save.mutate({
      scores: data.map((video) => ({
        videoId: video.videoId,
        learningValue: scores[video.videoId]?.learningValue ?? null,
        positivity: scores[video.videoId]?.positivity ?? null,
      })),
    });
  };
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/youtube"
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            <ArrowLeftIcon
              aria-hidden="true"
              className="inline-block size-[1em] align-[-0.125em]"
            />{" "}
            Dashboard
          </Link>
          <h1 className="font-rounded text-2xl font-semibold">
            Score calibration videos
          </h1>
        </div>
        <button
          onClick={saveAll}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {saved ? (
            <CheckCircleIcon weight="fill" />
          ) : (
            <FloppyDiskIcon weight="bold" />
          )}
          {save.isPending
            ? "Saving…"
            : saved
              ? `Saved ${data.length}`
              : `Save all ${data.length}`}
        </button>
      </div>
      {save.error && (
        <p className="mb-2 text-sm text-red-600">{save.error.message}</p>
      )}
      <div className="h-[calc(100vh-10rem)] overflow-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="w-12 px-3 py-3 text-right">#</th>
              <th className="w-32 px-3 py-3">Video</th>
              <th className="px-3 py-3">Title</th>
              <th className="w-56 px-3 py-3">Channel</th>
              <th className="w-32 px-3 py-3">Watched</th>
              <th className="w-28 px-3 py-3 text-center">Learning</th>
              <th className="w-28 px-3 py-3 text-center">Positivity</th>
            </tr>
          </thead>
          <tbody>
            {data.map((video, index) => (
              <tr
                key={video.videoId}
                className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
              >
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                  {index + 1}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={-1}
                  >
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt=""
                        width={112}
                        height={63}
                        className="h-[54px] w-24 rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-[54px] w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
                    )}
                  </a>
                </td>
                <td className="max-w-xl px-3 py-2 font-medium">
                  {video.title}
                </td>
                <td className="truncate px-3 py-2 text-neutral-600 dark:text-neutral-300">
                  {video.channelName}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">
                  {new Date(video.watchedAt).toLocaleDateString()}
                </td>
                {(["learningValue", "positivity"] as const).map((field) => (
                  <td key={field} className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      value={scores[video.videoId]?.[field] ?? ""}
                      placeholder="—"
                      onChange={(event) =>
                        update(video.videoId, field, event.target.value)
                      }
                      className="h-10 w-16 rounded-md border border-neutral-300 bg-transparent text-center text-lg font-semibold tabular-nums outline-none focus:border-blue-500 dark:border-neutral-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
