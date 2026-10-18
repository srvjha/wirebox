import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One interface over several LLM providers. Pick one with AI_PROVIDER, or
 * leave it unset and the first provider with a key wins.
 */

export type ProviderId = "anthropic" | "openai" | "gemini";

export type CompleteInput = { system: string; prompt: string; maxTokens?: number };

export type Provider = {
  id: ProviderId;
  model: string;
  complete(input: CompleteInput): Promise<string>;
};

const anthropic = (key: string): Provider => {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  return {
    id: "anthropic",
    model,
    async complete({ system, prompt, maxTokens = 400 }) {
      const client = new Anthropic({ apiKey: key });
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    },
  };
};

// Also works with any OpenAI-compatible API (OpenRouter, Groq, Together, Ollama…) via OPENAI_BASE_URL.
const openai = (key: string): Provider => {
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    id: "openai",
    model,
    async complete({ system, prompt, maxTokens = 400 }) {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
};

const gemini = (key: string): Provider => {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  return {
    id: "gemini",
    model,
    async complete({ system, prompt, maxTokens = 400 }) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
        },
      );
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    },
  };
};

const factories: Record<ProviderId, { env: string; make: (key: string) => Provider }> = {
  anthropic: { env: "ANTHROPIC_API_KEY", make: anthropic },
  openai: { env: "OPENAI_API_KEY", make: openai },
  gemini: { env: "GEMINI_API_KEY", make: gemini },
};

/** The configured provider, or null when no key is set (callers fall back to rules). */
export function getProvider(): Provider | null {
  const wanted = process.env.AI_PROVIDER?.toLowerCase() as ProviderId | undefined;
  const order: ProviderId[] = wanted && wanted in factories ? [wanted] : ["anthropic", "openai", "gemini"];
  for (const id of order) {
    const key = process.env[factories[id].env];
    if (key) return factories[id].make(key);
  }
  return null;
}
