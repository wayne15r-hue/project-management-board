import { z } from "zod";
import { jsonBody, personalAISession } from "@/lib/personal-ai/access";
import { personalAIErrorResponse, personalAIJson } from "@/lib/personal-ai/errors";
import { apiKeyInput, providerInput, selectionInput } from "@/lib/personal-ai/input";
import { checkProvider } from "@/lib/personal-ai/providers";
import { connectProvider, personalConnections, personalReport, removeProvider, retestProvider } from "@/lib/personal-ai/server";

const actions = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("check"), provider: providerInput, apiKey: apiKeyInput }),
  z.strictObject({ action: z.literal("retest"), provider: providerInput }),
  z.strictObject({ action: z.literal("remove"), provider: providerInput }),
  z.strictObject({
    action: z.literal("save"), selection: selectionInput, apiKey: apiKeyInput.optional(),
    budgetMicros: z.number().int().min(10_000).max(1_000_000_000), expiresAt: z.iso.datetime().nullable(),
  }),
]);

export async function GET(request: Request) {
  const session = await personalAISession(request);
  if (session instanceof Response) return session;
  try {
    const connections = await personalConnections(session.userId);
    return personalAIJson(new URL(request.url).searchParams.get("usage") === "1"
      ? { connections, ...await personalReport(session.userId) } : { connections });
  } catch (error) {
    return personalAIErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await personalAISession(request);
  if (session instanceof Response) return session;
  const input = actions.safeParse(await jsonBody(request));
  if (!input.success) return personalAIJson({ error: "Check the connection settings and try again." }, 400);
  const action = input.data;
  try {
    switch (action.action) {
      case "check": return personalAIJson(await checkProvider(action.provider, action.apiKey));
      case "retest": return personalAIJson(await retestProvider(session.userId, action.provider));
      case "save": return personalAIJson(await connectProvider(session.userId, action.selection, action.budgetMicros, action.expiresAt, action.apiKey));
      case "remove":
        await removeProvider(session.userId, action.provider);
        return personalAIJson({ removed: true });
    }
  } catch (error) {
    return personalAIErrorResponse(error);
  }
}
