// ---------------------------------------------------------------------------
// Excel data
// ---------------------------------------------------------------------------

export interface ExcelRow {
  id: string; // crypto.randomUUID()
  unique_key: string; // SHIPMENT || DELIVERY || NEELEVAT || `row-<i>`
  raw_data: Record<string, string>; // header -> celwaarde (alles strings)
  row_number: number; // Excel-rij, 1-indexed
  source_sheet: "uit";
  last_synced_at: string; // ISO
}

export interface Snapshot {
  rows: ExcelRow[];
  headers: string[];
  secondaryHeaders: Record<string, string>;
  importedAt: Date | null;
  fileName: string | null;
  isImporting: boolean;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Taakstatus
// ---------------------------------------------------------------------------

// Core statuses per the spec ("open" | "critical" | "late") plus the derived
// "ontime" (groen / "op tijd") bucket that the green_days thresholds and the
// dashboard's 4 KPI-tiles require.
export type TaskStatusValue = "open" | "critical" | "late" | "ontime";

export type GroupId =
  | "documents"
  | "cc"
  | "nvwa"
  | "cokz"
  | "to"
  | "lbl"
  | "pgi"
  | "shc"
  | "vgm_s";

export interface Threshold {
  late_days?: number;
  critical_days?: number;
  green_days?: number;
  late_disabled?: boolean;
  critical_disabled?: boolean;
  green_disabled?: boolean;
}

export interface TaskEvaluation {
  column: string;
  status: TaskStatusValue;
  daysUntil: number;
}

// ---------------------------------------------------------------------------
// Beheer-entiteiten
// ---------------------------------------------------------------------------

export interface Cluster {
  id: string;
  name: string;
  color: string;
  customer_codes: string[];
}

export interface LocalUser {
  id: string;
  name: string;
  role: "admin" | "user";
  cluster_id: string | null;
}
