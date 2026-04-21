import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Usage stats for current month
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("feature, input_tokens, output_tokens")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 md:px-10 animate-fade-in">
      <h1 className="text-[28px] font-bold leading-tight text-foreground">
        Settings
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Manage your profile and preferences.
      </p>

      <SettingsForm
        userId={user.id}
        email={user.email || ""}
        initialName={profile?.full_name || ""}
        initialAvatarUrl={profile?.avatar_url || null}
        aiConfigured={Boolean(process.env.GROQ_API_KEY) && process.env.AI_ENABLED !== "false"}
        aiModel={process.env.AI_MODEL || "llama-3.3-70b-versatile"}
        usage={usage ?? []}
      />
    </div>
  );
}
