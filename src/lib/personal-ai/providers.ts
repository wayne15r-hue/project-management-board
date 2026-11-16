import { choices, type Model } from "./catalog";
import type { ConnectionCheck, Provider, Quote, Usage } from "./contracts";
import { PersonalAIError, RejectedKeyError } from "./errors";
import { normalizeUsage, object } from "./usage";

const base: Record<Provider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
type Prompt = { system: string; input: string; json?: boolean };

async function call(provider: Provider, key: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider === "gemini") {
    headers["x-goog-api-key"] = key;
  } else {
    headers.Authorization = "Bearer " + key;
  }
  if (body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(base[provider] + path, {
      headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(body ? 40_000 : 10_000),
    });
  } catch {
    throw new PersonalAIError("The provider did not respond in time or could not be reached.", 502);
  }
  if (response.ok) return object(await response.json().catch(() => null));
  const status = response.status;
  const info = object((await response.json().catch(() => null))?.error);
  if (status === 401 || info.code === "API_KEY_INVALID" || (Array.isArray(info.details) &&
      info.details.some(detail => object(detail).reason === "API_KEY_INVALID"))) {
    throw new RejectedKeyError();
  }
  if (status === 403) throw new PersonalAIError("This key lacks permission for the provider request.", 403, true);
  if (status === 404) throw new PersonalAIError("This model or endpoint is no longer available. Choose another model.", 404, true);
  if (status === 402 || info.code === "insufficient_quota") {
    throw new PersonalAIError("Check the available credits or billing limits in your provider account.", 402, true);
  }
  if (status === 429) throw new PersonalAIError("The provider is rate limiting requests or its quota is exhausted.", 429, true);
  if (status === 400) throw new PersonalAIError("The provider rejected this model or effort setting. Check the selection and your provider account.", 400, true);
  throw new PersonalAIError("The provider is temporarily unavailable.", 502);
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(object) : [];
}

