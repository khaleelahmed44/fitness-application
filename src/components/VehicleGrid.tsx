"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { Vehicle } from "@/types/database";

interface Props {
  data: Vehicle[];
  columns: ColumnDef<Vehicle, any>[];
  emptyText: string;
}

/** Excel-style grid: row numbers, gridlines, sticky header, sortable columns, search. */
export default function VehicleGrid({ data, columns, emptyText }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b bg-gray-50 px-3 py-2">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search plate, chassis, engine, certificate…"
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <span className="shrink-0 text-xs text-gray-500">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-100">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="w-10 border border-gray-300 bg-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-500">
                  #
                </th>
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                      className={`whitespace-nowrap border border-gray-300 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 ${
                        sortable ? "cursor-pointer select-none hover:bg-gray-200" : ""
                      }`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="border border-gray-200 px-3 py-10 text-center text-gray-500"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-blue-50">
                  <td className="border border-gray-300 bg-gray-100 px-2 py-1.5 text-center text-xs text-gray-500">
                    {i + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border border-gray-300 px-3 py-1.5 align-middle"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
