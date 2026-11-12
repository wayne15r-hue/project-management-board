"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { responseError } from "@/lib/response-error";
import type { BoardSharing } from "@/types";

type ShareAction = { email: string } | { inviteId: string };

export function BoardShareDialog({ boardId, sharing }: { boardId: string; sharing?: BoardSharing }) {
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();
  const changeInvitation = useMutation({
    mutationFn: async (action: ShareAction) => {
      const response = await fetch(`/api/boards/${boardId}/sharing`, {
        method: "email" in action ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) throw await responseError(response, "Could not update the board invitation");
    },
    onSuccess: (_, action) => {
      if ("email" in action) {
        setEmail("");
        toast.success("Board invitation sent");
      } else {
        toast.success("Board invitation cancelled");
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["board-sharing", boardId] }),
  });

  return (
    <Dialog>
      <DialogTrigger className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
        <Share2 className="h-3.5 w-3.5" />
        Share
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>Invited people can join from their Helios dashboard.</DialogDescription>
        </DialogHeader>
        {sharing?.canInvite && (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (email.trim() && !changeInvitation.isPending) changeInvitation.mutate({ email: email.trim() });
            }}
          >
            <label htmlFor="board-invite-email" className="font-medium">Helios account email</label>
            <div className="flex gap-2">
              <Input id="board-invite-email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button type="submit" disabled={!email.trim() || changeInvitation.isPending}>Send invite</Button>
            </div>
          </form>
        )}
        {changeInvitation.isError && <p role="alert" className="text-destructive">{changeInvitation.error.message}</p>}
        {sharing ? (
          <>
            <section aria-label="Board members">
              <h3 className="mb-2 font-medium">Board members</h3>
              <ul className="space-y-1 text-muted-foreground">
                {sharing.members.map((member) => (
                  <li key={member.id} className="break-words">{member.full_name || member.email}</li>
                ))}
              </ul>
            </section>
            {sharing.pendingCount > 0 && (
              <section aria-label="Pending invitations">
                <h3 className="font-medium">Pending invitations ({sharing.pendingCount})</h3>
                <p className="mt-1 text-muted-foreground">New assignments resume once every pending invitation is resolved.</p>
                <ul className="mt-2 divide-y divide-border">
                  {sharing.pendingInvitations.map((invite) => (
                    <li key={invite.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0 break-words">{invite.email}</span>
                      <Button type="button" variant="ghost" size="sm" disabled={changeInvitation.isPending}
                        aria-label={`Cancel invitation to ${invite.email}`}
                        onClick={() => changeInvitation.mutate({ inviteId: invite.id })}>Cancel</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : <p className="text-muted-foreground">Board sharing is currently unavailable.</p>}
      </DialogContent>
    </Dialog>
  );
}
