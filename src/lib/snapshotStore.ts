import type { ExcelRow, Snapshot } from "./types";
import { parseExcelFile } from "./excelParser";

const STORAGE_KEY = "snapshot_v1";

interface PersistedSnapshot {
  rows: ExcelRow[];
  headers: string[];
  secondaryHeaders: Record<string, string>;
  importedAt: string | null;
  fileName: string | null;
}

const EMPTY: Snapshot = {
  rows: [],
  headers: [],
  secondaryHeaders: {},
  importedAt: null,
  fileName: null,
  isImporting: false,
  lastError: null,
};

// ---------------------------------------------------------------------------
// Synchronous hydration from localStorage (no loading flicker)
// ---------------------------------------------------------------------------

function hydrate(): Snapshot {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as PersistedSnapshot;
    return {
      rows: parsed.rows ?? [],
      headers: parsed.headers ?? [],
      secondaryHeaders: parsed.secondaryHeaders ?? {},
      importedAt: parsed.importedAt ? new Date(parsed.importedAt) : null,
      fileName: parsed.fileName ?? null,
      isImporting: false,
      lastError: null,
    };
  } catch {
    return EMPTY;
  }
}

let state: Snapshot = hydrate();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: Snapshot) {
  state = next;
  emit();
}

function persist(s: Snapshot) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSnapshot = {
      rows: s.rows,
      headers: s.headers,
      secondaryHeaders: s.secondaryHeaders,
      importedAt: s.importedAt ? s.importedAt.toISOString() : null,
      fileName: s.fileName,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

// ---------------------------------------------------------------------------
// Public store API
// ---------------------------------------------------------------------------

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return state;
}

export function getServerSnapshot(): Snapshot {
  return EMPTY;
}

/**
 * Import from a File: parse, validate (>=1 row + BLUJAY header), then commit
 * atomically. On failure the previous snapshot is kept and lastError is set.
 */
export async function importFromFile(file: File): Promise<void> {
  setState({ ...state, isImporting: true, lastError: null });
  try {
    const result = await parseExcelFile(file);

    if (result.rows.length < 1) {
      throw new Error("Geen datarijen gevonden in het bestand.");
    }
    if (!result.headers.includes("BLUJAY")) {
      throw new Error(
        "Verwachte kolom 'BLUJAY' ontbreekt — is dit het juiste SAP-exportbestand?",
      );
    }

    const next: Snapshot = {
      rows: result.rows,
      headers: result.headers,
      secondaryHeaders: result.secondaryHeaders,
      importedAt: result.importedAt,
      fileName: result.fileName,
      isImporting: false,
      lastError: null,
    };
    persist(next);
    setState(next);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Onbekende fout bij het inlezen.";
    // Keep the previous snapshot, surface the error.
    setState({ ...state, isImporting: false, lastError: message });
    throw err;
  }
}

/** Clear the current snapshot and its persisted copy. */
export function clearSnapshot(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  setState({ ...EMPTY });
}

/** Clear only the transient error flag. */
export function clearError(): void {
  if (state.lastError == null) return;
  setState({ ...state, lastError: null });
}
