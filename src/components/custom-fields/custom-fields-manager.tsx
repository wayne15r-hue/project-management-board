"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { CustomFieldDefinition, FieldType } from "@/types";

interface CustomFieldsManagerProps {
  boardId: string;
  fields: CustomFieldDefinition[];
  onRefresh: () => void;
}

export function CustomFieldsManager({
  boardId,
  fields,
  onRefresh,
}: CustomFieldsManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        field_type: fieldType,
      };
      if (fieldType === "select" && options.trim()) {
        body.options = options.split(",").map((o) => o.trim()).filter(Boolean);
      }

      const res = await fetch(`/api/boards/${boardId}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Custom field created");
      setOpen(false);
      setName("");
      setFieldType("text");
      setOptions("");
      onRefresh();
    } catch {
      toast.error("Failed to create field");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(fieldId: string) {
    try {
      const res = await fetch(`/api/boards/${boardId}/custom-fields`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Field deleted");
      onRefresh();
    } catch {
      toast.error("Failed to delete field");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background h-9 px-3 hover:bg-accent hover:text-accent-foreground">
        <Settings2 className="mr-2 h-4 w-4" />
        Custom Fields ({fields.length})
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Custom Fields</DialogTitle>
        </DialogHeader>

        {/* Existing fields */}
        <div className="space-y-2">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">{field.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {field.field_type}
                  {field.field_type === "select" &&
                    field.options &&
                    `: ${(field.options as string[]).join(", ")}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => handleDelete(field.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom fields yet
            </p>
          )}
        </div>

        {/* Add new field */}
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Add New Field</p>
          <div className="space-y-2">
            <Label htmlFor="field-name">Name</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Story Points"
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="select">Select</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fieldType === "select" && (
            <div className="space-y-2">
              <Label>Options (comma-separated)</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Option A, Option B, Option C"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Plus className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
