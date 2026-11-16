import { notFound } from "next/navigation";
import { WorkspaceTools } from "@/components/personal-ai/workspace-tools";
import { personalAIEnabled } from "@/lib/personal-ai/server";
import { createClient } from "@/lib/supabase/server";

export default async function ToolsPage() {
  if (!personalAIEnabled()) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  return <WorkspaceTools key={user.id} userId={user.id} />;
}
