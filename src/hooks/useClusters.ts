import { createPersistentStore } from "../lib/persistentStore";
import type { Cluster, ExcelRow } from "../lib/types";
import { uuid } from "../lib/utils";

const store = createPersistentStore<Cluster[]>("clusters_v1", []);

const CLUSTER_COLORS = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
];

export function useClusters() {
  const clusters = store.useValue();

  function addCluster() {
    const color = CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length];
    const cluster: Cluster = {
      id: uuid(),
      name: `Cluster ${clusters.length + 1}`,
      color,
      customer_codes: [],
    };
    store.set((prev) => [...prev, cluster]);
  }

  function updateCluster(id: string, patch: Partial<Cluster>) {
    store.set((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function removeCluster(id: string) {
    store.set((prev) => prev.filter((c) => c.id !== id));
  }

  return { clusters, addCluster, updateCluster, removeCluster };
}

/**
 * First cluster whose customer_codes overlap with a non-empty customer-code
 * column in the row. `codeColumns` maps header -> customer code (secondary
 * headers) for the current snapshot.
 */
export function clusterForRow(
  row: ExcelRow,
  clusters: Cluster[],
  secondaryHeaders: Record<string, string>,
): Cluster | null {
  // Determine which customer codes are "active" (non-empty column) for this row.
  const activeCodes = new Set<string>();
  for (const [header, code] of Object.entries(secondaryHeaders)) {
    const val = row.raw_data[header];
    if (val != null && String(val).trim() !== "") {
      activeCodes.add(code);
    }
  }
  if (activeCodes.size === 0) return null;

  for (const cluster of clusters) {
    if (cluster.customer_codes.some((code) => activeCodes.has(code))) {
      return cluster;
    }
  }
  return null;
}

export const clustersStore = store;
