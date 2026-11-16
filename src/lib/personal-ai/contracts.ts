export const PROVIDERS = {
  openai: { label: "OpenAI", keys: "https://platform.openai.com/api-keys" },
  anthropic: { label: "Anthropic", keys: "https://platform.claude.com/settings/keys" },
  gemini: { label: "Google Gemini", keys: "https://aistudio.google.com/api-keys" },
  groq: { label: "Groq", keys: "https://console.groq.com/keys" },
  openrouter: { label: "OpenRouter", keys: "https://openrouter.ai/settings/keys" },
} as const;
export type Provider = keyof typeof PROVIDERS;

export const TOOLS = {
  notes_to_tasks: { label: "Notes to Tasks", description: "Turn rough notes into a checklist.", instruction: "Write a checklist. Include owners and due dates only if explicitly stated." },
  meeting_recap: { label: "Meeting Recap", description: "Pull decisions and action items out of meeting notes.", instruction: "Use the sections Recap, Decisions, Action items, and Open questions. Only use evidence from the notes." },
  status_update: { label: "Status Update", description: "Turn progress notes into an update you can share.", instruction: "Use the sections Done, Next, and Blocked. Use only the supplied facts. Leave missing sections empty or say Not specified." },
  ticket_triage: { label: "Ticket Triage", description: "Suggest a category, priority, and follow-up questions.", instruction: "Suggest a category and priority (Low, Medium, High, or Urgent). Explain the supporting evidence and ask concise questions about missing impact or urgency. The recommendation is for human review." },
  rewrite_translate: { label: "Rewrite & Translate", description: "Make text clearer, shorter, or rephrase it in another language.", instruction: "Rewrite or translate according to the selected operation. Preserve meaning, names, and numbers. Return only the revised text." },
} as const;
export type Tool = keyof typeof TOOLS;
export const REWRITE_MODES = ["clearer", "shorter", "professional", "friendly", "translate"] as const;
export const TOOL_INPUT_LIMIT = 16_000;

export type ModelChoice = { id: string; label: string; efforts: readonly string[] };
export type Selection = { provider: Provider; model: string; effort: string };
export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens: number | null };
export type Receipt = { usage: Usage | null; costMicros: number | null; reservedMicros: number };
export type Quote = { inputTokens: number; outputAllowance: number; maxCostMicros: number };
export type Connection = Selection & {
  maskedKey: string;
  keyRejected: boolean;
  models: ModelChoice[];
  budgetMicros: number;
  expiresAt: string | null;
  providerExpiresAt: string | null;
  checkedAt: string;
};
export type MonthlyUsage = {
  provider: Provider; model: string; runs: number; input_tokens: number | null; output_tokens: number | null;
  total_tokens: number | null; reasoning_tokens: number | null; unknown_runs: number;
  cost_micros: number; pending_micros: number;
};
export type RecentRun = {
  id: string; provider: Provider; model: string; effort: string; feature: Tool | "email_draft";
  total_tokens: number | null; cost_micros: number | null; reserved_micros: number; status: string; created_at: string;
};
export type ConnectionCheck = { models: ModelChoice[]; providerExpiresAt: string | null };
export const isExpired = (connection: Connection) =>
  [connection.expiresAt, connection.providerExpiresAt].some(value => value !== null && Date.parse(value) <= Date.now());
export const usd = (micros: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(micros / 1_000_000);
