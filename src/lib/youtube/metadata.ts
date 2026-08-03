const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_CHANNELS_API_URL =
  "https://www.googleapis.com/youtube/v3/channels";

type YouTubeThumbnail = {
  url?: string;
  width?: number;
  height?: number;
};

export type YouTubeApiItem = {
  id: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    description?: string;
    categoryId?: string;
    tags?: string[];
    thumbnails?: Record<string, YouTubeThumbnail>;
  };
  contentDetails?: {
    duration: string;
    caption?: string; // "true" | "false"
    definition?: string; // "hd" | "sd"
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
  topicDetails?: {
    topicCategories?: string[];
  };
};

type YouTubeApiResponse = {
  items: YouTubeApiItem[];
  error?: { message?: string };
};

export type YouTubeVideoMetadata = {
  youtubeChannelId: string | null;
  title: string | null;
  channelName: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  categoryId: number | null;
  topicCategories: string | null; // JSON stringified array
  tags: string | null; // JSON stringified array
  viewCount: number | null;
  likeCount: number | null;
  hasCaptions: boolean | null;
  definition: string | null;
};

/** Parse ISO 8601 duration (PT1H2M10S) to seconds. */
export function parseDuration(iso: string): number {
  const time = iso.replace("P", "").replace("T", "");
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let num = "";

  for (const ch of time) {
    if (ch >= "0" && ch <= "9") {
      num += ch;
    } else {
      const val = parseInt(num, 10) || 0;
      if (ch === "H") hours = val;
      else if (ch === "M") minutes = val;
      else if (ch === "S") seconds = val;
      num = "";
    }
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function bestThumbnail(
  thumbnails: Record<string, YouTubeThumbnail> | undefined,
): string | null {
  if (!thumbnails) return null;

  const preferred = ["maxres", "standard", "high", "medium", "default"];
  for (const key of preferred) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }

  return (
    Object.values(thumbnails)
      .filter((thumbnail): thumbnail is YouTubeThumbnail & { url: string } =>
        Boolean(thumbnail.url),
      )
      .sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      )[0]?.url ?? null
  );
}

export function parseYouTubeVideoMetadata(
  item: YouTubeApiItem,
): YouTubeVideoMetadata {
  const durationSeconds = item.contentDetails
    ? parseDuration(item.contentDetails.duration)
    : 0;

  return {
    youtubeChannelId: cleanText(item.snippet?.channelId),
    title: cleanText(item.snippet?.title),
    channelName: cleanText(item.snippet?.channelTitle),
    description: cleanText(item.snippet?.description),
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
    durationSeconds,
    categoryId: item.snippet?.categoryId
      ? parseInt(item.snippet.categoryId, 10)
      : null,
    topicCategories: item.topicDetails?.topicCategories
      ? JSON.stringify(item.topicDetails.topicCategories)
      : null,
    tags: item.snippet?.tags ? JSON.stringify(item.snippet.tags) : null,
    viewCount: item.statistics?.viewCount
      ? parseInt(item.statistics.viewCount, 10)
      : null,
    likeCount: item.statistics?.likeCount
      ? parseInt(item.statistics.likeCount, 10)
      : null,
    hasCaptions:
      item.contentDetails?.caption === "true"
        ? true
        : item.contentDetails?.caption === "false"
          ? false
          : null,
    definition: item.contentDetails?.definition ?? null,
  };
}

export type YouTubeChannelMetadata = {
  youtubeChannelId: string;
  name: string | null;
  url: string;
  thumbnailUrl: string | null;
};

/** Fetch public identity metadata for up to 50 YouTube channel IDs. */
export async function fetchYouTubeChannelMetadata(
  channelIds: string[],
  apiKey: string,
): Promise<Map<string, YouTubeChannelMetadata>> {
  if (channelIds.length === 0) return new Map();
  if (channelIds.length > 50) {
    throw new Error(
      `YouTube channels.list accepts at most 50 IDs, got ${channelIds.length}`,
    );
  }
  const params = new URLSearchParams({
    part: "snippet",
    id: channelIds.join(","),
    key: apiKey,
  });
  const response = await fetch(
    `${YOUTUBE_CHANNELS_API_URL}?${params.toString()}`,
  );
  const data = (await response.json()) as YouTubeApiResponse;
  if (!response.ok) {
    throw new Error(
      `YouTube API error ${response.status}: ${data.error?.message ?? response.statusText}`,
    );
  }
  return new Map(
    data.items.map((item) => [
      item.id,
      {
        youtubeChannelId: item.id,
        name: cleanText(item.snippet?.title),
        url: `https://www.youtube.com/channel/${item.id}`,
        thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
      },
    ]),
  );
}

/** Fetch full public metadata for up to 50 YouTube video IDs. */
export async function fetchYouTubeVideoMetadata(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, YouTubeVideoMetadata>> {
  if (videoIds.length === 0) return new Map();
  if (videoIds.length > 50) {
    throw new Error(
      `YouTube videos.list accepts at most 50 IDs, got ${videoIds.length}`,
    );
  }

  const params = new URLSearchParams({
    part: "contentDetails,snippet,statistics,topicDetails",
    id: videoIds.join(","),
    key: apiKey,
  });
  const response = await fetch(`${YOUTUBE_API_URL}?${params.toString()}`);
  const data = (await response.json()) as YouTubeApiResponse;

  if (!response.ok) {
    throw new Error(
      `YouTube API error ${response.status}: ${data.error?.message ?? response.statusText}`,
    );
  }

  return new Map(
    data.items.map((item) => [item.id, parseYouTubeVideoMetadata(item)]),
  );
}

export function isBareYouTubeUrl(value: string | null): boolean {
  return value?.startsWith("https://www.youtube.com/watch") ?? false;
}

export function preferCanonicalMetadata(
  storedValue: string | null,
  canonicalValue: string | null | undefined,
): string | null {
  if (!storedValue || isBareYouTubeUrl(storedValue)) {
    return canonicalValue ?? storedValue;
  }
  return storedValue;
}
