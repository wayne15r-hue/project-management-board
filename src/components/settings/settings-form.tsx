"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/shared/theme-provider";
import { Sun, Moon, Monitor, Upload, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsFormProps {
  userId: string;
  email: string;
  initialName: string;
  initialAvatarUrl: string | null;
}

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3MB

export function SettingsForm({
  userId,
  email,
  initialName,
  initialAvatarUrl,
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
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) {
        const msg = (uploadErr.message || "").toLowerCase();
        if (msg.includes("bucket not found") || msg.includes("not found")) {
          toast.error(
            "Avatar storage isn't configured yet. Ask an admin to create the \"avatars\" bucket."
          );
          return;
        }
        throw uploadErr;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (updateErr) throw updateErr;

      setAvatarUrl(publicUrl);
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
