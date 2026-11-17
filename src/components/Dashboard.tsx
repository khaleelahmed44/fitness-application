"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarPlus,
  ClipboardList,
  FileUp,
  LogOut,
  Settings2,
  Menu,
  Plus,
  ShieldCheck,
  Truck,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  addVehicle,
  deleteVehicle,
  importVehicles,
  updateVehicle,
  setVerification,
  type ImportRow,
} from "@/lib/vehicle-actions";
import { exportList, exportRecord, type ExportFormat } from "@/lib/export";
import { suggestionsFor, type SuggestField } from "@/lib/suggestions";
import { canDelete, canEdit, canVerify, type Profile, type Vehicle, type VehicleInput } from "@/types/database";
import VehicleGrid from "./VehicleGrid";
import EntryModal from "./EntryModal";
import ImportModal from "./ImportModal";
import ConfirmModal from "./ConfirmModal";
import VerifyModal from "./VerifyModal";
import ExportMenu, { type ExportScope } from "./ExportMenu";
import AnimatedNumber from "./AnimatedNumber";
import { buildColumns, type TabKey } from "./columns";

interface Props {
  profile: Profile;
  initialVehicles: Vehicle[];
}

const TAB_LABELS: Record<TabKey, string> = {
  pending: "Pending / Not Verified",
  passed: "Verified / Passed",
};

const EMPTY_TEXT: Record<TabKey, string> = {
  pending: "No unverified vehicles. Add a new entry to get started.",
  passed: "No vehicles have been verified yet.",
};

type Dialog =
  | { kind: "new" }
  | { kind: "edit"; vehicle: Vehicle }
  | { kind: "delete"; vehicle: Vehicle }
  | { kind: "verify"; vehicle: Vehicle; to: boolean }
  | { kind: "import" }
  | null;

const todayIso = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

