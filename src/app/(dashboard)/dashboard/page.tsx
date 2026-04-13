import { createClient } from "@/lib/supabase/server";
import { BoardList } from "@/components/board/board-list";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Your Boards</h1>
        <p className="text-muted-foreground">
          Manage and organize your projects
        </p>
      </div>
      <BoardList boards={boards || []} userId={user!.id} />
    </div>
  );
}
