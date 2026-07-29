import type { AudioSourceType } from "./types/basic";

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const isYouTubeHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return normalized === "youtube.com" || normalized.endsWith(".youtube.com");
};

export const isValidYouTubeVideoId = (value: string): boolean => YOUTUBE_VIDEO_ID_PATTERN.test(value);

export const extractYouTubeVideoId = (value: string): string | null => {
  const trimmed = value.trim();
  if (isValidYouTubeVideoId(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return isValidYouTubeVideoId(videoId) ? videoId : null;
    }

    if (!isYouTubeHost(url.hostname)) return null;

    const pathParts = url.pathname.split("/").filter(Boolean);
    const videoId =
      url.searchParams.get("v") ??
      (["embed", "shorts", "live"].includes(pathParts[0] ?? "") ? pathParts[1] : null) ??
      "";

    return isValidYouTubeVideoId(videoId) ? videoId : null;
  } catch {
    return null;
  }
};

export const getCanonicalYouTubeUrl = (videoId: string): string => {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error("Invalid YouTube video ID");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
};

export const createYouTubeSource = (value: string): AudioSourceType | null => {
  const videoId = extractYouTubeVideoId(value);
  if (!videoId) return null;

  return {
    sourceType: "youtube",
    videoId,
    url: getCanonicalYouTubeUrl(videoId),
  };
};

export const isYouTubeSource = (
  source: AudioSourceType
): source is Extract<AudioSourceType, { sourceType: "youtube" }> => source.sourceType === "youtube";
