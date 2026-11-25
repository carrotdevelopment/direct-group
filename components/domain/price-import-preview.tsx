"use client";

import { useState } from "react";
import { ChevronDown, LoaderCircle, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PricePreviewRow } from "@/lib/price-importer";
import type { SupplierListRow } from "@/lib/supplier-price-list";

type EditableField = "costDg" | "vatRate" | "publicPrice";

const money = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const shortDate = (value: string) => value.split("-").reverse().join("/");
const inputClass =
  "h-7 w-full min-w-24 rounded-md border border-[#b9cce3] bg-white px-2 text-right text-[11px] outline-none focus:border-[#0b5bbb]";

export function samePrice(row: Pick<PricePreviewRow, EditableField>, other: Pick<PricePreviewRow, EditableField>) {
  return Math.abs(row.costDg - other.costDg) < 0.011 && Math.abs(row.publicPrice - other.publicPrice) < 0.011 && Math.abs(row.vatRate - other.vatRate) < 0.0011;
}

// Qué filas quedan marcadas al procesar: todas menos las que ya están iguales y las que hay que confirmar.
export function initialSelection(rows: PricePreviewRow[]) {
  return new Set(rows.filter((row) => !row.needsReview && !(row.existing && samePrice(row, row.existing))).map((row) => row.id));
}

function RowStatus({ row }: { row: PricePreviewRow }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {row.needsReview && <Badge tone="warning">Código parecido</Badge>}
      {row.existing
        ? samePrice(row, row.existing) ? <Badge tone="neutral">Ya cargado igual</Badge> : <Badge tone="warning">Reemplaza</Badge>
        : <Badge tone="success">Nuevo</Badge>}
    </div>
  );
}

// Valor contra el que se compara: el ya cargado para esa fecha o, si no hay, el último anterior.
function Before({ row, field }: { row: PricePreviewRow; field: EditableField }) {
  const base = row.existing ?? row.previous;
  if (!base) return <div className="mt-0.5 text-[#5a6a82]">sin precio previo</div>;
  const before = base[field];
  const title = `${row.existing ? "Ya cargado con fecha" : "Último precio:"} ${shortDate(base.informedAt)}`;
  if (field === "vatRate") {
    if (Math.abs(before - row.vatRate) < 0.0011) return null;
    return <div className="mt-0.5 font-bold text-[#8a6417]" title={title}>antes {decimal.format(before)}</div>;
  }
  if (Math.abs(before - row[field]) < 0.011) return <div className="mt-0.5 text-[#5a6a82]" title={title}>sin cambios</div>;
  const change = before > 0 ? ((row[field] - before) / before) * 100 : null;
  return (
    <div className={`mt-0.5 whitespace-nowrap ${change !== null && Math.abs(change) > 30 ? "font-bold text-[#a43d39]" : "text-[#5a6a82]"}`} title={title}>
      antes {money.format(before)}
      {change !== null && ` (${change > 0 ? "+" : ""}${decimal.format(change)}%)`}
    </div>
  );
}

