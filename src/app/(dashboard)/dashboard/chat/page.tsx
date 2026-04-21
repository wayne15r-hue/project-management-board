import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <ChatShell
      currentUser={{
        id: user.id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? user.email ?? "",
        avatar_url: profile?.avatar_url ?? null,
      }}
    />
  );
}
