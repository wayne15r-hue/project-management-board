"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MemberList } from "@/components/teams/member-list";
import { InviteDialog } from "@/components/teams/invite-dialog";
import { Loader2 } from "lucide-react";
import type { Team, TeamMember, Profile } from "@/types";

interface TeamDetail extends Team {
  team_members: (TeamMember & { profile: Profile })[];
}

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/teams/${teamId}`);
        if (res.ok) setTeam(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-6 text-center text-muted-foreground">Team not found</div>
    );
  }

  const members: TeamMember[] = team.team_members.map((tm) => ({
    id: tm.id,
    team_id: tm.team_id || teamId,
    user_id: tm.user_id,
    role: tm.role,
    joined_at: tm.joined_at,
    profile: tm.profile,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <InviteDialog teamId={teamId} teamName={team.name} />
      </div>

      <MemberList members={members} />
    </div>
  );
}
