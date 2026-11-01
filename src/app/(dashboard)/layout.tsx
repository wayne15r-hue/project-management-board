import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/sidebar";
import { MobileSidebarToggle } from "@/components/shared/mobile-sidebar-toggle";
import { AICommandBar } from "@/components/ai/ai-command-bar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AuthSessionBoundary } from "@/components/shared/auth-session-boundary";

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
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
    </AuthSessionBoundary>
  );
}
