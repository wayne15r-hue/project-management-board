import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmailMailbox } from "@/components/email/mailbox";

export default async function EmailPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data } = await db.rpc("email_enabled");
  if (data !== true) notFound();
  return <EmailMailbox key={user.id} userId={user.id} />;
}
