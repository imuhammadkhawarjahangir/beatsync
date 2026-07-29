import { YouTubePlayer } from "@/components/room/YouTubePlayer";
import { youtubePlayerController } from "@/lib/youtubePlayer";
import { useGlobalStore } from "@/store/global";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

interface PlayerEvents {
  onAutoplayBlocked: () => void;
  onError: (event: { data: number; target?: FakeYouTubePlayer }) => void;
  onReady: () => void;
  onStateChange: (event: { data: number; target?: FakeYouTubePlayer }) => void;
}

class FakeYouTubePlayer {
  static latest: FakeYouTubePlayer | undefined;

  calls: Array<{ method: string; value?: number | string }> = [];
  currentTime = 0;
  duration = 180;
  events: PlayerEvents;
  state = -1;
  videoId = "";

  constructor(_element: HTMLElement, options: { events: PlayerEvents }) {
    FakeYouTubePlayer.latest = this;
    this.events = options.events;
    queueMicrotask(() => this.events.onReady());
  }

  cueVideoById({ videoId }: { videoId: string }): void {
    this.videoId = videoId;
    this.calls.push({ method: "cue", value: videoId });
  }
  destroy(): void {
    this.calls.push({ method: "destroy" });
  }
  getCurrentTime(): number {
    return this.currentTime;
  }
  getDuration(): number {
    return this.duration;
  }
  getPlayerState(): number {
    return this.state;
  }
  getVideoData(): { video_id: string } {
    return { video_id: this.videoId };
  }
  mute(): void {}
  pauseVideo(): void {
    this.calls.push({ method: "pause" });
    this.state = 2;
  }
  playVideo(): void {
    this.calls.push({ method: "play" });
    this.state = 1;
  }
  seekTo(seconds: number): void {
    this.calls.push({ method: "seek", value: seconds });
    this.currentTime = seconds;
  }
  setVolume(volume: number): void {
    this.calls.push({ method: "volume", value: volume });
  }
  unMute(): void {}

  emitState(state: number): void {
    this.state = state;
    this.events.onStateChange({ data: state, target: this });
  }
}

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

describe("YouTubePlayer room controls", () => {
  let originalState: ReturnType<typeof useGlobalStore.getState>;

  beforeEach(() => {
    originalState = useGlobalStore.getState();
    youtubePlayerController.destroy();
    FakeYouTubePlayer.latest = undefined;

    Object.assign(window, {
      YT: {
        Player: FakeYouTubePlayer,
        PlayerState: {
          BUFFERING: 3,
          CUED: 5,
          ENDED: 0,
          PAUSED: 2,
          PLAYING: 1,
          UNSTARTED: -1,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    youtubePlayerController.destroy();
    useGlobalStore.setState(originalState, true);
  });

  const renderPreparedPlayer = async ({
    expectedPlaying,
    broadcastPause = mock(() => undefined),
    broadcastPlay = mock(() => undefined),
    canMutate = true,
    socket = null,
  }: {
    expectedPlaying: boolean;
    broadcastPause?: ReturnType<typeof mock>;
    broadcastPlay?: ReturnType<typeof mock>;
    canMutate?: boolean;
    socket?: WebSocket | null;
  }) => {
    useGlobalStore.setState({
      audioSources: [
        {
          source: {
            sourceType: "youtube",
            url: VIDEO_URL,
            videoId: VIDEO_ID,
          },
          status: "loaded",
        },
      ],
      broadcastPause,
      broadcastPlay,
      isInitingSystem: false,
      playbackControlsPermissions: canMutate ? "EVERYONE" : "ADMIN_ONLY",
      selectedAudioUrl: VIDEO_URL,
      socket,
      youtubePlaybackExpectedPlaying: expectedPlaying,
    });

    render(<YouTubePlayer />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(FakeYouTubePlayer.latest).toBeDefined());
    const player = FakeYouTubePlayer.latest;
    if (!player) throw new Error("Expected the fake YouTube player");

    let cue!: Promise<void>;
    await act(async () => {
      cue = youtubePlayerController.cue(VIDEO_ID);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(player.calls).toContainEqual({ method: "cue", value: VIDEO_ID });
    });
    await act(async () => {
      player.emitState(5);
      await cue;
    });

    return { broadcastPause, broadcastPlay, player };
  };

  it("broadcasts one room pause for an authorized iframe pause", async () => {
    const broadcastPause = mock(() => undefined);
    const { player } = await renderPreparedPlayer({
      expectedPlaying: true,
      broadcastPause,
    });
    player.currentTime = 42.25;

    await act(async () => {
      player.emitState(2);
      player.emitState(2);
    });

    expect(broadcastPause).toHaveBeenCalledTimes(1);
    expect(broadcastPause).toHaveBeenCalledWith(42.25);
  });

  it("does not echo an authoritative bottom-control pause back to the room", async () => {
    const broadcastPause = mock(() => undefined);
    const { player } = await renderPreparedPlayer({
      expectedPlaying: true,
      broadcastPause,
    });

    await act(async () => {
      useGlobalStore.getState().schedulePause({
        audioSource: VIDEO_URL,
        targetServerTime: 0,
        trackTimeSeconds: 20,
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
    expect(useGlobalStore.getState().youtubePlaybackExpectedPlaying).toBe(false);

    await act(async () => {
      player.emitState(2);
    });

    expect(broadcastPause).not.toHaveBeenCalled();
  });

  it("re-pauses an authorized direct play until the synchronized room play arrives", async () => {
    const broadcastPlay = mock(() => undefined);
    const { player } = await renderPreparedPlayer({
      expectedPlaying: false,
      broadcastPlay,
    });
    player.currentTime = 17.5;

    await act(async () => {
      player.emitState(1);
    });

    expect(player.calls.some((call) => call.method === "pause")).toBe(true);
    expect(broadcastPlay).toHaveBeenCalledTimes(1);
    expect(broadcastPlay).toHaveBeenCalledWith(17.5);

    await act(async () => {
      player.emitState(2);
      player.emitState(1);
    });
    expect(broadcastPlay).toHaveBeenCalledTimes(1);
  });

  it("sends at most one resync per unauthorized pause attempt", async () => {
    const send = mock((payload: string) => payload);
    const socket = {
      readyState: WebSocket.OPEN,
      send,
    } as unknown as WebSocket;
    const { player } = await renderPreparedPlayer({
      canMutate: false,
      expectedPlaying: true,
      socket,
    });

    await act(async () => {
      player.emitState(2);
      player.emitState(2);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0]?.[0]))).toEqual({ type: "SYNC" });

    await youtubePlayerController.schedulePlay(VIDEO_ID, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    await act(async () => {
      player.emitState(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 1_010));
    await act(async () => {
      player.emitState(2);
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
