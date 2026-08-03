"use client";

import Image from "next/image";
import { useId, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { scoreBand, scoreTextClass } from "~/lib/youtube/dashboard";
import { api } from "~/trpc/react";

import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";

import { type TimeRange, TimeRangeToggle } from "./TimeRangeToggle";

type MatrixPoint = {
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  learningValue: number;
  positivity: number;
  estimatedExposureHours: number;
  distinctVideos: number;
  showThumbnail: boolean;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function markerColor(point: MatrixPoint): string {
  const learning = scoreBand(point.learningValue);
  const positivity = scoreBand(point.positivity);
  if (learning === "high" && positivity === "high") return "hsl(142 65% 40%)";
  if (learning === "low" || positivity === "low") return "hsl(0 72% 51%)";
  return "hsl(38 92% 50%)";
}

function Bubble(props: { cx?: number; cy?: number; payload?: MatrixPoint }) {
  const { cx = 0, cy = 0, payload } = props;
  const generatedId = useId();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!payload) return null;

  if (!payload.showThumbnail) {
    return (
      <circle
        className="cursor-pointer"
        cx={cx}
        cy={cy}
        r={5}
        fill={markerColor(payload)}
        fillOpacity={0.82}
        stroke="white"
        strokeOpacity={0.8}
        strokeWidth={1}
      />
    );
  }

  const radius = Math.max(
    9,
    Math.min(20, 7 + Math.sqrt(payload.estimatedExposureHours)),
  );
  const clipId = "matrix-channel-" + generatedId.replace(/:/g, "");
  const canLoad = payload.thumbnailUrl !== null && !failed;
  return (
    <g className="cursor-pointer">
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={radius + 2}
        fill="white"
        stroke="hsl(0 0% 65%)"
      />
      <circle cx={cx} cy={cy} r={radius} fill="hsl(0 0% 78%)" />
      <text
        x={cx}
        y={cy}
        dy="0.35em"
        textAnchor="middle"
        fill="hsl(0 0% 35%)"
        fontSize={Math.max(7, radius * 0.65)}
        fontWeight={600}
      >
        {initials(payload.channelName)}
      </text>
      {canLoad && (
        <image
          href={payload.thumbnailUrl ?? undefined}
          x={cx - radius}
          y={cy - radius}
          width={radius * 2}
          height={radius * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={"url(#" + clipId + ")"}
          opacity={loaded ? 1 : 0}
          style={{ transition: "opacity 180ms ease" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </g>
  );
}

function MatrixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MatrixPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <p className="mb-1 font-medium">{point.channelName}</p>
      <p>{point.estimatedExposureHours.toFixed(1)}h estimated watch time</p>
      <p className={scoreTextClass(point.learningValue)}>
        Learning {point.learningValue.toFixed(1)}
      </p>
      <p className={scoreTextClass(point.positivity)}>
        Positivity {point.positivity.toFixed(1)}
      </p>
      <p className="text-neutral-500 dark:text-neutral-400">
        {point.distinctVideos.toLocaleString()} distinct videos
      </p>
    </div>
  );
}

function VideoThumbnail({ title, url }: { title: string; url: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-200 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
      {initials(title)}
      {url && !failed && (
        <Image
          src={url}
          alt=""
          fill
          sizes="64px"
          className={
            "object-cover transition-opacity duration-200 " +
            (loaded ? "opacity-100" : "opacity-0")
          }
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </span>
  );
}

export function LearningPositivityMatrix() {
  const [timeRange, setTimeRange] = useState<TimeRange>("1y");
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(
    null,
  );
  const { data, isLoading } = api.youtube.getInformationDietChannels.useQuery({
    limit: 500,
    timeRange,
  });
  const { data: videos } = api.youtube.getChannelVideos.useQuery(
    { channelId: selectedChannelId ?? 0, limit: 30 },
    { enabled: selectedChannelId !== null },
  );
  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  const points: MatrixPoint[] = (data ?? [])
    .filter(
      (
        channel,
      ): channel is typeof channel & {
        learningValue: number;
        positivity: number;
      } =>
        channel.learningValue !== null &&
        channel.positivity !== null &&
        !channel.channelId.startsWith("unknown:"),
    )
    .slice(0, 150)
    .map((channel, index) => ({
      ...channel,
      learningValue: channel.learningValue,
      positivity: channel.positivity,
      showThumbnail: index < 50,
    }));
  if (!points.length)
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        The matrix will appear once both scoring dimensions are active.
      </p>
    );
  return (
    <div>
      <div className="mb-3">
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>
      <ChartContainer
        config={{
          learningValue: { label: "Learning Value", color: "hsl(217 91% 55%)" },
          positivity: { label: "Positivity", color: "hsl(142 65% 40%)" },
        }}
        className="h-96 w-full"
      >
        <ScatterChart margin={{ top: 12, right: 16, bottom: 14, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="learningValue"
            name="Learning Value"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            label={{
              value: "Learning Value",
              position: "insideBottom",
              offset: -8,
            }}
          />
          <YAxis
            type="number"
            dataKey="positivity"
            name="Positivity"
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            label={{ value: "Positivity", angle: -90, position: "insideLeft" }}
          />
          <ZAxis
            type="number"
            dataKey="estimatedExposureHours"
            range={[80, 700]}
          />
          <ReferenceLine x={5} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={5} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ChartTooltip content={<MatrixTooltip />} />
          <Scatter
            data={points}
            shape={<Bubble />}
            onClick={(point) =>
              setSelectedChannelId(Number((point as MatrixPoint).channelId))
            }
            isAnimationActive={false}
          />
        </ScatterChart>
      </ChartContainer>
      {selectedChannelId !== null && (
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Watched videos</p>
            <button
              className="text-xs text-neutral-500"
              onClick={() => setSelectedChannelId(null)}
            >
              Close
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {videos?.map((video) => (
              <a
                key={video.videoId}
                href={"https://www.youtube.com/watch?v=" + video.videoId}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-md p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <VideoThumbnail title={video.title} url={video.thumbnailUrl} />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {video.title}
                </span>
                <span className="flex w-10 shrink-0 flex-col text-right text-[10px] tabular-nums">
                  <span className={scoreTextClass(video.learningValue)}>
                    L {video.learningValue?.toFixed(0) ?? "—"}
                  </span>
                  <span className={scoreTextClass(video.positivity)}>
                    P {video.positivity?.toFixed(0) ?? "—"}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
