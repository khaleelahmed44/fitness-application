"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ActionError,
  addVehicle,
  importVehicles,
  inspectVehicle,
  setDocumentsStatus,
  type ImportRow,
} from "@/lib/vehicle-actions";
import { exportList, exportRecord, type ExportFormat } from "@/lib/export";
import {
  canInspect as hasInspectorRights,
  type DocumentsStatus,
  type NewVehicleInput,
  type Profile,
  type Vehicle,
} from "@/types/database";
import VehicleGrid from "./VehicleGrid";
import NewEntryModal from "./NewEntryModal";
import InspectModal from "./InspectModal";
import ImportModal from "./ImportModal";
import ExportMenu from "./ExportMenu";
import { buildColumns, type TabKey } from "./columns";

interface Props {
  profile: Profile;
  initialVehicles: Vehicle[];
}

const TAB_LABELS: Record<TabKey, string> = {
  pending: "Pending Inspection",
  passed: "Passed Vehicles",
  failed: "Failed Vehicles",
};

const EMPTY_TEXT: Record<TabKey, string> = {
  pending: "No vehicles waiting for inspection.",
  passed: "No vehicles have passed yet.",
  failed: "No vehicles have failed.",
};

export default function Dashboard({ profile, initialVehicles }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inspector = hasInspectorRights(profile.role);

  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [tab, setTab] = useState<TabKey>("pending");
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [inspecting, setInspecting] = useState<{
    vehicle: Vehicle;
    decision: "passed" | "failed";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) flash("err", error.message);
    else setVehicles((data ?? []) as Vehicle[]);
  }, [supabase, flash]);

  const upsertLocal = (v: Vehicle) =>
    setVehicles((prev) => {
      const exists = prev.some((p) => p.id === v.id);
      return exists ? prev.map((p) => (p.id === v.id ? v : p)) : [v, ...prev];
    });

  // ---- handlers -------------------------------------------------------
  const handleAdd = async (input: NewVehicleInput) => {
    const created = await addVehicle(supabase, input);
    upsertLocal(created);
    flash("ok", `${created.registration_no} added to the pending queue.`);
  };

  const handleImport = async (rows: ImportRow[]) => {
    const res = await importVehicles(supabase, rows);
    res.inserted.forEach(upsertLocal);
    if (res.inserted.length > 0) {
      flash("ok", `Imported ${res.inserted.length} vehicle(s) into the pending queue.`);
      setTab("pending");
    }
    return res;
  };

  const handleExportList = async (format: ExportFormat) => {
    try {
      await exportList(format, tab, rows);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleExportRecord = async (v: Vehicle, format: ExportFormat) => {
    try {
      await exportRecord(format, tab, v);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleDecision = async (remarks: string) => {
    if (!inspecting) return;
    const { vehicle, decision } = inspecting;
    setBusyId(vehicle.id);
    try {
      const updated = await inspectVehicle(supabase, { id: vehicle.id, decision, remarks });
      upsertLocal(updated);
      flash(
        "ok",
        decision === "passed"
          ? `Passed. Certificate ${updated.certificate_no} issued.`
          : `${updated.registration_no} marked as failed.`
      );
      if (decision === "passed") setTab("passed");
      else setTab("failed");
    } catch (err) {
      if (err instanceof ActionError) await refresh();
      throw err; // modal shows the message
    } finally {
      setBusyId(null);
    }
  };

  const handleDocs = async (v: Vehicle, s: DocumentsStatus) => {
    setBusyId(v.id);
    try {
      upsertLocal(await setDocumentsStatus(supabase, v.id, s));
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Update failed");
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  // ---- derived data ---------------------------------------------------
  const visibleTabs: TabKey[] = inspector ? ["pending", "passed", "failed"] : ["pending"];
  const counts = useMemo(
    () => ({
      pending: vehicles.filter((v) => v.status === "pending").length,
      passed: vehicles.filter((v) => v.status === "passed").length,
      failed: vehicles.filter((v) => v.status === "failed").length,
    }),
    [vehicles]
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        v.status === tab &&
        (!q ||
          [v.registration_no, v.chassis_no, v.engine_no, v.documents_status, v.certificate_no, v.inspector_name, v.remarks]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(q)))
    );
  }, [vehicles, tab, search]);
  const existingPlates = useMemo(
    () =>
      new Set(
        vehicles.filter((v) => v.status === "pending").map((v) => v.registration_no.toUpperCase())
      ),
    [vehicles]
  );
  const columns = useMemo(
    () =>
      buildColumns(tab, {
        canInspect: inspector,
        busyId,
        onPass: (v) => setInspecting({ vehicle: v, decision: "passed" }),
        onFail: (v) => setInspecting({ vehicle: v, decision: "failed" }),
        onDocsChange: handleDocs,
        onExport: handleExportRecord,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, inspector, busyId]
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Vehicle Fitness Inspection</h1>
          <p className="text-xs text-gray-500">
            {profile.full_name ?? profile.email} ·{" "}
            <span className="font-medium capitalize">{profile.role}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Entry
          </button>
          <button
            onClick={refresh}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={signOut}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Sheet tabs */}
      <main className="flex min-h-0 flex-1 flex-col bg-white">
        <VehicleGrid
          key={tab}
          data={rows}
          columns={columns}
          emptyText={EMPTY_TEXT[tab]}
          search={search}
          onSearchChange={setSearch}
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="rounded border border-blue-600 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Import from File
              </button>
              <ExportMenu count={rows.length} onExport={handleExportList} />
            </>
          }
        />

        <nav className="flex gap-1 border-t bg-gray-100 px-2 pt-1" aria-label="Sheets">
          {visibleTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t border border-b-0 px-4 py-1.5 text-sm ${
                tab === t
                  ? "border-gray-300 bg-white font-semibold text-blue-700"
                  : "border-transparent text-gray-600 hover:bg-gray-200"
              }`}
            >
              {TAB_LABELS[t]}{" "}
              <span className="ml-1 rounded-full bg-gray-200 px-1.5 text-xs">{counts[t]}</span>
            </button>
          ))}
        </nav>
      </main>

      {showImport && (
        <ImportModal
          existingPlates={existingPlates}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
      {showNew && <NewEntryModal onClose={() => setShowNew(false)} onSubmit={handleAdd} />}
      {inspecting && (
        <InspectModal
          vehicle={inspecting.vehicle}
          decision={inspecting.decision}
          onClose={() => setInspecting(null)}
          onConfirm={handleDecision}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-14 right-4 z-50 max-w-sm rounded px-4 py-3 text-sm text-white shadow-lg ${
            toast.kind === "ok" ? "bg-green-700" : "bg-red-700"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
