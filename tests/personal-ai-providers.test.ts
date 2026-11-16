import { afterEach, expect, it, vi } from "vitest";
import { findModel } from "@/lib/personal-ai/catalog";
import type { Provider } from "@/lib/personal-ai/contracts";
import { checkProvider, estimateCharge, generate, quoteFor } from "@/lib/personal-ai/providers";

const source = { system: "Turn these notes into tasks.", input: "Sam will send the agenda." };
const normal = { choices: [{ message: { content: "Send the agenda" } }], usage: { prompt_tokens: 100, completion_tokens: 30 } };
const samples: {
  provider: Provider; model: string; url: string; header: string; auth: string;
  payload: unknown; response: object; reasoning: number | null;
}[] = [
  { provider: "openai", model: "gpt-5.4-mini", url: "https://api.openai.com/v1/responses", header: "authorization", auth: "Bearer test-key",
    payload: { reasoning: { effort: "low" }, store: false, max_output_tokens: 4096, service_tier: "default" },
    response: { output: [{ type: "message", content: [{ type: "output_text", text: "Send the agenda" }] }],
      usage: { input_tokens: 100, output_tokens: 30, output_tokens_details: { reasoning_tokens: 15 } } }, reasoning: 15 },
  { provider: "anthropic", model: "claude-sonnet-4-6", url: "https://api.anthropic.com/v1/messages", header: "x-api-key", auth: "test-key",
    payload: { output_config: { effort: "low" }, thinking: { type: "adaptive" }, max_tokens: 4096, service_tier: "standard_only" },
    response: { content: [{ type: "thinking", thinking: "hidden" }, { type: "text", text: "Send the agenda" }],
      usage: { input_tokens: 90, cache_read_input_tokens: 10, output_tokens: 30 } }, reasoning: null },
  { provider: "gemini", model: "gemini-3.1-flash-lite", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    header: "x-goog-api-key", auth: "test-key",
    payload: { generationConfig: { thinkingConfig: { thinkingLevel: "LOW" }, maxOutputTokens: 4096 } },
    response: { candidates: [{ content: { parts: [{ thought: true, text: "hidden" }, { text: "Send the agenda" }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10, totalTokenCount: 130 } }, reasoning: 10 },
  { provider: "groq", model: "openai/gpt-oss-20b", url: "https://api.groq.com/openai/v1/chat/completions", header: "authorization", auth: "Bearer test-key",
    payload: { max_completion_tokens: 4096, reasoning_effort: "low", include_reasoning: false }, response: normal, reasoning: null },
  { provider: "openrouter", model: "qwen/qwen3.8-27b", url: "https://openrouter.ai/api/v1/chat/completions", header: "authorization", auth: "Bearer test-key",
    payload: { max_tokens: 4096, reasoning: { effort: "low", exclude: true }, provider: { allow_fallbacks: false, require_parameters: true } },
    response: normal, reasoning: null },
];
afterEach(() => vi.unstubAllGlobals());

it.each(samples)("sends the supported $provider effort and accounts for the returned tokens", async (sample) => {
  const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockImplementation(async () => Response.json(sample.response));
  vi.stubGlobal("fetch", fetcher);
  const model = findModel(sample.provider, sample.model)!;
  const quote = quoteFor(model, "low", source);
  const result = await generate(sample.provider, "test-key", model, "low", source, quote.outputAllowance);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(sample.url);
  expect(new Headers(init.headers).get(sample.header)).toBe(sample.auth);
  expect(init.redirect).toBe("error");
  expect(JSON.parse(String(init.body))).toMatchObject(sample.payload as object);
  if (sample.provider === "groq") expect(JSON.parse(String(init.body))).not.toHaveProperty("reasoning_format");
  expect(result.text).toBe("Send the agenda");
  expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, totalTokens: 130, reasoningTokens: sample.reasoning });
  expect(estimateCharge(sample.provider, model, result.usage!, result.rawUsage)).toBeLessThan(quote.maxCostMicros);
});

it("filters models to key access and drops raw provider errors", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ data: [{ id: "gpt-5.4-mini" }, { id: "unknown" }] }))
    .mockResolvedValueOnce(Response.json({ error: { message: "test-key secret" } }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  expect((await checkProvider("openai", "test-key")).models.map(model => model.id)).toEqual(["gpt-5.4-mini"]);
  await expect(checkProvider("openai", "test-key")).rejects.toThrow("The provider rejected this key.");
  await expect(checkProvider("openai", "sk-admin-test-token")).rejects.toThrow("inference API key");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
