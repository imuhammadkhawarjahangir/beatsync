import { YouTubePlayerController } from "@/lib/youtubePlayer";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

interface PlayerEvents {
  onAutoplayBlocked: () => void;
  onError: (event: { data: number; target?: FakeYouTubePlayer }) => void;
  onReady: () => void;
  onStateChange: (event: { data: number; target?: FakeYouTubePlayer }) => void;
}

class FakeYouTubePlayer {
  static latest: FakeYouTubePlayer;
  static instances: FakeYouTubePlayer[] = [];

  currentTime = 0;
  duration = 180;
  events: PlayerEvents;
  state = -1;
  videoId = "";
  calls: Array<{ method: string; value?: number | string }> = [];

  constructor(_element: HTMLElement, options: { events: PlayerEvents }) {
    FakeYouTubePlayer.latest = this;
    FakeYouTubePlayer.instances.push(this);
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

  emitStateFor(videoId: string, state: number): void {
    const currentVideoId = this.videoId;
    this.videoId = videoId;
    this.events.onStateChange({ data: state, target: this });
    this.videoId = currentVideoId;
  }
}

describe("YouTubePlayerController", () => {
  let controller: YouTubePlayerController;
  let player: FakeYouTubePlayer;

  beforeEach(async () => {
    FakeYouTubePlayer.instances = [];
    controller = new YouTubePlayerController();
    class Player extends FakeYouTubePlayer {
      constructor(element: HTMLElement, options: { events: PlayerEvents }) {
        super(element, options);
      }
    }

    Object.assign(window, {
      YT: {
        Player,
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

    await controller.mount(document.createElement("div"));
    await Promise.resolve();
    player = FakeYouTubePlayer.latest;
  });

  afterEach(() => {
    controller.destroy();
  });

  it("waits for a cue event before considering a video ready", async () => {
    let resolved = false;
    const cue = controller.cue("dQw4w9WgXcQ").then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(player.calls).toContainEqual({ method: "cue", value: "dQw4w9WgXcQ" });

    player.emitState(5);
    await cue;
    expect(resolved).toBe(true);
  });

  it("labels cue transitions as programmatic and later player controls as interactive", async () => {
    const snapshots: Array<{ origin: string | null; sequence: number; state: number }> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      snapshots.push({
        origin: snapshot.stateChangeOrigin,
        sequence: snapshot.stateChangeSequence,
        state: snapshot.state,
      });
    });

    const cue = controller.cue("dQw4w9WgXcQ");
    await Promise.resolve();
    player.emitState(2);
    player.emitState(5);
    await cue;

    expect(snapshots.at(-2)).toEqual({ origin: "programmatic", sequence: 1, state: 2 });
    expect(snapshots.at(-1)).toEqual({ origin: "programmatic", sequence: 2, state: 5 });

    player.emitState(1);
    player.emitState(2);
    expect(snapshots.at(-2)).toEqual({ origin: "interactive", sequence: 3, state: 1 });
    expect(snapshots.at(-1)).toEqual({ origin: "interactive", sequence: 4, state: 2 });

    unsubscribe();
  });

  it("does not seek or play before the scheduled delay", async () => {
    const cue = controller.cue("dQw4w9WgXcQ", 12.5);
    await Promise.resolve();
    player.emitState(5);
    await cue;

    await controller.schedulePlay("dQw4w9WgXcQ", 12.5, 0.02);
    expect(player.calls.some((call) => call.method === "seek")).toBe(false);
    expect(player.calls.some((call) => call.method === "play")).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(player.calls).toContainEqual({ method: "seek", value: 12.5 });
    expect(player.calls.some((call) => call.method === "play")).toBe(true);
  });

  it("labels scheduled play and pause transitions as programmatic", async () => {
    const snapshots: Array<{ origin: string | null; state: number }> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      snapshots.push({ origin: snapshot.stateChangeOrigin, state: snapshot.state });
    });

    const cue = controller.cue("dQw4w9WgXcQ", 8);
    await Promise.resolve();
    player.emitState(5);
    await cue;

    await controller.schedulePlay("dQw4w9WgXcQ", 8, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    player.emitState(3);
    player.emitState(1);
    expect(snapshots.at(-2)).toEqual({ origin: "programmatic", state: 3 });
    expect(snapshots.at(-1)).toEqual({ origin: "programmatic", state: 1 });

    controller.schedulePause(0, 9);
    await new Promise((resolve) => setTimeout(resolve, 1));
    player.emitState(2);
    expect(snapshots.at(-1)).toEqual({ origin: "programmatic", state: 2 });

    const pauseIndex = player.calls.findIndex((call) => call.method === "pause");
    const seekAfterPauseIndex = player.calls.findIndex(
      (call, index) => index > pauseIndex && call.method === "seek" && call.value === 9
    );
    expect(pauseIndex).toBeGreaterThan(-1);
    expect(seekAfterPauseIndex).toBeGreaterThan(pauseIndex);

    unsubscribe();
  });

  it("absorbs a late playing event when a pause supersedes a scheduled play", async () => {
    const origins: Array<string | null> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      if (snapshot.state === 1 || snapshot.state === 2) origins.push(snapshot.stateChangeOrigin);
    });

    const cue = controller.cue("dQw4w9WgXcQ");
    await Promise.resolve();
    player.emitState(5);
    await cue;

    await controller.schedulePlay("dQw4w9WgXcQ", 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.schedulePause(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));

    player.emitState(1);
    player.emitState(2);

    expect(origins).toEqual(["programmatic", "programmatic"]);
    unsubscribe();
  });

