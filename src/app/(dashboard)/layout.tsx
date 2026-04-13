import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shared/sidebar";

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
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        boards={boards || []}
        userEmail={user.email || ""}
        userName={profile?.full_name || null}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
