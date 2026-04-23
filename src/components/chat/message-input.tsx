"use client";

import { useRef, useState } from "react";
import { Send, Paperclip, X, FileIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSend: (content: string) => Promise<void> | void;
  onUpload: (file: File) => Promise<void>;
  onTyping?: () => void;
  pendingFile: File | null;
  setPendingFile: (f: File | null) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageInput({
  onSend,
  onUpload,
  onTyping,
  pendingFile,
  setPendingFile,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function handleFileChange(file: File | null) {
    setPendingFile(file);
    if (preview) URL.revokeObjectURL(preview);
    if (file && file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  }

  function cancelFile() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    const trimmed = value.trim();
    if ((!trimmed && !pendingFile) || sending || uploading) return;

    if (trimmed) {
      setSending(true);
      try {
        await onSend(trimmed);
        setValue("");
        requestAnimationFrame(resize);
      } finally {
        setSending(false);
      }
    }

    if (pendingFile) {
      setUploading(true);
      try {
        await onUpload(pendingFile);
        cancelFile();
      } finally {
        setUploading(false);
      }
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const canSend =
    (value.trim().length > 0 || !!pendingFile) && !sending && !uploading;

  return (
    <div className="border-t border-border bg-card px-3 py-2.5">
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-background p-2">
          {preview ? (
            <img
              src={preview}
              alt=""
              className="h-12 w-12 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">
              {pendingFile.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatSize(pendingFile.size)}
              {uploading && " · uploading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={cancelFile}
            disabled={uploading}
            aria-label="Remove attachment"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-1.5 focus-within:border-ring">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Attach file"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
            onTyping?.();
          }}
          onKeyDown={onKey}
          placeholder="Write a message…"
          rows={1}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "text-muted-foreground"
          )}
        >
          {sending || uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
