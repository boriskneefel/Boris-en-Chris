import { parsePuDateMs } from "./taskStatus";

/** Human-readable P.U. DATE (dd-mm-yyyy) parsed from any accepted format. */
export function formatPuDate(raw: string | undefined | null): string {
  if (!raw) return "—";
  const ms = parsePuDateMs(raw);
  if (ms == null) return String(raw);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Sub-label: "3 DAGEN TE LAAT" / "VANDAAG" / "over 5 dagen". */
export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil === 0) return "VANDAAG";
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return `${n} ${n === 1 ? "DAG" : "DAGEN"} TE LAAT`;
  }
  if (daysUntil === 1) return "morgen";
  return `over ${daysUntil} dagen`;
}
