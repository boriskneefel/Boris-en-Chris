import { createPersistentStore } from "../lib/persistentStore";
import { DEFAULT_THRESHOLDS } from "../lib/taskStatus";
import type { GroupId, Threshold } from "../lib/types";

const store = createPersistentStore<Record<GroupId, Threshold>>(
  "thresholds_v1",
  DEFAULT_THRESHOLDS,
);

export function useTaskThresholds() {
  const thresholds = store.useValue();

  function updateGroup(group: GroupId, patch: Partial<Threshold>) {
    store.set((prev) => ({
      ...prev,
      [group]: { ...prev[group], ...patch },
    }));
  }

  function resetAll() {
    store.set(DEFAULT_THRESHOLDS);
  }

  return { thresholds, updateGroup, resetAll };
}

export const thresholdsStore = store;