export default function Dashboard({ profile, initialVehicles }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const verifier = canVerify(profile.role);
  const displayName = profile.full_name || profile.email || "User";

  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [tab, setTab] = useState<TabKey>("pending");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("id", { ascending: false });
    if (error) flash("err", error.message);
    else setVehicles((data ?? []) as Vehicle[]);
  }, [supabase, flash]);

  // Live updates: counters and lists follow changes made by anyone else.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("vehicles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 350);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  const upsertLocal = (v: Vehicle) =>
    setVehicles((prev) =>
      prev.some((p) => p.id === v.id) ? prev.map((p) => (p.id === v.id ? v : p)) : [v, ...prev]
    );

  // ---- handlers -------------------------------------------------------
  const handleAdd = async (input: VehicleInput) => {
    const created = await addVehicle(supabase, input);
    upsertLocal(created);
    setTab("pending");
    flash("ok", `${created.registration_no} added to the pending queue.`);
  };

  const handleEdit = async (id: number, input: VehicleInput) => {
    try {
      upsertLocal(await updateVehicle(supabase, id, input));
      flash("ok", "Entry updated.");
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const handleDelete = async (v: Vehicle) => {
    try {
      await deleteVehicle(supabase, v.id);
      setVehicles((prev) => prev.filter((p) => p.id !== v.id));
      flash("ok", `${v.registration_no} deleted.`);
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const handleSetVerified = async (v: Vehicle, verified: boolean, collectedBy?: string) => {
    setBusyId(v.id);
    try {
      const updated = await setVerification(supabase, v.id, verified, collectedBy);
      upsertLocal(updated);
      setTab(verified ? "passed" : "pending");
      flash(
        "ok",
        verified
          ? `Verified. Certificate ${updated.certificate_no} issued.`
          : `${updated.registration_no} marked Not Verified and moved back to Pending.`
      );
    } catch (err) {
      await refresh();
      throw err;
    } finally {
      setBusyId(null);
    }
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

  const handleExportList = async (scope: ExportScope, format: ExportFormat) => {
    try {
      const sorted = [...vehicles].sort((a, b) => a.id - b.id);
      const tab = scope === "verified" ? "passed" : scope === "pending" ? "pending" : "all";
      const subset = sorted.filter((v) => (tab === "all" ? true : v.status === tab));
      await exportList(format, tab, subset);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleExportRecord = async (v: Vehicle, format: ExportFormat) => {
    try {
      await exportRecord(format, "all", v);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Export failed");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  // ---- derived data ---------------------------------------------------
  const counts = useMemo(() => {
    const today = todayIso();
    return {
      total: vehicles.length,
      pending: vehicles.filter((v) => v.status === "pending").length,
      passed: vehicles.filter((v) => v.status === "passed").length,
      today: vehicles.filter((v) => v.date_of_entry === today).length,
    };
  }, [vehicles]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        v.status === tab &&
        (!q ||
          [
            v.registration_no,
            v.district,
            v.traffic_station,
            v.collected_by_or_operator_name,
            v.certificate_no,
            v.verified_by_name,
            v.document_status,
            String(v.id),
          ]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(q)))
    );
  }, [vehicles, tab, search]);

  const existingPlates = useMemo(
    () => new Set(vehicles.filter((v) => v.status === "pending").map((v) => v.registration_no.toUpperCase())),
    [vehicles]
  );

  const suggest = useMemo(() => {
    const fields: SuggestField[] = [
      "registration_no",
      "document_status",
      "district",
      "traffic_station",
      "collected_by_or_operator_name",
    ];
    return Object.fromEntries(fields.map((f) => [f, suggestionsFor(vehicles, f)])) as Record<
      SuggestField,
      string[]
    >;
  }, [vehicles]);

  const columns = useMemo(
    () =>
      buildColumns(tab, {
        canEdit: (v) => canEdit(v, profile.id, profile.role),
        canDelete: () => canDelete(profile.role),
        canToggle: () => verifier,
        busyId,
        onToggleVerify: (v) => setDialog({ kind: "verify", vehicle: v, to: v.status !== "passed" }),
        onEdit: (v) => setDialog({ kind: "edit", vehicle: v }),
        onDelete: (v) => setDialog({ kind: "delete", vehicle: v }),
        onExport: handleExportRecord,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, verifier, busyId, profile.id, profile.role]
  );

  const stats = [
    { label: "Total entries", value: counts.total, Icon: ClipboardList, tone: "from-indigo-500 to-violet-500" },
    { label: "Pending", value: counts.pending, Icon: Truck, tone: "from-amber-400 to-orange-500" },
    { label: "Verified / Passed", value: counts.passed, Icon: BadgeCheck, tone: "from-emerald-400 to-teal-500" },
    { label: "Added today", value: counts.today, Icon: CalendarPlus, tone: "from-sky-400 to-blue-500" },
  ];

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-900/40">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">Fitness Register</p>
          <p className="text-[11px] text-indigo-200/70">Vehicle e-certificates</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Sections">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setDrawer(false);
              }}
              className={`relative flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                active ? "text-white" : "text-indigo-100/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/10"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2.5">
                {t === "pending" ? <Truck className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}
                {TAB_LABELS[t]}
              </span>
              <span className="relative rounded-full bg-white/10 px-2 py-0.5 text-xs">
                {t === "pending" ? counts.pending : counts.passed}
              </span>
            </button>
          );
        })}

        {profile.role === "admin" && (
          <Link
            href="/admin"
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-white/5 hover:text-amber-100"
          >
            <Settings2 className="h-4 w-4" /> Admin Panel
          </Link>
        )}

        {profile.role === "inspector" && (
          <Link
            href="/team"
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-indigo-100/70 transition hover:bg-white/5 hover:text-white"
          >
            <Users className="h-4 w-4" /> My Team
          </Link>
        )}

        <div className="pt-4">
          <button
            onClick={() => {
              setDialog({ kind: "new" });
              setDrawer(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New Entry
          </button>
        </div>
      </nav>

      <div className="m-3 rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
        <p className="truncate text-sm font-medium text-white">{displayName}</p>
        <p className="mt-0.5 text-xs capitalize text-indigo-200/70">{profile.role}</p>
        <button
          onClick={signOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-xs font-medium text-white transition hover:bg-white/20"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 lg:block">
        {nav}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 to-indigo-950 lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <button
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{TAB_LABELS[tab]}</h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Welcome back, {displayName}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDialog({ kind: "new" })}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Entry</span>
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
          {/* Animated counters */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {stats.map(({ label, value, Icon, tone }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 24 }}
                whileHover={{ y: -2 }}
                className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
              >
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tone} text-white shadow`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    <AnimatedNumber value={value} />
                  </p>
                  <p className="truncate text-xs font-medium text-slate-500">{label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tabs + grid */}
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <div className="flex gap-1 border-b border-slate-100 px-3 pt-2" role="tablist">
              {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition ${
                    tab === t ? "text-indigo-700" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {TAB_LABELS[t]}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {t === "pending" ? counts.pending : counts.passed}
                  </span>
                  {tab === t && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600"
                    />
                  )}
                </button>
              ))}
            </div>

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
                    onClick={() => setDialog({ kind: "import" })}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                  >
                    <FileUp className="h-4 w-4" />
                    <span className="hidden sm:inline">Import Excel</span>
                  </button>
                  <ExportMenu
                    counts={{ all: counts.total, verified: counts.passed, pending: counts.pending }}
                    onExport={handleExportList}
                  />
                </>
              }
            />
          </section>
        </main>
      </div>

      <AnimatePresence>
        {dialog?.kind === "new" && (
          <EntryModal
            key="new"
            mode="add"
            defaultName={displayName}
            suggest={suggest}
            onSubmit={handleAdd}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "edit" && (
          <EntryModal
            key="edit"
            mode="edit"
            initial={dialog.vehicle}
            defaultName={displayName}
            suggest={suggest}
            onSubmit={(input) => handleEdit(dialog.vehicle.id, input)}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "import" && (
          <ImportModal
            key="import"
            existingPlates={existingPlates}
            onImport={handleImport}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "delete" && (
          <ConfirmModal
            key="delete"
            danger
            title="Delete this entry?"
            message={
              <>
                <b>{dialog.vehicle.registration_no}</b> (S.No {dialog.vehicle.id}) will be removed
                from the register{dialog.vehicle.status === "passed" ? " and its e-certificate will no longer be valid" : ""}. A
                copy is kept in the Admin Panel recycle bin, so it can be restored.
              </>
            }
            confirmLabel="Delete"
            onConfirm={() => handleDelete(dialog.vehicle)}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "verify" && dialog.to && (
          <VerifyModal
            key="verify-on"
            vehicle={dialog.vehicle}
            nameSuggestions={suggest.collected_by_or_operator_name}
            onConfirm={(name) => handleSetVerified(dialog.vehicle, true, name)}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "verify" && !dialog.to && (
          <ConfirmModal
            key="verify-off"
            danger
            title="Mark as Not Verified?"
            message={
              <>
                Mark <b>{dialog.vehicle.registration_no}</b> as <b>Not Verified</b>. Its certificate (
                {dialog.vehicle.certificate_no}) is withdrawn and the record returns to the Pending list.
              </>
            }
            confirmLabel="Mark Not Verified"
            onConfirm={() => handleSetVerified(dialog.vehicle, false)}
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
              toast.kind === "ok" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
