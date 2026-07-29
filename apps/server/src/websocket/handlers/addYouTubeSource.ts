import { createYouTubeSource, type ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleAddYouTubeSource: HandlerFunction<ExtractWSRequestFrom["ADD_YOUTUBE_SOURCE"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  const source = createYouTubeSource(message.url);

  if (!source) {
    throw new Error("Enter a valid YouTube video URL");
  }

  if (room.getAudioSources().some((existing) => existing.url === source.url)) {
    return;
  }

  const sources = room.addAudioSource(source);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources,
      },
    },
  });
};
