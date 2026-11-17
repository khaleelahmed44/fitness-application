"use client";

import { useRouter } from "next/navigation";
import { LogOut, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NoAccess({ email }: { email: string }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 to-indigo-950 p-6">
      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100">
          <ShieldOff className="h-7 w-7 text-rose-600" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">No access</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          <b>{email}</b> is not authorised to use this system. Accounts are issued by the administrator —
          please contact them to be added.
        </p>
        <button
          onClick={signOut}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </main>
  );
}
