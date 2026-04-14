"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Calendar as CalendarIcon,
  User,
  Flag,
  CircleDot,
  CalendarDays,
  CalendarClock,
  Trash2,
  Check,
  UserPlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CardCustomFields } from "@/components/custom-fields/card-custom-fields";
import { ActivityFeed } from "@/components/activity/activity-feed";
import type {
  Board,
  Card,
  Column,
  Profile,
  Priority,
  CustomFieldDefinition,
} from "@/types";

interface CardDetailDialogProps {
  card: Card | null;
  board?: Board | null;
  columns: Column[];
  members: Profile[];
  customFields?: CustomFieldDefinition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (cardId: string, data: Partial<Card>) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
  onNavigate?: (direction: "prev" | "next") => void;
}

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: "Low", color: "#27AE60" },
  medium: { label: "Medium", color: "#F2994A" },
  high: { label: "High", color: "#EB5757" },
};

type SaveStatus = "idle" | "saving" | "saved";

export function CardDetailDialog({
  card,
  board,
  columns,
  members,
  customFields = [],
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onNavigate,
}: CardDetailDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [columnId, setColumnId] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const lastCardId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (card && card.id !== lastCardId.current) {
      setTitle(card.title);
      setDescription(card.description || "");
      setPriority(card.priority);
      setColumnId(card.column_id);
      setDueDate(card.due_date ? new Date(card.due_date) : undefined);
      setStartDate(card.start_date ? new Date(card.start_date) : undefined);
      setAssigneeId(card.assignee_id || "");
      setConfirmDelete(false);
      setSaveStatus("idle");
      lastCardId.current = card.id;
    }
    if (!card) lastCardId.current = null;
  }, [card]);

  const performSave = useCallback(
    async (updates: Partial<Card>) => {
      if (!card) return;
      setSaveStatus("saving");
      try {
        await onUpdate(card.id, updates);
        setSaveStatus("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("idle");
      }
    },
    [card, onUpdate]
  );

  const debouncedSave = useCallback(
    (updates: Partial<Card>) => {
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => performSave(updates), 500);
    },
    [performSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // Arrow key navigation between cards while the dialog is open.
  useEffect(() => {
    if (!open || !onNavigate) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigate!("next");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigate!("prev");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNavigate]);

  if (!card) return null;

  const currentColumn = columns.find((c) => c.id === columnId);
  const currentAssignee = members.find((m) => m.id === assigneeId);
  const priorityMeta = PRIORITY_META[priority];

  function commitTitle() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== card!.title) {
      performSave({ title: trimmed });
    }
  }

  function commitDescription() {
    if (description !== (card!.description || "")) {
      performSave({ description: description || null });
    }
  }

  function changeStatus(id: string) {
    setColumnId(id);
    performSave({ column_id: id });
  }
  function changePriority(p: Priority) {
    setPriority(p);
    performSave({ priority: p });
  }
  function changeAssignee(id: string) {
    setAssigneeId(id);
    performSave({ assignee_id: id || null });
  }
  function changeStartDate(d: Date | undefined) {
    setStartDate(d);
    performSave({ start_date: d ? d.toISOString() : null });
  }
  function changeDueDate(d: Date | undefined) {
    setDueDate(d);
    performSave({ due_date: d ? d.toISOString() : null });
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(card!.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-0 grid h-screen w-full max-w-full translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-none border-0 bg-background p-0 ring-0 shadow-[-12px_0_40px_rgba(0,0,0,0.12)] sm:left-auto sm:right-0 sm:top-0 sm:bottom-0 sm:min-w-[500px] sm:w-[50vw] sm:max-w-[720px] sm:rounded-l-xl sm:border-l sm:border-border data-open:duration-200 data-open:ease-out data-open:slide-in-from-right data-closed:slide-out-to-right"
      >
        <DialogHeader className="border-b border-border px-5 pt-7 pb-4 sm:px-10 sm:pt-9 sm:pb-5">
          <DialogTitle className="sr-only">Card Details</DialogTitle>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="truncate text-[13px] text-muted-foreground">
              {board?.name ?? "Board"}
              <span className="mx-1.5 text-muted-foreground/40">/</span>
              <span className="text-foreground/70">
                {currentColumn?.name ?? "—"}
              </span>
            </p>
            <SaveIndicator status={saveStatus} />
          </div>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              debouncedSave({ title: e.target.value });
            }}
            onBlur={commitTitle}
            className="w-full border-0 bg-transparent p-0 text-[26px] font-bold leading-tight text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder="Untitled"
          />
        </DialogHeader>

        <div className="overflow-y-auto px-5 pb-8 pt-5 sm:px-10 sm:pb-10 sm:pt-6">
          {/* Properties */}
          <div className="space-y-0.5">
            <PropertyRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
              <Popover>
                <PopoverTrigger className="group/btn inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-accent">
                  {currentColumn ? (
                    <>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: currentColumn.color || "#9B8FBF" }}
                      />
                      <span
                        className="rounded px-1.5 py-0.5 text-[12px] font-medium"
                        style={{
                          backgroundColor: `${currentColumn.color || "#9B8FBF"}1A`,
                          color: currentColumn.color || "var(--foreground)",
                        }}
                      >
                        {currentColumn.name}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Empty</span>
                  )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1">
                  {columns.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => changeStatus(col.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: col.color || "#9B8FBF" }}
                      />
                      <span className="flex-1 truncate">{col.name}</span>
                      {col.id === columnId && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
              <Popover>
                <PopoverTrigger className="inline-flex h-7 items-center rounded-md px-1.5 hover:bg-accent">
                  <span
                    className="rounded px-1.5 py-0.5 text-[12px] font-medium"
                    style={{
                      backgroundColor: `${priorityMeta.color}1A`,
                      color: priorityMeta.color,
                    }}
                  >
                    {priorityMeta.label}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-40 p-1">
                  {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                    const m = PRIORITY_META[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => changePriority(p)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                      >
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${m.color}1A`,
                            color: m.color,
                          }}
                        >
                          {m.label}
                        </span>
                        {p === priority && (
                          <Check className="ml-auto h-3.5 w-3.5" />
                        )}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow icon={<User className="h-3.5 w-3.5" />} label="Assignee">
              <Popover>
                <PopoverTrigger className="inline-flex h-7 items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-accent">
                  {currentAssignee ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="bg-[#7CAFC4] text-[9px] font-semibold text-white">
                          {assigneeInitials(currentAssignee)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">
                        {currentAssignee.full_name || currentAssignee.email}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <UserPlus className="h-3.5 w-3.5" />
                      No assignee
                    </span>
                  )}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-1">
                  <button
                    type="button"
                    onClick={() => changeAssignee("")}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground text-muted-foreground">
                      <UserPlus className="h-3 w-3" />
                    </span>
                    <span className="flex-1 text-muted-foreground">No assignee</span>
                    {!assigneeId && <Check className="h-3.5 w-3.5" />}
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => changeAssignee(m.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="bg-[#7CAFC4] text-[9px] font-semibold text-white">
                          {assigneeInitials(m)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate">
                        {m.full_name || m.email}
                      </span>
                      {m.id === assigneeId && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Start date">
              <DatePickerButton value={startDate} onChange={changeStartDate} />
            </PropertyRow>

            <PropertyRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Due date">
              <DatePickerButton value={dueDate} onChange={changeDueDate} />
            </PropertyRow>
          </div>

          <Separator className="my-7" />

          {/* Description */}
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h3>
            <AutoTextarea
              value={description}
              onChange={setDescription}
              onBlur={commitDescription}
              placeholder="Add a description..."
            />
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <>
              <Separator className="my-7" />
              <CardCustomFields
                cardId={card.id}
                boardId={card.board_id}
                definitions={customFields}
              />
            </>
          )}

          <Separator className="my-7" />

          {/* Activity */}
          <ActivityFeed cardId={card.id} />

          {/* Footer */}
          <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
            <p className="text-[11px] text-muted-foreground">
              Created on {format(new Date(card.created_at), "MMM d, yyyy")}
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "inline-flex items-center gap-1.5 text-[12px] transition-colors",
                confirmDelete
                  ? "text-destructive hover:text-destructive/80"
                  : "text-muted-foreground hover:text-destructive"
              )}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmDelete ? "Click again to confirm" : "Delete card"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function assigneeInitials(p: Profile) {
  return (
    p.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() ||
    p.email?.charAt(0).toUpperCase() ||
    "?"
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return <span className="h-4" />;
  return (
    <span
      className={cn(
        "text-[11px] transition-opacity duration-300",
        status === "saved" ? "text-muted-foreground" : "text-muted-foreground"
      )}
    >
      {status === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-2">
      <div className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-muted-foreground">
        <span>{icon}</span>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DatePickerButton({
  value,
  onChange,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] hover:bg-accent",
          !value && "text-muted-foreground"
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
        {value ? format(value, "MMM d, yyyy") : "Empty"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} />
        {value && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="w-full rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 80)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-2 text-[14px] leading-relaxed text-foreground outline-none transition-colors hover:bg-accent/40 focus:border-border focus:bg-background placeholder:text-muted-foreground/60"
    />
  );
}
