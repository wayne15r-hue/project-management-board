import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  const { data: board, error } = await supabase
    .from("boards")
    .select(
      `
      *,
      columns (
        *,
        cards (
          *,
          assignee:profiles!cards_assignee_id_fkey (id, full_name, email),
          subtasks (id, title, completed, position),
          card_labels (label:labels (id, name, color))
        )
      ),
      labels (id, name, color)
    `
    )
    .eq("id", boardId)
    .single();

  if (error || !board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const safeName = (board.name ?? "board").replace(/[^a-z0-9_-]+/gi, "-");

  type RawColumn = {
    id: string;
    name: string;
    position: number;
    cards: RawCard[];
  };
  type RawCard = {
    id: string;
    column_id: string;
    title: string;
    description: string | null;
    priority: string;
    due_date: string | null;
    created_at: string;
    assignee?: { full_name: string | null; email: string } | null;
    card_labels?: { label: { name: string } | null }[];
  };

  const columns = (board.columns ?? []) as RawColumn[];
  columns.sort((a, b) => a.position - b.position);

  if (format === "json") {
    const body = JSON.stringify(board, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-backup.json"`,
      },
    });
  }

  // CSV (default)
  const header = [
    "Title",
    "Status",
    "Priority",
    "Assignee",
    "Due Date",
    "Description",
    "Labels",
    "Created Date",
  ];
  const colNameById = new Map(columns.map((c) => [c.id, c.name]));

  const rows: string[][] = [header];
  for (const col of columns) {
    for (const card of col.cards ?? []) {
      const labels =
        card.card_labels
          ?.map((cl) => cl.label?.name)
          .filter(Boolean)
          .join(", ") ?? "";
      rows.push([
        card.title,
        colNameById.get(card.column_id) ?? "",
        card.priority,
        card.assignee?.full_name || card.assignee?.email || "",
        card.due_date ?? "",
        card.description ?? "",
        labels,
        card.created_at,
      ]);
    }
  }

  const csv = "\uFEFF" + toCsv(rows); // BOM so Excel reads UTF-8

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-export.csv"`,
    },
  });
}
