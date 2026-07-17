import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { TaskStatusValue } from "../lib/types";

const STATUS_STYLES: Record<
  TaskStatusValue,
  { label: string; className: string }
> = {
  late: {
    label: "Te laat",
    className: "bg-red-100 text-red-700",
  },
  critical: {
    label: "Kritiek",
    className: "bg-amber-100 text-amber-800",
  },
  open: {
    label: "Open",
    className: "bg-slate-200 text-slate-700",
  },
  ontime: {
    label: "Op tijd",
    className: "bg-emerald-100 text-emerald-700",
  },
};

export const STATUS_ORDER: Record<TaskStatusValue, number> = {
  late: 0,
  critical: 1,
  open: 2,
  ontime: 3,
};

export const STATUS_LABELS: Record<TaskStatusValue, string> = {
  late: STATUS_STYLES.late.label,
  critical: STATUS_STYLES.critical.label,
  open: STATUS_STYLES.open.label,
  ontime: STATUS_STYLES.ontime.label,
};

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatusValue;
  className?: string;
}) {
  const s = STATUS_STYLES[status];
  return <Badge className={cn(s.className, className)}>{s.label}</Badge>;
}
