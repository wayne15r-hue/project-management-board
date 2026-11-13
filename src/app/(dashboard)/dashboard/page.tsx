import { createClient } from "@/lib/supabase/server";
import { BoardList } from "@/components/board/board-list";
import { BoardInvitationInbox } from "@/components/board/board-invitation-inbox";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { RecentActivity } from "@/components/dashboard/recent-activity";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .order("updated_at", { ascending: false });

  // Per-board counts for progress bars and card counts
  const boardIds = (boards ?? []).map((b) => b.id);
  let boardStatsMap = new Map<
    string,
    { total: number; done: number; overdue: number }
  >();
  if (boardIds.length > 0) {
    const { data: cols } = await supabase
      .from("columns")
      .select("id, board_id, position")
      .in("board_id", boardIds);
    const lastByBoard = new Map<string, string>(); // board_id -> last column id
    (cols ?? []).forEach((c) => {
      const curr = lastByBoard.get(c.board_id);
      if (!curr) lastByBoard.set(c.board_id, c.id);
      else {
        const cp = (cols ?? []).find((x) => x.id === curr)?.position ?? -1;
        if (c.position > cp) lastByBoard.set(c.board_id, c.id);
      }
    });
    const { data: cards } = await supabase
      .from("cards")
      .select("board_id, column_id, due_date")
      .in("board_id", boardIds);
    boardStatsMap = new Map(
      boardIds.map((id) => [id, { total: 0, done: 0, overdue: 0 }])
    );
    // Request-time clock in an async Server Component; not client render state.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    (cards ?? []).forEach((card) => {
      const stats = boardStatsMap.get(card.board_id);
      if (!stats) return;
      stats.total += 1;
      if (lastByBoard.get(card.board_id) === card.column_id) stats.done += 1;
      if (card.due_date && new Date(card.due_date).getTime() < now)
        stats.overdue += 1;
    });
  }

  const boardStats = Object.fromEntries(boardStatsMap);

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 md:px-7 md:py-7">
      <header className="workspace-page-intro mb-5">
        <h1>
          All Boards
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile?.full_name ? `${profile.full_name.split(" ")[0]}, here’s what’s happening across your projects.` : "See what’s happening across your projects."}
        </p>
      </header>

      <div className="mb-6">
        <DashboardStats />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="min-w-0">
          <BoardInvitationInbox userId={user!.id} />
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">
            Your boards
          </h2>
          <BoardList
            boards={boards || []}
            userId={user!.id}
            boardStats={boardStats}
          />
        </div>
        <div className="min-w-0">
          <RecentActivity />
        </div>
      </div>

      <OnboardingWizard
        userName={profile?.full_name || null}
        boardCount={boards?.length || 0}
        userId={user!.id}
      />
    </div>
  );
}
