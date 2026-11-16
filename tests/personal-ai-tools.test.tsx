/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceTools } from "@/components/personal-ai/workspace-tools";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("quotes an override before generation and shows the provider token receipt", async () => {
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path.endsWith("connections")) return Response.json({ connections: [{
      provider: "groq", model: "openai/gpt-oss-20b", effort: "high",
      models: [
        { id: "openai/gpt-oss-20b", label: "GPT OSS 20B", efforts: ["low", "medium", "high"] },
        { id: "openai/gpt-oss-120b", label: "GPT OSS 120B", efforts: ["low", "medium", "high"] },
      ],
      expiresAt: null, providerExpiresAt: null,
    }] });
    const body = JSON.parse(String(init.body));
    if (!body.runId) return Response.json({ inputTokens: 640, outputAllowance: 4096, maxCostMicros: 1280 });
    return Response.json({
      text: "Send the agenda.",
      receipt: { usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120, reasoningTokens: 12 }, costMicros: 51, reservedMicros: 1280 },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<WorkspaceTools userId="test-user" />);
  await screen.findByRole("option", { name: "Groq" });
  fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "groq" } });
  expect((screen.getByLabelText("Effort") as HTMLSelectElement).value).toBe("high");
  fireEvent.change(screen.getByLabelText("Effort"), { target: { value: "low" } });
  fireEvent.change(screen.getByLabelText("Source text"), { target: { value: "Sam will send the agenda." } });
  const generate = screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement;
  expect(generate.disabled).toBe(true);
  await screen.findByText(/Estimated input 640 tokens/);
  await waitFor(() => expect(generate.disabled).toBe(false));
  fireEvent.click(generate);
  await screen.findByText("120 total tokens");
  expect(screen.getByText(/including 12 reasoning/)).toBeTruthy();
  expect((screen.getByLabelText("Result") as HTMLTextAreaElement).value).toBe("Send the agenda.");
  const toolBodies = fetcher.mock.calls.filter(([path]) => path.endsWith("/tools")).map(([, init]) => JSON.parse(String(init.body)));
  expect(toolBodies).toHaveLength(2);
  expect(toolBodies[0].runId).toBeUndefined();
  expect(toolBodies[1]).toMatchObject({ runId: expect.any(String), selection: { provider: "groq", effort: "low" } });
});
