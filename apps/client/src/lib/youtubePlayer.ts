type YouTubePlayerState = -1 | 0 | 1 | 2 | 3 | 5;

interface YouTubePlayerEvent {
  data: number;
  target?: YouTubeIframePlayer;
}

interface YouTubePlayerErrorEvent {
  data: number;
  target?: YouTubeIframePlayer;
}

interface YouTubeIframePlayer {
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { video_id?: string };
  mute(): void;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  unMute(): void;
}

interface YouTubePlayerConstructorOptions {
  events: {
    onAutoplayBlocked: () => void;
    onError: (event: YouTubePlayerErrorEvent) => void;
    onReady: () => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
  };
  height: string;
  playerVars: {
    controls: number;
    enablejsapi: number;
    origin: string;
    playsinline: number;
    rel: number;
  };
  width: string;
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerConstructorOptions) => YouTubeIframePlayer;
  PlayerState: {
    BUFFERING: 3;
    CUED: 5;
    ENDED: 0;
    PAUSED: 2;
    PLAYING: 1;
    UNSTARTED: -1;
  };
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerSnapshot {
  autoplayBlocked: boolean;
  duration: number;
  errorCode?: number;
  isReady: boolean;
  state: YouTubePlayerState;
  stateChangeOrigin: "interactive" | "programmatic" | null;
  stateChangeSequence: number;
  videoId: string | null;
}

type SnapshotListener = (snapshot: YouTubePlayerSnapshot) => void;
type ProgrammaticIntentKind = "cue" | "drift" | "pause" | "play" | "unlock";

interface ProgrammaticStateIntent {
  allowedStates: ReadonlySet<YouTubePlayerState>;
  expiresAt: number;
  generation: number;
  kind: ProgrammaticIntentKind;
  reassertionPending: boolean;
  settledAt: number | null;
  terminalState: YouTubePlayerState;
  videoId: string | null;
}

interface StateChangeClassification {
  intentGeneration?: number;
  isProgrammatic: boolean;
  reassertState?: 1 | 2;
}

const YOUTUBE_API_SCRIPT = "https://www.youtube.com/iframe_api";
const YOUTUBE_API_LOAD_TIMEOUT_MS = 10_000;
const CUE_TIMEOUT_MS = 10_000;
const PLAYER_COMMAND_TIMEOUT_MS = 5_000;
const PLAYER_COMMAND_SETTLE_GRACE_MS = 1_000;

let apiPromise: Promise<YouTubeApi> | null = null;

const loadYouTubeApi = (): Promise<YouTubeApi> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube playback is only available in the browser"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  const loadAttempt = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    let settled = false;
    let insertedScript: HTMLScriptElement | null = null;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };

    window.onYouTubeIframeAPIReady = () => {
      try {
        previousReadyHandler?.();
      } finally {
        finish(() => {
          if (window.YT?.Player) resolve(window.YT);
          else reject(new Error("YouTube IFrame API did not initialize"));
        });
      }
    };

    const timeout = window.setTimeout(() => {
      insertedScript?.remove();
      finish(() => reject(new Error("Timed out while loading the YouTube IFrame API")));
    }, YOUTUBE_API_LOAD_TIMEOUT_MS);

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_API_SCRIPT}"]`);
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => finish(() => reject(new Error("Failed to load the YouTube IFrame API"))),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    insertedScript = script;
    script.src = YOUTUBE_API_SCRIPT;
    script.async = true;
    script.onerror = () => {
      insertedScript?.remove();
      finish(() => reject(new Error("Failed to load the YouTube IFrame API")));
    };
    document.head.appendChild(script);
  });

  apiPromise = loadAttempt.catch((error) => {
    apiPromise = null;
    throw error;
  });

  return apiPromise;
};

export class YouTubeCueSupersededError extends Error {
  constructor() {
    super("YouTube cue was superseded by another video");
    this.name = "YouTubeCueSupersededError";
  }
}

