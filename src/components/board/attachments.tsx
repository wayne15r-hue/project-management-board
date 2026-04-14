// NOTE: Requires a Supabase Storage bucket named "attachments" (private) to exist.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Upload,
  Trash2,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  Loader2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Attachment } from "@/types";

type AttachmentWithUrl = Attachment & { url: string | null };

interface AttachmentsProps {
  cardId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.includes("pdf") || type.includes("word") || type.includes("text"))
    return FileText;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv"))
    return FileSpreadsheet;
  return FileIcon;
}

export function Attachments({ cardId }: AttachmentsProps) {
  const [items, setItems] = useState<AttachmentWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/cards/${cardId}/attachments`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  async function uploadFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name} exceeds 10 MB`);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const created = await res.json();
      setItems((prev) => [created, ...prev]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleFiles(files: FileList | File[]) {
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        await uploadFile(f);
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteAttachment(id: string) {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== id));
    try {
      await fetch(`/api/cards/${cardId}/attachments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      setItems(prev);
      toast.error("Failed to delete attachment");
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Attachments
        </h3>
        {items.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {items.length} {items.length === 1 ? "file" : "files"}
          </span>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-5 text-center transition-colors",
          dragOver ? "border-foreground/40 bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-4 w-4 text-muted-foreground" />
        )}
        <p className="text-[12px] text-muted-foreground">
          Drop files here or click to upload · max 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!loading && items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((a) => {
            const Icon = iconFor(a.file_type);
            const isImage = a.file_type.startsWith("image/");
            return (
              <li
                key={a.id}
                className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                {isImage && a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.file_name}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {a.file_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSize(a.file_size)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {a.url && (
                    <a
                      href={a.url}
                      download={a.file_name}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteAttachment(a.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { Paperclip };
