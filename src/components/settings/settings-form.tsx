"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/shared/theme-provider";
import {
  Sun,
  Moon,
  Monitor,
  Upload,
  Loader2,
  X,
  Sparkles,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UsageRow {
  feature: string;
  input_tokens: number;
  output_tokens: number;
}

interface SettingsFormProps {
  userId: string;
  email: string;
  initialName: string;
  initialAvatarUrl: string | null;
  aiConfigured?: boolean;
  aiModel?: string;
  usage?: UsageRow[];
}

const DAILY_LIMIT = 50;

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3MB

export function SettingsForm({
  userId,
  email,
  initialName,
  initialAvatarUrl,
  aiConfigured = false,
  aiModel = "llama-3.3-70b-versatile",
  usage = [],
}: SettingsFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Usage totals
  const usageTotals = usage.reduce(
    (acc, u) => {
      acc.calls += 1;
      acc.input += u.input_tokens;
      acc.output += u.output_tokens;
      acc.byFeature[u.feature] = (acc.byFeature[u.feature] ?? 0) + 1;
      return acc;
    },
    { calls: 0, input: 0, output: 0, byFeature: {} as Record<string, number> }
  );
  const featureEntries = Object.entries(usageTotals.byFeature).sort(
    (a, b) => b[1] - a[1]
  );
  const maxFeatureCount = featureEntries[0]?.[1] ?? 1;

  // Today's calls for daily quota display
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  // usage prop is month-to-date, so we can't accurately split by day on the
  // client without extra data. We just show monthly total and the daily cap.
  const callsThisMonth = usageTotals.calls;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Profile updated");
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image must be under 3MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to upload avatar");
        return;
      }
      setAvatarUrl(json.avatar_url);
      toast.success("Avatar updated");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (error) throw error;
      setAvatarUrl(null);
      toast.success("Avatar removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove avatar");
    } finally {
      setUploading(false);
    }
  }

  const initials =
    (name || email)
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="mt-8 space-y-8">
      {/* Profile section */}
      <section>
        <h2 className="mb-4 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
          Profile
        </h2>
        <form onSubmit={handleSave} className="space-y-5">
          <div
            className={cn(
              "flex flex-col items-start gap-4 rounded-xl border border-dashed border-border p-4 sm:flex-row sm:items-center",
              dragOver && "border-foreground/40 bg-accent/40"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) uploadFile(file);
            }}
          >
            <div className="relative">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#7CAFC4] text-lg font-semibold text-white"
                style={
                  avatarUrl
                    ? {
                        backgroundImage: `url(${avatarUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                {!avatarUrl && initials}
              </div>
              {avatarUrl && !uploading && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:text-foreground"
                  aria-label="Remove avatar"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-foreground">
                Profile picture
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Drop an image here or click below. PNG, JPG up to 3MB.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {avatarUrl ? "Change" : "Upload"}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div className="pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      {/* AI Assistant */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          AI Assistant
        </h2>
        <div className="space-y-4 rounded-xl border border-border p-5">
          <div className="flex items-start gap-3">
            {aiConfigured ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1">
              <p className="text-[13px] font-medium text-foreground">
                {aiConfigured
                  ? "AI features enabled"
                  : "AI features are currently unavailable"}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {aiConfigured ? (
                  <>
                    Powered by open-source{" "}
                    <span className="font-mono text-[11px]">{aiModel}</span> via
                    Groq. No configuration needed — free and ready to use.
                  </>
                ) : (
                  <>
                    The server is missing <code>GROQ_API_KEY</code>. Contact the
                    administrator.
                  </>
                )}
              </p>
            </div>
          </div>

          {aiConfigured && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Daily limit:</strong> Up to{" "}
              {DAILY_LIMIT} AI calls per user per day to keep the shared quota
              fair. Resets at midnight UTC.
            </p>
          )}

          {callsThisMonth > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[12px] font-medium text-foreground">
                This month's usage
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-muted-foreground">AI calls</p>
                  <p className="font-medium text-foreground">
                    {callsThisMonth}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tokens</p>
                  <p className="font-medium text-foreground">
                    {(usageTotals.input + usageTotals.output).toLocaleString()}
                  </p>
                </div>
              </div>
              {featureEntries.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {featureEntries.slice(0, 5).map(([feature, count]) => (
                    <div key={feature} className="flex items-center gap-2">
                      <span className="w-32 truncate text-[11px] text-muted-foreground">
                        {feature}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-foreground/60"
                          style={{
                            width: `${(count / maxFeatureCount) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h2 className="mb-4 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
          Appearance
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <ThemeOption
            active={theme === "light"}
            icon={<Sun className="h-4 w-4" />}
            label="Light"
            onClick={() => setTheme("light")}
          />
          <ThemeOption
            active={theme === "dark"}
            icon={<Moon className="h-4 w-4" />}
            label="Dark"
            onClick={() => setTheme("dark")}
          />
          <ThemeOption
            active={theme === "system"}
            icon={<Monitor className="h-4 w-4" />}
            label="System"
            onClick={() => setTheme("system")}
          />
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-4 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </h2>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </section>
    </div>
  );
}

function ThemeOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-md border p-3 text-[13px] transition-colors",
        active
          ? "border-foreground/40 bg-accent text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
