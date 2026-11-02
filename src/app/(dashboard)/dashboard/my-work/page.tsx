import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyWork } from "@/components/my-work/my-work";

export default async function MyWorkPage() {
  const client = await createClient();
  const {data:{user}} = await client.auth.getUser();
  if (!user) redirect("/login");
  return <MyWork key={user.id} userId={user.id} />;
}
