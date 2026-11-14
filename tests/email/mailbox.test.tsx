// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailMailboxProvider, EmailNavBadge } from "@/components/email/mailbox-state";
import { replyRecipients } from "@/lib/email/reply";
import type { EmailMessage } from "@/lib/email/types";

const { channel, removeChannel, handlers } = vi.hoisted(() => {
  const handlers: { event?: () => void; status?: (status: string) => void } = {};
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, fn: () => void) => { handlers.event = fn; return channel; }),
    subscribe: vi.fn((fn: (status: string) => void) => { handlers.status = fn; return channel; }),
  };
  return { channel, removeChannel: vi.fn(), handlers };
});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ channel: () => channel, removeChannel }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("refreshes an exact accessible count on Realtime updates and hides zero", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(101)).mockResolvedValueOnce(Response.json(0));
  vi.stubGlobal("fetch", fetch);
  render(<EmailMailboxProvider userId="user-one"><EmailNavBadge collapsed /></EmailMailboxProvider>);
  expect((await screen.findByLabelText("101 unread emails")).textContent).toBe("99+");
  act(() => handlers.event?.());
  await waitFor(() => expect(screen.queryByLabelText(/unread emails/)).toBeNull());
});

const message: EmailMessage = {
  id: "entry", direction: "inbox", folder: "inbox", subject: "", body: "", sentAt: "", attachments: [],
  sender: { id: "sender", name: "Sender", eligible: true },
  recipients: [
    { id: "viewer", name: "Viewer", kind: "to", eligible: true },
    { id: "cc", name: "Cc", kind: "cc", eligible: true },
    { id: "bcc", name: "Bcc", kind: "bcc", eligible: true },
    { id: "inactive", name: "Inactive", kind: "to", eligible: false },
  ],
  isBcc: false,
};

it("never copies Bcc addresses into a reply all", () => {
  expect(replyRecipients(message, "viewer", true).map(({ id, kind }) => [id, kind]))
    .toEqual([["sender", "to"], ["cc", "cc"]]);
  expect(replyRecipients({ ...message, isBcc: true }, "viewer", true).map(({ id }) => id)).toEqual(["sender"]);
});
