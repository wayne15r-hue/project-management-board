import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/sidebar";
import { WorkspaceShell } from "@/components/shared/workspace-shell";
import { AICommandBar } from "@/components/ai/ai-command-bar";
import { AuthSessionBoundary } from "@/components/shared/auth-session-boundary";
import { CallProvider } from '@/components/calls/call-provider';

import { EmailMailboxProvider } from "@/components/email/mailbox-state";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: employment, error: employmentError } = await supabase.from('employee_records').select('completed_at').eq('user_id', user.id).maybeSingle();
  if (employmentError) throw new Error('Employee setup is temporarily unavailable.');
  if (!employment?.completed_at) redirect('/employee-setup');
  const { data: adminRole, error: adminError } = await supabase.rpc('employee_admin_role');
  if (adminError) throw new Error('Account permissions are temporarily unavailable.');

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email")
    .eq("id", user.id)
    .single();

  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: emailEnabled } = await supabase.rpc("email_enabled");

  return (
    <AuthSessionBoundary key={user.id} userId={user.id}>
      <CallProvider currentUserId={user.id}>
        <EmailMailboxProvider userId={user.id} enabled={emailEnabled === true}>
          <WorkspaceShell
            userId={user.id}
            sidebar={
              <Sidebar
                isEmployeeAdmin={!!adminRole}
                emailEnabled={emailEnabled === true}
                boards={boards || []}
                userEmail={user.email || ""}
                userName={profile?.full_name || null}
                userAvatarUrl={profile?.avatar_url || null}
              />
            }
          >
            {children}
            <AICommandBar />
          </WorkspaceShell>
        </EmailMailboxProvider>
      </CallProvider>
    </AuthSessionBoundary>
  );
}
