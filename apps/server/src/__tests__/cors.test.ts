import { describe, expect, it } from "bun:test";
import { createCorsPolicy } from "@/utils/responses";

describe("CORS policy", () => {
  it("allows requests without an Origin header", () => {
    const policy = createCorsPolicy("http://localhost:3000");

    expect(policy.isOriginAllowed(null)).toBe(true);
  });

  it("rejects supplied origins when the allowlist is empty", () => {
    const policy = createCorsPolicy("");

    expect(policy.isOriginAllowed("http://localhost:3000")).toBe(false);
    expect(policy.getHeaders("http://localhost:3000")["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("allows configured origins and rejects other origins", () => {
    const policy = createCorsPolicy("http://localhost:3000, http://192.168.100.110:3000/,https://beatsync.example");

    expect(policy.isOriginAllowed("http://localhost:3000")).toBe(true);
    expect(policy.isOriginAllowed("http://192.168.100.110:3000")).toBe(true);
    expect(policy.isOriginAllowed("https://beatsync.example")).toBe(true);
    expect(policy.isOriginAllowed("https://evil.example")).toBe(false);
  });

  it("echoes an allowed origin and varies the response by Origin", () => {
    const policy = createCorsPolicy("http://localhost:3000");

    expect(policy.getHeaders("http://localhost:3000")).toEqual({
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      Vary: "Origin",
    });
  });

  it("supports an explicit wildcard policy", () => {
    const policy = createCorsPolicy("*");

    expect(policy.isOriginAllowed("https://example.com")).toBe(true);
    expect(policy.getHeaders("https://example.com")["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("rejects invalid configured origins", () => {
    expect(() => createCorsPolicy("not-an-origin")).toThrow("Invalid origin in CORS_ALLOWED_ORIGINS");
    expect(() => createCorsPolicy("ftp://example.com")).toThrow("Invalid origin in CORS_ALLOWED_ORIGINS");
    expect(() => createCorsPolicy("https://example.com/path")).toThrow("Invalid origin in CORS_ALLOWED_ORIGINS");
  });
});
