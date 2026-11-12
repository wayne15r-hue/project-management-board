"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { responseError } from "@/lib/response-error";
import type { BoardInvitation } from "@/types";

export function BoardInvitationInbox({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["board-invitations", userId];
  const inbox = useQuery({
    queryKey,
    refetchInterval: 15_000,
    queryFn: async ({ signal }): Promise<BoardInvitation[]> => {
      const response = await fetch("/api/board-invitations", { signal });
      if (!response.ok) throw await responseError(response, "Could not load board invitations");
      return response.json();
    },
  });
  const respond = useMutation({
    mutationFn: async (action: { inviteId: string; accept: boolean }) => {
      const response = await fetch("/api/board-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) throw await responseError(response, "Could not respond to the invitation");
    },
    onSuccess: (_, { inviteId, accept }) => {
      queryClient.setQueryData<BoardInvitation[]>(queryKey, (current) => current?.filter((invite) => invite.id !== inviteId));
      if (accept) {
        router.refresh();
        toast.success("Board added to Your boards");
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const invitations = inbox.isError ? [] : inbox.data ?? [];
  if (!invitations.length && !inbox.isError && !respond.isError) return null;

  return (
    <section aria-labelledby="board-invitations-heading" className="mb-5 rounded-xl border border-border bg-card p-4">
      <h2 id="board-invitations-heading" className="text-[15px] font-semibold">Board invitations</h2>
      {inbox.isError && (
        <div className="mt-2 flex items-center gap-2 text-sm" role="alert">
          <p>Could not load board invitations.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void inbox.refetch()}>Retry</Button>
        </div>
      )}
      {respond.isError && <p role="alert" className="mt-2 text-sm text-destructive">{respond.error.message}</p>}
      {invitations.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {invitations.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 break-words">
                <p className="text-sm font-medium">{invite.board_name}</p>
                {invite.inviter_name && <p className="text-xs text-muted-foreground">Invited by {invite.inviter_name}</p>}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={respond.isPending}
                  aria-label={`Decline invitation to ${invite.board_name}`}
                  onClick={() => respond.mutate({ inviteId: invite.id, accept: false })}>Decline</Button>
                <Button type="button" size="sm" disabled={respond.isPending}
                  aria-label={`Accept invitation to ${invite.board_name}`}
                  onClick={() => respond.mutate({ inviteId: invite.id, accept: true })}>Accept</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
