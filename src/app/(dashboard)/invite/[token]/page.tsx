"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAccept() {
    setStatus("loading");
    try {
      const res = await fetch("/api/teams/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept invitation");
      }

      setStatus("success");
      setTimeout(() => router.push("/dashboard/teams"), 2000);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "success" ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <CardTitle className="mt-4">You&apos;re in!</CardTitle>
              <CardDescription>
                Redirecting you to your teams...
              </CardDescription>
            </>
          ) : status === "error" ? (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <CardTitle className="mt-4">Invitation Failed</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Team Invitation</CardTitle>
              <CardDescription>
                You&apos;ve been invited to join a team on ProjectBoard.
              </CardDescription>
            </>
          )}
        </CardHeader>
        {(status === "idle" || status === "loading") && (
          <CardContent className="flex justify-center">
            <Button onClick={handleAccept} disabled={status === "loading"} size="lg">
              {status === "loading" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Accept Invitation
            </Button>
          </CardContent>
        )}
        {status === "error" && (
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