export class YouTubePlayerController {
  private player: YouTubeIframePlayer | null = null;
  private playerReadyPromise: Promise<void>;
  private resolvePlayerReady: (() => void) | null = null;
  private rejectPlayerReady: ((error: Error) => void) | null = null;
  private mountPromise: Promise<void> | null = null;
  private mountReferenceCount = 0;
  private mountError: Error | null = null;
  private scheduledActionTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCue:
    | {
        promise: Promise<void>;
        reject: (error: Error) => void;
        resolve: () => void;
        startSeconds: number;
        timeout: ReturnType<typeof setTimeout>;
        videoId: string;
      }
    | undefined;
  private preparedStartSeconds = 0;
  private preparedVideoId: string | null = null;
  private programmaticIntent: ProgrammaticStateIntent | null = null;
  private programmaticIntentGeneration = 0;
  private listeners = new Set<SnapshotListener>();
  private snapshot: YouTubePlayerSnapshot = {
    autoplayBlocked: false,
    duration: 0,
    isReady: false,
    state: -1,
    stateChangeOrigin: null,
    stateChangeSequence: 0,
    videoId: null,
  };

  constructor() {
    this.playerReadyPromise = this.createPlayerReadyPromise();
  }

  async mount(element: HTMLElement): Promise<() => void> {
    this.mountReferenceCount++;

    try {
      if (!this.player) {
        if (!this.mountPromise) {
          if (this.mountError) {
            this.mountError = null;
            this.playerReadyPromise = this.createPlayerReadyPromise();
          }
          this.mountPromise = this.initializePlayer(element);
        }
        await this.mountPromise;
      }
    } catch (error) {
      this.mountReferenceCount = Math.max(0, this.mountReferenceCount - 1);
      throw error;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.mountReferenceCount = Math.max(0, this.mountReferenceCount - 1);
      if (this.mountReferenceCount === 0) this.destroy();
    };
  }

