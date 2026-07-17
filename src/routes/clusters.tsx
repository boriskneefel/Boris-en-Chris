import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, X, Layers } from "lucide-react";
import { useClusters } from "../hooks/useClusters";
import { useSnapshot } from "../hooks/useSnapshot";
import type { Cluster } from "../lib/types";
import {
  Card,
  CardContent,
  CardHeader,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";

export const Route = createFileRoute("/clusters")({
  head: () => ({
    meta: [
      { title: "Clusters — Admin" },
      {
        name: "description",
        content:
          "Groepeer klantcodes in clusters met een naam en kleur voor de planning.",
      },
    ],
  }),
  component: ClustersPage,
});

function ClustersPage() {
  const { clusters, addCluster, updateCluster, removeCluster } = useClusters();
  const snapshot = useSnapshot();

  // Unique customer codes from the current snapshot's secondary headers.
  const availableCodes = React.useMemo(() => {
    const set = new Set<string>();
    for (const code of Object.values(snapshot.secondaryHeaders)) {
      if (code && String(code).trim() !== "") set.add(String(code).trim());
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [snapshot.secondaryHeaders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">Clusters</h1>
          <p className="text-sm text-black/50">
            Groepeer klantcodes tot clusters. Wijzigingen worden automatisch
            opgeslagen.
          </p>
        </div>
        <Button onClick={addCluster}>
          <Plus className="h-4 w-4" />
          Cluster toevoegen
        </Button>
      </div>

      {availableCodes.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Nog geen klantcodes beschikbaar — laad eerst een Excel-bestand om
          codes aan clusters te koppelen.
        </p>
      )}

      {clusters.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Layers className="mb-3 h-10 w-10 text-black/20" />
          <p className="text-sm text-black/50">Nog geen clusters.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              availableCodes={availableCodes}
              onChange={(patch) => updateCluster(cluster.id, patch)}
              onRemove={() => removeCluster(cluster.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterCard({
  cluster,
  availableCodes,
  onChange,
  onRemove,
}: {
  cluster: Cluster;
  availableCodes: string[];
  onChange: (patch: Partial<Cluster>) => void;
  onRemove: () => void;
}) {
  const unselected = availableCodes.filter(
    (c) => !cluster.customer_codes.includes(c),
  );

  function addCode(code: string) {
    if (!code || cluster.customer_codes.includes(code)) return;
    onChange({ customer_codes: [...cluster.customer_codes, code] });
  }

  function removeCode(code: string) {
    onChange({
      customer_codes: cluster.customer_codes.filter((c) => c !== code),
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cluster.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border border-black/10 bg-white p-0.5"
            title="Kleur"
          />
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: cluster.color }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          title="Cluster verwijderen"
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`name-${cluster.id}`}>Naam</Label>
          <Input
            id={`name-${cluster.id}`}
            value={cluster.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Klantcodes</Label>
          <div className="flex min-h-8 flex-wrap gap-1.5">
            {cluster.customer_codes.length === 0 && (
              <span className="text-xs text-black/35">
                Nog geen codes gekoppeld.
              </span>
            )}
            {cluster.customer_codes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                {code}
                <button
                  onClick={() => removeCode(code)}
                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                  aria-label={`Verwijder ${code}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Select
            value=""
            onChange={(e) => {
              addCode(e.target.value);
              e.target.value = "";
            }}
            disabled={unselected.length === 0}
            className="mt-1"
          >
            <option value="">
              {unselected.length === 0
                ? "Alle codes toegevoegd"
                : "+ Klantcode toevoegen…"}
            </option>
            {unselected.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
