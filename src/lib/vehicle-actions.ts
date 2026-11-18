import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle, VehicleInput } from "@/types/database";
import { normaliseField as normalise } from "./normalise";

export class ActionError extends Error {}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

function payload(i: VehicleInput) {
  return {
    // "Vehicle No" is the single unique identifier; the legacy plate column mirrors it.
    jumper_no: normalise(i.jumper_no),
    registration_no: normalise(i.jumper_no),
    document_status: clean(i.document_status).replace(/[,;\s]+$/, ""),
    district: clean(i.district) || null,
    traffic_station: clean(i.traffic_station) || null,
    collected_by_or_operator_name: clean(i.collected_by_or_operator_name),
    ...(i.date_of_entry ? { date_of_entry: i.date_of_entry } : {}),
  };
}

function explain(error: { code?: string; message: string }): ActionError {
  if (error.code === "23505") {
    return new ActionError("This Vehicle No already exists. Every record needs its own unique Vehicle No.");
  }
  if (error.code === "42501") {
    return new ActionError("You are not authorised to do this.");
  }
  return new ActionError(error.message);
}

/** Assistants log into the working queue ("draft"); inspectors / admins may enter straight into the verification queue. */
export type EntryStage = "draft" | "pending";

export async function addVehicle(
  supabase: SupabaseClient,
  input: VehicleInput,
  stage: EntryStage = "draft"
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...payload(input), status: stage })
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

/** Admin / inspector: delete many records (each is archived in the recycle bin by a DB trigger). */
export async function deleteVehicles(supabase: SupabaseClient, ids: number[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("vehicles")
      .delete()
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (error) throw explain(error);
    deleted += data?.length ?? 0;
  }
  if (ids.length > 0 && deleted === 0) {
    throw new ActionError("You are not authorised to delete these records.");
  }
  return deleted;
}

/**
 * Inspector / admin: turn verification on or off.
 * Certificate number, verifier and timestamp are set (or cleared) by a DB trigger.
 */
export async function setVerification(
  supabase: SupabaseClient,
  id: number,
  verified: boolean
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .update({ status: verified ? "passed" : "pending" })
    .eq("id", id)
    .eq("status", verified ? "pending" : "passed")
    .select();
  if (error) throw explain(error);
  if (!data || data.length === 0) {
    throw new ActionError("Could not change verification: it already changed, or you lack permission.");
  }
  return data[0] as Vehicle;
}

/** Move a working-queue entry into the inspector verification queue. */
export async function sendForVerification(supabase: SupabaseClient, id: number): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "draft")
    .select();
  if (error) throw explain(error);
  if (!data || data.length === 0) {
    throw new ActionError("Could not send this entry: it already moved, or it is not yours.");
  }
  return data[0] as Vehicle;
}

/** Bulk status move (Send all / Approve all). Returns the updated rows. */
export async function moveAll(
  supabase: SupabaseClient,
  ids: number[],
  from: "draft" | "pending",
  to: "pending" | "passed"
): Promise<Vehicle[]> {
  const out: Vehicle[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("vehicles")
      .update({ status: to })
      .in("id", ids.slice(i, i + 100))
      .eq("status", from)
      .select();
    if (error) throw explain(error);
    out.push(...((data ?? []) as Vehicle[]));
  }
  return out;
}

export interface ImportRow extends VehicleInput {
  /** Row number in the uploaded file, used for error reporting */
  line: number;
}

export interface ImportResult {
  inserted: Vehicle[];
  failed: { line: number; message: string }[];
}

/** Bulk insert into the working queue; falls back to row-by-row if a chunk is rejected. */
export async function importVehicles(
  supabase: SupabaseClient,
  rows: ImportRow[],
  stage: EntryStage = "draft"
): Promise<ImportResult> {
  const inserted: Vehicle[] = [];
  const failed: ImportResult["failed"] = [];
  const CHUNK = 200;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const body = chunk.map((r) => ({ ...payload(r), status: stage }));

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
          message: err.code === "23505" ? "Vehicle No already exists" : err.message,
        });
      } else {
        inserted.push(one as Vehicle);
      }
    }
  }
  return { inserted, failed };
}
