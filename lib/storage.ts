import { Vehicle, YardData } from "./types";
import { initialVehicles, initialHorseCodes } from "./initialData";

export const STORAGE_KEY = "mare-transport-yard-data";
export const CODES_KEY = "mare-transport-horse-codes";

export function loadData(): Vehicle[] {
  if (typeof window === "undefined") return initialVehicles;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialVehicles;
    const parsed = JSON.parse(raw) as YardData;
    if (!parsed || !Array.isArray(parsed.vehicles)) return initialVehicles;
    return parsed.vehicles;
  } catch {
    return initialVehicles;
  }
}

export function saveData(vehicles: Vehicle[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: YardData = { vehicles };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 使用不可時は無視
  }
}

export function clearData(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視
  }
}

export function loadCodes(): string[] {
  if (typeof window === "undefined") return initialHorseCodes;
  try {
    const raw = window.localStorage.getItem(CODES_KEY);
    if (!raw) return initialHorseCodes;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialHorseCodes;
    return parsed as string[];
  } catch {
    return initialHorseCodes;
  }
}

export function saveCodes(codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CODES_KEY, JSON.stringify(codes));
  } catch {
    // 無視
  }
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}
