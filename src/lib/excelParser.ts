import type * as XLSXType from "xlsx";
import type { ExcelRow } from "./types";
import { uuid } from "./utils";

export interface ParserConfig {
  sheetName: string;
  headerRow: number; // 1-indexed Excel row containing the main headers
  secondaryHeaderRow: number; // 1-indexed Excel row containing customer codes
  dataStartRow: number; // 1-indexed Excel row where data begins
}

export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  sheetName: "uit",
  headerRow: 5,
  secondaryHeaderRow: 4,
  dataStartRow: 6,
};

export interface ParseResult {
  rows: ExcelRow[];
  headers: string[];
  secondaryHeaders: Record<string, string>;
  fileName: string;
  importedAt: Date;
}

/** Normalize a cell value into a trimmed string; Date -> ISO string. */
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    // Guard against invalid dates
    const t = value.getTime();
    if (Number.isNaN(t)) return "";
    return value.toISOString();
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).trim();
}

/**
 * Parse an uploaded Excel file (ArrayBuffer) using SheetJS.
 * Follows the "uit" sheet convention: customer codes on row 4, main headers on
 * row 5, data from row 6 onwards.
 */
export function parseExcelBuffer(
  XLSX: typeof XLSXType,
  buffer: ArrayBuffer,
  fileName: string,
  config: ParserConfig = DEFAULT_PARSER_CONFIG,
): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  // Sheet-match: case-insensitive / trimmed
  const wantedName = config.sheetName.trim().toLowerCase();
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === wantedName,
  );
  if (!sheetName) {
    throw new Error(
      `Blad "${config.sheetName}" niet gevonden. Beschikbare bladen: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const sheet = workbook.Sheets[sheetName];
  // Convert whole sheet into a matrix of rows (arrays of cells). blankrows:true
  // preserves absolute row positions so headerRow/dataStartRow indices stay
  // aligned even when the scratch rows (1–3) are empty.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: "",
  });

  const headerRowIdx = config.headerRow - 1;
  const secondaryRowIdx = config.secondaryHeaderRow - 1;
  const dataStartIdx = config.dataStartRow - 1;

  const rawHeaderRow = (matrix[headerRowIdx] ?? []) as unknown[];
  const rawSecondaryRow = (matrix[secondaryRowIdx] ?? []) as unknown[];

  // Determine the last non-empty header column so trailing empties are dropped.
  let lastCol = -1;
  for (let i = 0; i < rawHeaderRow.length; i++) {
    if (cellToString(rawHeaderRow[i]) !== "") lastCol = i;
  }

  const headers: string[] = [];
  const secondaryHeaders: Record<string, string> = {};
  const columnKeys: string[] = []; // resolved key per column index (incl. internal)

  for (let col = 0; col <= lastCol; col++) {
    const rawName = cellToString(rawHeaderRow[col]);
    let key: string;
    if (rawName === "") {
      // Empty header -> internal placeholder, not shown in UI
      key = `__col_${col}`;
    } else {
      key = rawName;
    }
    columnKeys.push(key);
    // Only expose real (non-internal) headers to the UI
    if (!key.startsWith("__col_")) {
      headers.push(key);
      const code = cellToString(rawSecondaryRow[col]);
      if (code !== "") secondaryHeaders[key] = code;
    }
  }

  const rows: ExcelRow[] = [];
  const nowIso = new Date().toISOString();

  for (let r = dataStartIdx; r < matrix.length; r++) {
    const rowArr = (matrix[r] ?? []) as unknown[];
    const raw_data: Record<string, string> = {};
    let hasAny = false;

    for (let col = 0; col <= lastCol; col++) {
      const key = columnKeys[col];
      if (key.startsWith("__col_")) continue; // skip internal columns
      const val = cellToString(rowArr[col]);
      raw_data[key] = val;
      if (val !== "") hasAny = true;
    }

    if (!hasAny) continue; // skip fully empty rows

    const excelRowNumber = r + 1; // convert 0-index back to 1-indexed Excel row
    const unique_key =
      raw_data["SHIPMENT"] ||
      raw_data["DELIVERY"] ||
      raw_data["NEELEVAT"] ||
      `row-${excelRowNumber}`;

    rows.push({
      id: uuid(),
      unique_key,
      raw_data,
      row_number: excelRowNumber,
      source_sheet: "uit",
      last_synced_at: nowIso,
    });
  }

  return {
    rows,
    headers,
    secondaryHeaders,
    fileName,
    importedAt: new Date(),
  };
}

/** Read a File into an ArrayBuffer and parse it. */
export async function parseExcelFile(
  file: File,
  config: ParserConfig = DEFAULT_PARSER_CONFIG,
): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  // Load SheetJS on demand so it stays out of the initial bundle.
  const XLSX = await import("xlsx");
  return parseExcelBuffer(XLSX, buffer, file.name, config);
}
