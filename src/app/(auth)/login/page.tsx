"use client";

import { Suspense, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/auth/floating-input";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { internalRedirect } from "../redirect";

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const authError = searchParams.get("error") === "auth";
  const router = useRouter();
  const supabase = createClient();

  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 1) {
      setEmail(email.trim());
      setError(null);
      setStep(2);
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(internalRedirect(searchParams.get("next")));
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?next=${encodeURIComponent(internalRedirect(searchParams.get("next")))}`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  function changeEmail() {
    flushSync(() => {
      setStep(1);
      setPassword("");
      setShowPassword(false);
      setError(null);
    });
    emailInput.current?.focus();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-foreground">
          Sign in to Helios
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step === 1 ? 'Enter your work email to continue.' : 'Enter your password to continue.'}
        </p>
      </div>

      {authError && <p role="alert" className="text-destructive">Your sign-in or recovery link expired or could not be verified. Please try again.</p>}
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className={step === 2 ? 'sr-only' : ''}>
        <FloatingInput
          label="Email"
          ref={emailInput}
          type="email"
          name="email"
          autoComplete="username"
          tabIndex={step === 2 ? -1 : undefined}
          readOnly={step === 2}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        </div>
        {step === 2 && <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/55 px-3 py-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{email}</span>
          <Button type="button" variant="ghost" disabled={loading} onClick={changeEmail}>Change email</Button>
        </div>
        <div className="relative">
        <FloatingInput
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          className="pr-20"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="button" variant="ghost" className="absolute right-1 top-1 h-10" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Hide':'Show'}</Button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/reset-password"
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        </>}

        <Button
          type="submit"
          className="h-12 w-full"
          disabled={loading}
          aria-busy={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {step === 1 ? <>Next <ArrowRight aria-hidden="true" /></> : 'Sign in'}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              or continue with
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            aria-busy={googleLoading}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background text-[14px] font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>
        </>
      )}

      <p className="text-center text-[13px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.75 3.98 14.58 3 12 3 6.96 3 2.9 7.06 2.9 12S6.96 21 12 21c6.94 0 9.1-4.87 9.1-7.37 0-.5-.05-.88-.13-1.23h-.62z"
        fill="#4285F4"
      />
    </svg>
  );
}
