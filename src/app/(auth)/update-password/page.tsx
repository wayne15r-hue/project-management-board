"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/auth/floating-input";

export default function UpdatePasswordPage() {
  const [status, setStatus] = useState<"checking" | "valid" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser().then(({ data, error }) => {
      if (!cancelled) setStatus(!error && data.user ? "valid" : "expired");
    }).catch(() => { if (!cancelled) setStatus("expired"); });
    return () => { cancelled = true; };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) { setError(error.message); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setError("Could not update your password. Please try again."); }
    finally { setLoading(false); }
  }
  return <div className="space-y-6">
    <h1 className="text-[26px] font-bold">Choose a new password</h1>
    {status === "checking" && <p>Checking your recovery link…</p>}
    {status === "expired" && <p role="alert">This recovery link is expired or invalid. <Link href="/reset-password" className="underline">Request a new link</Link>.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {status === "valid" && <form onSubmit={submit} className="space-y-3.5">
      <FloatingInput label="New password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
      <FloatingInput label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      <Button type="submit" className="w-full" disabled={loading}>Update password</Button>
    </form>}
  </div>;
}
