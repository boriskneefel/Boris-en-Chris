import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useTaskThresholds } from "../hooks/useTaskThresholds";
import { GROUPS } from "../lib/taskStatus";
import type { GroupId, Threshold } from "../lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/drempels")({
  head: () => ({
    meta: [
      { title: "Drempelwaarden — Admin" },
      {
        name: "description",
        content:
          "Stel de drempels (te laat / kritiek / op tijd) per taakgroep in.",
      },
    ],
  }),
  component: DrempelsPage,
});

function DrempelsPage() {
  const { thresholds, updateGroup, resetAll } = useTaskThresholds();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">Drempelwaarden</h1>
          <p className="text-sm text-black/50">
            Bepaal per taakgroep wanneer een taak rood, geel of groen wordt.
            Wijzigingen worden automatisch opgeslagen.
          </p>
        </div>
        <Button variant="secondary" onClick={resetAll}>
          <RotateCcw className="h-4 w-4" />
          Alle drempels naar standaard
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <ThresholdCard
            key={g.id}
            id={g.id}
            label={g.label}
            hint={g.hint}
            threshold={thresholds[g.id]}
            onChange={(patch) => updateGroup(g.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function ThresholdCard({
  id,
  label,
  hint,
  threshold,
  onChange,
}: {
  id: GroupId;
  label: string;
  hint: string;
  threshold: Threshold;
  onChange: (patch: Partial<Threshold>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-snug text-black/45">{hint}</p>

        <div className="grid grid-cols-3 gap-2">
          <DayField
            fieldId={`${id}-late`}
            label="Te laat"
            value={threshold.late_days}
            disabled={threshold.late_disabled}
            onCommit={(v) => onChange({ late_days: v })}
          />
          <DayField
            fieldId={`${id}-crit`}
            label="Kritiek"
            value={threshold.critical_days}
            disabled={threshold.critical_disabled}
            onCommit={(v) => onChange({ critical_days: v })}
          />
          <DayField
            fieldId={`${id}-green`}
            label="Op tijd"
            value={threshold.green_days}
            disabled={threshold.green_disabled}
            onCommit={(v) => onChange({ green_days: v })}
          />
        </div>

        <div className="space-y-1.5 border-t border-black/5 pt-3">
          <Toggle
            label="Te laat uitschakelen"
            checked={threshold.late_disabled ?? false}
            onChange={(c) => onChange({ late_disabled: c })}
          />
          <Toggle
            label="Kritiek uitschakelen"
            checked={threshold.critical_disabled ?? false}
            onChange={(c) => onChange({ critical_disabled: c })}
          />
          <Toggle
            label="Op tijd uitschakelen"
            checked={threshold.green_disabled ?? false}
            onChange={(c) => onChange({ green_disabled: c })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DayField({
  fieldId,
  label,
  value,
  disabled,
  onCommit,
}: {
  fieldId: string;
  label: string;
  value: number | undefined;
  disabled: boolean | undefined;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = React.useState(
    value != null ? String(value) : "",
  );

  // Sync down when the stored value changes (e.g. after reset).
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setLocal(value != null ? String(value) : "");
    }
  }, [value]);

  // Debounced commit.
  React.useEffect(() => {
    const n = Number(local);
    if (local === "" || Number.isNaN(n)) return;
    if (n === value) return;
    const t = setTimeout(() => {
      onCommit(n);
      last.current = n;
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="space-y-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type="number"
        min={0}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        className="h-8 px-2 text-sm"
      />
      <span className="block text-[10px] text-black/35">dagen</span>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-xs text-black/60">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-navy"
      />
    </label>
  );
}
