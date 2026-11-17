"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  CalendarPlus,
  ClipboardList,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminStats, ManagedUser, TrashRow } from "@/types/database";
import AnimatedNumber from "./AnimatedNumber";
import ConfirmModal from "./ConfirmModal";
import Modal from "./Modal";

type Section = "monitor" | "users" | "trash";

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

type Dialog =
  | { kind: "removeUser"; user: ManagedUser }
  | { kind: "resetPw"; user: ManagedUser }
  | { kind: "purgeOne"; row: TrashRow }
  | { kind: "purgeAll" }
  | null;

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function AdminPanel({ adminName }: { adminName: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("monitor");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [trash, setTrash] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    const [s, u, t] = await Promise.all([
      supabase.rpc("admin_stats"),
      supabase.rpc("admin_list_users"),
      supabase
        .from("vehicles_trash")
        .select(
          "trash_id, deleted_at, deleted_by_name, id, registration_no, status, district, traffic_station, collected_by_or_operator_name"
        )
        .order("deleted_at", { ascending: false }),
    ]);
    const err = s.error ?? u.error ?? t.error;
    if (err) flash("err", err.message);
    else {
      setStats(s.data as AdminStats);
      setUsers((u.data ?? []) as ManagedUser[]);
      setTrash((t.data ?? []) as TrashRow[]);
    }
    setLoading(false);
  }, [supabase, flash]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20000); // live monitoring
    return () => clearInterval(timer);
  }, [load]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  async function run(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) throw new Error(error.message);
    flash("ok", label);
    await load();
  }

  const cards = stats
    ? [
        { label: "Total records", value: stats.total, Icon: ClipboardList, tone: "from-indigo-500 to-violet-500" },
        { label: "Pending", value: stats.pending, Icon: Truck, tone: "from-amber-400 to-orange-500" },
        { label: "Verified", value: stats.verified, Icon: BadgeCheck, tone: "from-emerald-400 to-teal-500" },
        { label: "Added today", value: stats.today, Icon: CalendarPlus, tone: "from-sky-400 to-blue-500" },
        { label: "Last 7 days", value: stats.last7, Icon: Activity, tone: "from-fuchsia-400 to-pink-500" },
        { label: "In recycle bin", value: stats.trash, Icon: Trash2, tone: "from-slate-400 to-slate-600" },
      ]
    : [];

  const tabs: { key: Section; label: string; Icon: typeof Users }[] = [
    { key: "monitor", label: "Monitoring", Icon: Activity },
    { key: "users", label: "Users & Inspectors", Icon: Users },
    { key: "trash", label: `Recycle Bin (${trash.length})`, Icon: Trash2 },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-4 text-white sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-200/70">Super Admin</p>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
          <p className="text-xs text-indigo-200/70">Signed in as {adminName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" /> Register
          </Link>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={section === key}
              onClick={() => setSection(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                section === key
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {/* ---------- Monitoring ---------- */}
        {section === "monitor" && stats && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {cards.map(({ label, value, Icon, tone }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
                >
                  <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${tone} text-white shadow`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      <AnimatedNumber value={value} />
                    </p>
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="h-4 w-4 text-indigo-600" /> Database
                </h2>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Database size", stats.db_size],
                    ["Vehicles table size", stats.table_size],
                    ["Last entry added", fmtDateTime(stats.last_entry_at)],
                    ["Last verification", fmtDateTime(stats.last_verified_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-medium text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-indigo-600" /> Accounts
                </h2>
                <dl className="space-y-2 text-sm">
                  {[
                    ["Super admin", stats.admins],
                    ["Inspectors", stats.inspectors],
                    ["Data-entry operators", stats.operators],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-medium text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-slate-400">Refreshes automatically every 20 seconds.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Users ---------- */}
        {section === "users" && (
          <div className="space-y-5">
            <AddUserForm
              onCreate={async (v) => {
                await run(
                  `${v.role === "inspector" ? "Inspector" : "Operator"} ${v.name} added.`,
                  supabase.rpc("admin_create_user", {
                    p_email: v.email,
                    p_password: v.password,
                    p_full_name: v.name,
                    p_role: v.role,
                  })
                );
              }}
            />

            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {["Name", "Email", "Role", "Entries", "Verified", "Last sign-in", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{u.full_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            u.role === "admin"
                              ? "bg-amber-100 text-amber-800"
                              : u.role === "inspector"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {u.role === "admin" ? "Super admin" : u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{u.entries}</td>
                      <td className="px-4 py-2.5 tabular-nums">{u.verified}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtDateTime(u.last_sign_in_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setDialog({ kind: "resetPw", user: u })}
                            title="Reset password"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          {u.role !== "admin" && (
                            <button
                              onClick={() => setDialog({ kind: "removeUser", user: u })}
                              title="Remove user"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------- Recycle bin ---------- */}
        {section === "trash" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Records deleted from the register are kept here. Restore them, or delete them permanently.
              </p>
              <button
                disabled={trash.length === 0}
                onClick={() => setDialog({ kind: "purgeAll" })}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                Empty recycle bin
              </button>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {["S.No", "Vehicle No", "Status", "District", "Traffic Station", "Deleted", "By", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trash.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        The recycle bin is empty.
                      </td>
                    </tr>
                  )}
                  {trash.map((r) => (
                    <tr key={r.trash_id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 tabular-nums text-slate-500">{r.id}</td>
                      <td className="px-4 py-2.5 font-semibold">{r.registration_no}</td>
                      <td className="px-4 py-2.5">{r.status === "passed" ? "Verified" : "Not Verified"}</td>
                      <td className="px-4 py-2.5">{r.district ?? "—"}</td>
                      <td className="px-4 py-2.5">{r.traffic_station ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtDateTime(r.deleted_at)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.deleted_by_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              void run(`${r.registration_no} restored.`, supabase.rpc("admin_restore_vehicle", { p_trash_id: r.trash_id })).catch(
                                (e: Error) => flash("err", e.message)
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Restore
                          </button>
                          <button
                            onClick={() => setDialog({ kind: "purgeOne", row: r })}
                            title="Delete permanently"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {dialog?.kind === "removeUser" && (
          <ConfirmModal
            key="rm"
            danger
            title="Remove this user?"
            message={
              <>
                <b>{dialog.user.full_name}</b> ({dialog.user.email}) will lose access immediately. Their past
                entries and verifications stay in the register.
              </>
            }
            confirmLabel="Remove user"
            onConfirm={() =>
              run(`${dialog.user.full_name} removed.`, supabase.rpc("admin_delete_user", { p_id: dialog.user.id }))
            }
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "resetPw" && (
          <ResetPasswordModal
            key="pw"
            user={dialog.user}
            onSubmit={(pw) =>
              run(
                `Password updated for ${dialog.user.full_name}.`,
                supabase.rpc("admin_set_password", { p_id: dialog.user.id, p_password: pw })
              )
            }
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "purgeOne" && (
          <ConfirmModal
            key="p1"
            danger
            title="Delete permanently?"
            message={
              <>
                <b>{dialog.row.registration_no}</b> will be erased for good and can no longer be restored.
              </>
            }
            confirmLabel="Delete permanently"
            onConfirm={() => run("Deleted permanently.", supabase.rpc("admin_purge_trash", { p_trash_id: dialog.row.trash_id }))}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "purgeAll" && (
          <ConfirmModal
            key="pa"
            danger
            title="Empty the recycle bin?"
            message={<>All {trash.length} record(s) in the recycle bin will be erased for good.</>}
            confirmLabel="Empty recycle bin"
            onConfirm={() => run("Recycle bin emptied.", supabase.rpc("admin_purge_trash", { p_trash_id: null }))}
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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

function AddUserForm({
  onCreate,
}: {
  onCreate: (v: { name: string; email: string; password: string; role: "inspector" | "operator" }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"inspector" | "operator">("inspector");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name, email, password, role });
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <UserPlus className="h-4 w-4 text-indigo-600" /> Add an inspector or operator
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className={input} placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={input}
          type="email"
          placeholder="Email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={input}
          type="text"
          placeholder="Password (min 8)"
          required
          minLength={8}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value as "inspector" | "operator")}>
          <option value="inspector">Inspector (verify + edit)</option>
          <option value="operator">Operator (data entry)</option>
        </select>
        <button
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add user
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="mt-3 text-xs text-slate-400">
        Share the email and password with the person; they can sign in straight away. Only you can add or remove users.
      </p>
    </form>
  );
}

function ResetPasswordModal({
  user,
  onSubmit,
  onClose,
}: {
  user: ManagedUser;
  onSubmit: (pw: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(pw);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Reset password" subtitle={`${user.full_name} (${user.email})`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          className={input}
          type="text"
          placeholder="New password (min 8 characters)"
          minLength={8}
          required
          autoFocus
          autoComplete="off"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </div>
      </form>
    </Modal>
  );
}
