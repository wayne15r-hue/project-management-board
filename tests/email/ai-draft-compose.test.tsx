// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailCompose } from "@/components/email/compose";
import type { EmailDraft } from "@/lib/email/types";

const fetchMock = vi.fn<typeof fetch>();
const initial = {
  id: "draft", version: 1, composeKind: "new", subject: "", body: "", attachments: [],
  recipients: [{ id: "recipient", name: "Teammate", kind: "to" }],
} satisfies EmailDraft;

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (url) => {
    if (url === "/api/email/ai-draft") return Response.json({ subject: "Thank you", body: "Thanks for the help!" });
    return Response.json({ version: 2 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function compose(draft: EmailDraft = initial, aiEnabled = true) {
  return render(<EmailCompose userId="user-one" initial={draft} aiEnabled={aiEnabled}
    onClose={vi.fn()} onSaved={vi.fn()} onSent={vi.fn()} />);
}

function generate(context = "Thank them for their help.") {
  fireEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
  fireEvent.change(screen.getByLabelText("Context"), { target: { value: context } });
  fireEvent.change(screen.getByLabelText("Tone"), { target: { value: "friendly" } });
  fireEvent.change(screen.getByLabelText("Length"), { target: { value: "long" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
}

function value(label: string) {
  return (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value;
}

it("keeps preview and context out of autosave until the user uses the draft", async () => {
  compose();
  generate();
  const useDraft = await screen.findByRole("button", { name: "Use draft" });
  expect(value("Subject")).toBe("");
  expect(value("Message")).toBe("");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/email/ai-draft");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
    context: "Thank them for their help.", mode: "new", tone: "friendly", length: "long",
  });
  fireEvent.click(useDraft);
  expect(value("Subject")).toBe("Thank you");
  expect(value("Message")).toBe("Thanks for the help!");
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
    action: "save-draft", id: "draft", version: 1, subject: "Thank you", body: "Thanks for the help!",
    recipients: [{ id: "recipient", kind: "to" }],
  });
});

it("protects a reopened reply's subject and edits made while generating", async () => {
  let deliver!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { deliver = resolve; }));
  compose({ ...initial, composeKind: "reply", subject: "Re: Update" });
  generate();
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "My edit while waiting." } });
  await act(async () => { deliver(Response.json({ body: "Thanks for the update." })); });
  const replace = await screen.findByRole("button", { name: "Replace message" });
  expect(value("Message")).toBe("My edit while waiting.");
  expect(value("Subject")).toBe("Re: Update");
  fireEvent.click(replace);
  expect(value("Message")).toBe("Thanks for the update.");
  expect(value("Subject")).toBe("Re: Update");
});

it("discards in-flight previews if the context changes", async () => {
  let deliver!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { deliver = resolve; }));
  compose();
  generate();
  fireEvent.change(screen.getByLabelText("Context"), { target: { value: "Different request" } });
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => { deliver(Response.json({ subject: "Old", body: "Old result" })); });
  expect(screen.queryByText("Old result")).toBeNull();
  expect(value("Message")).toBe("");
});

it("shows the refusal without changing the draft", async () => {
  const error = "This tool only drafts appropriate emails. Describe the email you’d like to write.";
  fetchMock.mockResolvedValueOnce(Response.json({ error }, { status: 422 }));
  compose({ ...initial, subject: "Original subject", body: "Original message." });
  generate("Draft a message and send it.");
  expect((await screen.findByRole("alert")).textContent).toBe(error);
  expect(value("Subject")).toBe("Original subject");
  expect(value("Message")).toBe("Original message.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([["forward", true], [null, true], ["new", false]] as const)("uses the manual composer for %s with flag %s", (composeKind, enabled) => {
  compose({ ...initial, composeKind }, enabled);
  expect(screen.queryByRole("button", { name: "Draft with AI" })).toBeNull();
  expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
});
