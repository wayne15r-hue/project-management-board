// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BoardList } from "@/components/board/board-list";
import type { Board } from "@/types";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params, usePathname: () => "/dashboard",
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const boards = [{ id: "board", name: "QA Board", description: null, created_at: "2026-11-01", updated_at: "2026-11-01" }] as Board[];
beforeEach(() => {
  localStorage.clear(); nav.params = new URLSearchParams(); nav.replace.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ boardIds: [] }) }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("exposes the grid card as a board link with an independent favorite control", async () => {
  render(<BoardList boards={boards} userId="owner" />);
  const link = screen.getByRole("link", { name: "QA Board" });
  const favorite = screen.getByRole("button", { name: "Favorite" });

  expect(link.getAttribute("href")).toBe("/dashboard/board/board");
  expect(link.contains(favorite)).toBe(false);
  nav.push.mockClear();
  fireEvent.click(favorite);

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    "/api/boards/favorites",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ boardId: "board", favorite: true }) }),
  ));
  expect(nav.push).not.toHaveBeenCalled();
});

it("opens the existing template chooser from the first-board empty state", async () => {
  const { container } = render(<BoardList boards={[]} userId="owner" />);
  expect(screen.getByRole("heading", { name: "Create your first board" })).toBeTruthy();
  expect(container.querySelector('img[src="/illustrations/first-board.webp"]')?.getAttribute("alt")).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "New board" }));
  await screen.findByRole("heading", { name: "Choose a template" });
});

it("opens sidebar-requested creation on client navigation and consumes only new when closed", async () => {
  const view = render(<BoardList boards={boards} userId="owner" />);
  nav.params = new URLSearchParams("new=true&keep=yes");
  view.rerender(<BoardList boards={boards} userId="owner" />);
  await screen.findByRole("heading", { name: "Choose a template" });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(nav.replace).toHaveBeenCalledWith("/dashboard?keep=yes", { scroll: false });
});

it.each(["list", "filtered-grid"])("keeps board creation reachable in %s", async mode => {
  if (mode === "list") localStorage.setItem("pm-board-view-mode", "list");
  render(<BoardList boards={boards} userId="owner" />);
  if (mode === "filtered-grid") fireEvent.change(screen.getByPlaceholderText("Search boards..."), { target: { value: "unmatched" } });
  fireEvent.click(screen.getByRole("button", { name: "New board" }));
  await screen.findByRole("heading", { name: "Choose a template" });
});

it("reverts the favorite indicator when the server rejects the write", async () => {
  const fetcher = vi.mocked(fetch);
  fetcher.mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { error: "denied" } : { boardIds: [] }), { status: options?.method === "POST" ? 500 : 200 }));
  render(<BoardList boards={boards} userId="owner" />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
  expect(screen.getByRole("button", { name: "Unfavorite" })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Unfavorite" })).toBeNull());
  expect(screen.getByRole("button", { name: "Favorite" })).toBeTruthy();
});
