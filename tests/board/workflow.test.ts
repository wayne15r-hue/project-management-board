import { describe, expect, it, vi } from "vitest";
import { moveBoardCard, persistBoardMove } from "../../src/lib/board-move";
import { decodeBoardState, encodeBoardState, targetCardId } from "../../src/lib/board-url-state";
import { csvEscape } from "../../src/lib/csv-export";
import type { BoardWithDetails, Card } from "../../src/types";

const card = (id: string, column_id: string, position: number) => ({ id, column_id, position, title: id } as Card);
const columns = () => [
  {id: "a", cards: [card("one", "a", 0), card("hidden", "a", 1), card("three", "a", 2)]},
  {id: "b", cards: [card("four", "b", 0), card("other-hidden", "b", 1)]},
] as BoardWithDetails["columns"];

describe("canonical drag ordering", () => {
  it("persists the exact final same-column order without changing the cached input", async () => {
    const original = columns(); const snapshot = structuredClone(original);
    const final = moveBoardCard(original, "one", "three");
    expect(original).toEqual(snapshot);
    expect(final[0].cards.map(c => [c.id,c.position])).toEqual([["hidden",0],["three",1],["one",2]]);
    const request = vi.fn().mockResolvedValue({ok:true});
    await persistBoardMove(final,"one",request);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/cards/one", expect.objectContaining({method:"PATCH",body:JSON.stringify({column_id:"a",position:2})}));
  });
  it("preserves all hidden records and both source/destination positions", () => {
    const final = moveBoardCard(columns(),"one","four");
    expect(final[0].cards.map(c => [c.id,c.position])).toEqual([["hidden",0],["three",1]]);
    expect(final[1].cards.map(c => [c.id,c.position,c.column_id])).toEqual([["one",0,"b"],["four",1,"b"],["other-hidden",2,"b"]]);
  });
  it("handles empty-column and end-column drops", () => {
    const final = moveBoardCard(columns(),"one","column-b");
    expect(final[1].cards.map(c => c.id)).toEqual(["four","other-hidden","one"]);
    const empty = columns(); empty[1].cards=[];
    expect(moveBoardCard(empty,"one","column-b")[1].cards[0].position).toBe(0);
  });
  it("propagates rejected HTTP and network writes", async () => {
    await expect(persistBoardMove(columns(),"one",vi.fn().mockResolvedValue({ok:false}))).rejects.toThrow();
    await expect(persistBoardMove(columns(),"one",vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow("offline");
  });
});

describe("bounded board URL state", () => {
  it.each(["null","{}","[null]",'[ {"field":"priority","id":"x","op":"is","value":"urgent"} ]', '[{"field":"toString","id":"x","op":"is","value":"x"}]',"[",JSON.stringify(Array(21).fill({}))])("safely defaults malformed filter %s", (raw) => {
    expect(decodeBoardState(new URLSearchParams({filter:raw})).filters).toEqual([]);
  });
  it("bounds text/JSON and validates sorts", () => {
    const decoded = decodeBoardState(new URLSearchParams({q:"x".repeat(900),filter:"x".repeat(9000),sort:'[{"id":"x","field":"title","dir":"sideways"}]'}));
    expect(decoded).toEqual({search:"x".repeat(500),filters:[],sorts:[]});
  });
  it("preserves notification and unrelated URL parameters during filter updates", () => {
    const params = new URLSearchParams({card:"12345678-1234-1234-1234-123456789abc",other:"keep",q:"old"});
    const result = new URLSearchParams(encodeBoardState(params,{search:"new",filters:[],sorts:[]}));
    expect(result.get("card")).toBe(params.get("card")); expect(result.get("other")).toBe("keep"); expect(result.get("q")).toBe("new");
    expect(targetCardId(result)).toBe(params.get("card"));
    expect(targetCardId(new URLSearchParams({card:"javascript:alert(1)"}))).toBeNull();
  });
});

describe("spreadsheet CSV literals", () => {
  it.each(["=1+1","+SUM(A1)","-1+2","@SUM(A1)"," \t=1+1","\tformula","\rformula","\nformula"])("neutralizes %j", value => {
    const escaped = csvEscape(value);
    expect(escaped.replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("still escapes quotes and separators and preserves ordinary text", () => {
    expect(csvEscape('hello,"world"')).toBe('"hello,""world"""'); expect(csvEscape("normal")).toBe("normal");
  });
});