  private async initializePlayer(element: HTMLElement): Promise<void> {
    try {
      const api = await loadYouTubeApi();
      if (this.player) return;

      this.player = new api.Player(element, {
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onAutoplayBlocked: () => {
            this.snapshot = { ...this.snapshot, autoplayBlocked: true };
            this.emit();
          },
          onReady: () => {
            this.mountError = null;
            this.snapshot = { ...this.snapshot, isReady: true };
            this.resolvePlayerReady?.();
            this.resolvePlayerReady = null;
            this.rejectPlayerReady = null;
            this.emit();
          },
          onStateChange: (event) => {
            const eventVideoId = this.getEventVideoId(event.target);
            if (this.snapshot.videoId && eventVideoId && eventVideoId !== this.snapshot.videoId) return;

            const state = event.data as YouTubePlayerState;
            const classification = this.classifyStateChange(state, eventVideoId);
            this.snapshot = {
              ...this.snapshot,
              autoplayBlocked: event.data === api.PlayerState.PLAYING ? false : this.snapshot.autoplayBlocked,
              duration: this.getDuration(),
              state,
              stateChangeOrigin: classification.isProgrammatic ? "programmatic" : "interactive",
              stateChangeSequence: this.snapshot.stateChangeSequence + 1,
            };
            if (event.data === api.PlayerState.CUED || event.data === api.PlayerState.PLAYING) {
              this.resolvePendingCue(eventVideoId);
            }
            this.emit();
            if (classification.reassertState && classification.intentGeneration !== undefined) {
              this.reassertProgrammaticState(classification.intentGeneration, classification.reassertState);
            }
          },
          onError: (event) => {
            const eventVideoId = this.getEventVideoId(event.target);
            if (this.snapshot.videoId && eventVideoId && eventVideoId !== this.snapshot.videoId) return;

            this.snapshot = { ...this.snapshot, errorCode: event.data };
            this.rejectPendingCue(new Error(`YouTube player error ${event.data}`), eventVideoId);
            this.emit();
          },
        },
      });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.mountError = normalizedError;
      this.rejectPlayerReady?.(normalizedError);
      throw normalizedError;
    } finally {
      this.mountPromise = null;
    }
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async cue(videoId: string, startSeconds = 0): Promise<void> {
    await this.waitUntilReady();
    if (!this.player) throw new Error("YouTube player is not mounted");

    const normalizedStartSeconds = Math.max(0, startSeconds);
    if (
      this.pendingCue?.videoId === videoId &&
      Math.abs(this.pendingCue.startSeconds - normalizedStartSeconds) < 0.05
    ) {
      return this.pendingCue.promise;
    }

    if (
      this.snapshot.videoId === videoId &&
      this.preparedVideoId === videoId &&
      Math.abs(this.preparedStartSeconds - normalizedStartSeconds) < 0.05 &&
      [2, 5].includes(this.player.getPlayerState())
    ) {
      return;
    }

    this.clearScheduledAction();
    this.rejectPendingCue(new YouTubeCueSupersededError());
    this.snapshot = {
      ...this.snapshot,
      duration: 0,
      errorCode: undefined,
      state: -1,
      stateChangeOrigin: null,
      stateChangeSequence: this.snapshot.stateChangeSequence,
      videoId,
    };
    this.emit();

    let resolveCue!: () => void;
    let rejectCue!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveCue = resolve;
      rejectCue = reject;
    });
    void promise.catch(() => undefined);

    const timeout = setTimeout(() => {
      if (this.pendingCue?.promise !== promise) return;
      this.pendingCue = undefined;
      rejectCue(new Error("Timed out while preparing the YouTube video"));
    }, CUE_TIMEOUT_MS);
    this.pendingCue = {
      promise,
      reject: rejectCue,
      resolve: resolveCue,
      startSeconds: normalizedStartSeconds,
      timeout,
      videoId,
    };

    this.beginProgrammaticIntent("cue", [-1, 2, 3, 5], 5, videoId, CUE_TIMEOUT_MS);
    this.player.cueVideoById({ videoId, startSeconds: normalizedStartSeconds });
    return promise;
  }

  async schedulePlay(videoId: string, trackTimeSeconds: number, delaySeconds: number): Promise<void> {
    await this.cue(videoId, trackTimeSeconds);
    if (!this.player) return;

    this.clearScheduledAction();
    this.scheduledActionTimer = setTimeout(
      () => {
        this.beginProgrammaticIntent("play", [-1, 2, 3, 5, 1], 1, videoId);
        this.player?.seekTo(Math.max(0, trackTimeSeconds), true);
        this.player?.playVideo();
        this.scheduledActionTimer = null;
      },
      Math.max(0, delaySeconds * 1000)
    );
  }

  schedulePause(delaySeconds: number, trackTimeSeconds?: number, onPaused?: () => void): void {
    this.clearScheduledAction();
    this.scheduledActionTimer = setTimeout(
      () => {
        this.beginProgrammaticIntent("pause", [1, 3, 5, 2], 2);
        this.player?.pauseVideo();
        if (trackTimeSeconds !== undefined) {
          this.player?.seekTo(Math.max(0, trackTimeSeconds), true);
        }
        onPaused?.();
        this.scheduledActionTimer = null;
      },
      Math.max(0, delaySeconds * 1000)
    );
  }

  pauseNow(): void {
    this.clearScheduledAction();
    this.rejectPendingCue(new YouTubeCueSupersededError());
    this.beginProgrammaticIntent("pause", [1, 3, 5, 2], 2);
    this.player?.pauseVideo();
  }

  unlock(): void {
    if (!this.player) return;
    this.player.mute();
    this.beginProgrammaticIntent("unlock", [-1, 1, 2, 3, 5], 2);
    this.player.playVideo();
    this.player.pauseVideo();
    this.player.unMute();
  }

  getCurrentTime(): number {
    const value = this.player?.getCurrentTime() ?? 0;
    return Number.isFinite(value) ? value : 0;
  }

  getDuration(): number {
    const value = this.player?.getDuration() ?? 0;
    return Number.isFinite(value) ? value : 0;
  }

  setVolume(volume: number): void {
    this.player?.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
  }

  correctDrift(expectedTimeSeconds: number, toleranceSeconds = 0.75): boolean {
    if (!this.player || this.player.getPlayerState() !== 1) return false;
    const currentTime = this.getCurrentTime();
    if (Math.abs(currentTime - expectedTimeSeconds) <= toleranceSeconds) return false;

    this.beginProgrammaticIntent("drift", [3, 1], 1);
    this.player.seekTo(Math.max(0, expectedTimeSeconds), true);
    return true;
  }

  destroy(): void {
    this.clearScheduledAction();
    this.rejectPendingCue(new Error("YouTube player was destroyed"));
    this.rejectPlayerReady?.(new Error("YouTube player was destroyed"));
    this.player?.destroy();
    this.player = null;
    this.mountPromise = null;
    this.mountReferenceCount = 0;
    this.mountError = null;
    this.preparedStartSeconds = 0;
    this.preparedVideoId = null;
    this.programmaticIntent = null;
    this.playerReadyPromise = this.createPlayerReadyPromise();
    this.snapshot = {
      autoplayBlocked: false,
      duration: 0,
      isReady: false,
      state: -1,
      stateChangeOrigin: null,
      stateChangeSequence: 0,
      videoId: null,
    };
    this.emit();
  }

  private async waitUntilReady(): Promise<void> {
    if (this.snapshot.isReady) return;
    if (this.mountError) throw this.mountError;
    await this.playerReadyPromise;
  }

  private createPlayerReadyPromise(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.resolvePlayerReady = resolve;
      this.rejectPlayerReady = reject;
    });
    void promise.catch(() => undefined);
    return promise;
  }

  private clearScheduledAction(): void {
    if (!this.scheduledActionTimer) return;
    clearTimeout(this.scheduledActionTimer);
    this.scheduledActionTimer = null;
  }

  private beginProgrammaticIntent(
    kind: ProgrammaticIntentKind,
    allowedStates: YouTubePlayerState[],
    terminalState: YouTubePlayerState,
    videoId = this.snapshot.videoId,
    timeoutMs = PLAYER_COMMAND_TIMEOUT_MS
  ): void {
    this.programmaticIntent = {
      allowedStates: new Set(allowedStates),
      expiresAt: Date.now() + timeoutMs,
      generation: ++this.programmaticIntentGeneration,
      kind,
      reassertionPending: false,
      settledAt: null,
      terminalState,
      videoId,
    };
  }

  private classifyStateChange(state: YouTubePlayerState, videoId?: string): StateChangeClassification {
    const now = Date.now();
    const intent = this.programmaticIntent;
    if (!intent) return { isProgrammatic: false };
    if (intent.expiresAt <= now) {
      this.programmaticIntent = null;
      return { isProgrammatic: false };
    }
    if (intent.videoId && videoId && intent.videoId !== videoId) return { isProgrammatic: false };
    if (!intent.allowedStates.has(state)) return { isProgrammatic: false };

    if (state === intent.terminalState) {
      if (intent.kind === "cue") this.programmaticIntent = null;
      else if (intent.settledAt === null) {
        intent.settledAt = now;
        intent.expiresAt = now + PLAYER_COMMAND_SETTLE_GRACE_MS;
      }
      return { isProgrammatic: true };
    }

    const reassertState =
      (intent.terminalState === 1 && state === 2) || (intent.terminalState === 2 && state === 1)
        ? intent.terminalState
        : undefined;

    return {
      intentGeneration: intent.generation,
      isProgrammatic: true,
      reassertState,
    };
  }

  private reassertProgrammaticState(intentGeneration: number, state: 1 | 2): void {
    const intent = this.programmaticIntent;
    if (!intent || intent.generation !== intentGeneration || intent.reassertionPending) return;

    intent.reassertionPending = true;
    queueMicrotask(() => {
      const latestIntent = this.programmaticIntent;
      if (!latestIntent || latestIntent.generation !== intentGeneration) return;

      latestIntent.reassertionPending = false;
      if (state === 1) this.player?.playVideo();
      else this.player?.pauseVideo();
    });
  }

  private getEventVideoId(eventTarget?: YouTubeIframePlayer): string | undefined {
    return eventTarget?.getVideoData().video_id ?? this.player?.getVideoData().video_id;
  }

  private resolvePendingCue(videoId?: string): void {
    const pending = this.pendingCue;
    if (!pending || (videoId && videoId !== pending.videoId)) return;
    clearTimeout(pending.timeout);
    this.pendingCue = undefined;
    this.preparedVideoId = pending.videoId;
    this.preparedStartSeconds = pending.startSeconds;
    pending.resolve();
  }

  private rejectPendingCue(error: Error, videoId?: string): void {
    const pending = this.pendingCue;
    if (!pending || (videoId && videoId !== pending.videoId)) return;
    clearTimeout(pending.timeout);
    this.pendingCue = undefined;
    pending.reject(error);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const youtubePlayerController = new YouTubePlayerController();
