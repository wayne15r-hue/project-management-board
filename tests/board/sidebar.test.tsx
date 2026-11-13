// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/shared/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Board } from "@/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/board/board-1",
  useRouter: () => ({}),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/chat/chat-nav-badge", () => ({ ChatNavBadge: () => <span>3</span> }));

const name = "Cross-functional onboarding and delivery readiness";
const board = { id: "board-1", name } as Board;
afterEach(cleanup);

it("identifies the current board and exposes creation without showing Admin to members", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
  try {
    render(<TooltipProvider><Sidebar boards={[board]} userEmail="jordan@example.test" userName="Jordan" /></TooltipProvider>);
    expect(screen.getByRole("link", { name }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "New board" }).getAttribute("href")).toBe("/dashboard?new=true");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(screen.getByRole("link", { name: /^Chat\s*3$/ }).textContent).toBe("Chat3");
  } finally {
    vi.unstubAllGlobals();
  }
});
