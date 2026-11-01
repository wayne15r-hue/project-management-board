import type { BoardWithDetails } from "@/types";
type Columns = BoardWithDetails["columns"];

// Place against canonical board order. Hidden/sorted cards remain in that order;
// a visible target is an insertion anchor, never a replacement for the full list.
export function moveBoardCard(columns: Columns, cardId: string, overId: string): Columns {
  const source = columns.find(c => c.cards.some(card => card.id === cardId));
  const destination = overId.startsWith("column-")
    ? columns.find(c => c.id === overId.slice(7))
    : columns.find(c => c.cards.some(card => card.id === overId));
  if (!source || !destination || cardId === overId) return columns;
  const card = source.cards.find(c => c.id === cardId)!;
  const targetIndex = overId.startsWith("column-") ? destination.cards.length : destination.cards.findIndex(c => c.id === overId);
  return columns.map(col => {
    if (col.id !== source.id && col.id !== destination.id) return col;
    const cards = col.cards.filter(c => c.id !== cardId);
    if (col.id === destination.id) cards.splice(Math.min(targetIndex, cards.length), 0, { ...card, column_id: col.id });
    return { ...col, cards: cards.map((c, position) => ({ ...c, position })) };
  });
}

export async function persistBoardMove(columns: Columns, cardId: string, request: typeof fetch = fetch): Promise<void> {
  const card = columns.flatMap(c => c.cards).find(c => c.id === cardId);
  if (!card) throw new Error("Card no longer exists");
  // The PATCH route invokes the transactional move RPC, including full source
  // and destination reindexing, then applies activity and recurrence behavior.
  const response = await request(`/api/cards/${cardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ column_id: card.column_id, position: card.position }) });
  if (!response.ok) throw new Error("Failed to save card position");
}
