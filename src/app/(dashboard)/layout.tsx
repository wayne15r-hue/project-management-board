import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/sidebar";
import { MobileSidebarToggle } from "@/components/shared/mobile-sidebar-toggle";
import { AICommandBar } from "@/components/ai/ai-command-bar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AuthSessionBoundary } from "@/components/shared/auth-session-boundary";
import { CallProvider } from '@/components/calls/call-provider';

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

  return (
    <AuthSessionBoundary key={user.id} userId={user.id}>
    <CallProvider currentUserId={user.id}>
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isEmployeeAdmin={!!adminRole}
        boards={boards || []}
        userEmail={user.email || ""}
        userName={profile?.full_name || null}
        userAvatarUrl={profile?.avatar_url || null}
      />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-auto">
        <MobileSidebarToggle />
        <div className="fixed right-3 top-3 z-30">
          <NotificationBell userId={user.id} />
        </div>
        {children}
      </main>
      <AICommandBar />
    </div>
    </CallProvider>
    </AuthSessionBoundary>
  );
}
