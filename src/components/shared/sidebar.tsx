"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Plus,
  LogOut,
  Users,
  Kanban,
} from "lucide-react";
import type { Board } from "@/types";

interface SidebarProps {
  boards: Board[];
  userEmail: string;
  userName: string | null;
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

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <LayoutDashboard className="h-5 w-5" />
          <span>ProjectBoard</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          <Link href="/dashboard">
            <Button
              variant={pathname === "/dashboard" ? "secondary" : "ghost"}
              className="w-full justify-start"
              size="sm"
            >
              <Kanban className="mr-2 h-4 w-4" />
              All Boards
            </Button>
          </Link>
          <Link href="/dashboard/teams">
            <Button
              variant={pathname === "/dashboard/teams" ? "secondary" : "ghost"}
              className="w-full justify-start"
              size="sm"
            >
              <Users className="mr-2 h-4 w-4" />
              Teams
            </Button>
          </Link>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Boards
            </span>
            <Link href="/dashboard?new=true">
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="space-y-1">
            {boards.map((board) => (
              <Link key={board.id} href={`/dashboard/board/${board.id}`}>
                <Button
                  variant={
                    pathname === `/dashboard/board/${board.id}`
                      ? "secondary"
                      : "ghost"
                  }
                  className="w-full justify-start text-sm"
                  size="sm"
                >
                  <span className="truncate">{board.name}</span>
                </Button>
              </Link>
            ))}
            {boards.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">
                No boards yet
              </p>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {userName || "User"}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {userEmail}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="h-8 w-8 shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
