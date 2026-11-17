import type { Vehicle } from "@/types/database";

export type SuggestField =
  | "registration_no"
  | "district"
  | "traffic_station"
  | "collected_by_or_operator_name";

/**
 * Past values for a field, most-used first (ties: most recent first).
 * Built from the rows already loaded, so it needs no extra queries.
 */
export function suggestionsFor(vehicles: Vehicle[], field: SuggestField): string[] {
  const stats = new Map<string, { n: number; last: number }>();
  for (const v of vehicles) {
    const raw = v[field];
    const val = typeof raw === "string" ? raw.trim() : "";
    if (!val) continue;
    const key = val;
    const s = stats.get(key) ?? { n: 0, last: 0 };
    s.n += 1;
    s.last = Math.max(s.last, v.id);
    stats.set(key, s);
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    .map(([k]) => k);
}
