import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { EmployeeDetails } from '@/components/employee/employee-details';
import type { EmployeeState } from '@/types/employee';
import type { DirectoryFields } from '@/types/accounts';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {data: employeeState, error: employeeError} = await supabase.rpc('employee_setup_state');
  if (employeeError) throw new Error('Employee details are temporarily unavailable.');
  const {data: directory, error: directoryError} = await supabase.rpc('account_own_directory');

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email_notifications")
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
        initialEmailNotifications={profile?.email_notifications ?? true}
        aiConfigured={Boolean(process.env.GROQ_API_KEY) && process.env.AI_ENABLED !== "false"}
        aiModel={process.env.AI_MODEL || "openai/gpt-oss-120b"}
        usage={usage ?? []}
      />
      <EmployeeDetails state={employeeState as EmployeeState} directory={directory as DirectoryFields|null} directoryUnavailable={!!directoryError}/>
    </div>
  );
}
