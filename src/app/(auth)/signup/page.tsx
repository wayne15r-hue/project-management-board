"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/auth/floating-input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function passwordStrength(pw: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
  color: string;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 3) return { score: 3, label: "Strong", color: "#27AE60" };
  if (score === 2) return { score: 2, label: "Medium", color: "#F2994A" };
  if (score === 1 || pw.length > 0)
    return { score: 1, label: "Weak", color: "#EB5757" };
  return { score: 0, label: "", color: "transparent" };
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordsMatch = password === confirm || confirm.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!terms) {
      setError("You must agree to the Terms of Service");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Start shipping in under a minute. No credit card required.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <FloatingInput
          label="Full name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <FloatingInput
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div>
          <FloatingInput
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {password.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full bg-muted transition-colors"
                    style={{
                      backgroundColor:
                        i < strength.score ? strength.color : undefined,
                    }}
                  />
                ))}
              </div>
              <span
                className="text-[11px] font-medium"
                style={{ color: strength.color }}
              >
                {strength.label}
              </span>
            </div>
          )}
        </div>
        <FloatingInput
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          error={!passwordsMatch ? "Passwords do not match" : undefined}
        />

        <label className="flex cursor-pointer items-start gap-2 pt-1 text-[12.5px] text-muted-foreground">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-foreground"
          />
          <span>
            I agree to the{" "}
            <span className="text-foreground hover:underline">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="text-foreground hover:underline">
              Privacy Policy
            </span>
            .
          </span>
        </label>

        <Button
          type="submit"
          className={cn(
            "h-11 w-full bg-foreground text-background transition-transform hover:bg-foreground/90 active:scale-[0.98]"
          )}
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
