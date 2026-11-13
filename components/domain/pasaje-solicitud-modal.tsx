"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, FileSpreadsheet, Plus, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchDownloads, type PasajeBatch } from "@/components/domain/pasaje-batches";
import { REQUEST_HEADER } from "@/lib/pasaje-export";
import { parseSolicitudSheet, type ResolvedRow, type SolicitudRow } from "@/lib/pasaje-solicitud";

type CreateResult = {
  batchId: string;
  created: number;
  skipped: { row: number; messages: string[] }[];
};

// Columnas de la grilla, en el orden de la solicitud: FECHA · SH · SKU VIEJO · DESCRIPCION · CANT (origen) y
// SH · SKU NUEVO · DESCRIPCION · CANT (destino).
const COLUMNS = [
  { label: "Fecha", width: "w-[88px]", placeholder: "dd/mm/aaaa" },
  { label: "SH origen", width: "w-[64px]", placeholder: "1258" },
  { label: "SKU viejo", width: "w-[96px]", placeholder: "DG99-3026" },
  { label: "Descripción origen", width: "", placeholder: "" },
  { label: "Cant.", width: "w-[56px]", placeholder: "" },
  { label: "SH destino", width: "w-[64px]", placeholder: "1955" },
  { label: "SKU nuevo", width: "w-[96px]", placeholder: "" },
  { label: "Descripción destino", width: "", placeholder: "" },
  { label: "Cant.", width: "w-[56px]", placeholder: "" },
];

type GridRow = string[];
const emptyRow = (): GridRow => COLUMNS.map(() => "");
const blankGrid = (n = 8) => Array.from({ length: n }, emptyRow);
const filled = (row: GridRow) => row.some((cell, index) => index > 0 && cell.trim());

