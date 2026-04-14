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
    <div className="px-4 py-6 md:px-6 md:py-8 animate-fade-in">
      <div className="mb-6 pl-12 md:pl-0">
        <h1 className="text-[28px] font-bold leading-tight text-foreground">
          Your Boards
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Manage and organize your projects
        </p>
      </div>
      <BoardList boards={boards || []} userId={user!.id} />
    </div>
  );
}
