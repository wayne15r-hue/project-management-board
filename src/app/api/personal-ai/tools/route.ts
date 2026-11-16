import { z } from "zod";
import { jsonBody, personalAISession } from "@/lib/personal-ai/access";
import { personalAIErrorResponse, personalAIJson } from "@/lib/personal-ai/errors";
import { runIdInput, selectionInput, toolInput, toolPrompt } from "@/lib/personal-ai/input";
import { personalQuote, runPersonalAI } from "@/lib/personal-ai/server";

export const maxDuration = 60;
const input = z.strictObject({ selection: selectionInput, input: toolInput, runId: runIdInput.optional() });

export async function POST(request: Request) {
  const session = await personalAISession(request);
  if (session instanceof Response) return session;
  const parsed = input.safeParse(await jsonBody(request));
  if (!parsed.success) return personalAIJson({ error: "Check the text and model settings." }, 400);
  const { selection, input: values, runId } = parsed.data;
  const prompt = toolPrompt(values);
  try {
    if (!runId) return personalAIJson(await personalQuote(session.userId, selection, prompt));
    const result = await runPersonalAI(session.userId, selection, runId, values.tool, prompt);
    if (!result.text) return personalAIJson({ error: "The model returned no text. Try a lower effort or another model.", receipt: result.receipt }, 422);
    return personalAIJson(result);
  } catch (error) {
    return personalAIErrorResponse(error);
  }
}
