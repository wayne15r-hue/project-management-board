"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ImportCardsDialogProps {
  boardId: string;
  firstColumnId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

interface ParsedRow {
  title: string;
  priority: "low" | "medium" | "high";
  due_date?: string | null;
  description?: string | null;
  _error?: string;
}

// Minimal RFC-ish CSV parser supporting quoted fields and embedded commas/newlines
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += c;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function normalizePriority(v: string): "low" | "medium" | "high" {
  const s = v.trim().toLowerCase();
  if (s === "high" || s === "h") return "high";
  if (s === "low" || s === "l") return "low";
  return "medium";
}

function parseRows(rows: string[][]): ParsedRow[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_")
  );
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const titleIdx = idx("title", "name");
  const priorityIdx = idx("priority");
  const dueIdx = idx("due_date", "due", "due_at");
  const descIdx = idx("description", "desc", "notes");

  const out: ParsedRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = titleIdx >= 0 ? (row[titleIdx] ?? "").trim() : "";
    if (!title) {
      out.push({
        title: "",
        priority: "medium",
        _error: "Missing title",
      });
      continue;
    }
    out.push({
      title,
      priority:
        priorityIdx >= 0
          ? normalizePriority(row[priorityIdx] ?? "")
          : "medium",
      due_date: dueIdx >= 0 ? (row[dueIdx] ?? "").trim() || null : null,
      description: descIdx >= 0 ? (row[descIdx] ?? "").trim() || null : null,
    });
  }
  return out;
}

export function ImportCardsDialog({
  boardId,
  firstColumnId,
  open,
  onOpenChange,
  onImported,
}: ImportCardsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [importing, setImporting] = useState(false);

  function reset() {
    setParsed(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const text = await file.text();
    const rows = parseRows(parseCsv(text));
    setParsed(rows);
    setFileName(file.name);
  }

  async function handleImport() {
    if (!parsed) return;
    if (!firstColumnId) {
      toast.error("Add a column to this board first");
      return;
    }
    const valid = parsed.filter((r) => !r._error);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnId: firstColumnId,
          rows: valid.map((r) => ({
            title: r.title,
            priority: r.priority,
            due_date: r.due_date ?? null,
            description: r.description ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { created: number };
      toast.success(`Imported ${json.created} card${json.created === 1 ? "" : "s"}`);
      reset();
      onOpenChange(false);
      onImported?.();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  const validCount = parsed?.filter((r) => !r._error).length ?? 0;
  const errorCount = parsed?.filter((r) => r._error).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import cards from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <strong>Title</strong> (required),
            Priority, Due Date, Description. Cards are added to the first
            column.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className="mt-2 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center"
          >
            <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-[14px] font-medium text-foreground">
              Drop a CSV file here
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              or click to browse
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => fileRef.current?.click()}
            >
              Choose file
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px] font-medium text-foreground">
                  {fileName}
                </span>
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-[12px] text-muted-foreground hover:text-foreground"
              >
                Change file
              </button>
            </div>

            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-foreground">
                <strong>{validCount}</strong> valid
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errorCount} skipped
                </span>
              )}
            </div>

            <div className="max-h-[280px] overflow-auto rounded-md border border-border">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-border ${
                        r._error ? "bg-destructive/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-foreground">
                        {r._error ? (
                          <span className="text-destructive">{r._error}</span>
                        ) : (
                          r.title
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {r.priority}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {r.due_date ?? ""}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        <span className="line-clamp-1">{r.description ?? ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && (
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  + {parsed.length - 50} more rows
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing
                  ? "Importing…"
                  : `Import ${validCount} card${validCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
