"use client";

import Link from "next/link";
import { Plus, Mail } from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/dashboard?new=true"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        New board
      </Link>
      <Link
        href="/dashboard/teams"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Mail className="h-3.5 w-3.5" />
        Invite teammate
      </Link>
    </div>
  );
}
