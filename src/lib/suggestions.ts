import type { Vehicle } from "@/types/database";

export type SuggestField =
  | "registration_no"
  | "document_status"
  | "district"
  | "traffic_station"
  | "collected_by_or_operator_name";

/**
 * Past values for a field, most-used first (ties: most recent first).
 * Built from the saved records, so history is shared by every operator.
 *
 * For `document_status` (free text) both the full phrases and the individual
 * comma-separated items are suggested, so "CNIC" can be reused on its own.
 */
export function suggestionsFor(vehicles: Vehicle[], field: SuggestField): string[] {
  const stats = new Map<string, { n: number; last: number }>();
  const bump = (val: string, id: number) => {
    const s = stats.get(val) ?? { n: 0, last: 0 };
    s.n += 1;
    s.last = Math.max(s.last, id);
    stats.set(val, s);
  };

  for (const v of vehicles) {
    const raw = v[field];
    const val = typeof raw === "string" ? raw.trim() : "";
    if (!val) continue;
    bump(val, v.id);
    if (field === "document_status" && /[,;]/.test(val)) {
      for (const part of val.split(/[,;]/)) {
        const item = part.trim();
        if (item) bump(item, v.id);
      }
    }
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
    .map(([k]) => k);
}
