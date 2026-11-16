"use client";

import { useEffect, useState } from "react";
import type { Connection, Quote, Receipt } from "./contracts";

export class PersonalAIRequestError extends Error {
  constructor(message: string, readonly receipt?: Receipt) { super(message); }
}

export async function requestPersonalAI<T>(userId: string, path: string, body?: string, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: {
      "X-Helios-AI-User": userId,
      ...(path.startsWith("/api/email/") ? { "X-Helios-Email-User": userId } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new PersonalAIRequestError(data?.error || "Personal AI is temporarily unavailable.", data?.receipt);
  return data as T;
}

export function usePersonalConnections(userId: string, enabled: boolean) {
  const [state, setState] = useState<{ connections: Connection[]; error: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    requestPersonalAI<{ connections: Connection[] }>(userId, "/api/personal-ai/connections", undefined, controller.signal)
      .then(data => setState({ connections: data.connections, error: "" }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ connections: [], error: error.message });
      });
    return () => controller.abort();
  }, [userId, enabled]);
  return state;
}

export function usePersonalQuote(userId: string, path: string, body: string | null) {
  const [result, setResult] = useState<{ body: string; quote?: Quote; error?: string } | null>(null);
  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      requestPersonalAI<Quote>(userId, path, body, controller.signal)
        .then(quote => setResult({ body, quote }))
        .catch((error: Error) => {
          if (!controller.signal.aborted) setResult({ body, error: error.message });
        });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [userId, path, body]);
  return result?.body === body ? result : null;
}