function today() {
  const parts = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// Pega un bloque copiado de Excel desde la celda elegida.
function pasteInto(grid: GridRow[], text: string, startRow: number, startCol: number) {
  const next = grid.map((row) => [...row]);
  text.split(/\r?\n/).filter((line) => line.trim()).forEach((line, rowOffset) => {
    const rowIndex = startRow + rowOffset;
    while (next.length <= rowIndex) next.push(emptyRow());
    line.split("\t").forEach((value, colOffset) => {
      const col = startCol + colOffset;
      if (col < COLUMNS.length) next[rowIndex][col] = value.trim();
    });
  });
  return next;
}

// Carga de pasajes: se completa la grilla (o se sube el Excel de la solicitud), el servidor resuelve cada fila
// (shipper + código → cliente) y, al confirmar, crea el lote: cada pasaje egresa del origen, deja el ingreso
// pendiente en el destino y espera la aprobación de la encargada del origen.
export function PasajeSolicitudModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [grid, setGrid] = useState<GridRow[]>(() => blankGrid());
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [rows, setRows] = useState<SolicitudRow[]>([]);
  const [duplicateFile, setDuplicateFile] = useState<{ fileName: string | null; createdBy: string; createdAt: string } | null>(null);
  const [preview, setPreview] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [batch, setBatch] = useState<PasajeBatch | null>(null);

  function editCell(rowIndex: number, col: number, value: string) {
    setGrid((current) => current.map((row, index) => (index === rowIndex ? row.map((cell, c) => (c === col ? value : cell)) : row)));
    // Un cambio en la grilla deja de ser el archivo subido tal cual.
    setFileHash("");
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setPreview([]);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // Huella del archivo: el mismo Excel no se puede cargar dos veces.
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = parseSolicitudSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }));
      if (parsed.length === 0) throw new Error("La solicitud no tiene filas con códigos.");
      setGrid(parsed.map((row) => [
        formatDate(row.requestDate).replace("—", ""), row.fromShipper, row.fromClientCode, row.fromDescription, row.fromQuantity === null ? "" : String(row.fromQuantity),
        row.toShipper, row.toClientCode, row.toDescription, row.toQuantity === null ? "" : String(row.toQuantity),
      ]));
      setFileName(file.name);
      setFileHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    }
  }

  async function validate() {
    setError("");
    const used = grid.filter(filled).map((row) => (row[0].trim() ? row : [today(), ...row.slice(1)]));
    if (used.length === 0) return setError("Completá al menos una fila: shipper, SKU y cantidad del origen y del destino.");
    // La grilla se lee igual que el Excel de la solicitud, con su fila de títulos.
    const parsed = parseSolicitudSheet([REQUEST_HEADER, ...used], 0);
    setLoading(true);
    try {
      const response = await fetch("/api/pasajes/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed, fileHash: fileHash || undefined, preview: true }),
      });
      const data = (await response.json()) as { rows?: ResolvedRow[]; duplicateFile?: typeof duplicateFile; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo validar la carga.");
      setRows(parsed);
      setPreview(data.rows ?? []);
      setDuplicateFile(data.duplicateFile ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar la carga.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/pasajes/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName: fileHash ? fileName : "", fileHash: fileHash || undefined }),
      });
      const data = (await response.json()) as CreateResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudieron cargar los pasajes.");
      setResult(data);
      onCreated();
      const batches = await fetch("/api/pasajes/lotes", { cache: "no-store" }).then((res) => (res.ok ? res.json() : { batches: [] }));
      setBatch((batches.batches as PasajeBatch[]).find((item) => item.id === data.batchId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pasajes.");
    } finally {
      setLoading(false);
    }
  }

  const valid = preview.filter((row) => row.status === "ok" || row.status === "warning");
  const withErrors = preview.filter((row) => row.status === "error").length;
  const withWarnings = preview.filter((row) => row.status === "warning").length;
  const codeChanges = preview.filter((row) => row.status === "excluded").length;
  const editing = !result && preview.length === 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Pasajes</div>
        <h2 className="mt-2 text-xl font-black">Cargar pasajes</h2>
        <p className="mt-2 max-w-4xl text-xs text-[#62728a]">
          Completá la grilla, pegá desde Excel o subí la solicitud. El cliente sale del shipper (SH) y del código. Al cargarlos,
          cada pasaje egresa del origen, deja el ingreso pendiente en el destino y espera que lo apruebe la encargada del cliente
          origen. Después vas a poder bajar el Excel para mandarle a Urbano y la planilla para subir en Urbano.
        </p>

        {editing && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#9fb9da] bg-[#f6f9fd] px-3 py-2 text-xs font-bold text-[#16365f] hover:bg-[#edf4fc]">
                <FileSpreadsheet size={15} />
                {fileName ? `Cambiar archivo (${fileName})` : "Subir el Excel de la solicitud"}
                <input type="file" accept=".xls,.xlsx,.xlsm" className="sr-only" onChange={onFile} />
              </label>
              <span className="text-[10px] font-semibold text-[#8a99ad]">Sin fecha se toma la de hoy. Si una cantidad queda vacía se usa la otra.</span>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-[#e1e8f1]">
              <table className="w-full min-w-[1080px] table-fixed text-left text-[11px]">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-[#edf4fc] text-[10px] font-extrabold uppercase text-[#334b6b]">
                    <th colSpan={5} className="border-b border-r border-[#dbe4ef] px-2 py-1">Origen</th>
                    <th colSpan={4} className="border-b border-[#dbe4ef] px-2 py-1">Destino</th>
                  </tr>
                  <tr className="bg-[#f4f7fb] text-[10px] font-bold text-[#62728a]">
                    {COLUMNS.map((column, index) => (
                      <th key={index} className={`${column.width} px-2 py-1.5 ${index === 4 ? "border-r border-[#dbe4ef]" : ""}`}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f7]">
                  {grid.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, col) => (
                        <td key={col} className={`p-0.5 ${col === 4 ? "border-r border-[#dbe4ef]" : ""}`}>
                          <input
                            value={cell}
                            inputMode={col === 4 || col === 8 ? "numeric" : undefined}
                            placeholder={rowIndex === 0 ? COLUMNS[col].placeholder : ""}
                            onChange={(event) => editCell(rowIndex, col, event.target.value)}
                            onPaste={(event) => {
                              const text = event.clipboardData.getData("text");
                              if (!text.includes("\t") && !text.includes("\n")) return;
                              event.preventDefault();
                              setGrid((current) => pasteInto(current, text, rowIndex, col));
                              setFileHash("");
                            }}
                            className={`h-8 w-full rounded-md border border-transparent px-1.5 text-[11px] outline-none hover:border-[#dbe4ef] focus:border-[#7da4d3] focus:bg-white ${col === 4 || col === 8 ? "text-right" : ""}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setGrid((current) => [...current, ...blankGrid(5)])}>
                  <Plus size={13} /> 5 filas más
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => { setGrid(blankGrid()); setFileName(""); setFileHash(""); }}>
                  Limpiar
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button type="button" disabled={loading} onClick={() => void validate()}>
                  {loading ? "Revisando…" : "Revisar"}
                </Button>
              </div>
            </div>
          </>
        )}

        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}

        {result ? (
          <div className="mt-4 space-y-3 overflow-y-auto text-xs">
            <p className="rounded-xl bg-[#e7f7eb] px-4 py-3 font-bold text-[#23783a]">
              Se cargaron {result.created} pasajes. Ya egresaron del origen, el ingreso quedó pendiente en el destino y esperan la
              aprobación de la encargada del cliente origen.
            </p>
            {batch && (
              <div className="rounded-xl border border-[#e1e8f1] px-4 py-3">
                <div className="mb-2 font-bold text-[#10233f]">Excel para Urbano</div>
                <BatchDownloads batch={batch} />
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="rounded-xl bg-[#fce9e8] px-4 py-3 text-[#a43d39]">
                <div className="font-bold">No se cargaron {result.skipped.length} filas (con error o cambios de código del mismo cliente):</div>
                {result.skipped.map((item) => <div key={item.row}>Fila {item.row}: {item.messages.join(" ")}</div>)}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        ) : preview.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-bold">
              <span className="rounded-full bg-[#e7f7eb] px-3 py-1 text-[#23783a]">{valid.length - withWarnings} correctas</span>
              {withWarnings > 0 && <span className="rounded-full bg-[#fff0d9] px-3 py-1 text-[#985b00]">{withWarnings} con aviso</span>}
              {withErrors > 0 && <span className="rounded-full bg-[#fce9e8] px-3 py-1 text-[#a43d39]">{withErrors} con error (no se cargan)</span>}
              {codeChanges > 0 && <span className="rounded-full bg-[#eef1f5] px-3 py-1 text-[#52647d]">{codeChanges} cambios de código del mismo cliente (no se cargan acá)</span>}
              <span className="text-[#8a99ad]">Fecha de la solicitud: {formatDate(preview.find((row) => row.requestDate)?.requestDate ?? null)}</span>
            </div>
            {duplicateFile && (
              <div className="mt-3 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
                Este archivo ya se cargó{duplicateFile.fileName ? ` (${duplicateFile.fileName})` : ""}: lo cargó {duplicateFile.createdBy} el{" "}
                {new Date(duplicateFile.createdAt).toLocaleDateString("es-AR")}. Para cargar filas corregidas, subí un Excel solo con esas filas.
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-[#e1e8f1]">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-[#f4f7fb] text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Origen</th>
                    <th className="px-3 py-2">Destino</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f7]">
                  {preview.map((row) => (
                    <tr key={row.row} className={row.status === "error" ? "bg-[#fff8f8]" : row.status === "warning" ? "bg-[#fffaf1]" : row.status === "excluded" ? "bg-[#f6f7f9] text-[#8a99ad]" : "bg-white"}>
                      <td className="px-3 py-2 text-[#8a99ad]">{row.row}</td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-[#10233f]">{row.fromClient ?? "—"}</div>
                        <div className="text-[#62728a]">{row.fromClientCode} · SH {row.fromShipper || "—"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-[#10233f]">{row.toClient ?? "—"}</div>
                        <div className="text-[#62728a]">{row.toClientCode} · SH {row.toShipper || "—"}</div>
                      </td>
                      <td className="max-w-[260px] px-3 py-2 text-[#334b6b]">
                        <div className="truncate" title={row.fromDescription || row.toDescription}>{row.fromDescription || row.toDescription}</div>
                        <div className="text-[#8a99ad]">{row.uniqueCode ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{row.quantity ?? "—"}</td>
                      <td className="max-w-[340px] px-3 py-2">
                        <div className="flex items-start gap-1.5">
                          {row.status === "ok" && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#23783a]" />}
                          {row.status === "warning" && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#985b00]" />}
                          {row.status === "error" && <XCircle size={14} className="mt-0.5 shrink-0 text-[#a43d39]" />}
                          {row.status === "excluded" && <ArrowLeftRight size={14} className="mt-0.5 shrink-0 text-[#62728a]" />}
                          <span className={row.status === "error" ? "text-[#a43d39]" : row.status === "warning" ? "text-[#985b00]" : row.status === "excluded" ? "text-[#52647d]" : "text-[#23783a]"}>
                            {row.messages.length ? row.messages.join(" ") : "Correcta"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPreview([])}>Volver a editar</Button>
              <Button type="button" disabled={loading || valid.length === 0 || !!duplicateFile} onClick={() => void submit()}>
                Cargar {valid.length} {valid.length === 1 ? "pasaje" : "pasajes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
