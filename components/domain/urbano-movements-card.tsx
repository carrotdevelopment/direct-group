"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

type Movement = { id: string; type: string; date: string; voucher: string | null; clientCode: string; product: string; client: string | null; inQuantity: number; outQuantity: number };
type MovementList = { total: number; types: string[]; items: Movement[] };

const TYPE_LABELS: Record<string, string> = { PICKING: "Picking", RECEPCION: "Recepción", AJUSTE: "Ajuste", TRANSFERENCIA: "Transferencia" };
const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
const fmt = (value: number) => (value ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value) : "—");
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

// Movimientos de depósito que informa la API de Urbano. Las transferencias son traslados internos: una fila
// de salida y otra de entrada del mismo código.
export function UrbanoMovementsCard() {
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<MovementList | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/stock/urbano?movements=1${type ? `&type=${encodeURIComponent(type)}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as MovementList & { message?: string };
        if (!response.ok) throw new Error(body.message || "No se pudieron leer los movimientos.");
        setData(body);
        setError("");
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudieron leer los movimientos.");
      });
    return () => controller.abort();
  }, [type]);

  const items = data?.items;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items ?? [];
    return (items ?? []).filter((item) => [item.clientCode, item.product, item.client ?? "", item.voucher ?? ""].some((value) => value.toLowerCase().includes(term)));
  }, [items, search]);

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-3">
        <div className="text-xs font-black text-[#10233f]">
          Movimientos de Urbano
          {data && data.total > data.items.length && <span className="ml-2 font-bold text-[#8a99ad]">últimos {data.items.length} de {data.total}</span>}
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Tipo de movimiento"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-8 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs outline-none focus:border-[#0b5bbb]"
          >
            <option value="">Todos los tipos</option>
            {(data?.types ?? []).map((option) => <option key={option} value={option}>{typeLabel(option)}</option>)}
          </select>
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#7b8da6]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar código, producto o cliente"
              className="h-8 w-60 rounded-lg border border-[#dbe4ef] bg-white pl-7 pr-2 text-xs outline-none focus:border-[#0b5bbb]"
            />
          </div>
        </div>
      </div>
      {error && <div className="m-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[#f4f7fb] text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Comprobante</th>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2 text-right">Entrada</th>
              <th className="px-4 py-2 text-right">Salida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7]">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center font-bold text-[#8a99ad]">{data?.items.length ? "Sin resultados." : "Sin movimientos."}</td>
              </tr>
            ) : visible.map((item) => (
              <tr key={item.id} className="bg-white">
                <td className="whitespace-nowrap px-4 py-2 text-[#62728a]">{dateTime(item.date)}</td>
                <td className="px-4 py-2 font-bold text-[#334b6b]">{typeLabel(item.type)}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[#62728a]">{item.voucher ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono font-bold text-[#10233f]">{item.clientCode}</td>
                <td className="max-w-[320px] px-4 py-2 text-[#334b6b]"><div className="truncate" title={item.product}>{item.product}</div></td>
                <td className="px-4 py-2 text-[#334b6b]">{item.client ?? <span className="text-[#985b00]">Sin código cliente</span>}</td>
                <td className="px-4 py-2 text-right font-bold tabular-nums text-[#23783a]">{fmt(item.inQuantity)}</td>
                <td className="px-4 py-2 text-right font-bold tabular-nums text-[#a43d39]">{fmt(item.outQuantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
