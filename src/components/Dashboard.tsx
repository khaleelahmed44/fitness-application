"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCheck,
  FolderArchive,
  Send,
  CalendarPlus,
  ClipboardList,
  FileUp,
  LogOut,
  Settings2,
  Menu,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  addVehicle,
  deleteVehicle,
  deleteVehicles,
  importVehicles,
  moveAll,
  sendForVerification,
  updateVehicle,
  setVerification,
  type ImportRow,
} from "@/lib/vehicle-actions";
import { exportList, exportRecord, type ExportFormat } from "@/lib/export";
import { suggestionsFor, type SuggestField } from "@/lib/suggestions";
import { canDelete, canDeleteRow, canEdit, canSend, canVerify, type Profile, type Vehicle, type VehicleInput } from "@/types/database";
import VehicleGrid from "./VehicleGrid";
import EntryModal from "./EntryModal";
import ImportModal from "./ImportModal";
import ConfirmModal from "./ConfirmModal";
import DailyFiles from "./DailyFiles";
import ExportMenu, { type ExportScope } from "./ExportMenu";
import AnimatedNumber from "./AnimatedNumber";
import { buildColumns, type TabKey } from "./columns";

interface Props {
  profile: Profile;
  initialVehicles: Vehicle[];
}

const TAB_LABELS: Record<TabKey, string> = {
  draft: "Working",
  pending: "Pending",
  passed: "Verified",
  daily: "Daily Files",
};

const EMPTY_TEXT: Record<TabKey, string> = {
  draft: "Nothing in Working. Add a new entry or import a file.",
  pending: "Nothing is pending verification.",
  passed: "No records have been verified yet.",
  daily: "No records for this day.",
};

const TAB_ICON: Record<TabKey, typeof Truck> = {
  draft: ClipboardList,
  pending: Truck,
  passed: BadgeCheck,
  daily: FolderArchive,
};

type Dialog =
  | { kind: "new" }
  | { kind: "edit"; vehicle: Vehicle }
  | { kind: "delete"; vehicle: Vehicle }
  | { kind: "verify"; vehicle: Vehicle; to: boolean }
  | { kind: "import" }
  | { kind: "deleteAll" }
  | { kind: "approveAll" }
  | { kind: "sendAll" }
  | null;

const todayIso = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

