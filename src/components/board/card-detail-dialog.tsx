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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Card Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 shadow-none"
              placeholder="Card title"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Description */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={6}
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Right: Metadata */}
            <div className="space-y-4">
              {/* Status */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Status
                </Label>
                <Select value={columnId} onValueChange={(v) => v && setColumnId(v)}>
                  <SelectTrigger className="mt-1.5">
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
              </div>

              {/* Priority */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Priority
                </Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                >
                  <SelectTrigger className="mt-1.5">
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
              </div>

              {/* Assignee */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Assignee
                </Label>
                <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v ?? "")}>
                  <SelectTrigger className="mt-1.5">
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
              </div>

              {/* Start Date */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Start Date
                </Label>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "inline-flex items-center w-full justify-start rounded-md border border-input bg-background px-3 py-2 text-sm font-normal mt-1.5 hover:bg-accent hover:text-accent-foreground",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Due Date */}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Due Date
                </Label>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "inline-flex items-center w-full justify-start rounded-md border border-input bg-background px-3 py-2 text-sm font-normal mt-1.5 hover:bg-accent hover:text-accent-foreground",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <>
              <Separator />
              <CardCustomFields
                cardId={card!.id}
                boardId={card!.board_id}
                definitions={customFields}
              />
            </>
          )}

          {/* Activity Feed */}
          <Separator />
          <ActivityFeed cardId={card!.id} />

          <Separator />

          <div className="flex justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Card
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
