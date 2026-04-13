"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { CustomFieldDefinition } from "@/types";

interface FieldRendererProps {
  definition: CustomFieldDefinition;
  value: unknown;
}

export function FieldRenderer({ definition, value }: FieldRendererProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  switch (definition.field_type) {
    case "text":
      return <span className="text-sm">{String(value)}</span>;
    case "number":
      return <span className="text-sm font-mono">{Number(value)}</span>;
    case "date":
      try {
        return (
          <span className="text-sm">
            {format(new Date(String(value)), "MMM d, yyyy")}
          </span>
        );
      } catch {
        return <span className="text-sm">{String(value)}</span>;
      }
    case "select":
      return (
        <Badge variant="secondary" className="text-xs font-normal">
          {String(value)}
        </Badge>
      );
    default:
      return <span className="text-sm">{String(value)}</span>;
  }
}
