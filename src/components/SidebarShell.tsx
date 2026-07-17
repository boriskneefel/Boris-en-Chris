import * as React from "react";
import { Menu, X, AlertCircle } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { ImportButton } from "./ImportButton";
import { SnapshotStatus } from "./SnapshotStatus";
import { useSnapshot } from "../hooks/useSnapshot";
import { clearError } from "../lib/snapshotStore";
import { cn } from "../lib/utils";

function ErrorToast() {
  const snapshot = useSnapshot();
  React.useEffect(() => {
    if (!snapshot.lastError) return;
    const t = setTimeout(() => clearError(), 8000);
    return () => clearTimeout(t);
  }, [snapshot.lastError]);

  if (!snapshot.lastError) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="flex items-start gap-3 rounded-xl bg-red-600 px-4 py-3 text-white shadow-lg">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Import mislukt</p>
          <p className="text-white/90">{snapshot.lastError}</p>
        </div>
        <button
          onClick={() => clearError()}
          className="text-white/70 hover:text-white cursor-pointer"
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:block shrink-0 transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <AppSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-60">
            <AppSidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 bg-navy px-4 text-white">
          <button
            className="md:hidden text-white/80 hover:text-white cursor-pointer"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu openen"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <SnapshotStatus />
          </div>
          <ImportButton variant="secondary" className="shrink-0" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1600px] p-4 md:p-6">{children}</div>
        </main>
      </div>

      <ErrorToast />
    </div>
  );
}
