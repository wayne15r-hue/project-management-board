"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/shared/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsFormProps {
  userId: string;
  email: string;
  initialName: string;
}

export function SettingsForm({ userId, email, initialName }: SettingsFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

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
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7CAFC4] text-lg font-semibold text-white">
              {initials}
            </div>
            <div className="text-[13px] text-muted-foreground">
              Avatar uses your initials.
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
