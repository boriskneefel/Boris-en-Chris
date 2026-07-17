/** Canonical main-column display order (UI shows a column only if it exists). */
export const MAIN_COLUMN_ORDER: string[] = [
  "BLUJAY",
  "NEELEVAT",
  "DELIVERY",
  "SHIPMENT",
  "LBL",
  "TO",
  "CTY",
  "PGI",
  "SHC",
  "P.U. DATE",
  "MONTH",
  "ETA",
  "PREP",
  "TYPE",
  "CARRIER",
  "SHIP TO",
  "INCT",
  "CC",
  "EXA",
  "T1",
  "T2",
  "ATR",
  "EUR",
  "CVO",
  "NVWA",
  "COKZ",
  "VGM CLOSING",
  "CLOSING",
  "VGM S",
  "PICK. TERM",
  "DEL. TERM",
];

/** Columns whose duration + work-instruction PDF are managed on /tijden. */
export const TASK_COLUMNS: string[] = [
  "CC",
  "EXA",
  "T1",
  "T2",
  "ATR",
  "EUR",
  "CVO",
  "NVWA",
  "COKZ",
];

/** Order the snapshot's headers by the canonical order, appending extras. */
export function orderedHeaders(headers: string[]): string[] {
  const present = new Set(headers);
  const ordered = MAIN_COLUMN_ORDER.filter((c) => present.has(c));
  const extras = headers.filter((h) => !MAIN_COLUMN_ORDER.includes(h));
  return [...ordered, ...extras];
}
