import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, FileText } from "lucide-react";
import { TASK_COLUMNS } from "../lib/columns";
import { useTaskDurations, usePdfUrls } from "../hooks/useTaskDurations";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { formatDuration, hmsToSeconds, secondsToHMS } from "../lib/utils";

export const Route = createFileRoute("/tijden")({
  head: () => ({
    meta: [
      { title: "Tijden — Admin" },
      {
        name: "description",
        content:
          "Beheer de standaardduur en werkinstructie-PDF per taakkolom.",
      },
    ],
  }),
  component: TijdenPage,
});

function TijdenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">Tijden</h1>
        <p className="text-sm text-black/50">
          Standaardduur en werkinstructie per taakkolom. Wijzigingen worden
          automatisch opgeslagen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Taakkolommen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Kolom</TableHead>
                  <TableHead className="w-48">Duur (uu:mm:ss)</TableHead>
                  <TableHead>Werkinstructie PDF (URL)</TableHead>
                  <TableHead className="w-32 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TASK_COLUMNS.map((col) => (
                  <TijdRow key={col} column={col} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function useSavedFlag(): [boolean, () => void] {
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = React.useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1800);
  }, []);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [saved, flash];
}

function TijdRow({ column }: { column: string }) {
  const { durations, setDuration } = useTaskDurations();
  const { pdfUrls, setPdfUrl } = usePdfUrls();

  const storedSeconds = durations[column] ?? 0;
  const storedUrl = pdfUrls[column] ?? "";

  const [durInput, setDurInput] = React.useState(() =>
    storedSeconds ? secondsToHMS(storedSeconds) : "",
  );
  const [urlInput, setUrlInput] = React.useState(storedUrl);
  const [durError, setDurError] = React.useState(false);
  const [saved, flash] = useSavedFlag();

  // Keep local state in sync if the store changes elsewhere.
  const lastStoredSeconds = React.useRef(storedSeconds);
  React.useEffect(() => {
    if (storedSeconds !== lastStoredSeconds.current) {
      lastStoredSeconds.current = storedSeconds;
      setDurInput(storedSeconds ? secondsToHMS(storedSeconds) : "");
    }
  }, [storedSeconds]);

  // Debounced save for duration
  React.useEffect(() => {
    const parsed = hmsToSeconds(durInput);
    if (parsed == null) {
      setDurError(true);
      return;
    }
    setDurError(false);
    if (parsed === storedSeconds) return;
    const t = setTimeout(() => {
      setDuration(column, parsed);
      lastStoredSeconds.current = parsed;
      flash();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durInput]);

  // Debounced save for pdf url
  React.useEffect(() => {
    const value = urlInput.trim();
    if (value === (storedUrl ?? "")) return;
    const t = setTimeout(() => {
      setPdfUrl(column, value === "" ? null : value);
      flash();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInput]);

  return (
    <TableRow>
      <TableCell className="font-semibold text-navy">{column}</TableCell>
      <TableCell>
        <Input
          value={durInput}
          onChange={(e) => setDurInput(e.target.value)}
          placeholder="00:00:00"
          className={durError ? "border-red-400 focus-visible:ring-red-300" : ""}
        />
        {storedSeconds > 0 && !durError && (
          <span className="mt-1 block text-[11px] text-black/40">
            {formatDuration(storedSeconds)}
          </span>
        )}
        {durError && (
          <span className="mt-1 block text-[11px] text-red-500">
            Ongeldig formaat (uu:mm:ss)
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…/werkinstructie.pdf"
            type="url"
          />
          {storedUrl && (
            <a
              href={storedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-navy/70 hover:text-navy"
              title="PDF openen"
            >
              <FileText className="h-4 w-4" />
            </a>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {saved ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="h-4 w-4" />
            Opgeslagen
          </span>
        ) : (
          <span className="text-xs text-black/30">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
