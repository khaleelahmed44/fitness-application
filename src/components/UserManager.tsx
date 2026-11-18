"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ManagedUser } from "@/types/database";
import ConfirmModal from "./ConfirmModal";
import Modal from "./Modal";

interface Props {
  /** admin adds inspectors; inspectors add their own assistants */
  viewerRole: "admin" | "inspector";
  flash: (kind: "ok" | "err", text: string) => void;
}

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never";

type Dialog = { kind: "remove"; user: ManagedUser } | { kind: "reset"; user: ManagedUser } | null;

const ROLE_LABEL: Record<string, string> = { admin: "Super admin", inspector: "Inspector", assistant: "Assistant" };

export default function UserManager({ viewerRole, flash }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const newRole = viewerRole === "admin" ? "inspector" : "assistant";
  const noun = newRole === "inspector" ? "inspector" : "assistant";

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_managed_users");
    if (error) flash("err", error.message);
    else setUsers((data ?? []) as ManagedUser[]);
    setLoading(false);
  }, [supabase, flash]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) throw new Error(error.message);
    flash("ok", label);
    await load();
  }

  return (
    <div className="space-y-5">
      <AddUserForm
        noun={noun}
        onCreate={(v) =>
          call(
            `${v.name} added as ${noun}. Share the username and password with them.`,
            supabase.rpc("create_user", {
              p_username: v.username,
              p_password: v.password,
              p_full_name: v.name,
              p_role: newRole,
            })
          )
        }
      />

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              {["Name", "Username", "Role", "Added by", "Entries", "Verified", "Last sign-in", "Actions"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No {noun}s yet. Add the first one above.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">{u.full_name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{u.username}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.role === "admin"
                        ? "bg-amber-100 text-amber-800"
                        : u.role === "inspector"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{u.created_by_name ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{u.entries}</td>
                <td className="px-4 py-2.5 tabular-nums">{u.verified}</td>
                <td className="px-4 py-2.5 text-slate-500">{fmt(u.last_sign_in_at)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDialog({ kind: "reset", user: u })}
                      title="Reset password"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {u.role !== "admin" && (
                      <button
                        onClick={() => setDialog({ kind: "remove", user: u })}
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

      <AnimatePresence>
        {dialog?.kind === "remove" && (
          <ConfirmModal
            key="rm"
            danger
            title={`Remove ${dialog.user.full_name}?`}
            message={
              <>
                <b>{dialog.user.username}</b> loses access immediately.
                {dialog.user.role === "inspector" && " Their assistants are removed too."} Entries and verifications
                they made stay in CFX.
              </>
            }
            confirmLabel="Remove"
            onConfirm={() => call(`${dialog.user.full_name} removed.`, supabase.rpc("remove_user", { p_id: dialog.user.id }))}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "reset" && (
          <ResetPasswordModal
            key="pw"
            user={dialog.user}
            onSubmit={(pw) =>
              call(`Password updated for ${dialog.user.full_name}.`, supabase.rpc("set_user_password", { p_id: dialog.user.id, p_password: pw }))
            }
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddUserForm({
  noun,
  onCreate,
}: {
  noun: string;
  onCreate: (v: { name: string; username: string; password: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name, username, password });
      setName("");
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold capitalize text-slate-900">
        <UserPlus className="h-4 w-4 text-indigo-600" /> Add a new {noun}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className={input} placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className={input}
          placeholder="Username (e.g. ali.raza)"
          required
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className={input}
          type="text"
          placeholder="Password (min 6)"
          required
          minLength={6}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add {noun}
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <p className="mt-3 text-xs text-slate-400">
        No email or OTP is needed: they sign in with this username and password straight away.
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
    <Modal title="Reset password" subtitle={`${user.full_name} (${user.username})`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          className={input}
          type="text"
          placeholder="New password (min 6 characters)"
          minLength={6}
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
