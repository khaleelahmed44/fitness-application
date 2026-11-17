"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { History } from "lucide-react";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Past values, most-used first */
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  uppercase?: boolean;
}

/**
 * Text input with type-ahead history: a dropdown that filters as you type and a
 * row of one-click "recent" chips beneath it.
 */
export default function SuggestInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  maxLength = 50,
  autoFocus,
  uppercase,
}: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim().toLowerCase();
  const matches = useMemo(
    () =>
      suggestions
        .filter((s) => s.toLowerCase() !== q && (q === "" || s.toLowerCase().includes(q)))
        .slice(0, 8),
    [suggestions, q]
  );
  const chips = useMemo(
    () => suggestions.filter((s) => s.toLowerCase() !== q).slice(0, 5),
    [suggestions, q]
  );

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${
          uppercase ? "uppercase" : ""
        }`}
      />

      <AnimatePresence>
        {open && matches.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {matches.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-3.5 py-2 text-sm ${
                  i === active ? "bg-indigo-50 text-indigo-700" : "text-slate-700"
                }`}
              >
                <History className="h-3.5 w-3.5 text-slate-400" />
                {s}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
