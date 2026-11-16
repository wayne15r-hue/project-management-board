import type { ModelChoice, Provider } from "./contracts";

export type Model = ModelChoice & { input: number; output: number; cachedInput?: number; adaptive?: boolean };
const simple = ["low", "medium", "high"];
const openAI = ["none", ...simple, "xhigh"];

// USD per million tokens. OpenRouter entries are enforced routing price ceilings.
const catalog: Record<Provider, Model[]> = {
  openai: [
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini", efforts: openAI, input: 0.75, output: 4.5, cachedInput: 0.075 },
    { id: "gpt-5.4", label: "GPT-5.4", efforts: openAI, input: 2.5, output: 15, cachedInput: 0.25 },
  ],
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", efforts: [], input: 1, output: 5, cachedInput: 0.1 },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", efforts: [...simple, "max"], input: 3, output: 15, cachedInput: 0.3, adaptive: true },
  ],
  gemini: [
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", efforts: ["minimal", ...simple], input: 0.25, output: 1.5, cachedInput: 0.025 },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", efforts: simple, input: 2, output: 12, cachedInput: 0.2 },
  ],
  groq: [
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B", efforts: simple, input: 0.075, output: 0.30, cachedInput: 0.037 },
    { id: "openai/gpt-oss-120b", label: "GPT OSS 120B", efforts: simple, input: 0.15, output: 0.60, cachedInput: 0.075 },
  ],
  openrouter: [
    { id: "openai/gpt-oss-20b", label: "GPT OSS 20B", efforts: simple, input: 0.25, output: 1 },
    { id: "qwen/qwen3.8-27b", label: "Qwen3.8 27B", efforts: simple, input: 0.50, output: 5 },
  ],
};

export function choices(provider: Provider, modelIds: readonly string[]): ModelChoice[] {
  return catalog[provider].filter(model => modelIds.includes(model.id))
    .map(({ id, label, efforts }) => ({ id, label, efforts }));
}
export function findModel(provider: Provider, id: string) {
  return catalog[provider].find(model => model.id === id);
}
export function supportsEffort(model: ModelChoice, effort: string) {
  return effort === "default" || model.efforts.includes(effort);
}
