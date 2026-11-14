"use client";
import { BRAND } from "@/lib/brand";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { Dialog } from "@base-ui/react/dialog";
import { BrandMark } from "./brand-logo";
import { BranchedMenu, MenuBranch } from "@/components/react-bits/BranchedMenu";
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
  Mail,
  LayoutGrid,
  ClipboardList,
  Ticket,
  CalendarDays,
  ShieldCheck,
  Settings,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  X,
} from "lucide-react";
import { useTheme } from "@/components/shared/theme-provider";
import { ChatNavBadge } from "@/components/chat/chat-nav-badge";
import { EmailNavBadge } from "@/components/email/mailbox-state";
import type { Board } from "@/types";

interface SidebarProps {
  isEmployeeAdmin?: boolean;
  emailEnabled?: boolean;
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
const mobileQuery = "(width < 48rem)";

function subscribeToViewport(change: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

const isMobile = () => window.matchMedia(mobileQuery).matches;
const isDesktopOnServer = () => false;

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

export function Sidebar({ boards, userEmail, userName, userAvatarUrl, isEmployeeAdmin = false, emailEnabled = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const mobile = useSyncExternalStore(subscribeToViewport, isMobile, isDesktopOnServer);
  const desktopCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const collapsed = !mobile && desktopCollapsed;
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const mobileOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const { theme, setTheme } = useTheme();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === "1");
    } catch {
      // Sidebar still works when browser storage is unavailable.
    }
    return useAppStore.subscribe((state, previous) => {
      if (state.sidebarCollapsed === previous.sidebarCollapsed) return;
      try {
        localStorage.setItem(COLLAPSED_KEY, state.sidebarCollapsed ? "1" : "0");
      } catch {
        // Keep the in-memory preference.
      }
    });
  }, [setCollapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, mobile, setMobileOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const workspaceName = userName?.split(" ")[0]
    ? `${userName.split(" ")[0]}'s Workspace`
    : "My Workspace";

  const workspaceLinks = [
    { href: "/dashboard/my-work", label: "My Work", icon: ClipboardList },
    { href: "/dashboard", label: "All Boards", icon: LayoutGrid },
    { href: "/dashboard/service-desk", label: "Service Desk", icon: Ticket },
    { href: "/dashboard/leave-desk", label: "LeaveDesk", icon: CalendarDays },
    { href: "/dashboard/chat", label: "Chat", icon: MessageSquare, badge: <ChatNavBadge collapsed={collapsed} /> },
    ...(emailEnabled ? [{ href: "/dashboard/email", label: "Email", icon: Mail, badge: <EmailNavBadge collapsed={collapsed} /> }] : []),
  ];
  const settingsLinks = [
    ...(isEmployeeAdmin ? [{ href: "/dashboard/admin", label: "Admin", icon: ShieldCheck }] : []),
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  const primaryLinks = [...workspaceLinks, ...settingsLinks].map(({ href, label, icon: Icon, ...props }) => (
    <SidebarLink
      key={href}
      href={href}
      active={pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`))}
      icon={<Icon className="size-4" />}
      label={label}
      collapsed={collapsed}
      {...props}
    />
  ));
  const boardLinks = (collapsed ? boards.slice(0, 8) : boards).map((board) => (
    <SidebarLink
      key={board.id}
      href={`/dashboard/board/${board.id}`}
      active={pathname === `/dashboard/board/${board.id}`}
      label={board.name}
      icon={<BoardDot id={board.id} />}
      board
      collapsed={collapsed}
    />
  ));

  const content = (
    <>
        <div
          className={cn(
            "flex min-h-17 shrink-0 items-center gap-2 border-b border-sidebar-border",
            collapsed ? "flex-col justify-center gap-0 py-2" : "px-4"
          )}
        >
          <BrandMark className="h-9 w-9 shrink-0 rounded-xl border border-sidebar-border bg-sidebar-accent p-1.5 text-sidebar-primary" />
          {!collapsed && <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-tight">{workspaceName}</span>}
          {mobile ? (
            <Dialog.Close ref={closeButton} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-accent" aria-label="Close navigation">
              <X className="size-5" />
            </Dialog.Close>
          ) : <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>}
        </div>

        {/* Main nav */}
        <nav
          aria-label="Workspace navigation"
          className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-3", collapsed ? "px-2" : "px-3")}
          onClick={(event) => {
            if (mobile && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
                event.target instanceof Element && event.target.closest("a")) setMobileOpen(false);
          }}
        >
          {collapsed ? (
            <div className="space-y-0.5">
              {primaryLinks}
              <div className="my-3 h-px bg-sidebar-border" />
              <SidebarLink href="/dashboard?new=true" active={false} label="New board" icon={<Plus className="size-4" />} collapsed />
              {boardLinks}
            </div>
          ) : (
            <BranchedMenu>
              <MenuBranch label="Workspace">{primaryLinks.slice(0, workspaceLinks.length)}</MenuBranch>
              <MenuBranch
                label="Boards"
                action={
                  <Link href="/dashboard?new=true" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-sidebar-border px-2 text-xs font-medium text-sidebar-primary hover:bg-sidebar-accent">
                    <Plus className="size-3.5" aria-hidden="true" /> New board
                  </Link>
                }
              >
                {boardLinks.length ? boardLinks : <p className="px-3 py-2 text-[13px] text-muted-foreground">No boards yet</p>}
              </MenuBranch>
              <MenuBranch label="Management">{primaryLinks.slice(workspaceLinks.length)}</MenuBranch>
            </BranchedMenu>
          )}
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
              aria-label="Account menu"
              className={cn(
                "flex w-full items-center gap-2 rounded-md text-left hover:bg-sidebar-accent",
                collapsed ? "justify-center p-1.5" : "px-2 py-1.5"
              )}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-[11px] font-semibold text-accent-foreground"
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
              <DropdownMenuItem onClick={() => { setMobileOpen(false); router.push("/dashboard/settings"); }}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setMobileOpen(false); setShortcutsOpen(true); }}>
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
                  if (confirm(`Sign out of ${BRAND.name}?`)) handleSignOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </>
  );

  if (mobile) {
    return (
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal keepMounted>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/55" />
          <Dialog.Popup
            className="workspace-sidebar fixed inset-y-0 left-0 z-50 w-[min(100%,360px)] outline-none"
            initialFocus={closeButton}
            finalFocus={() => document.getElementById("workspace-menu-trigger")}
          >
            <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
            {content}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <aside className={cn("workspace-sidebar hidden shrink-0 md:flex", collapsed ? "w-16" : "w-68")}>
      {content}
    </aside>
  );
}

function BoardDot({ id }: { id: string }) {
  return <span className="size-2 rounded-full" style={{ backgroundColor: getBoardColor(id) }} />;
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
  board,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  badge?: React.ReactNode;
  board?: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={board ? label : undefined}
      className={cn("workspace-nav-link", collapsed ? "justify-center px-0" : "gap-3 px-3")}
    >
      <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className={cn(collapsed ? "sr-only" : "min-w-0 flex-1", !collapsed && (board ? "line-clamp-2 wrap-anywhere" : "truncate"))}>{label}</span>
      {badge}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}
