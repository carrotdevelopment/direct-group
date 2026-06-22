"use client";

import { useMemo, useState } from "react";
import { Download, Filter, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type DataRow = {
  id: string;
  primary: string;
  secondary: string;
  values: Array<string | React.ReactNode>;
  status: { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" };
};

export function DataList({
  columns, rows, searchPlaceholder = "Buscar...",
}: {
  columns: string[]; rows: DataRow[]; searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => rows.filter((row) => `${row.primary} ${row.secondary} ${row.values.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, rows]);

  return (
    <section className="card animate-enter overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e8ebe8] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[340px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#939b95]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-full rounded-xl border border-[#dfe4df] bg-[#fafbfa] pl-10 pr-4 text-xs outline-none focus:border-[#98b7a3] focus:ring-3 focus:ring-[#e2ede6]" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm"><Filter size={14} /> Filtros</Button>
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex"><SlidersHorizontal size={14} /> Columnas</Button>
          <Button variant="secondary" size="sm"><Download size={14} /> Exportar</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left">
          <thead><tr className="border-b border-[#e9ece9] bg-[#fafbfa] text-[9px] font-black uppercase tracking-[.11em] text-[#929a94]"><th className="px-5 py-3.5">{columns[0]}</th>{columns.slice(1).map((column) => <th key={column} className="px-4 py-3.5">{column}</th>)}<th className="px-4 py-3.5">Estado</th><th className="w-12 px-4 py-3.5" /></tr></thead>
          <tbody className="divide-y divide-[#edf0ed]">
            {filtered.map((row) => (
              <tr key={row.id} className="group text-xs transition hover:bg-[#fafbfa]">
                <td className="px-5 py-4"><div className="font-extrabold text-[#273129]">{row.primary}</div><div className="mt-1 font-mono text-[10px] text-[#909892]">{row.secondary}</div></td>
                {row.values.map((value, index) => <td key={index} className="px-4 py-4 font-semibold text-[#5e6961]">{value}</td>)}
                <td className="px-4 py-4"><Badge tone={row.status.tone} dot>{row.status.label}</Badge></td>
                <td className="px-4 py-4"><button aria-label={`Acciones para ${row.primary}`} className="grid h-8 w-8 place-items-center rounded-lg text-[#929a94] hover:bg-[#edf0ed] hover:text-[#273129]"><MoreHorizontal size={16} /></button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={columns.length + 2} className="px-6 py-16 text-center text-sm text-[#7e8780]">No encontramos resultados para “{query}”.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-[#e9ece9] bg-[#fafbfa] px-5 py-3 text-[10px] font-semibold text-[#7e8780]"><span>Mostrando {filtered.length} de {rows.length} registros</span><span>Página 1 de 1</span></div>
    </section>
  );
}
