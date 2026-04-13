"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { PriorityBadge } from "@/components/shared/priority-badge";
import {
  Calendar as CalendarIcon,
  Loader2,
  Trash2,
  User,
  Flag,
  CircleDot,
  CalendarDays,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CardCustomFields } from "@/components/custom-fields/card-custom-fields";
import { ActivityFeed } from "@/components/activity/activity-feed";
import type { Card, Column, Profile, Priority, CustomFieldDefinition } from "@/types";

interface CardDetailDialogProps {
  card: Card | null;
  columns: Column[];
  members: Profile[];
  customFields?: CustomFieldDefinition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (cardId: string, data: Partial<Card>) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
}

export function CardDetailDialog({
  card,
  columns,
  members,
  customFields = [],
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: CardDetailDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [columnId, setColumnId] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description || "");
      setPriority(card.priority);
      setColumnId(card.column_id);
      setDueDate(card.due_date ? new Date(card.due_date) : undefined);
      setStartDate(card.start_date ? new Date(card.start_date) : undefined);
      setAssigneeId(card.assignee_id || "");
    }
  }, [card]);

  if (!card) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate(card!.id, {
        title,
        description: description || null,
        priority,
        column_id: columnId,
        due_date: dueDate ? dueDate.toISOString() : null,
        start_date: startDate ? startDate.toISOString() : null,
        assignee_id: assigneeId || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
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
        className="fixed left-auto right-0 top-0 bottom-0 grid h-screen w-full max-w-[680px] translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-none rounded-l-xl border-l border-border bg-background p-0 ring-0 sm:max-w-[680px] data-open:slide-in-from-right data-closed:slide-out-to-right"
      >
        <DialogHeader className="border-b border-border px-8 pt-8 pb-4">
          <DialogTitle className="sr-only">Card Details</DialogTitle>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-0 bg-transparent p-0 text-[24px] font-bold leading-tight text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder="Untitled"
          />
        </DialogHeader>

        <div className="overflow-y-auto px-8 pb-8 pt-6">
          {/* Properties panel */}
          <div className="space-y-1">
            <PropertyRow icon={<CircleDot className="h-4 w-4" />} label="Status">
              <Select value={columnId} onValueChange={(v) => v && setColumnId(v)}>
                <SelectTrigger className="h-8 border-0 bg-transparent shadow-none hover:bg-accent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertyRow>

            <PropertyRow icon={<Flag className="h-4 w-4" />} label="Priority">
              <Select
                value={priority}
                onValueChange={(v) => v && setPriority(v as Priority)}
              >
                <SelectTrigger className="h-8 border-0 bg-transparent shadow-none hover:bg-accent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <PriorityBadge priority="low" />
                  </SelectItem>
                  <SelectItem value="medium">
                    <PriorityBadge priority="medium" />
                  </SelectItem>
                  <SelectItem value="high">
                    <PriorityBadge priority="high" />
                  </SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>

            <PropertyRow icon={<User className="h-4 w-4" />} label="Assignee">
              <Select
                value={assigneeId}
                onValueChange={(v) => setAssigneeId(v ?? "")}
              >
                <SelectTrigger className="h-8 border-0 bg-transparent shadow-none hover:bg-accent">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertyRow>

            <PropertyRow icon={<CalendarDays className="h-4 w-4" />} label="Start date">
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "inline-flex h-8 w-full items-center justify-start rounded-md px-2 text-[13px] hover:bg-accent",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {startDate ? format(startDate, "PPP") : "Empty"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                  />
                </PopoverContent>
              </Popover>
            </PropertyRow>

            <PropertyRow icon={<CalendarClock className="h-4 w-4" />} label="Due date">
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "inline-flex h-8 w-full items-center justify-start rounded-md px-2 text-[13px] hover:bg-accent",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dueDate ? format(dueDate, "PPP") : "Empty"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                  />
                </PopoverContent>
              </Popover>
            </PropertyRow>
          </div>

          {/* Description */}
          <div className="mt-8">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </h3>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={6}
              className="resize-none border-border bg-transparent text-[14px] leading-relaxed shadow-none focus-visible:ring-1"
            />
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div className="mt-8">
              <Separator className="mb-6" />
              <CardCustomFields
                cardId={card!.id}
                boardId={card!.board_id}
                definitions={customFields}
              />
            </div>
          )}

          {/* Activity */}
          <div className="mt-8">
            <Separator className="mb-6" />
            <ActivityFeed cardId={card!.id} />
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <div className="grid grid-cols-[160px_1fr] items-center gap-2 py-1">
      <div className="flex items-center gap-2 px-2 text-[13px] text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
