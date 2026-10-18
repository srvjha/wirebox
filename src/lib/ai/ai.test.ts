import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEYS = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"];

describe("getProvider", () => {
  beforeEach(() => KEYS.forEach((k) => vi.stubEnv(k, "")));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null without any key", async () => {
    const { getProvider } = await import("./index");
    expect(getProvider()).toBeNull();
  });

  it("picks the provider whose key is set, or the one AI_PROVIDER names", async () => {
    const { getProvider } = await import("./index");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    expect(getProvider()?.id).toBe("openai");
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(getProvider()?.id).toBe("gemini");
  });

  it("calls an OpenAI-compatible chat completions endpoint", async () => {
    const { getProvider } = await import("./index");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_BASE_URL", "https://example.test/v1/");
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "Your database is the bottleneck." } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const text = await getProvider()!.complete({ system: "sys", prompt: "hi" });
    expect(text).toBe("Your database is the bottleneck.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(JSON.parse(String(init.body)).messages[0]).toEqual({ role: "system", content: "sys" });
  });

  it("calls Gemini generateContent", async () => {
    const { getProvider } = await import("./index");
    vi.stubEnv("GEMINI_API_KEY", "g-test");
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "Add a cache." }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getProvider()!.complete({ system: "sys", prompt: "hi" })).toBe("Add a cache.");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain(":generateContent");
  });

  it("surfaces HTTP errors so the route can fall back to rules", async () => {
    const { getProvider } = await import("./index");
    vi.stubEnv("OPENAI_API_KEY", "sk-bad");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    await expect(getProvider()!.complete({ system: "s", prompt: "p" })).rejects.toThrow(/openai 401/);
  });
});
