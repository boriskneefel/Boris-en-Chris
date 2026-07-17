import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Timer,
  UserCog,
  SlidersHorizontal,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Ship,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useLocalUsers } from "../hooks/useLocalUsers";
import { Select } from "./ui/select";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/" },
  { icon: Timer, label: "Tijden", to: "/tijden" },
  { icon: UserCog, label: "Gebruikers", to: "/gebruikers" },
  { icon: SlidersHorizontal, label: "Drempels", to: "/drempels" },
  { icon: Layers, label: "Clusters", to: "/clusters" },
] as const;

export function AppSidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { users, activeUserId, activeUser, setActiveUser } = useLocalUsers();

  return (
    <div className="flex h-full flex-col bg-navy text-white">
      {/* Brand */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 h-14 border-b border-white/10",
          collapsed && "justify-center px-0",
        )}
      >
        <Ship className="h-6 w-6 shrink-0 text-white" />
        {!collapsed && (
          <span className="font-semibold leading-tight">
            Maasvlakte
            <span className="block text-[11px] font-normal text-white/50">
              Planning
            </span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-1 px-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{ className: "bg-white/10" }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white",
                    collapsed && "justify-center px-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: active user */}
      <div className="border-t border-white/10 p-3">
        {!collapsed ? (
          <div className="space-y-1.5">
            <span className="block text-[11px] uppercase tracking-wide text-white/40">
              Actieve gebruiker
            </span>
            {users.length > 0 ? (
              <Select
                value={activeUserId ?? ""}
                onChange={(e) => setActiveUser(e.target.value || null)}
                className="h-8 border-white/15 bg-white/10 text-white text-xs"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="text-black">
                    {u.name} ({u.role})
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-xs text-white/50">Geen gebruikers</span>
            )}
          </div>
        ) : (
          <div
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold"
            title={activeUser?.name ?? "Geen gebruiker"}
          >
            {activeUser?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={onToggle}
        className="hidden md:flex items-center justify-center gap-2 border-t border-white/10 py-2 text-xs text-white/60 hover:bg-white/5 hover:text-white cursor-pointer"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" />
            <span>Inklappen</span>
          </>
        )}
      </button>
    </div>
  );
}
