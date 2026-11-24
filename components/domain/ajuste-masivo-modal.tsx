"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readDraft, saveDraft } from "@/lib/browser-draft";
import { parseAjusteSheet, type AjustePreviewRow, type AjusteRow } from "@/lib/ajuste-masivo";

type Mapping = { client: string; clientCode: string; uniqueCode: string; active: boolean };
type GridRow = string[];

const COLUMNS = ["Código cliente", "Cantidad", "Motivo"];
const emptyRow = (): GridRow => ["", "", ""];
const blankGrid = () => Array.from({ length: 8 }, emptyRow);
const filled = (row: GridRow) => row.some((cell) => cell.trim());
const cellClass = "h-8 w-full rounded-md border border-transparent px-1.5 text-[11px] outline-none hover:border-[#dbe4ef] focus:border-[#7da4d3] focus:bg-white";
const fieldClass = "mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]";

// Varios ajustes de stock de un cliente juntos: se escriben, se pegan o se suben en Excel, se revisa cómo queda
// el stock y recién ahí se aplican todos.
export function AjusteMasivoModal({
  mappings,
  products,
  allowedClients,
  draftKey,
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
  products: { code: string; name: string }[];
  allowedClients: string[] | null;
  draftKey: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [saved] = useState(() => readDraft<{ client: string; reason: string; grid: GridRow[] }>(draftKey));
  const [client, setClient] = useState(saved?.client ?? "");
  const [reason, setReason] = useState(saved?.reason ?? "");
  const [grid, setGrid] = useState<GridRow[]>(() =>
    Array.isArray(saved?.grid) && saved.grid.length > 0 && saved.grid.every((row) => Array.isArray(row) && row.length === COLUMNS.length) ? saved.grid : blankGrid());
  const [preview, setPreview] = useState<AjustePreviewRow[]>([]);
  const [sent, setSent] = useState<AjusteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<number | null>(null);

  useEffect(() => {
    saveDraft(draftKey, created === null && grid.some(filled) ? { client, reason, grid } : null);
  }, [draftKey, client, reason, grid, created]);

  const clients = useMemo(() => {
    const allowed = allowedClients === null ? null : new Set(allowedClients.map((item) => item.trim().toLowerCase()));
    const names = new Map<string, string>();
    for (const mapping of mappings) {
      const key = mapping.client.trim().toLowerCase();
      if (mapping.active && key && (!allowed || allowed.has(key))) names.set(key, mapping.client.trim());
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [mappings, allowedClients]);

  const nameByCode = useMemo(() => {
    const productNames = new Map(products.map((product) => [product.code.toLowerCase(), product.name]));
    const result = new Map<string, { code: string; name: string }>();
    for (const mapping of mappings) {
      if (!mapping.active || mapping.client.trim().toLowerCase() !== client.trim().toLowerCase()) continue;
      const code = mapping.clientCode.trim();
      result.set(code.toLowerCase(), { code, name: productNames.get(mapping.uniqueCode.trim().toLowerCase()) ?? mapping.uniqueCode });
    }
    return result;
  }, [mappings, products, client]);

  function editCell(rowIndex: number, col: number, value: string) {
    setGrid((current) => current.map((row, index) => (index === rowIndex ? row.map((cell, c) => (c === col ? value : cell)) : row)));
  }

  function paste(text: string, startRow: number, startCol: number) {
    setGrid((current) => {
      const next = current.map((row) => [...row]);
      text.split(/\r?\n/).filter((line) => line.trim()).forEach((line, offset) => {
        while (next.length <= startRow + offset) next.push(emptyRow());
        line.split("\t").forEach((value, col) => {
          if (startCol + col < COLUMNS.length) next[startRow + offset][startCol + col] = value.trim();
        });
      });
      return next;
    });
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = parseAjusteSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }));
      if (rows.length === 0) throw new Error("El Excel no tiene filas con ajustes.");
      setGrid(rows.map((row) => [row.clientCode, row.quantity, row.reason]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([COLUMNS]);
    sheet["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(book, sheet, "Ajustes");
    XLSX.writeFile(book, "Plantilla ajustes.xlsx");
  }

  async function send(rows: AjusteRow[], isPreview: boolean) {
    const response = await fetch("/api/ajustes/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, rows, preview: isPreview }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "No se pudieron procesar los ajustes.");
    return data;
  }

  async function review() {
    setError("");
    if (!client) return setError("Elegí el cliente.");
    const rows = grid.flatMap((row, index) => (filled(row)
      ? [{ row: index + 1, clientCode: row[0].trim(), quantity: row[1].trim(), reason: row[2].trim() || reason.trim() }]
      : []));
    if (rows.length === 0) return setError("Completá al menos una fila.");
    setLoading(true);
    try {
      const data = await send(rows, true);
      setSent(rows);
      setPreview(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron revisar los ajustes.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!window.confirm(`¿Aplicar ${preview.length} ajustes al stock de ${client}?`)) return;
    setError("");
    setLoading(true);
    try {
      const data = await send(sent, false);
      setCreated(data.created);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los ajustes.");
    } finally {
      setLoading(false);
    }
  }

  const editing = created === null && preview.length === 0;
  const withErrors = preview.filter((row) => row.errors.length > 0).length;
  const added = preview.reduce((sum, row) => sum + Math.max(row.quantity, 0), 0);
  const removed = preview.reduce((sum, row) => sum + Math.max(-row.quantity, 0), 0);
  // Primero las que hay que corregir.
  const ordered = [...preview].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.row - b.row);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#5a6a82] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Ajustes</div>
        <h2 className="mt-2 text-xl font-black">Ajustes masivos de stock</h2>
        {created !== null && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#e6f5ec] px-4 py-3 text-xs font-bold text-[#1f7a45]">
            <CheckCircle2 size={16} /> Ajustes aplicados en {client}: {created}.
          </div>
        )}
        {editing && (
          <>
            <p className="mt-1 text-xs text-[#5a6a82]">
              Cantidad negativa resta stock y positiva suma. Se pueden pegar filas desde Excel. El motivo general se usa en las filas que no tengan uno propio.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Cliente
                <select value={client} onChange={(event) => setClient(event.target.value)} className={fieldClass}>
                  <option value="">Elegí un cliente</option>
                  {clients.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Motivo general
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Conteo de stock, rotura..." className={fieldClass} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#9fb9da] bg-[#f6f9fd] px-3 py-2 text-xs font-bold text-[#16365f] hover:bg-[#edf4fc]">
                <FileSpreadsheet size={15} /> Subir Excel
                <input type="file" accept=".xls,.xlsx,.xlsm" className="sr-only" onChange={onFile} />
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => void downloadTemplate()}>
                <Download size={14} /> Descargar plantilla
              </Button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-[#e1e8f1]">
              <table className="w-full min-w-[640px] table-fixed text-left text-[11px]">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                    <th className="w-[130px] px-2 py-2">Código cliente</th>
                    <th className="px-2 py-2">Producto</th>
                    <th className="w-[90px] px-2 py-2 text-right">Cantidad</th>
                    <th className="w-[200px] px-2 py-2">Motivo</th>
                    <th className="w-[40px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f7]">
                  {grid.map((row, rowIndex) => {
                    const known = nameByCode.get(row[0].trim().toLowerCase());
                    const input = (col: number) => (
                      <input
                        value={row[col]}
                        aria-label={`${COLUMNS[col]}, fila ${rowIndex + 1}`}
                        list={col === 0 ? "ajuste-codigos" : undefined}
                        placeholder={col === 1 && rowIndex === 0 ? "-5" : col === 2 ? reason : ""}
                        onChange={(event) => editCell(rowIndex, col, event.target.value)}
                        onPaste={(event) => {
                          const text = event.clipboardData.getData("text");
                          if (!text.includes("\t") && !text.includes("\n")) return;
                          event.preventDefault();
                          paste(text, rowIndex, col);
                        }}
                        className={`${cellClass} ${col === 1 ? "text-right" : ""}`}
                      />
                    );
                    return (
                      <tr key={rowIndex}>
                        <td className="p-0.5">{input(0)}</td>
                        <td className={`truncate px-2 ${known ? "text-[#5a6a82]" : "font-bold text-[#a43d39]"}`}>
                          {known?.name ?? (row[0].trim() && client ? `No está activo en ${client}` : "")}
                        </td>
                        <td className="p-0.5">{input(1)}</td>
                        <td className="p-0.5">{input(2)}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            aria-label={`Quitar fila ${rowIndex + 1}`}
                            className="rounded p-1 text-[#5a6a82] hover:bg-[#f0f2f0]"
                            onClick={() => setGrid((current) => (current.length > 1 ? current.filter((_, index) => index !== rowIndex) : [emptyRow()]))}
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="ajuste-codigos">
              {[...nameByCode.values()].map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </datalist>
          </>
        )}
        {created === null && preview.length > 0 && (
          <>
            <p className="mt-1 text-xs font-bold text-[#334b6b]">
              {client} · Filas: {preview.length} · Suman {added} · Restan {removed}
            </p>
            {withErrors > 0 && (
              <div className="mt-3 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
                Filas con errores: {withErrors}. Volvé a editar para corregirlas; no se aplica ninguna hasta que estén todas bien.
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-[#e1e8f1]">
              <table className="w-full min-w-[760px] text-left text-[11px]">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2 text-right">Stock hoy</th>
                    <th className="px-3 py-2 text-right">Ajuste</th>
                    <th className="px-3 py-2 text-right">Queda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f7]">
                  {ordered.map((row) => (
                    <tr key={row.row} className={row.errors.length ? "bg-[#fdf3f2]" : row.warnings.length ? "bg-[#fff9ec]" : ""}>
                      <td className="px-3 py-2">{row.row}</td>
                      <td className="px-3 py-2 font-bold text-[#10233f]">{row.clientCode}</td>
                      <td className="px-3 py-2">
                        {row.product || row.uniqueCode}
                        {row.errors.length > 0 && <div className="font-bold text-[#a43d39]">{row.errors.join(" ")}</div>}
                        {row.warnings.length > 0 && <div className="font-bold text-[#985b00]">{row.warnings.join(" ")}</div>}
                      </td>
                      <td className="px-3 py-2">{row.reason}</td>
                      <td className="px-3 py-2 text-right">{row.stock ?? ""}</td>
                      <td className="px-3 py-2 text-right font-bold">{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</td>
                      <td className="px-3 py-2 text-right font-bold">{row.result ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            {editing && (
              <>
                <Button type="button" variant="secondary" onClick={() => setGrid((current) => [...current, ...blankGrid()])}>
                  <Plus size={14} /> Agregar filas
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setGrid(blankGrid()); setReason(""); setError(""); }}>
                  Vaciar
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {created !== null && <Button type="button" onClick={onClose}>Cerrar</Button>}
            {editing && (
              <>
                <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button type="button" disabled={loading} onClick={() => void review()}>{loading ? "Revisando..." : "Revisar"}</Button>
              </>
            )}
            {created === null && preview.length > 0 && (
              <>
                <Button type="button" variant="secondary" disabled={loading} onClick={() => { setPreview([]); setError(""); }}>Volver a editar</Button>
                <Button type="button" disabled={loading || withErrors > 0} onClick={() => void submit()}>
                  {loading ? "Aplicando..." : `Aplicar ${preview.length} ${preview.length === 1 ? "ajuste" : "ajustes"}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
