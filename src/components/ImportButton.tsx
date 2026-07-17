import * as React from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { importFromFile } from "../lib/snapshotStore";
import { useSnapshot } from "../hooks/useSnapshot";
import { cn } from "../lib/utils";

export function ImportButton({
  className,
  variant = "secondary",
}: {
  className?: string;
  variant?: "default" | "secondary";
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const snapshot = useSnapshot();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset value so selecting the same file again still fires change.
    e.target.value = "";
    if (!file) return;
    try {
      await importFromFile(file);
    } catch {
      /* error surfaced via snapshot.lastError */
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        onChange={onFile}
      />
      <Button
        variant={variant}
        className={cn(className)}
        disabled={snapshot.isImporting}
        onClick={() => inputRef.current?.click()}
      >
        {snapshot.isImporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Excel laden
      </Button>
    </>
  );
}