export function PriceImportPreviewTable({
  rows,
  unmatched,
  selected,
  saving,
  onSelect,
  onEdit,
  onConfirm,
}: {
  rows: PricePreviewRow[];
  unmatched: SupplierListRow[];
  selected: Set<string>;
  saving: boolean;
  onSelect: (selected: Set<string>) => void;
  onEdit: (id: string, field: EditableField, value: number) => void;
  onConfirm: () => void;
}) {
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const replaced = rows.filter((row) => selected.has(row.id) && row.existing).length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    onSelect(next);
  }

  return (
    <>
      {rows.length > 0 && (
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-[11px]">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-[#dbe4ef] bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Marcar todas las filas"
                    checked={selected.size === rows.length}
                    onChange={(event) => onSelect(new Set(event.target.checked ? rows.map((row) => row.id) : []))}
                  />
                </th>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Código en el archivo</th>
                <th className="px-2 py-2 text-center">Fecha</th>
                <th className="px-2 py-2 text-right">Costo DG</th>
                <th className="px-2 py-2 text-right">IVA %</th>
                <th className="px-2 py-2 text-right">Precio público</th>
                <th className="px-2 py-2 text-right">Markup %</th>
                <th className="px-2 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4]">
              {rows.map((row) => (
                <tr key={row.id} className={`align-top hover:bg-[#f8fafd] ${selected.has(row.id) ? "" : "opacity-60"}`}>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="mt-1.5" aria-label={`Cargar ${row.uniqueCode}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-mono font-bold text-[#10233f]">{row.uniqueCode}</div>
                    <div className="max-w-[260px] truncate text-[#5a6a82]" title={row.productName}>{row.productName}</div>
                  </td>
                  <td className={`px-2 py-2 font-mono ${row.needsReview ? "font-bold text-[#8a6417]" : "text-[#425979]"}`}>{row.sourceCode}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-center text-[#425979]">{shortDate(row.informedAt)}</td>
                  {(["costDg", "vatRate", "publicPrice"] as const).map((field) => (
                    <td key={field} className="px-2 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={Number.isNaN(row[field]) ? "" : row[field]}
                        aria-label={`${field === "costDg" ? "Costo DG" : field === "vatRate" ? "IVA" : "Precio público"} de ${row.uniqueCode}`}
                        onChange={(event) => onEdit(row.id, field, event.target.valueAsNumber)}
                        className={field === "vatRate" ? inputClass.replace("min-w-24", "min-w-14") : inputClass}
                      />
                      <Before row={row} field={field} />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-bold leading-7 text-[#425979]">{decimal.format(row.markup)}</td>
                  <td className="px-2 py-2"><RowStatus row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="border-t border-[#e7edf4] px-5 py-3 text-[11px]">
          <button type="button" aria-expanded={unmatchedOpen} onClick={() => setUnmatchedOpen((open) => !open)} className="flex items-center gap-2 text-left font-bold text-[#334b6b]">
            <ChevronDown size={14} className={`transition ${unmatchedOpen ? "" : "-rotate-90"}`} />
            {unmatched.length} {unmatched.length === 1 ? "código del archivo no está" : "códigos del archivo no están"} en Productos (no se cargan)
          </button>
          {unmatchedOpen && (
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-[#dbe4ef]">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-[#dbe4ef] bg-[#f8fafd] font-bold text-[#334b6b]">
                    <th className="px-3 py-1.5">Código</th>
                    <th className="px-2 py-1.5">Descripción</th>
                    <th className="px-2 py-1.5 text-right">Costo DG</th>
                    <th className="px-2 py-1.5 text-right">IVA %</th>
                    <th className="px-3 py-1.5 text-right">Precio público</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7edf4]">
                  {unmatched.map((row) => (
                    <tr key={row.sourceCode}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono font-bold text-[#10233f]">{row.sourceCode}</td>
                      <td className="px-2 py-1.5 text-[#425979]">{row.description}</td>
                      <td className="px-2 py-1.5 text-right">{money.format(row.costDg)}</td>
                      <td className="px-2 py-1.5 text-right">{decimal.format(row.vatRate)}</td>
                      <td className="px-3 py-1.5 text-right">{money.format(row.publicPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {unmatchedOpen && <p className="mt-2 text-[#5a6a82]">Si alguno se vende, dalo de alta en Productos con ese código y volvé a procesar el archivo.</p>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#e7edf4] bg-[#f8fafd] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] font-semibold text-[#5a6a82]">
            {selected.size} de {rows.length} marcados para cargar
            {replaced > 0 && ` · ${replaced} ${replaced === 1 ? "reemplaza un precio ya cargado" : "reemplazan precios ya cargados"} en esa fecha`}.
            {" "}Los que están igual y los de código parecido arrancan sin marcar.
          </div>
          <Button type="button" onClick={onConfirm} disabled={saving || selected.size === 0}>
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            {selected.size === 1 ? "Cargar 1 precio" : `Cargar ${selected.size} precios`}
          </Button>
        </div>
      )}
    </>
  );
}
