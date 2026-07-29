"use client";

import { youtubePlayerController, type YouTubePlayerSnapshot } from "@/lib/youtubePlayer";
import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, epochNow, isYouTubeSource } from "@beatsync/shared";
import { Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const INITIAL_SNAPSHOT: YouTubePlayerSnapshot = {
  autoplayBlocked: false,
  duration: 0,
  isReady: false,
  state: -1,
  stateChangeOrigin: null,
  stateChangeSequence: 0,
  videoId: null,
};
const PENDING_INTERACTIVE_ACTION_TIMEOUT_MS = 5_000;

type PendingInteractiveAction = {
  expiresAt: number;
  type: "pause" | "play" | "sync";
};

export const YouTubePlayer = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioUrl = useGlobalStore((state) => state.selectedAudioUrl);
  const isInitingSystem = useGlobalStore((state) => state.isInitingSystem);
  const canMutate = useCanMutate();
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [playbackEnabled, setPlaybackEnabled] = useState(false);
  const lastSyncRequestAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pendingInteractiveActionRef = useRef<PendingInteractiveAction | null>(null);

  const requestRoomSync = useCallback(() => {
    const now = performance.now();
    if (now - lastSyncRequestAtRef.current < 500) return false;

    const socket = useGlobalStore.getState().socket;
    if (socket?.readyState !== WebSocket.OPEN) return false;

    lastSyncRequestAtRef.current = now;
    sendWSRequest({
      ws: socket,
      request: { type: ClientActionEnum.enum.SYNC },
    });
    return true;
  }, []);

  const selectedSource = useMemo(
    () => audioSources.find((source) => source.source.url === selectedAudioUrl)?.source,
    [audioSources, selectedAudioUrl]
  );
  const youtubeSource = selectedSource && isYouTubeSource(selectedSource) ? selectedSource : null;
  const youtubePlaybackExpectedPlaying = useGlobalStore((state) => state.youtubePlaybackExpectedPlaying);

  useEffect(() => {
    const pendingAction = pendingInteractiveActionRef.current?.type;
    if (
      (pendingAction === "play" && youtubePlaybackExpectedPlaying) ||
      (pendingAction === "pause" && !youtubePlaybackExpectedPlaying)
    ) {
      pendingInteractiveActionRef.current = null;
    }
  }, [youtubePlaybackExpectedPlaying]);

  useEffect(() => {
    pendingInteractiveActionRef.current = null;
  }, [selectedAudioUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let destroy: () => void = () => undefined;

    void youtubePlayerController
      .mount(host)
      .then((cleanup) => {
        if (disposed) cleanup();
        else destroy = cleanup;
      })
      .catch((error) => {
        console.error("Failed to initialize YouTube player:", error);
        toast.error("Failed to initialize the YouTube player");
      });

    return () => {
      disposed = true;
      destroy();
    };
  }, []);

  useEffect(() => youtubePlayerController.subscribe(setSnapshot), []);

  useEffect(() => {
    if (!youtubeSource || snapshot.videoId !== youtubeSource.videoId) return;

    if (
      snapshot.state === 1 &&
      snapshot.stateChangeOrigin === "programmatic" &&
      pendingInteractiveActionRef.current?.type === "sync"
    ) {
      pendingInteractiveActionRef.current = null;
    }

    if (snapshot.isReady) {
      useGlobalStore.getState().applyFinalGain();
    }

    if (snapshot.duration > 0) {
      useGlobalStore.setState({ duration: snapshot.duration });
    }

    if (snapshot.errorCode) {
      useGlobalStore.setState((state) => ({
        audioSources: state.audioSources.map((source) =>
          source.source.url === youtubeSource.url
            ? { source: youtubeSource, status: "error", error: `YouTube error ${snapshot.errorCode}` }
            : source
        ),
        isPlaying: false,
        youtubePlaybackExpectedPlaying: false,
      }));
    }

    if (snapshot.autoplayBlocked) {
      useGlobalStore.setState({ isPlaying: false });
      toast.warning("Click Enable playback to reconnect this device to the room.", {
        id: "youtube-autoplay-blocked",
      });
    } else if (snapshot.state === 1 && snapshot.stateChangeOrigin === "interactive") {
      const state = useGlobalStore.getState();
      if (!state.youtubePlaybackExpectedPlaying && state.selectedAudioUrl === youtubeSource.url) {
        if (canMutate) {
          const pendingAction = pendingInteractiveActionRef.current;
          if (pendingAction && pendingAction.expiresAt <= performance.now()) {
            pendingInteractiveActionRef.current = null;
          }
          if (pendingInteractiveActionRef.current?.type === "play") return;
          pendingInteractiveActionRef.current = {
            expiresAt: performance.now() + PENDING_INTERACTIVE_ACTION_TIMEOUT_MS,
            type: "play",
          };
          const currentTime = youtubePlayerController.getCurrentTime();
          youtubePlayerController.pauseNow();
          useGlobalStore.setState({
            currentTime,
            isPlaying: false,
          });
          state.broadcastPlay(currentTime);
        } else {
          youtubePlayerController.pauseNow();
          useGlobalStore.setState({ isPlaying: false });
          toast.warning("You do not have permission to control room playback.", {
            id: "youtube-playback-permission",
          });
        }
      }
    } else if (snapshot.state === 2 && snapshot.stateChangeOrigin === "interactive") {
      const state = useGlobalStore.getState();
      if (state.youtubePlaybackExpectedPlaying && state.selectedAudioUrl === youtubeSource.url) {
        const pendingAction = pendingInteractiveActionRef.current;
        if (pendingAction && pendingAction.expiresAt <= performance.now()) {
          pendingInteractiveActionRef.current = null;
        }
        if (
          pendingInteractiveActionRef.current?.type === "pause" ||
          pendingInteractiveActionRef.current?.type === "sync"
        ) {
          return;
        }
        useGlobalStore.setState({ isPlaying: false });
        if (canMutate) {
          pendingInteractiveActionRef.current = {
            expiresAt: performance.now() + PENDING_INTERACTIVE_ACTION_TIMEOUT_MS,
            type: "pause",
          };
          state.broadcastPause(youtubePlayerController.getCurrentTime());
        } else {
          if (requestRoomSync()) {
            pendingInteractiveActionRef.current = {
              expiresAt: performance.now() + PENDING_INTERACTIVE_ACTION_TIMEOUT_MS,
              type: "sync",
            };
          }
          toast.info("Only a room controller can pause playback. Reconnecting this device.", {
            id: "youtube-local-pause",
          });
        }
      }
    } else if (snapshot.state === 0) {
      const state = useGlobalStore.getState();
      const shouldCoordinateNextTrack =
        state.isPlaying && state.selectedAudioUrl === youtubeSource.url && state.currentUser?.isAdmin;

      useGlobalStore.setState({
        currentTime: snapshot.duration,
        isPlaying: false,
        youtubePlaybackExpectedPlaying: false,
      });

      if (shouldCoordinateNextTrack) {
        queueMicrotask(() => {
          const latestState = useGlobalStore.getState();
          if (latestState.audioSources.length > 1) {
            latestState.skipToNextTrack(true);
          } else {
            latestState.broadcastPause();
          }
        });
      }
    }
  }, [
    snapshot.autoplayBlocked,
    snapshot.duration,
    snapshot.errorCode,
    snapshot.isReady,
    snapshot.state,
    snapshot.stateChangeOrigin,
    snapshot.stateChangeSequence,
    snapshot.videoId,
    canMutate,
    requestRoomSync,
    youtubeSource,
  ]);

  useEffect(() => {
    if (!youtubeSource) return;

    const interval = window.setInterval(() => {
      const state = useGlobalStore.getState();
      if (!state.isPlaying || state.selectedAudioUrl !== youtubeSource.url) return;

      const elapsedSeconds =
        (epochNow() + state.offsetEstimate + state.nudgeOffsetMs - state.youtubePlaybackTargetServerTime) / 1000;
      const expectedTime = state.youtubePlaybackStartPosition + Math.max(0, elapsedSeconds);
      youtubePlayerController.correctDrift(expectedTime);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [youtubeSource]);

  const shouldShow = Boolean(youtubeSource) && !isInitingSystem;
  const needsPlaybackPermission = !playbackEnabled || snapshot.autoplayBlocked;

  return (
    <section
      className={cn("shrink-0 border-b border-neutral-800/50 bg-neutral-950 px-4 py-3", !shouldShow && "hidden")}
      aria-label="Synchronized YouTube player"
    >
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-neutral-400">
          <span className="flex items-center gap-2">
            <Video className="size-4 text-red-500" />
            Synchronized YouTube playback
          </span>
          {needsPlaybackPermission && (
            <button
              type="button"
              className="rounded-md bg-white px-3 py-1.5 font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-50"
              disabled={!snapshot.isReady || !youtubeSource}
              onClick={() => {
                youtubePlayerController.unlock();
                setPlaybackEnabled(true);
                requestRoomSync();
              }}
            >
              Enable playback
            </button>
          )}
        </div>
        <div className="aspect-video min-h-[200px] overflow-hidden rounded-lg bg-black">
          <div className="h-full w-full">
            <div ref={hostRef} className="h-full w-full" />
          </div>
        </div>
        {needsPlaybackPermission && (
          <p className="mt-2 text-xs text-neutral-500">
            Each device may need one click before the browser permits synchronized YouTube playback.
          </p>
        )}
        <p className="mt-2 text-[11px] text-neutral-600">
          YouTube playback is governed by{" "}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-400"
          >
            YouTube&apos;s Terms
          </a>{" "}
          and the{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-400"
          >
            Google Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
};
