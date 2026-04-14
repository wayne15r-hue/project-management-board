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
      />
    </div>
  );
}
