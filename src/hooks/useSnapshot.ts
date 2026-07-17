import { useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "../lib/snapshotStore";

export function useSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
