"use client";

import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum, extractYouTubeVideoId } from "@beatsync/shared";
import { Plus, Video } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export const YouTubeUrlInput = () => {
  const canMutate = useCanMutate();
  const [url, setUrl] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;

    const trimmedUrl = url.trim();
    if (!extractYouTubeVideoId(trimmedUrl)) {
      toast.error("Enter a valid YouTube video URL");
      return;
    }

    const socket = useGlobalStore.getState().socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("The room is not connected");
      return;
    }

    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.ADD_YOUTUBE_SOURCE,
        url: trimmedUrl,
      },
    });
    setUrl("");
  };

  if (!canMutate) return null;

  return (
    <form className="px-3" onSubmit={handleSubmit}>
      <label htmlFor="youtube-url" className="mb-1.5 flex items-center gap-2 text-xs text-neutral-400">
        <Video className="size-4 text-red-500" />
        Add a YouTube video
      </label>
      <div className="flex gap-2">
        <input
          id="youtube-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={!url.trim()}
          className="rounded-md bg-neutral-800 px-3 text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add YouTube video"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </form>
  );
};
