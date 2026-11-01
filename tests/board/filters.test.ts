import { describe, expect, it } from "vitest";
import { applyView } from "../../src/lib/board-filters";
import type { Card } from "../../src/types";
const card = (id: string, title: string, due_date: string | null = null) => ({ id, title, due_date, priority: "medium", column_id: "a", description: null, created_at: "2026-01-01" } as Card);
describe("board sorting", () => {
  it("continues secondary sort for two missing dates", () => {
    expect(applyView([card("z", "Zebra"), card("a", "Alpha")], [], [{id:"d",field:"due_date",dir:"asc"},{id:"t",field:"title",dir:"asc"}], "").map(c=>c.id)).toEqual(["a","z"]);
  });
});