export async function checkProvider(provider: Provider, apiKey: string): Promise<ConnectionCheck> {
  if ((provider === "openai" && apiKey.startsWith("sk-admin-")) ||
      (provider === "anthropic" && apiKey.startsWith("sk-ant-admin"))) {
    throw new PersonalAIError("Use an inference API key instead of an admin key.", 400, true);
  }
  let providerExpiresAt: string | null = null;
  if (provider === "openrouter") {
    const metadata = object((await call(provider, apiKey, "/key")).data);
    if (!Object.keys(metadata).length || metadata.is_management_key || metadata.is_provisioning_key) {
      throw new PersonalAIError("Use an OpenRouter inference key.", 400);
    }
    const expiry = typeof metadata.expires_at === "string" ? Date.parse(metadata.expires_at) : NaN;
    providerExpiresAt = Number.isFinite(expiry) ? new Date(expiry).toISOString() : null;
  }
  const path = {
    openrouter: "/models/user", gemini: "/models?pageSize=1000",
    anthropic: "/models?limit=1000", openai: "/models", groq: "/models",
  }[provider];
  const response = await call(provider, apiKey, path);
  const ids = provider === "gemini"
    ? list(response.models).filter(row => Array.isArray(row.supportedGenerationMethods) && row.supportedGenerationMethods.includes("generateContent"))
      .flatMap(row => typeof row.name === "string" ? [row.name.replace(/^models\//, "")] : [])
    : list(response.data).flatMap(row => typeof row.id === "string" ? [row.id] : []);
  return { models: choices(provider, ids), providerExpiresAt };
}

export function quoteFor(model: Model, effort: string, prompt: Prompt): Quote {
  // UTF-8 byte length with framing headroom gives a conservative input allowance.
  const inputTokens = Buffer.byteLength(prompt.system + prompt.input, "utf8") + 512;
  const outputAllowance = model.efforts.length && ["medium", "high", "xhigh", "max", "default"].includes(effort) ? 8192 : 4096;
  return { inputTokens, outputAllowance, maxCostMicros: Math.max(1, Math.ceil(inputTokens * model.input + outputAllowance * model.output)) };
}

export async function generate(provider: Provider, key: string, model: Model, effort: string, prompt: Prompt, maxTokens: number) {
  const configured = effort === "default" ? undefined : effort;
  const messages = [{ role: "system", content: prompt.system }, { role: "user", content: prompt.input }];
  let response: Record<string, unknown>;
  let output: unknown;
  let rawUsage: unknown;
  switch (provider) {
    case "openai":
      response = await call(provider, key, "/responses", {
        model: model.id, instructions: prompt.system, input: prompt.input, max_output_tokens: maxTokens, store: false,
        service_tier: "default",
        reasoning: configured ? { effort: configured } : undefined,
        text: prompt.json ? { format: { type: "json_object" } } : undefined,
      });
      output = list(response.output).filter(item => item.type === "message")
        .flatMap(item => list(item.content)).filter(item => item.type === "output_text")
        .map(item => item.text).join("");
      rawUsage = response.usage;
      break;
    case "anthropic":
      response = await call(provider, key, "/messages", {
        model: model.id, system: prompt.system, messages: messages.slice(1), max_tokens: maxTokens,
        service_tier: "standard_only",
        thinking: model.adaptive && configured ? { type: "adaptive" } : undefined,
        output_config: configured ? { effort: configured } : undefined,
      });
      output = list(response.content).filter(block => block.type === "text").map(block => block.text).join("");
      rawUsage = response.usage;
      break;
    case "gemini":
      response = await call(provider, key, "/models/" + model.id + ":generateContent", {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.input }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          thinkingConfig: configured ? { thinkingLevel: configured.toUpperCase() } : undefined,
          responseMimeType: prompt.json ? "application/json" : undefined,
        },
      });
      output = list(object(list(response.candidates)[0]?.content).parts)
        .filter(part => part.thought !== true).map(part => part.text).join("");
      rawUsage = response.usageMetadata;
      break;
    default:
      response = await call(provider, key, "/chat/completions", {
        model: model.id, messages,
        response_format: prompt.json ? { type: "json_object" } : undefined,
        ...(provider === "groq"
          ? { max_completion_tokens: maxTokens, reasoning_effort: configured, include_reasoning: false }
          : {
            max_tokens: maxTokens,
            usage: { include: true },
            reasoning: { effort: configured, exclude: true },
            provider: {
              allow_fallbacks: false, require_parameters: true, data_collection: "deny",
              max_price: { prompt: model.input, completion: model.output, request: 0 },
            },
          }),
      });
      output = object(list(response.choices)[0]?.message).content;
      rawUsage = response.usage;
  }
  return { text: typeof output === "string" ? output.trim() : "", usage: normalizeUsage(provider, rawUsage), rawUsage: object(rawUsage) };
}

export function estimateCharge(provider: Provider, model: Model, usage: Usage, raw: Record<string, unknown>) {
  if (provider === "openrouter" && typeof raw.cost === "number" && Number.isFinite(raw.cost) && raw.cost >= 0) {
    const upstream = object(raw.cost_details).upstream_inference_cost;
    if (raw.is_byok !== true) return Math.ceil(raw.cost * 1_000_000);
    if (typeof upstream === "number" && Number.isFinite(upstream) && upstream > 0) {
      return Math.ceil((raw.cost + upstream) * 1_000_000);
    }
  }
  const rawCache = object(raw.input_tokens_details ?? raw.prompt_tokens_details).cached_tokens
    ?? raw.cache_read_input_tokens ?? raw.cachedContentTokenCount;
  const cached = typeof rawCache === "number" && Number.isInteger(rawCache) ? Math.max(0, Math.min(rawCache, usage.inputTokens)) : 0;
  return Math.ceil((usage.inputTokens - cached) * model.input + cached * (model.cachedInput ?? model.input) +
    usage.outputTokens * model.output);
}
