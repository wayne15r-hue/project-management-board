// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardInvitationInbox } from "@/components/board/board-invitation-inbox";
import { BoardShareDialog } from "@/components/board/board-share-dialog";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

function mount(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(component, { wrapper: Wrapper });
}

it("sends an invitation from Share and displays pending status", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: "invite" }, { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const view = mount(<BoardShareDialog boardId="board" sharing={{ canInvite: true, members: [], pendingCount: 0, pendingInvitations: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  fireEvent.change(await screen.findByLabelText("Helios account email"), { target: { value: "teammate@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/boards/board/sharing", expect.objectContaining({
    method: "POST", body: JSON.stringify({ email: "teammate@example.test" }),
  })));
  await waitFor(() => expect((screen.getByLabelText("Helios account email") as HTMLInputElement).value).toBe(""));
  view.rerender(
    <BoardShareDialog boardId="board" sharing={{
      canInvite: true, members: [], pendingCount: 1, pendingInvitations: [{ id: "invite", email: "teammate@example.test" }],
    }} />
  );
  expect(await screen.findByText("Pending invitations (1)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel invitation to teammate@example.test" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/boards/board/sharing", expect.objectContaining({
    method: "DELETE", body: JSON.stringify({ inviteId: "invite" }),
  })));
});

it.each([true, false])("responds from the dashboard and refreshes the board list on accept=%s", async (accept) => {
  let pending = true;
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      pending = false;
      return Response.json({ boardId: "board" });
    }
    return Response.json(pending ? [{ id: "invite", board_id: "board", board_name: "Operations", inviter_name: "Board Owner" }] : []);
  });
  vi.stubGlobal("fetch", fetch);
  mount(<BoardInvitationInbox userId="invitee" />);
  fireEvent.click(await screen.findByRole("button", { name: `${accept ? "Accept" : "Decline"} invitation to Operations` }));
  await waitFor(() => expect(screen.queryByText("Operations")).toBeNull());
  expect(fetch).toHaveBeenCalledWith("/api/board-invitations", expect.objectContaining({
    method: "POST", body: JSON.stringify({ inviteId: "invite", accept }),
  }));
  expect(refresh).toHaveBeenCalledTimes(accept ? 1 : 0);
});
