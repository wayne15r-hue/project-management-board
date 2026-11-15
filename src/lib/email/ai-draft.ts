export const EMAIL_DRAFT_AI_MODES = ["new", "reply"] as const;
export const EMAIL_DRAFT_TONES = ["friendly", "professional"] as const;
export const EMAIL_DRAFT_LENGTHS = ["short", "long"] as const;
export const EMAIL_DRAFT_CONTEXT_LIMIT = 4_000;
export const EMAIL_DRAFT_RETRY_MESSAGE = "A draft could not be generated. Try again.";

export type EmailDraftAIInput = {
  context: string;
  mode: typeof EMAIL_DRAFT_AI_MODES[number];
  tone: typeof EMAIL_DRAFT_TONES[number];
  length: typeof EMAIL_DRAFT_LENGTHS[number];
};

export type EmailDraftPreview = { subject?: string; body: string };
