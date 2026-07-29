import "@/env";
import type { WSBroadcastType, WSUnicastType } from "@beatsync/shared";
import type { ServerWebSocket } from "bun";
import type { BunServer, WSData } from "@/utils/websocket";

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const corsHeaders = baseCorsHeaders;

const normalizeOrigin = (origin: string): string => {
  const trimmedOrigin = origin.trim();
  if (trimmedOrigin === "*") return trimmedOrigin;

  try {
    const url = new URL(trimmedOrigin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("Only HTTP(S) origins without paths, credentials, queries, or fragments are allowed");
    }
    return url.origin;
  } catch {
    throw new Error(`Invalid origin in CORS_ALLOWED_ORIGINS: ${origin}`);
  }
};

export const createCorsPolicy = (configuredOrigins = "") => {
  const allowedOrigins = new Set(
    configuredOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
  );
  const allowAllOrigins = allowedOrigins.has("*");

  const isOriginAllowed = (origin: string | null): boolean => {
    if (!origin) return true;
    if (allowAllOrigins) return true;

    try {
      return allowedOrigins.has(normalizeOrigin(origin));
    } catch {
      return false;
    }
  };

  const getHeaders = (origin: string | null): Record<string, string> => {
    const headers: Record<string, string> = { ...baseCorsHeaders };

    if (origin && isOriginAllowed(origin)) {
      headers["Access-Control-Allow-Origin"] = allowAllOrigins ? "*" : normalizeOrigin(origin);
      headers.Vary = "Origin";
    }

    return headers;
  };

  return { allowedOrigins, isOriginAllowed, getHeaders };
};

export const corsPolicy = createCorsPolicy(process.env.CORS_ALLOWED_ORIGINS);

export const applyCorsHeaders = (response: Response, origin: string | null): Response => {
  for (const [header, value] of Object.entries(corsPolicy.getHeaders(origin))) {
    response.headers.set(header, value);
  }
  return response;
};

// Helper functions for common responses
export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const errorResponse = (message: string, status = 400) =>
  new Response(message, {
    status,
    headers: corsHeaders,
  });

// Broadcast to all clients in the room
export const sendBroadcast = ({
  server,
  roomId,
  message,
}: {
  server: BunServer;
  roomId: string;
  message: WSBroadcastType;
}) => {
  server.publish(roomId, JSON.stringify(message));
};

export const sendUnicast = ({ ws, message }: { ws: ServerWebSocket<WSData>; message: WSUnicastType }) => {
  ws.send(JSON.stringify(message));
};

// Send a broadcast-typed message to a single client (e.g., initial state on join)
export const sendToClient = ({ ws, message }: { ws: ServerWebSocket<WSData>; message: WSBroadcastType }) => {
  ws.send(JSON.stringify(message));
};
