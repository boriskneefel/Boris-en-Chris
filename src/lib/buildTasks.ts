import type {
  Cluster,
  ExcelRow,
  GroupId,
  Snapshot,
  TaskStatusValue,
  Threshold,
} from "./types";
import { COLUMN_TO_GROUP, GROUPS, evaluateGroup } from "./taskStatus";
import { clusterForRow } from "../hooks/useClusters";

export interface TaskItem {
  id: string; // `${rowId}:${column}`
  rowId: string;
  neelevat: string;
  delivery: string;
  shipment: string;
  puDate: string; // raw P.U. DATE value
  group: GroupId;
  column: string; // task column name
  status: TaskStatusValue;
  daysUntil: number;
  clusterId: string | null;
  clusterName: string | null;
  clusterColor: string | null;
}

export interface TaskAggregate {
  tasks: TaskItem[];
  counts: Record<TaskStatusValue, number>;
  groupCounts: Record<GroupId, Record<TaskStatusValue, number>>;
}

function emptyCounts(): Record<TaskStatusValue, number> {
  return { late: 0, critical: 0, open: 0, ontime: 0 };
}

export function buildTasks(
  snapshot: Snapshot,
  thresholds: Record<GroupId, Threshold>,
  clusters: Cluster[],
  now: Date = new Date(),
): TaskAggregate {
  const tasks: TaskItem[] = [];
  const counts = emptyCounts();
  const groupCounts = GROUPS.reduce(
    (acc, g) => {
      acc[g.id] = emptyCounts();
      return acc;
    },
    {} as Record<GroupId, Record<TaskStatusValue, number>>,
  );

  for (const row of snapshot.rows) {
    const cluster = clusterForRow(row, clusters, snapshot.secondaryHeaders);
    const raw = row.raw_data;
    for (const group of GROUPS) {
      const th = thresholds[group.id];
      const evals = evaluateGroup(group, raw, th, now);
      for (const ev of evals) {
        counts[ev.status] += 1;
        groupCounts[group.id][ev.status] += 1;
        tasks.push({
          id: `${row.id}:${ev.column}`,
          rowId: row.id,
          neelevat: raw["NEELEVAT"] ?? "",
          delivery: raw["DELIVERY"] ?? "",
          shipment: raw["SHIPMENT"] ?? "",
          puDate: raw["P.U. DATE"] ?? "",
          group: group.id,
          column: ev.column,
          status: ev.status,
          daysUntil: ev.daysUntil,
          clusterId: cluster?.id ?? null,
          clusterName: cluster?.name ?? null,
          clusterColor: cluster?.color ?? null,
        });
      }
    }
  }

  return { tasks, counts, groupCounts };
}

export { COLUMN_TO_GROUP };
