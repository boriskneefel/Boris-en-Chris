import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format seconds as "1u 23m 45s" (leading zero-units trimmed). */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}u`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

/** Format a "uu:mm:ss" string from seconds for input display. */
export function secondsToHMS(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Parse "uu:mm:ss" (or "mm:ss" / "ss") into seconds. Returns null on invalid. */
export function hmsToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  let h = 0,
    m = 0,
    s = 0;
  if (nums.length === 3) [h, m, s] = nums;
  else if (nums.length === 2) [m, s] = nums;
  else if (nums.length === 1) [s] = nums;
  else return null;
  if (h < 0 || m < 0 || s < 0) return null;
  return h * 3600 + m * 60 + s;
}

/** Safe localStorage read with JSON parse. Returns fallback on any failure. */
export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Safe localStorage write. Silently ignores failures (quota, SSR). */
export function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (should not be hit in modern browsers)
  return "id-" + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36);
}
