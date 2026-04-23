"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  LogOut,
  MessageSquare,
  LayoutGrid,
  Settings,
  MoreHorizontal,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  Keyboard,
} from "lucide-react";
import { useTheme } from "@/components/shared/theme-provider";
import { ChatNavBadge } from "@/components/chat/chat-nav-badge";
import type { Board } from "@/types";

interface SidebarProps {
  boards: Board[];
  userEmail: string;
  userName: string | null;
  userAvatarUrl?: string | null;
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

const COLLAPSED_KEY = "pm-board-sidebar-collapsed";

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

export function Sidebar({ boards, userEmail, userName, userAvatarUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const mobileOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const { theme, setTheme } = useTheme();

  // Hydrate collapsed state from localStorage + responsive auto-collapse.
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) setCollapsed(stored === "1");
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setCollapsed(true);
    };
    onChange(mq);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setCollapsed]);

  // Persist collapsed state.
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Close mobile overlay on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const workspaceName = userName?.split(" ")[0]
    ? `${userName.split(" ")[0]}'s Workspace`
    : "My Workspace";

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden animate-fade-in"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[transform,width] duration-200 ease-out md:static md:translate-x-0",
          collapsed ? "w-[56px]" : "w-[240px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Workspace header */}
        <div
          className={cn(
            "flex items-center gap-1 pt-3 pb-2",
            collapsed ? "px-2 justify-center" : "px-3"
          )}
        >
          {!collapsed && (
            <button
              type="button"
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-[#E8A87C] text-[11px] font-semibold text-white">
                {initials(userName, userEmail)}
              </div>
              <span className="flex-1 truncate text-[14px] font-semibold">
                {workspaceName}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Main nav */}
        <nav className={cn("flex-1 overflow-y-auto pb-2", collapsed ? "px-1.5" : "px-3")}>
          <div className="space-y-0.5">
            <SidebarLink
              href="/dashboard"
              active={pathname === "/dashboard"}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="All Boards"
              collapsed={collapsed}
            />
            <SidebarLink
              href="/dashboard/chat"
              active={pathname.startsWith("/dashboard/chat")}
              icon={<MessageSquare className="h-4 w-4" />}
              label="Chat"
              collapsed={collapsed}
              badge={<ChatNavBadge collapsed={collapsed} />}
            />
          </div>

          {/* Separator */}
          <div className="my-4 h-px bg-sidebar-border" />

          {/* Boards section */}
          {!collapsed && (
            <div>
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
          )}

          {collapsed && (
            <div className="space-y-0.5">
              {boards.slice(0, 8).map((board) => {
                const active = pathname === `/dashboard/board/${board.id}`;
                return (
                  <Tooltip key={board.id}>
                    <TooltipTrigger
                      render={
                        <Link
                          href={`/dashboard/board/${board.id}`}
                          aria-label={board.name}
                          className={cn(
                            "flex h-8 w-full items-center justify-center rounded-md transition-colors",
                            active
                              ? "bg-sidebar-accent"
                              : "hover:bg-sidebar-accent"
                          )}
                        />
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: getBoardColor(board.id) }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="right">{board.name}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}

          <div className="my-4 h-px bg-sidebar-border" />

          {/* Settings section */}
          <div className="space-y-0.5">
            <SidebarLink
              href="/dashboard/settings"
              active={pathname === "/dashboard/settings"}
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              collapsed={collapsed}
            />
          </div>
        </nav>

        {/* User footer */}
        <div
          className={cn(
            "border-t border-sidebar-border",
            collapsed ? "p-1.5" : "p-2"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center gap-2 rounded-md text-left hover:bg-sidebar-accent",
                collapsed ? "justify-center p-1.5" : "px-2 py-1.5"
              )}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#7CAFC4] text-[11px] font-semibold text-white"
                style={
                  userAvatarUrl
                    ? {
                        backgroundImage: `url(${userAvatarUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                {!userAvatarUrl && initials(userName, userEmail)}
              </div>
              {!collapsed && (
                <>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">
                      {userName || "User"}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {userEmail}
                    </span>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[244px]">
              <div className="flex flex-col gap-0.5 px-1.5 py-1">
                <span className="text-[13px] font-semibold text-foreground">
                  {userName || "User"}
                </span>
                <span className="truncate text-[11px] font-normal text-muted-foreground">
                  {userEmail}
                </span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <Keyboard className="mr-2 h-4 w-4" />
                Keyboard shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-1.5 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Theme
                </span>
              </div>
              <div className="flex items-center gap-1 px-2 pb-1.5">
                <ThemeButton
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                  label="Light"
                  icon={<Sun className="h-3.5 w-3.5" />}
                />
                <ThemeButton
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                  label="Dark"
                  icon={<Moon className="h-3.5 w-3.5" />}
                />
                <ThemeButton
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                  label="Auto"
                  icon={<Monitor className="h-3.5 w-3.5" />}
                />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (confirm("Sign out of ProjectBoard?")) handleSignOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-md border py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "border-foreground/20 bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SidebarLink({
  href,
  active,
  icon,
  label,
  collapsed,
  badge,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: React.ReactNode;
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={href}
              aria-label={label}
              className={cn(
                "relative flex h-8 w-full items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              {icon}
              {badge}
            </Link>
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
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
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}
