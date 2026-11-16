import type { Provider, Usage } from "./contracts";

type JsonObject = Record<string, unknown>;
export function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2_000_000_000 ? value : null;
}

export function normalizeUsage(provider: Provider, value: unknown): Usage | null {
  const usage = object(value);
  const input = count(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount);
  let output = count(usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount);
  const details = object(usage.output_tokens_details ?? usage.completion_tokens_details);
  const reasoning = count(usage.thoughtsTokenCount ?? details.reasoning_tokens);
  const total = count(usage.total_tokens ?? usage.totalTokenCount);
  if (input === null) return null;
  // Gemini reports generated answer tokens and thinking tokens separately.
  if (provider === "gemini") {
    if (output !== null) output += reasoning ?? 0;
    else if (total !== null && total >= input + (reasoning ?? 0)) output = total - input;
  }
  if (output === null) return null;
  const cache = provider === "anthropic"
    ? (count(usage.cache_read_input_tokens) ?? 0) + (count(usage.cache_creation_input_tokens) ?? 0) : 0;
  return {
    inputTokens: input + cache, outputTokens: output, reasoningTokens: reasoning,
    totalTokens: total ?? input + cache + output,
  };
}
