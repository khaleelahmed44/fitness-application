export type Role = "operator" | "inspector" | "admin";
export type VehicleStatus = "pending" | "passed";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

/** Notebook-format register row. */
export interface Vehicle {
  /** S.No */
  id: number;
  /** Vehicle No */
  registration_no: string;
  /** Documents Original Submitted – free text, e.g. "CNIC, Original Registration Book" */
  document_status: string;
  /** Date of entry (YYYY-MM-DD, auto-captured) */
  date_of_entry: string;
  district: string | null;
  traffic_station: string | null;
  /** Name – person who collected / data-entry operator */
  collected_by_or_operator_name: string;
  status: VehicleStatus;
  certificate_no: string | null;
  created_by: string | null;
  created_at: string;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
}

export interface VehicleInput {
  registration_no: string;
  document_status: string;
  district: string;
  traffic_station: string;
  /** Leave blank to use the signed-in user's name (done by the database) */
  collected_by_or_operator_name: string;
  /** Optional (imports only) – YYYY-MM-DD */
  date_of_entry?: string;
}

export const canVerify = (role: Role | undefined): boolean =>
  role === "inspector" || role === "admin";

/** Edit rule (mirrors RLS): admin; verified rows: any inspector; pending rows: creator or inspector. */
export function canEdit(v: Vehicle, userId: string, role: Role): boolean {
  if (role === "admin") return true;
  if (v.status === "passed") return role === "inspector";
  return v.created_by === userId || role === "inspector";
}

/** Delete rule (mirrors RLS, stricter than edit): verified rows only by their verifier. */
export function canModify(v: Vehicle, userId: string, role: Role): boolean {
  if (role === "admin") return true;
  if (v.status === "pending") return v.created_by === userId || role === "inspector";
  return v.verified_by === userId;
}
