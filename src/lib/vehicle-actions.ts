import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle, VehicleInput } from "@/types/database";
import { normaliseField as normalise } from "./normalise";

export class ActionError extends Error {}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

function payload(i: VehicleInput) {
  return {
    registration_no: normalise(i.registration_no),
    document_status: i.document_status,
    district: clean(i.district) || null,
    traffic_station: clean(i.traffic_station) || null,
    collected_by_or_operator_name: clean(i.collected_by_or_operator_name),
    ...(i.date_of_entry ? { date_of_entry: i.date_of_entry } : {}),
  };
}

function explain(error: { code?: string; message: string }): ActionError {
  if (error.code === "23505") {
    return new ActionError("This vehicle number is already in the pending queue.");
  }
  if (error.code === "42501") {
    return new ActionError("You are not authorised to do this.");
  }
  return new ActionError(error.message);
}

export async function addVehicle(supabase: SupabaseClient, input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...payload(input), status: "pending" })
    .select()
    .single();
  if (error) throw explain(error);
  return data as Vehicle;
}

/** Edit a record. RLS decides who may; zero rows back means "not allowed". */
export async function updateVehicle(
  supabase: SupabaseClient,
  id: number,
  input: VehicleInput
): Promise<Vehicle> {
  const { date_of_entry: _ignored, ...rest } = payload(input);
  void _ignored;
  const { data, error } = await supabase.from("vehicles").update(rest).eq("id", id).select();
  if (error) throw explain(error);
  if (!data || data.length === 0) {
    throw new ActionError("You are not authorised to edit this record.");
  }
  return data[0] as Vehicle;
}

export async function deleteVehicle(supabase: SupabaseClient, id: number): Promise<void> {
  const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select("id");
  if (error) throw explain(error);
  if (!data || data.length === 0) {
    throw new ActionError("You are not authorised to delete this record.");
  }
}

/** Inspector / admin: mark verified. Certificate no. + verifier are set by a DB trigger. */
export async function verifyVehicle(supabase: SupabaseClient, id: number): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .update({ status: "passed" })
    .eq("id", id)
    .eq("status", "pending")
    .select();
  if (error) throw explain(error);
  if (!data || data.length === 0) {
    throw new ActionError("Could not verify: already verified, or you lack permission.");
  }
  return data[0] as Vehicle;
}

export interface ImportRow extends VehicleInput {
  /** Row number in the uploaded file, used for error reporting */
  line: number;
}

export interface ImportResult {
  inserted: Vehicle[];
  failed: { line: number; message: string }[];
}

/** Bulk insert into the pending queue; falls back to row-by-row if a chunk is rejected. */
export async function importVehicles(
  supabase: SupabaseClient,
  rows: ImportRow[]
): Promise<ImportResult> {
  const inserted: Vehicle[] = [];
  const failed: ImportResult["failed"] = [];
  const CHUNK = 200;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const body = chunk.map((r) => ({ ...payload(r), status: "pending" }));

    const { data, error } = await supabase.from("vehicles").insert(body).select();
    if (!error) {
      inserted.push(...((data ?? []) as Vehicle[]));
      continue;
    }
    for (let j = 0; j < chunk.length; j++) {
      const { data: one, error: err } = await supabase
        .from("vehicles")
        .insert(body[j])
        .select()
        .single();
      if (err) {
        failed.push({
          line: chunk[j].line,
          message: err.code === "23505" ? "Vehicle number is already in the pending queue" : err.message,
        });
      } else {
        inserted.push(one as Vehicle);
      }
    }
  }
  return { inserted, failed };
}
