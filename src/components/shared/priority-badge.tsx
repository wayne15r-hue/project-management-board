import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";

const priorityConfig: Record<
  Priority,
  { label: string; className: string }
> = {
  low: {
    label: "Low",
    className: "bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
  },
  medium: {
    label: "Medium",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300",
  },
  high: {
    label: "High",
    className: "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900 dark:text-red-300",
  },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config = priorityConfig[priority];
  return (
    <Badge variant="secondary" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}
