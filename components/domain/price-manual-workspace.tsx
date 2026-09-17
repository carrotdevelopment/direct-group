"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type PriceRecord = {
  id: string;
  supplier: string;
  uniqueCode: string;
  informedAt: string;
  costDg: number;
  vatRate: number;
  publicPrice: number;
  markup: number;
};

type DraftRow = {
  uniqueCode: string;
  informedAt: string;
  costDg: string;
  vatRate: string;
  publicPrice: string;
  markup: string;
};

const now = new Date();
const blankRow = (): DraftRow => ({
  uniqueCode: "",
  informedAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  costDg: "",
  vatRate: "",
  publicPrice: "",
  markup: "",
});

const inputClass =
  "h-8 w-full min-w-16 border-0 bg-transparent px-2 text-right text-[10px] outline-none focus:bg-[#edf4fc]";
const dateInputClass = `${inputClass} min-w-32 text-center`;

function parseDecimal(value: string) {
  const clean = value.trim().replace(/\s/g, "");
  if (!clean) return Number.NaN;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  return Number(normalized);
}

function formatDecimal(value: number, decimals: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function PriceManualWorkspace({ onPricesChanged }: { onPricesChanged?: () => void }) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    Array.from({ length: 6 }, blankRow),
  );
  const [loadStatus, setLoadStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [productCodes, setProductCodes] = useState<Set<string>>(new Set());
  const [productCodesLoaded, setProductCodesLoaded] = useState(false);
  const [touchedCodes, setTouchedCodes] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState({ uniqueCode: "", informedAt: "" });
  const [searchResults, setSearchResults] = useState<PriceRecord[]>([]);
  const [searchResult, setSearchResult] = useState<PriceRecord | null>(null);
  const [editDraft, setEditDraft] = useState<PriceRecord | null>(null);
  const [searchStatus, setSearchStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/lookups?kind=products")
      .then((response) => response.json())
      .then((data: { products?: Array<{ code: string }> }) => {
        if (!active) return;
        setProductCodes(
          new Set(
            (data.products ?? [])
              .map((product) => product.code.trim().toUpperCase())
              .filter(Boolean),
          ),
        );
        setProductCodesLoaded(true);
      })
      .catch(() => {
        if (active) setProductCodesLoaded(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filledRows = useMemo(
    () =>
      rows.filter((row) =>
        [
          row.uniqueCode,
          row.costDg,
          row.vatRate,
          row.publicPrice,
          row.markup,
        ].some((value) => Boolean(value.trim())),
      ),
    [rows],
  );

  const unknownCodes = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row, index }) =>
            touchedCodes.has(index) &&
            productCodesLoaded &&
            Boolean(row.uniqueCode.trim()) &&
            !productCodes.has(row.uniqueCode.trim().toUpperCase()),
        ),
    [productCodes, productCodesLoaded, rows, touchedCodes],
  );

  function updateRow(index: number, field: keyof DraftRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
    setLoadStatus(null);
  }

  async function loadPrices() {
    if (filledRows.length === 0) {
      setLoadStatus({ tone: "error", text: "Ingresá al menos un precio para cargar." });
      return;
    }
    if (productCodesLoaded) {
      const unknown = filledRows.find(
        (row) =>
          row.uniqueCode.trim() &&
          !productCodes.has(row.uniqueCode.trim().toUpperCase()),
      );
      if (unknown) {
        setLoadStatus({
          tone: "error",
          text: `El código único '${unknown.uniqueCode}' no existe en Productos.`,
        });
        return;
      }
    }
    for (const row of filledRows) {
      const missing = [
        [row.uniqueCode, "código único"],
        [row.informedAt, "fecha"],
        [row.costDg, "costo DG"],
        [row.vatRate, "IVA"],
        [row.publicPrice, "precio público"],
        [row.markup, "mark up"],
      ].filter(([value]) => !value.trim()).map(([, label]) => label);
      if (missing.length) {
        setLoadStatus({ tone: "error", text: `Para ${row.uniqueCode || "la fila incompleta"} falta: ${missing.join(", ")}.` });
        return;
      }
      if (!validDate(row.informedAt)) {
        setLoadStatus({ tone: "error", text: `La fecha de ${row.uniqueCode} no es válida.` });
        return;
      }
      const numericValues = [row.costDg, row.vatRate, row.publicPrice, row.markup].map(parseDecimal);
      if (numericValues.some((value) => !Number.isFinite(value))) {
        setLoadStatus({ tone: "error", text: `Los valores económicos de ${row.uniqueCode} deben ser números válidos.` });
        return;
      }
    }

    setSaving(true);
    setLoadStatus(null);
    try {
      const response = await fetch("/api/local-db/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: filledRows.map((row) => ({
            uniqueCode: row.uniqueCode.trim(),
            informedAt: row.informedAt,
            costDg: parseDecimal(row.costDg),
            vatRate: parseDecimal(row.vatRate),
            publicPrice: parseDecimal(row.publicPrice),
            markup: parseDecimal(row.markup),
          })),
        }),
      });
      const data = (await response.json()) as { message?: string; prices?: PriceRecord[] };
      if (!response.ok) throw new Error(data.message || "No se pudieron cargar los precios.");
      setRows(Array.from({ length: 6 }, blankRow));
      setTouchedCodes(new Set());
      setLoadStatus({ tone: "success", text: data.message || `${data.prices?.length ?? 0} precios cargados.` });
      onPricesChanged?.();
    } catch (error) {
      setLoadStatus({ tone: "error", text: error instanceof Error ? error.message : "No se pudieron cargar los precios." });
    } finally {
      setSaving(false);
    }
  }

  async function findPrice() {
    if (!search.uniqueCode.trim() && !search.informedAt.trim()) {
      setSearchStatus({ tone: "error", text: "Completá el código único, la fecha, o ambos." });
      return;
    }
    if (search.informedAt.trim() && !validDate(search.informedAt)) {
      setSearchStatus({ tone: "error", text: "La fecha ingresada no es válida." });
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setSearchResult(null);
    setEditDraft(null);
    try {
      const params = new URLSearchParams();
      if (search.uniqueCode.trim()) params.set("uniqueCode", search.uniqueCode.trim());
      if (search.informedAt.trim()) {
        const [year, month, day] = search.informedAt.split("-");
        params.set("day", day);
        params.set("month", month);
        params.set("year", year);
      }
      const response = await fetch(`/api/local-db/prices?${params}`);
      const data = (await response.json()) as { prices?: PriceRecord[] };
      const found = data.prices ?? [];
      if (!found.length) {
        setSearchStatus({ tone: "error", text: "No existen precios para esa búsqueda." });
        return;
      }
      if (found.length === 1) {
        setSearchResult(found[0]);
        setSearchStatus({ tone: "success", text: "Precio encontrado. Podés editarlo o eliminarlo." });
      } else {
        setSearchResults(found);
        setSearchStatus({ tone: "success", text: `${found.length} precios encontrados. Elegí uno para editarlo o eliminarlo.` });
      }
    } catch {
      setSearchStatus({ tone: "error", text: "No se pudo consultar la base de precios." });
    } finally {
      setSearching(false);
    }
  }

  function selectResult(record: PriceRecord) {
    setSearchResults([]);
    setSearchResult(record);
    setEditDraft(null);
  }

  function updateEdit(field: "costDg" | "vatRate" | "publicPrice" | "markup", value: string) {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, [field]: parseDecimal(value) });
  }

  async function saveEdit() {
    if (!editDraft) return;
    const values = [editDraft.costDg, editDraft.vatRate, editDraft.publicPrice, editDraft.markup];
    if (values.some((value) => !Number.isFinite(value))) {
      setSearchStatus({ tone: "error", text: "Completá todos los valores económicos con números válidos." });
      return;
    }
    const response = await fetch("/api/local-db/prices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: [editDraft] }),
    });
    if (!response.ok) {
      setSearchStatus({ tone: "error", text: "No se pudo editar el precio." });
      return;
    }
    setSearchResult(editDraft);
    setEditDraft(null);
    setSearchStatus({ tone: "success", text: "El precio se editó correctamente." });
    onPricesChanged?.();
  }

  async function deletePrice() {
    if (!searchResult || !window.confirm(`¿Eliminar el precio de ${searchResult.uniqueCode} del ${searchResult.informedAt}?`)) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/local-db/prices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [searchResult.id] }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo eliminar el precio.");
      setSearchResult(null);
      setEditDraft(null);
      setSearchStatus({ tone: "success", text: data.message || "El precio se eliminó correctamente." });
      onPricesChanged?.();
    } catch (error) {
      setSearchStatus({ tone: "error", text: error instanceof Error ? error.message : "No se pudo eliminar el precio." });
    } finally {
      setDeleting(false);
    }
  }

  const columns: Array<{ key: keyof DraftRow; label: string; className?: string }> = [
    { key: "uniqueCode", label: "Código único", className: "text-left font-mono" },
    { key: "informedAt", label: "Fecha (dd/mm/aaaa)" },
    { key: "costDg", label: "Costo DG" },
    { key: "vatRate", label: "IVA (%)" },
    { key: "publicPrice", label: "Precio público" },
    { key: "markup", label: "Mark up (%)" },
  ];

  const placeholders: Partial<Record<keyof DraftRow, string>> = {
    uniqueCode: "Ej. PROD-001",
    costDg: "Ej. 1.000,00",
    vatRate: "Ej. 21",
    publicPrice: "Ej. 1.512,50",
    markup: "Ej. 25",
  };

  const shown = editDraft ?? searchResult;
  const shownDate = shown?.informedAt.split("-") ?? [];

  return (
    <section className="card mb-5 overflow-hidden">
      <div className="grid xl:grid-cols-2">
        <div className="border-b border-[#dbe4ef] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4">
            <div className="eyebrow">Actualización de precios</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">Cargar precios nuevos</h2>
            <p className="mt-1 text-[10px] font-semibold text-[#62728a]">
              Podés usar coma o punto decimal. IVA y mark up se ingresan como porcentaje: 21 = 21%, 25 = 25%.
            </p>
          </div>
          <div className="overflow-auto p-4">
            <table className="w-full min-w-[650px] table-fixed text-[10px]">
              <thead><tr className="bg-[#123f78] text-white">{columns.map((column) => <th key={column.key} className="px-2 py-2 text-center font-bold">{column.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#e7edf4] border border-[#dbe4ef]">
                {rows.map((row, index) => {
                  const unknownCode = unknownCodes.some(
                    (item) => item.index === index,
                  );
                  return (
                  <tr key={index} className={unknownCode ? "bg-[#fff1f0]" : "bg-white hover:bg-[#f8fafd]"}>
                    {columns.map((column) => (
                      <td key={column.key} className={`border-r border-[#e7edf4] p-0 last:border-r-0 ${unknownCode && column.key === "uniqueCode" ? "bg-[#fff1f0]" : ""}`}>
                        <input
                          type={column.key === "informedAt" ? "date" : "text"}
                          lang="es-AR"
                          value={row[column.key]}
                          placeholder={placeholders[column.key]}
                          onChange={(event) => updateRow(index, column.key, event.target.value)}
                          onBlur={column.key === "uniqueCode" ? () => setTouchedCodes((current) => new Set(current).add(index)) : undefined}
                          inputMode={column.key === "uniqueCode" ? "text" : column.key === "informedAt" ? undefined : "decimal"}
                          title={column.key === "informedAt" ? "Formato: dd/mm/aaaa" : undefined}
                          className={`${column.key === "informedAt" ? dateInputClass : inputClass} ${column.className ?? ""} ${unknownCode && column.key === "uniqueCode" ? "font-bold text-[#b42318]" : ""}`}
                        />
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unknownCodes.length > 0 && (
            <div className="border-t border-[#f2c9c7] bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
              {unknownCodes.length === 1
                ? `El código único '${unknownCodes[0].row.uniqueCode}' no existe en Productos.`
                : `Los códigos ${unknownCodes.map(({ row }) => `'${row.uniqueCode}'`).join(", ")} no existen en Productos.`}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7edf4] bg-[#fafcff] px-4 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((current) => [...current, ...Array.from({ length: 3 }, blankRow)])}><Plus size={13} /> Agregar filas</Button>
            <Button type="button" size="sm" onClick={loadPrices} disabled={saving || unknownCodes.length > 0}>{saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />} Cargar</Button>
          </div>
          {loadStatus && <div className={`border-t px-4 py-3 text-xs font-bold ${loadStatus.tone === "success" ? "bg-[#e7f6ec] text-[#297a45]" : "bg-[#fce9e8] text-[#a43d39]"}`}>{loadStatus.text}</div>}
        </div>

        <div>
          <div className="border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4">
            <div className="eyebrow">Corrección de carga</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">Editar o eliminar precios</h2>
            <p className="mt-1 text-[10px] font-semibold text-[#62728a]">Buscá por código único, por fecha, o por ambos.</p>
          </div>
          <div className="grid items-center gap-2 border-b border-[#e7edf4] p-4 sm:grid-cols-[minmax(150px,1fr)_230px_auto]">
            <input value={search.uniqueCode} onChange={(event) => setSearch({ ...search, uniqueCode: event.target.value })} onKeyDown={(event) => event.key === "Enter" && findPrice()} placeholder="Código único (opcional si hay fecha)" className="h-9 rounded-xl border border-[#dbe4ef] px-3 font-mono text-xs outline-none focus:border-[#7da4d3]" />
            <input
              type="date"
              lang="es-AR"
              value={search.informedAt}
              onChange={(event) => setSearch({ ...search, informedAt: event.target.value })}
              aria-label="Fecha en formato día, mes y año"
              title="Fecha (dd/mm/aaaa)"
              className="h-9 w-full rounded-xl border border-[#dbe4ef] px-3 text-center text-xs outline-none focus:border-[#7da4d3]"
            />
            <Button type="button" size="sm" onClick={findPrice} disabled={searching} className="h-9">{searching ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />} Buscar</Button>
          </div>
          {searchStatus && <div className={`border-b px-4 py-3 text-xs font-bold ${searchStatus.tone === "success" ? "bg-[#e9f1fb] text-[#0b5bbb]" : "bg-[#fce9e8] text-[#a43d39]"}`}>{searchStatus.text}</div>}
          <div className="min-h-48 overflow-auto p-4">
            {searchResults.length > 0 ? (
              <table className="w-full min-w-[560px] text-[10px]">
                <thead><tr className="bg-[#123f78] text-white"><th className="px-2 py-2 text-left">Código único</th><th>Fecha (dd/mm/aaaa)</th><th>Costo DG</th><th>IVA (%)</th><th>Precio público</th><th>Mark up (%)</th></tr></thead>
                <tbody>
                  {searchResults.map((record) => {
                    const [year, month, day] = record.informedAt.split("-");
                    return (
                      <tr key={record.id} onClick={() => selectResult(record)} className="cursor-pointer border border-[#dbe4ef] hover:bg-[#edf4fc]">
                        <td className="px-2 py-2 font-mono font-bold">{record.uniqueCode}</td>
                        <td className="text-center">{day}/{month}/{year}</td>
                        {(["costDg", "vatRate", "publicPrice", "markup"] as const).map((field) => <td key={field} className="border-l border-[#e7edf4] px-2 py-2 text-right">{formatDecimal(record[field], field === "vatRate" ? 3 : 2)}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : shown ? (
              <table className="w-full min-w-[560px] text-[10px]">
                <thead><tr className="bg-[#123f78] text-white"><th className="px-2 py-2 text-left">Código único</th><th>Fecha (dd/mm/aaaa)</th><th>Costo DG</th><th>IVA (%)</th><th>Precio público</th><th>Mark up (%)</th></tr></thead>
                <tbody><tr className="border border-[#dbe4ef]">
                  <td className="px-2 py-2 font-mono font-bold">{shown.uniqueCode}</td>
                  <td className="text-center">{shownDate[2]}/{shownDate[1]}/{shownDate[0]}</td>
                  {(["costDg", "vatRate", "publicPrice", "markup"] as const).map((field) => <td key={field} className="border-l border-[#e7edf4] p-0">{editDraft ? <input defaultValue={formatDecimal(editDraft[field], field === "vatRate" ? 3 : 2)} onChange={(event) => updateEdit(field, event.target.value)} className={inputClass} /> : <div className="px-2 py-2 text-right">{formatDecimal(shown[field], field === "vatRate" ? 3 : 2)}</div>}</td>)}
                </tr></tbody>
              </table>
            ) : <div className="grid min-h-40 place-items-center text-xs font-semibold text-[#8a99ad]">Ingresá un código, una fecha, o ambos para buscar.</div>}
          </div>
          {searchResult && <div className="flex justify-end gap-2 border-t border-[#e7edf4] bg-[#fafcff] px-4 py-3">{editDraft ? <><Button type="button" variant="secondary" size="sm" onClick={() => setEditDraft(null)}><X size={13} /> Cancelar</Button><Button type="button" size="sm" onClick={saveEdit}><Save size={13} /> Guardar cambios</Button></> : <><Button type="button" variant="secondary" size="sm" onClick={() => setEditDraft({ ...searchResult })}><Pencil size={13} /> Editar</Button><Button type="button" variant="danger" size="sm" onClick={deletePrice} disabled={deleting}><Trash2 size={13} /> Borrar</Button></>}</div>}
        </div>
      </div>
    </section>
  );
}
