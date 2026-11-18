"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarDays, FolderArchive, FolderOpen } from "lucide-react";
import type { Vehicle } from "@/types/database";

interface Props {
  vehicles: Vehicle[];
  today: string;
  onOpen: (date: string) => void;
}

interface Folder {
  date: string;
  working: number;
  queue: number;
  verified: number;
  total: number;
}

const label = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

/** Date-wise archive: one folder per day. Today's folder is active; earlier days are archived. */
export default function DailyFiles({ vehicles, today, onOpen }: Props) {
  const folders = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const v of vehicles) {
      const f = map.get(v.date_of_entry) ?? { date: v.date_of_entry, working: 0, queue: 0, verified: 0, total: 0 };
      f.total += 1;
      if (v.status === "draft") f.working += 1;
      else if (v.status === "pending") f.queue += 1;
      else f.verified += 1;
      map.set(v.date_of_entry, f);
    }
    if (!map.has(today)) map.set(today, { date: today, working: 0, queue: 0, verified: 0, total: 0 });
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [vehicles, today]);

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <p className="mb-4 text-sm text-slate-500">
        Every entry is filed under the date it was logged. Open a day to see its working, in-queue and verified records.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((f, i) => {
          const active = f.date === today;
          const pct = f.total ? Math.round((f.verified / f.total) * 100) : 0;
          return (
            <motion.button
              key={f.date}
              type="button"
              onClick={() => onOpen(f.date)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              whileHover={{ y: -2 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl ${
                      active ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {active ? <FolderOpen className="h-5 w-5" /> : <FolderArchive className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="font-mono text-base font-bold text-slate-900">{f.date}</p>
                    <p className="text-xs text-slate-500">{label(f.date)}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {active ? "Active today" : "Archived"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 py-1.5">
                  <p className="text-base font-bold tabular-nums text-slate-800">{f.working}</p>
                  <p className="text-slate-500">Working</p>
                </div>
                <div className="rounded-lg bg-amber-50 py-1.5">
                  <p className="text-base font-bold tabular-nums text-amber-700">{f.queue}</p>
                  <p className="text-amber-700/80">In queue</p>
                </div>
                <div className="rounded-lg bg-emerald-50 py-1.5">
                  <p className="text-base font-bold tabular-nums text-emerald-700">{f.verified}</p>
                  <p className="text-emerald-700/80">Verified</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
                <CalendarDays className="h-3 w-3" /> {f.total} record{f.total === 1 ? "" : "s"} · {pct}% verified
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
