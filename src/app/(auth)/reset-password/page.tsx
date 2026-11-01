"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/auth/floating-input";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/callback?next=%2Fupdate-password`,
      });
      if (error) setError(error.message); else setSent(true);
    } catch { setError("Could not request a reset link. Please try again."); }
    finally { setLoading(false); }
  }
  return <div className="space-y-6">
    <h1 className="text-[26px] font-bold">Reset your password</h1>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {sent ? <p role="status">Check your email. If an account exists for this address, you will receive a password reset link.</p> :
      <form onSubmit={submit} className="space-y-3.5">
        <FloatingInput label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <Button type="submit" className="w-full" disabled={loading}>Send reset link</Button>
      </form>}
    <Link href="/login" className="text-sm hover:underline">Back to sign in</Link>
  </div>;
}
