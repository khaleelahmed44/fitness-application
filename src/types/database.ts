export type Role = "assistant" | "inspector" | "admin";
/** draft = assistant working queue, pending = inspector verification queue, passed = verified */
export type VehicleStatus = "draft" | "pending" | "passed";

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

/** Notebook-format register row. */
export interface Vehicle {
  /** S.No */
  id: number;
  /** Vehicle No: the single unique identifier of a record (legacy column name) */
  jumper_no: string;
  /** Vehicle No */
  registration_no: string;
  /** Documents Original Submitted – free text, e.g. "CNIC, Original Registration Book" */
  document_status: string;
  /** Date of entry (YYYY-MM-DD, auto-captured) */
  date_of_entry: string;
  district: string | null;
  traffic_station: string | null;
  /** Collected By – the assistant who received and processed the documents */
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
  jumper_no: string;
  registration_no: string;
  document_status: string;
  district: string;
  traffic_station: string;
  /** Collected By (mandatory) */
  collected_by_or_operator_name: string;
  /** Optional (imports only) – YYYY-MM-DD */
  date_of_entry?: string;
}

export const canVerify = (role: Role | undefined): boolean =>
  role === "inspector" || role === "admin";

/** Edit rule (mirrors RLS): admin and inspectors any record; assistants only their own drafts. */
export function canEdit(v: Vehicle, userId: string, role: Role): boolean {
  if (role === "admin" || role === "inspector") return true;
  return v.status === "draft" && v.created_by === userId;
}

/** Send for Verification: the person who logged a draft, or an inspector / admin. */
export function canSend(v: Vehicle, userId: string, role: Role): boolean {
  return v.status === "draft" && (canVerify(role) || v.created_by === userId);
}

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  draft: "Working",
  pending: "Pending",
  passed: "Verified",
};

/** Delete / recycle: super admin only (mirrors RLS). */
export const canDelete = (role: Role | undefined): boolean => role === "admin" || role === "inspector";

export interface ManagedUser {
  id: string;
  username: string;
  full_name: string | null;
  role: Role;
  created_by_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  entries: number;
  verified: number;
}

export interface AdminStats {
  total: number;
  pending: number;
  verified: number;
  today: number;
  last7: number;
  trash: number;
  admins: number;
  inspectors: number;
  assistants: number;
  last_entry_at: string | null;
  last_verified_at: string | null;
  db_size: string;
  table_size: string;
}

export interface TrashRow {
  trash_id: number;
  deleted_at: string;
  deleted_by_name: string | null;
  id: number;
  registration_no: string | null;
  status: string | null;
  district: string | null;
  traffic_station: string | null;
  collected_by_or_operator_name: string | null;
}
