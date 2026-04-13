"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { TeamMember } from "@/types";

interface MemberListProps {
  members: TeamMember[];
}

export function MemberList({ members }: MemberListProps) {
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center justify-between rounded-md border p-3"
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {member.profile?.full_name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">
                {member.profile?.full_name || member.profile?.email || "Unknown"}
              </p>
              <p className="text-xs text-muted-foreground">
                {member.profile?.email}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="capitalize text-xs">
            {member.role}
          </Badge>
        </div>
      ))}
    </div>
  );
}
