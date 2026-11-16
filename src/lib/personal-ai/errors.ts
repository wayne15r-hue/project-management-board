import type { Receipt } from "./contracts";

export class PersonalAIError extends Error {
  constructor(message: string, readonly status = 503, readonly rejected = false, readonly receipt?: Receipt) {
    super(message);
  }
}

export class RejectedKeyError extends PersonalAIError {
  constructor() {
    super("The provider rejected this key. Replace it in API Connections.", 400, true);
  }
}

export function personalAIErrorResponse(error: unknown) {
  const failure = error instanceof PersonalAIError ? error : new PersonalAIError("Personal AI is temporarily unavailable.");
  return personalAIJson({ error: failure.message, receipt: failure.receipt }, failure.status);
}

export function personalAIJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
