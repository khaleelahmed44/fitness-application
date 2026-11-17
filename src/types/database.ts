export type Role = "operator" | "inspector" | "admin";
export type VehicleStatus = "pending" | "passed" | "failed";
export type DocumentsStatus = "Verified" | "Pending";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Vehicle {
  id: string;
  registration_no: string;
  chassis_no: string;
  engine_no: string;
  documents_status: DocumentsStatus;
  status: VehicleStatus;
  inspector_name: string | null;
  certificate_no: string | null;
  remarks: string | null;
  created_at: string;
  created_by: string | null;
  inspected_by: string | null;
  inspected_at: string | null;
}

export interface NewVehicleInput {
  registration_no: string;
  chassis_no: string;
  engine_no: string;
  documents_status: DocumentsStatus;
}

export const canInspect = (role: Role | undefined): boolean =>
  role === "inspector" || role === "admin";
