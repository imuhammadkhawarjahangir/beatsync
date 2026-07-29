import {
  AudioSourceSchema,
  createYouTubeSource,
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  isYouTubeSource,
  WSRequestSchema,
} from "@beatsync/shared";
import { describe, expect, it } from "bun:test";
import { RoomManager } from "@/managers/RoomManager";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("YouTube sources", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${VIDEO_ID}`, VIDEO_ID],
    [`https://m.youtube.com/watch?v=${VIDEO_ID}&feature=share`, VIDEO_ID],
    [`https://music.youtube.com/watch?v=${VIDEO_ID}`, VIDEO_ID],
    [`https://youtu.be/${VIDEO_ID}?t=10`, VIDEO_ID],
    [`https://www.youtube.com/shorts/${VIDEO_ID}`, VIDEO_ID],
    [`https://www.youtube.com/embed/${VIDEO_ID}`, VIDEO_ID],
    [`https://www.youtube.com/live/${VIDEO_ID}`, VIDEO_ID],
    [VIDEO_ID, VIDEO_ID],
  ])("extracts a video ID from %s", (input, expected) => {
    expect(extractYouTubeVideoId(input)).toBe(expected);
  });

  it.each([
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PL123",
    "https://youtu.be/not-valid",
    "not a URL",
  ])("rejects invalid or spoofed URLs: %s", (input) => {
    expect(extractYouTubeVideoId(input)).toBeNull();
  });

  it("creates a canonical queue source", () => {
    const source = createYouTubeSource(`https://youtu.be/${VIDEO_ID}?si=abc`);
    if (!source) throw new Error("Expected a YouTube source");

    expect(source).toEqual({
      sourceType: "youtube",
      videoId: VIDEO_ID,
      url: getCanonicalYouTubeUrl(VIDEO_ID),
    });
    expect(isYouTubeSource(source)).toBe(true);
    expect(AudioSourceSchema.parse(source)).toEqual(source);
  });

  it("keeps legacy file-audio sources valid", () => {
    expect(AudioSourceSchema.parse({ url: "https://cdn.example/song.mp3" })).toEqual({
      url: "https://cdn.example/song.mp3",
    });
  });

  it("validates ADD_YOUTUBE_SOURCE requests", () => {
    expect(
      WSRequestSchema.parse({
        type: "ADD_YOUTUBE_SOURCE",
        url: `https://youtu.be/${VIDEO_ID}`,
      })
    ).toEqual({
      type: "ADD_YOUTUBE_SOURCE",
      url: `https://youtu.be/${VIDEO_ID}`,
    });
  });

  it("preserves authoritative source metadata while reordering a mixed queue", () => {
    const room = new RoomManager("youtube-reorder");
    const youtubeSource = createYouTubeSource(VIDEO_ID);
    if (!youtubeSource) throw new Error("Expected a YouTube source");

    room.addAudioSource({ url: "https://cdn.example/song.mp3" });
    room.addAudioSource(youtubeSource);

    const result = room.reorderAudioSource([{ url: youtubeSource.url }, { url: "https://cdn.example/song.mp3" }]);

    expect(result).toBeUndefined();
    expect(room.getAudioSources()[0]).toEqual(youtubeSource);
  });
});
