"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { CustomFieldDefinition } from "@/types";

interface FieldEditorProps {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function FieldEditor({ definition, value, onChange }: FieldEditorProps) {
  switch (definition.field_type) {
    case "text":
      return (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${definition.name}...`}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value !== null && value !== undefined ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          placeholder="0"
        />
      );

    case "date": {
      const dateValue = value ? new Date(String(value)) : undefined;
      return (
        <Popover>
          <PopoverTrigger
            className={cn(
              "inline-flex items-center w-full justify-start rounded-md border border-input bg-background px-3 py-2 text-sm font-normal hover:bg-accent hover:text-accent-foreground",
              !dateValue && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateValue ? format(dateValue, "PPP") : "Pick a date"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={(date) =>
                onChange(date ? date.toISOString() : null)
              }
            />
          </PopoverContent>
        </Popover>
      );
    }

    case "select":
      return (
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${definition.name}...`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            {(definition.options || []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    default:
      return null;
  }
}
