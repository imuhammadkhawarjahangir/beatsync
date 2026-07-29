import { getUserLocation } from "@/lib/ip";
import { expect, it, mock } from "bun:test";

it("continues without location data when every external provider is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warn = mock(() => undefined);
  const fetchMock = mock(() => Promise.reject(new TypeError("Failed to fetch")));

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  console.warn = warn;

  try {
    await expect(getUserLocation()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledWith("IP location is unavailable; continuing without location data.");
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