  it("reasserts pause when a stale playing event arrives after the pause terminal event", async () => {
    const origins: Array<string | null> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      if (snapshot.state === 1 || snapshot.state === 2) origins.push(snapshot.stateChangeOrigin);
    });

    const cue = controller.cue("dQw4w9WgXcQ");
    await Promise.resolve();
    player.emitState(5);
    await cue;

    await controller.schedulePlay("dQw4w9WgXcQ", 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.schedulePause(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));

    player.emitState(2);
    player.emitState(1);
    await Promise.resolve();

    expect(origins).toEqual(["programmatic", "programmatic"]);
    expect(player.calls.at(-1)).toEqual({ method: "pause" });
    unsubscribe();
  });

  it("reasserts play when a stale paused event arrives after the play terminal event", async () => {
    const origins: Array<string | null> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      if (snapshot.state === 1 || snapshot.state === 2) origins.push(snapshot.stateChangeOrigin);
    });

    const cue = controller.cue("dQw4w9WgXcQ");
    await Promise.resolve();
    player.emitState(5);
    await cue;

    controller.schedulePause(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    await controller.schedulePlay("dQw4w9WgXcQ", 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 1));

    player.emitState(1);
    player.emitState(2);
    await Promise.resolve();

    expect(origins).toEqual(["programmatic", "programmatic"]);
    expect(player.calls.at(-1)).toEqual({ method: "play" });
    unsubscribe();
  });

  it("does not extend the stale-event grace period after reasserting play", async () => {
    const originalNow = Date.now;
    let now = 1_000;
    Date.now = () => now;

    try {
      const origins: Array<string | null> = [];
      const unsubscribe = controller.subscribe((snapshot) => {
        if (snapshot.state === 1 || snapshot.state === 2) origins.push(snapshot.stateChangeOrigin);
      });

      const cue = controller.cue("dQw4w9WgXcQ");
      await Promise.resolve();
      player.emitState(5);
      await cue;

      await controller.schedulePlay("dQw4w9WgXcQ", 0, 0);
      await new Promise((resolve) => setTimeout(resolve, 1));
      player.emitState(1);

      now = 1_500;
      player.emitState(2);
      await Promise.resolve();
      player.emitState(1);

      now = 2_001;
      player.emitState(2);

      expect(origins).toEqual(["programmatic", "programmatic", "programmatic", "interactive"]);
      unsubscribe();
    } finally {
      Date.now = originalNow;
    }
  });

  it("shares one player across concurrent mounts and destroys it after the final release", async () => {
    const concurrentController = new YouTubePlayerController();
    const instanceCountBeforeMount = FakeYouTubePlayer.instances.length;
    const host = document.createElement("div");

    const [releaseFirst, releaseSecond] = await Promise.all([
      concurrentController.mount(host),
      concurrentController.mount(host),
    ]);
    await Promise.resolve();

    expect(FakeYouTubePlayer.instances).toHaveLength(instanceCountBeforeMount + 1);
    const concurrentPlayer = FakeYouTubePlayer.latest;

    releaseFirst();
    expect(concurrentPlayer.calls.some((call) => call.method === "destroy")).toBe(false);

    releaseSecond();
    expect(concurrentPlayer.calls.some((call) => call.method === "destroy")).toBe(true);
  });

  it("ignores late state events from a superseded video", async () => {
    const firstCue = controller.cue("dQw4w9WgXcQ");
    await Promise.resolve();
    const secondCue = controller.cue("M7lc1UVf-VE");
    let secondResolved = false;
    void secondCue.then(() => {
      secondResolved = true;
    });

    await expect(firstCue).rejects.toHaveProperty("name", "YouTubeCueSupersededError");

    player.emitStateFor("dQw4w9WgXcQ", 5);
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    player.emitStateFor("M7lc1UVf-VE", 5);
    await secondCue;
    expect(secondResolved).toBe(true);
  });

  it("surfaces an API load failure and allows a later mount retry", async () => {
    const availableApi = window.YT;
    if (!availableApi) throw new Error("Expected the fake YouTube API");
    const retryController = new YouTubePlayerController();
    const originalAppendChild = document.head.appendChild;
    document.head.appendChild = ((node: Node) => {
      queueMicrotask(() => node.dispatchEvent(new Event("error")));
      return node;
    }) as typeof document.head.appendChild;
    try {
      delete window.YT;

      const failedMount = retryController.mount(document.createElement("div"));
      await expect(failedMount).rejects.toThrow("Failed to load the YouTube IFrame API");
      await expect(retryController.cue("dQw4w9WgXcQ")).rejects.toThrow("Failed to load the YouTube IFrame API");
    } finally {
      document.head.appendChild = originalAppendChild;
      Object.assign(window, { YT: availableApi });
    }

    const release = await retryController.mount(document.createElement("div"));
    await Promise.resolve();
    release();
  });

  it("corrects drift only while playing and outside the tolerance", () => {
    player.state = 1;
    player.currentTime = 20;

    expect(controller.correctDrift(20.5, 0.75)).toBe(false);
    expect(controller.correctDrift(22, 0.75)).toBe(true);
    expect(player.calls).toContainEqual({ method: "seek", value: 22 });
  });
});
