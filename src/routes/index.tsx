import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X, Inbox } from "lucide-react";
import { useSnapshot } from "../hooks/useSnapshot";
import { useTaskThresholds } from "../hooks/useTaskThresholds";
import { useClusters } from "../hooks/useClusters";
import { useTaskDurations } from "../hooks/useTaskDurations";
import { buildTasks, type TaskItem } from "../lib/buildTasks";
import { GROUPS } from "../lib/taskStatus";
import type { GroupId, TaskStatusValue } from "../lib/types";
import { StatusBadge, STATUS_ORDER } from "../components/StatusBadge";
import { ImportButton } from "../components/ImportButton";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { cn, formatDuration } from "../lib/utils";
import { formatPuDate, formatDaysUntil } from "../lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Openstaande taken" },
      {
        name: "description",
        content:
          "Overzicht van alle openstaande taken per klant en status voor het Maasvlakte-team.",
      },
    ],
  }),
  component: Dashboard,
});

const ROW_HEIGHT = 52;

function Dashboard() {
  const snapshot = useSnapshot();
  const { thresholds } = useTaskThresholds();
  const { clusters } = useClusters();
  const { durations } = useTaskDurations();

  const { tasks, counts, groupCounts } = React.useMemo(
    () => buildTasks(snapshot, thresholds, clusters),
    [snapshot, thresholds, clusters],
  );

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | TaskStatusValue>(
    "",
  );
  const [groupFilter, setGroupFilter] = React.useState<"" | GroupId>("");
  const [clusterFilter, setClusterFilter] = React.useState<string>("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (groupFilter && t.group !== groupFilter) return false;
      if (clusterFilter) {
        if (clusterFilter === "__none__" && t.clusterId != null) return false;
        if (clusterFilter !== "__none__" && t.clusterId !== clusterFilter)
          return false;
      }
      if (q) {
        const hay =
          `${t.neelevat} ${t.delivery} ${t.shipment} ${t.column} ${t.clusterName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Default sort: P.U. DATE asc, then status (late first)
    result.sort((a, b) => {
      const da = a.daysUntil;
      const db = b.daysUntil;
      if (da !== db) return da - db;
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    });
    return result;
  }, [tasks, search, statusFilter, groupFilter, clusterFilter]);

  const hasData = snapshot.rows.length > 0;

  function toggleGroupFilter(id: GroupId) {
    setGroupFilter((g) => (g === id ? "" : id));
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setGroupFilter("");
    setClusterFilter("");
  }

  const anyFilter =
    search !== "" ||
    statusFilter !== "" ||
    groupFilter !== "" ||
    clusterFilter !== "";

  if (!hasData) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Inbox className="mb-4 h-14 w-14 text-black/20" />
        <h1 className="text-lg font-semibold text-navy">
          Upload een Excel om te beginnen
        </h1>
        <p className="mb-6 mt-1 max-w-sm text-sm text-black/50">
          Laad het bestand <code>SAP_planning_Maasvlakte.xlsx</code> om de
          openstaande taken te bekijken.
        </p>
        <ImportButton variant="default" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">Dashboard</h1>
        <p className="text-sm text-black/50">Openstaande taken</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Totaal open"
          value={tasks.length}
          className="text-navy"
        />
        <KpiTile
          label="Te laat"
          value={counts.late}
          className="text-red-600"
          onClick={() =>
            setStatusFilter((s) => (s === "late" ? "" : "late"))
          }
          active={statusFilter === "late"}
        />
        <KpiTile
          label="Kritiek"
          value={counts.critical}
          className="text-amber-600"
          onClick={() =>
            setStatusFilter((s) => (s === "critical" ? "" : "critical"))
          }
          active={statusFilter === "critical"}
        />
        <KpiTile
          label="Op tijd"
          value={counts.ontime}
          className="text-emerald-600"
          onClick={() =>
            setStatusFilter((s) => (s === "ontime" ? "" : "ontime"))
          }
          active={statusFilter === "ontime"}
        />
      </div>

      {/* Group cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {GROUPS.map((g) => {
          const gc = groupCounts[g.id];
          const total = gc.late + gc.critical + gc.open + gc.ontime;
          const active = groupFilter === g.id;
          return (
            <button
              key={g.id}
              onClick={() => toggleGroupFilter(g.id)}
              className={cn(
                "rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-navy/30 cursor-pointer",
                active ? "border-navy ring-1 ring-navy" : "border-black/5",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-navy">
                  {g.label}
                </span>
                <span className="text-sm font-bold text-black/70">
                  {total}
                </span>
              </div>
              <div className="mt-2 flex gap-1.5 text-[11px]">
                <CountDot n={gc.late} className="bg-red-500" />
                <CountDot n={gc.critical} className="bg-amber-500" />
                <CountDot n={gc.open} className="bg-slate-400" />
                <CountDot n={gc.ontime} className="bg-emerald-500" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op NEELEVAT, DELIVERY, SHIPMENT…"
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "" | TaskStatusValue)
            }
            className="w-auto"
          >
            <option value="">Alle statussen</option>
            <option value="late">Te laat</option>
            <option value="critical">Kritiek</option>
            <option value="open">Open</option>
            <option value="ontime">Op tijd</option>
          </Select>
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as "" | GroupId)}
            className="w-auto"
          >
            <option value="">Alle taakgroepen</option>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">Alle clusters</option>
            <option value="__none__">Zonder cluster</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Wissen
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-black/50">
        {filtered.length} taken getoond
        {filtered.length !== tasks.length && ` (van ${tasks.length})`}
      </p>

      <TaskTable tasks={filtered} durations={durations} />
    </div>
  );
}

function KpiTile({
  label,
  value,
  className,
  onClick,
  active,
}: {
  label: string;
  value: number;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white p-4 text-left shadow-sm",
        onClick && "cursor-pointer transition-colors hover:border-navy/30",
        active ? "border-navy ring-1 ring-navy" : "border-black/5",
      )}
    >
      <div className={cn("text-2xl font-bold", className)}>{value}</div>
      <div className="mt-1 text-xs font-medium text-black/50">{label}</div>
    </Comp>
  );
}

function CountDot({ n, className }: { n: number; className: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-black/60">
      <span className={cn("h-2 w-2 rounded-full", className)} />
      {n}
    </span>
  );
}

function TaskTable({
  tasks,
  durations,
}: {
  tasks: TaskItem[];
  durations: Record<string, number>;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualize = tasks.length > 500;

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: virtualize,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualize && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualize && virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const rowsToRender = virtualize
    ? virtualItems.map((vi) => tasks[vi.index])
    : tasks;

  return (
    <Card className="overflow-hidden">
      <div
        ref={parentRef}
        className="table-scroll max-h-[calc(100vh-360px)] min-h-[240px] overflow-auto"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-black/60">
            <tr>
              <Th>NEELEVAT</Th>
              <Th>DELIVERY</Th>
              <Th>SHIPMENT</Th>
              <Th>P.U. DATE</Th>
              <Th>Taak</Th>
              <Th>Status</Th>
              <Th>Duur</Th>
              <Th>Cluster</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-sm text-black/40"
                >
                  Geen taken gevonden voor de huidige filters.
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr style={{ height: paddingTop }}>
                <td colSpan={8} />
              </tr>
            )}
            {rowsToRender.map((t) => (
              <TaskRow key={t.id} task={t} duration={durations[t.column]} />
            ))}
            {paddingBottom > 0 && (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={8} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  duration,
}: {
  task: TaskItem;
  duration: number | undefined;
}) {
  const late = task.daysUntil < 0;
  const today = task.daysUntil === 0;
  return (
    <tr
      className="border-b border-black/5 hover:bg-black/[0.02]"
      style={{ height: ROW_HEIGHT }}
    >
      <Td className="font-medium text-navy">{task.neelevat || "—"}</Td>
      <Td>{task.delivery || "—"}</Td>
      <Td>{task.shipment || "—"}</Td>
      <Td>
        <div className="leading-tight">
          <div>{formatPuDate(task.puDate)}</div>
          <div
            className={cn(
              "text-[11px] font-medium uppercase",
              late
                ? "text-red-600"
                : today
                  ? "text-amber-600"
                  : "text-black/40",
            )}
          >
            {formatDaysUntil(task.daysUntil)}
          </div>
        </div>
      </Td>
      <Td className="font-medium">{task.column}</Td>
      <Td>
        <StatusBadge status={task.status} />
      </Td>
      <Td className="tabular-nums text-black/60">
        {duration ? formatDuration(duration) : "—"}
      </Td>
      <Td>
        {task.clusterName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: task.clusterColor ?? "#999" }}
            />
            <span className="text-xs">{task.clusterName}</span>
          </span>
        ) : (
          <span className="text-xs text-black/30">—</span>
        )}
      </Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="sticky top-0 z-10 h-9 whitespace-nowrap bg-slate-100 px-3 text-left text-[11px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-2 align-middle", className)}>
      {children}
    </td>
  );
}