export default function Dashboard({ profile, initialVehicles }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const verifier = canVerify(profile.role);
  const displayName = profile.full_name || profile.email || "User";

  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [tab, setTab] = useState<TabKey>(profile.role === "assistant" ? "draft" : "pending");
  const [activeDate, setActiveDate] = useState<string | null>(null);
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
  /** Assistants log into the working queue; inspectors / admins may enter straight into the verification queue. */
  const entryStage = verifier ? "pending" : "draft";

  const handleAdd = async (input: VehicleInput) => {
    const created = await addVehicle(supabase, input, entryStage);
    upsertLocal(created);
    setTab(entryStage);
    setActiveDate(null);
    flash(
      "ok",
      entryStage === "draft"
        ? `${created.jumper_no} added to Working. Request verification when ready.`
        : `${created.jumper_no} added to Pending.`
    );
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
      flash("ok", `${v.jumper_no} deleted.`);
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const handleDeleteAll = async () => {
    const ids = rows.map((r) => r.id);
    try {
      const n = await deleteVehicles(supabase, ids);
      setVehicles((prev) => prev.filter((p) => !ids.includes(p.id)));
      flash("ok", `${n} record(s) deleted.`);
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  const handleSetVerified = async (v: Vehicle, verified: boolean) => {
    setBusyId(v.id);
    try {
      const updated = await setVerification(supabase, v.id, verified);
      upsertLocal(updated);
      flash(
        "ok",
        verified
          ? `Approved. Certificate ${updated.certificate_no} issued for ${updated.jumper_no}.`
          : `${updated.jumper_no} returned to Pending.`
      );
    } catch (err) {
      await refresh();
      flash("err", err instanceof Error ? err.message : "Could not change verification");
    } finally {
      setBusyId(null);
    }
  };

  const handleSend = async (v: Vehicle) => {
    setBusyId(v.id);
    try {
      upsertLocal(await sendForVerification(supabase, v.id));
      flash("ok", `Verification requested for ${v.jumper_no}. It is now in Pending.`);
    } catch (err) {
      await refresh();
      flash("err", err instanceof Error ? err.message : "Could not request verification");
    } finally {
      setBusyId(null);
    }
  };

  const handleSendAll = async () => {
    const ids = rows.filter((r) => r.status === "draft" && canSend(r, profile.id, profile.role)).map((r) => r.id);
    const moved = await moveAll(supabase, ids, "draft", "pending");
    moved.forEach(upsertLocal);
    flash("ok", `${moved.length} entr${moved.length === 1 ? "y" : "ies"}: verification requested. Now in Pending.`);
  };

  const handleApproveAll = async () => {
    const ids = rows.filter((r) => r.status === "pending").map((r) => r.id);
    const moved = await moveAll(supabase, ids, "pending", "passed");
    moved.forEach(upsertLocal);
    flash("ok", `Approved ${moved.length} record${moved.length === 1 ? "" : "s"}. Certificates issued.`);
  };

  const handleImport = async (rows: ImportRow[]) => {
    const res = await importVehicles(supabase, rows, entryStage);
    res.inserted.forEach(upsertLocal);
    if (res.inserted.length > 0) {
      flash(
        "ok",
        `Imported ${res.inserted.length} record(s) into ${entryStage === "draft" ? "Working" : "Pending"}.`
      );
      setTab(entryStage);
      setActiveDate(null);
    }
    return res;
  };

  const handleExportList = async (scope: ExportScope, format: ExportFormat) => {
    try {
      const sorted = [...vehicles].sort((a, b) => a.id - b.id);
      const tab = scope === "verified" ? "passed" : scope === "pending" ? "pending" : "all";
      // "pending" scope = everything not yet verified (working + pending)
      const subset = sorted.filter((v) =>
        tab === "all" ? true : tab === "passed" ? v.status === "passed" : v.status !== "passed"
      );
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
      draft: vehicles.filter((v) => v.status === "draft").length,
      pending: vehicles.filter((v) => v.status === "pending").length,
      passed: vehicles.filter((v) => v.status === "passed").length,
      today: vehicles.filter((v) => v.date_of_entry === today).length,
    };
  }, [vehicles]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (tab === "daily" ? v.date_of_entry === activeDate : v.status === tab) &&
        (!q ||
          [
            v.jumper_no,
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
  }, [vehicles, tab, search, activeDate]);

  const existingJumpers = useMemo(
    () => new Set(vehicles.map((v) => v.jumper_no.toUpperCase())),
    [vehicles]
  );
  const countFor = (t: TabKey) =>
    t === "draft" ? counts.draft : t === "pending" ? counts.pending : t === "passed" ? counts.passed : counts.total;

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
        canDelete: (v) => canDeleteRow(v, profile.id, profile.role),
        canVerify: verifier,
        canSend: (v) => canSend(v, profile.id, profile.role),
        busyId,
        onSend: (v) => void handleSend(v),
        onApprove: (v) => void handleSetVerified(v, true),
        onUnverify: (v) => setDialog({ kind: "verify", vehicle: v, to: false }),
        onEdit: (v) => setDialog({ kind: "edit", vehicle: v }),
        onDelete: (v) => setDialog({ kind: "delete", vehicle: v }),
        onExport: handleExportRecord,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, verifier, busyId, profile.id, profile.role]
  );

  const stats = [
    { label: "Total records", value: counts.total, Icon: FolderArchive, tone: "from-indigo-500 to-violet-500" },
    { label: "Working", value: counts.draft, Icon: ClipboardList, tone: "from-slate-500 to-slate-700" },
    { label: "Pending", value: counts.pending, Icon: Truck, tone: "from-amber-400 to-orange-500" },
    { label: "Verified", value: counts.passed, Icon: BadgeCheck, tone: "from-emerald-400 to-teal-500" },
    { label: "Added today", value: counts.today, Icon: CalendarPlus, tone: "from-sky-400 to-blue-500" },
  ];

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-900/40">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-base font-bold leading-tight tracking-wide text-white">CFX</p>
          <p className="text-[11px] text-indigo-200/70">Document verification portal</p>
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
                setActiveDate(null);
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
                {(() => {
                  const Icon = TAB_ICON[t];
                  return <Icon className="h-4 w-4" />;
                })()}
                {TAB_LABELS[t]}
              </span>
              <span className="relative rounded-full bg-white/10 px-2 py-0.5 text-xs">{countFor(t)}</span>
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
              <h1 className="text-lg font-semibold text-slate-900">
                CFX · {TAB_LABELS[tab]}{tab === "daily" && activeDate ? ` · ${activeDate}` : ""}
              </h1>
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
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
                  onClick={() => {
                    setTab(t);
                    setActiveDate(null);
                  }}
                  className={`relative px-4 py-2.5 text-sm font-medium transition ${
                    tab === t ? "text-indigo-700" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {TAB_LABELS[t]}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {countFor(t)}
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

            {tab === "daily" && !activeDate ? (
              <DailyFiles vehicles={vehicles} today={todayIso()} onOpen={setActiveDate} />
            ) : (
              <>
                {tab === "daily" && activeDate && (
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() => setActiveDate(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      <ArrowLeft className="h-4 w-4" /> All days
                    </button>
                    <span className="font-mono font-semibold text-slate-800">{activeDate}</span>
                    <span className="text-slate-500">{activeDate === todayIso() ? "Active today" : "Archived"}</span>
                  </div>
                )}
            <VehicleGrid
              key={`${tab}-${activeDate ?? ""}`}
              data={rows}
              columns={columns}
              emptyText={EMPTY_TEXT[tab]}
              search={search}
              onSearchChange={setSearch}
              actions={
                <>
                  {tab === "draft" && rows.some((r) => canSend(r, profile.id, profile.role)) && (
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: "sendAll" })}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                    >
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Request verification for all</span>
                    </button>
                  )}
                  {tab === "pending" && verifier && (
                    <button
                      type="button"
                      disabled={rows.length === 0}
                      onClick={() => setDialog({ kind: "approveAll" })}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCheck className="h-4 w-4" />
                      <span className="hidden sm:inline">Approve all ({rows.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: "import" })}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                  >
                    <FileUp className="h-4 w-4" />
                    <span className="hidden sm:inline">Import Excel</span>
                  </button>
                  {canDelete(profile.role) && (
                    <button
                      type="button"
                      disabled={rows.length === 0}
                      onClick={() => setDialog({ kind: "deleteAll" })}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete all ({rows.length})</span>
                    </button>
                  )}
                  <ExportMenu
                    counts={{ all: counts.total, verified: counts.passed, pending: counts.draft + counts.pending }}
                    onExport={handleExportList}
                  />
                </>
              }
            />
              </>
            )}
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
            existingJumpers={existingJumpers}
            onImport={handleImport}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "deleteAll" && (
          <ConfirmModal
            key="delete-all"
            danger
            requireText="DELETE"
            title={`Delete all ${rows.length} records?`}
            message={
              <>
                Every record currently listed in <b>{TAB_LABELS[tab]}</b>
                {search.trim() ? <> (matching your search)</> : null} will be removed from CFX
                {tab === "passed" ? " and their e-certificates will no longer be valid" : ""}. Copies are kept in the
                Admin Panel recycle bin.
              </>
            }
            confirmLabel={`Delete ${rows.length}`}
            onConfirm={handleDeleteAll}
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
                <b>{dialog.vehicle.jumper_no}</b> will be removed
                from CFX{dialog.vehicle.status === "passed" ? " and its e-certificate will no longer be valid" : ""}. A
                copy is kept in the Admin Panel recycle bin, so it can be restored.
              </>
            }
            confirmLabel="Delete"
            onConfirm={() => handleDelete(dialog.vehicle)}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "approveAll" && (
          <ConfirmModal
            key="approve-all"
            title={`Approve all ${rows.length} records?`}
            message={
              <>
                Every record currently listed in <b>Pending</b>
                {search.trim() ? <> (matching your search)</> : null} will be approved and moved to Verified,
                and a certificate number is issued for each.
              </>
            }
            confirmLabel={`Approve ${rows.length}`}
            onConfirm={handleApproveAll}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "sendAll" && (
          <ConfirmModal
            key="send-all"
            title="Request verification for all?"
            message={
              <>
                Every entry currently listed in <b>Working</b>
                {search.trim() ? <> (matching your search)</> : null} moves to Pending for the inspector. You
                will no longer be able to edit them.
              </>
            }
            confirmLabel="Request all"
            onConfirm={handleSendAll}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "verify" && !dialog.to && (
          <ConfirmModal
            key="verify-off"
            danger
            title="Unverify this record?"
            message={
              <>
                Unverify <b>{dialog.vehicle.jumper_no}</b>. Its certificate (
                {dialog.vehicle.certificate_no}) is withdrawn and the record returns to Pending.
              </>
            }
            confirmLabel="Unverify"
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
