"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  LogOut,
  Users,
  LayoutGrid,
  Settings,
  MoreHorizontal,
  ChevronsUpDown,
} from "lucide-react";
import type { Board } from "@/types";

interface SidebarProps {
  boards: Board[];
  userEmail: string;
  userName: string | null;
}

const BOARD_COLORS = [
  "#E8A87C",
  "#7CAFC4",
  "#9B8FBF",
  "#8BAE68",
  "#D4846A",
  "#C4A464",
  "#6B9EAE",
];

function getBoardColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return BOARD_COLORS[Math.abs(hash) % BOARD_COLORS.length];
}

function initials(name: string | null, email: string) {
  const source = (name && name.trim()) || email;
  return source
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function Sidebar({ boards, userEmail, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const workspaceName = userName?.split(" ")[0]
    ? `${userName.split(" ")[0]}'s Workspace`
    : "My Workspace";

  return (
    <div className="flex h-full w-[240px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Workspace header */}
      <div className="px-3 pt-3 pb-2">
        <button
          type="button"
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-[#E8A87C] text-[11px] font-semibold text-white">
            {initials(userName, userEmail)}
          </div>
          <span className="flex-1 truncate text-[14px] font-semibold">
            {workspaceName}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="space-y-0.5">
          <SidebarLink
            href="/dashboard"
            active={pathname === "/dashboard"}
            icon={<LayoutGrid className="h-4 w-4" />}
            label="All Boards"
          />
          <SidebarLink
            href="/dashboard/teams"
            active={pathname === "/dashboard/teams"}
            icon={<Users className="h-4 w-4" />}
            label="Teams"
          />
        </div>

        {/* Boards section */}
        <div className="mt-5">
          <div className="group/section flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Boards
            </span>
            <Link
              href="/dashboard?new=true"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-sidebar-accent hover:text-foreground group-hover/section:opacity-100"
              aria-label="New board"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-0.5">
            {boards.map((board) => {
              const active = pathname === `/dashboard/board/${board.id}`;
              return (
                <Link
                  key={board.id}
                  href={`/dashboard/board/${board.id}`}
                  className={cn(
                    "group/item flex items-center gap-2 rounded-md px-2 py-1 text-[14px] font-normal transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent"
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: getBoardColor(board.id) }}
                  />
                  <span className="flex-1 truncate">{board.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition hover:bg-background/60 group-hover/item:opacity-100"
                    aria-label="Board options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </Link>
              );
            })}
            {boards.length === 0 && (
              <p className="px-2 py-1 text-[13px] text-muted-foreground">
                No boards yet
              </p>
            )}
          </div>
        </div>

        {/* Settings section */}
        <div className="mt-5 space-y-0.5">
          <SidebarLink
            href="/dashboard/settings"
            active={pathname === "/dashboard/settings"}
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
          />
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#7CAFC4] text-[11px] font-semibold text-white">
              {initials(userName, userEmail)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">
                {userName || "User"}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {userEmail}
              </span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[216px]">
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-[14px] transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
