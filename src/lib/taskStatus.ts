import type {
  ExcelRow,
  GroupId,
  TaskEvaluation,
  TaskStatusValue,
  Threshold,
} from "./types";

// ---------------------------------------------------------------------------
// Group definitions
// ---------------------------------------------------------------------------

export interface GroupDef {
  id: GroupId;
  label: string;
  columns: string[];
  /** P.U. DATE offset family — how late/critical are computed. */
  family: "documents" | "leadtime" | "cokz" | "vgm_s";
  hint: string;
}

export const GROUPS: GroupDef[] = [
  {
    id: "documents",
    label: "Documenten",
    columns: ["EXA", "T1", "T2", "ATR", "EUR", "CVO"],
    family: "documents",
    hint: "Rood bij ≤ late_days kalenderdagen tot P.U. DATE, geel bij ≤ critical_days werkdagen.",
  },
  {
    id: "cc",
    label: "CC",
    columns: ["CC"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "nvwa",
    label: "NVWA",
    columns: ["NVWA"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "cokz",
    label: "COKZ",
    columns: ["COKZ"],
    family: "cokz",
    hint: "Rood vanaf late_days dagen ná P.U. DATE. Geel/groen standaard uit.",
  },
  {
    id: "to",
    label: "TO",
    columns: ["TO"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "lbl",
    label: "LBL",
    columns: ["LBL"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "pgi",
    label: "PGI",
    columns: ["PGI"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "shc",
    label: "SHC",
    columns: ["SHC"],
    family: "leadtime",
    hint: "Rood als minder dan late_days kalenderdagen resteren, geel binnen critical_days.",
  },
  {
    id: "vgm_s",
    label: "VGM S",
    columns: ["VGM S"],
    family: "vgm_s",
    hint: "Gebaseerd op VGM CLOSING-datum in plaats van P.U. DATE.",
  },
];

export const GROUP_BY_ID: Record<GroupId, GroupDef> = GROUPS.reduce(
  (acc, g) => {
    acc[g.id] = g;
    return acc;
  },
  {} as Record<GroupId, GroupDef>,
);

/** Map of column name -> the group it belongs to. */
export const COLUMN_TO_GROUP: Record<string, GroupId> = GROUPS.reduce(
  (acc, g) => {
    for (const c of g.columns) acc[c] = g.id;
    return acc;
  },
  {} as Record<string, GroupId>,
);

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------

export const DEFAULT_THRESHOLDS: Record<GroupId, Threshold> = {
  documents: { late_days: 0, critical_days: 1, green_days: 2 },
  cc: { late_days: 5, critical_days: 10, green_days: 11 },
  nvwa: { late_days: 10, critical_days: 15, green_days: 16 },
  cokz: { late_days: 0, critical_disabled: true, green_disabled: true },
  to: { late_days: 5, critical_days: 10, green_days: 11 },
  lbl: { late_days: 3, critical_days: 7, green_days: 8 },
  pgi: { late_days: 2, critical_days: 5, green_days: 6 },
  shc: { late_days: 3, critical_days: 7, green_days: 8 },
  vgm_s: { late_days: 0, critical_days: 1, green_days: 2 },
};

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const EXCEL_SERIAL_RE = /^\d{4,6}(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;
const DMY_RE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;

/** Convert a value into a local-midnight timestamp (ms), or null if unparseable. */
export function parsePuDateMs(value: string | undefined | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === "") return null;

  // ISO (from Date cells or literal YYYY-MM-DD)
  if (ISO_RE.test(raw)) {
    const d = new Date(raw);
    const t = d.getTime();
    if (Number.isNaN(t)) return null;
    return atLocalMidnight(d);
  }

  // Excel serial number
  if (EXCEL_SERIAL_RE.test(raw)) {
    const serial = parseFloat(raw);
    // Excel epoch: serial 25569 == 1970-01-01 (UTC). Handles the common range.
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    // Interpret as a calendar date at local midnight.
    return atLocalMidnight(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  // dd-mm-yyyy or dd/mm/yyyy
  const m = DMY_RE.exec(raw);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (m[3].length === 2) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return null;
    return atLocalMidnight(d);
  }

  // Last resort: let the Date constructor try
  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return atLocalMidnight(fallback);
  return null;
}

function atLocalMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const MS_PER_DAY = 86400000;

/** "Today" at local midnight — injectable for testing. */
export function todayMs(now: Date = new Date()): number {
  return atLocalMidnight(now);
}

/** Calendar days from today until the target (positive = future). */
export function calendarDaysUntil(targetMs: number, refMs: number): number {
  return Math.round((targetMs - refMs) / MS_PER_DAY);
}

/** Weekday (Mon–Fri) count from today until the target (signed by direction). */
export function workdaysUntil(targetMs: number, refMs: number): number {
  if (targetMs === refMs) return 0;
  const forward = targetMs > refMs;
  const step = forward ? MS_PER_DAY : -MS_PER_DAY;
  let count = 0;
  let cursor = refMs;
  let guard = 0;
  while (cursor !== targetMs && guard < 2000) {
    cursor += step;
    const day = new Date(cursor).getDay(); // 0 Sun .. 6 Sat
    if (day !== 0 && day !== 6) count += forward ? 1 : -1;
    guard++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Open-cell detection
// ---------------------------------------------------------------------------

/** A task cell counts as "open" (still to be done) when empty, "O" or "0". */
export function isOpenCell(value: string | undefined | null): boolean {
  if (value == null) return true;
  const v = String(value).trim();
  if (v === "") return true;
  return /^[o0]$/i.test(v);
}

// ---------------------------------------------------------------------------
// Status evaluation
// ---------------------------------------------------------------------------

interface Ctx {
  refMs: number;
}

function classify(
  family: GroupDef["family"],
  puMs: number | null,
  vgmClosingMs: number | null,
  threshold: Threshold,
  ctx: Ctx,
): { status: TaskStatusValue; daysUntil: number } | null {
  const lateDisabled = threshold.late_disabled === true;
  const critDisabled = threshold.critical_disabled === true;
  const greenDisabled = threshold.green_disabled === true;
  const lateDays = threshold.late_days ?? 0;
  const critDays = threshold.critical_days ?? 0;
  const greenDays = threshold.green_days ?? Number.POSITIVE_INFINITY;

  if (family === "vgm_s") {
    if (vgmClosingMs == null) return null;
    const daysUntil = calendarDaysUntil(vgmClosingMs, ctx.refMs);
    if (!lateDisabled && daysUntil <= lateDays)
      return { status: "late", daysUntil };
    if (!critDisabled && daysUntil <= critDays)
      return { status: "critical", daysUntil };
    if (!greenDisabled && daysUntil >= greenDays)
      return { status: "ontime", daysUntil };
    return { status: "open", daysUntil };
  }

  if (puMs == null) return null;
  const daysUntil = calendarDaysUntil(puMs, ctx.refMs);

  if (family === "cokz") {
    // Red once we are late_days days AFTER the P.U. DATE.
    if (!lateDisabled && daysUntil <= -lateDays)
      return { status: "late", daysUntil };
    if (!critDisabled && daysUntil <= critDays)
      return { status: "critical", daysUntil };
    if (!greenDisabled && daysUntil >= greenDays)
      return { status: "ontime", daysUntil };
    return { status: "open", daysUntil };
  }

  if (family === "documents") {
    const workUntil = workdaysUntil(puMs, ctx.refMs);
    if (!lateDisabled && daysUntil <= lateDays)
      return { status: "late", daysUntil };
    if (!critDisabled && workUntil <= critDays)
      return { status: "critical", daysUntil };
    if (!greenDisabled && daysUntil >= greenDays)
      return { status: "ontime", daysUntil };
    return { status: "open", daysUntil };
  }

  // leadtime family (cc, to, lbl, pgi, shc, nvwa)
  if (!lateDisabled && daysUntil < lateDays)
    return { status: "late", daysUntil };
  if (!critDisabled && daysUntil <= critDays)
    return { status: "critical", daysUntil };
  if (!greenDisabled && daysUntil >= greenDays)
    return { status: "ontime", daysUntil };
  return { status: "open", daysUntil };
}

/**
 * Evaluate a single group for one row: returns an entry for every *open* task
 * cell in that group.
 */
export function evaluateGroup(
  group: GroupDef,
  raw: Record<string, string>,
  threshold: Threshold,
  now: Date = new Date(),
): TaskEvaluation[] {
  const refMs = todayMs(now);
  const puMs = parsePuDateMs(raw["P.U. DATE"]);
  const vgmMs =
    parsePuDateMs(raw["VGM CLOSING"]) ?? parsePuDateMs(raw["VGM S"]);
  const out: TaskEvaluation[] = [];

  for (const column of group.columns) {
    if (!(column in raw)) continue; // column not present in this dataset
    if (!isOpenCell(raw[column])) continue; // done -> skip
    const res = classify(group.family, puMs, vgmMs, threshold, { refMs });
    if (res == null) continue; // no date to evaluate against
    out.push({ column, status: res.status, daysUntil: res.daysUntil });
  }
  return out;
}

/** Evaluate every group for a row against the supplied thresholds. */
export function evaluateRow(
  row: ExcelRow,
  thresholds: Record<GroupId, Threshold>,
  now: Date = new Date(),
): TaskEvaluation[] {
  const out: TaskEvaluation[] = [];
  for (const group of GROUPS) {
    const th = thresholds[group.id] ?? DEFAULT_THRESHOLDS[group.id];
    out.push(...evaluateGroup(group, row.raw_data, th, now));
  }
  return out;
}
