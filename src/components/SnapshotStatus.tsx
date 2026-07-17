import { FileSpreadsheet } from "lucide-react";
import { useSnapshot } from "../hooks/useSnapshot";

function formatDateTime(d: Date | null): string {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function SnapshotStatus() {
  const snapshot = useSnapshot();

  if (!snapshot.fileName) {
    return (
      <span className="text-xs text-white/60">Nog geen import</span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-white/80">
      <FileSpreadsheet className="h-4 w-4 shrink-0 text-white/60" />
      <div className="leading-tight">
        <span className="font-medium text-white">{snapshot.fileName}</span>
        <span className="mx-1 text-white/40">·</span>
        <span>{snapshot.rows.length} rijen</span>
        {snapshot.importedAt && (
          <>
            <span className="mx-1 text-white/40">·</span>
            <span>{formatDateTime(snapshot.importedAt)}</span>
          </>
        )}
      </div>
    </div>
  );
}
