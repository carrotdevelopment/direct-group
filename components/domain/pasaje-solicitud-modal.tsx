"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, FileSpreadsheet, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseSolicitudSheet, type ResolvedRow, type SolicitudRow } from "@/lib/pasaje-solicitud";

type CreateResult = {
  created: number;
  skipped: { row: number; messages: string[] }[];
  notifications: { sent: { to: string; pasajes: number }[]; failed: { to: string; error: string }[]; withoutRecipient: string[] };
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// Carga de la solicitud de pasaje de stock a Urbano: se lee el Excel en el navegador, el servidor
// resuelve cada fila (shipper + código → cliente) y, al confirmar, crea el lote con las filas válidas.
export function PasajeSolicitudModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SolicitudRow[]>([]);
  const [fileHash, setFileHash] = useState("");
  const [duplicateFile, setDuplicateFile] = useState<{ fileName: string | null; createdBy: string; createdAt: string } | null>(null);
  const [preview, setPreview] = useState<ResolvedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setPreview([]);
    setResult(null);
    setDuplicateFile(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // Huella del archivo: el mismo Excel no se puede cargar dos veces.
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      setFileHash(hash);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const firstRow = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s.r + 1;
      const parsed = parseSolicitudSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }), firstRow);
      if (parsed.length === 0) throw new Error("La solicitud no tiene filas con códigos.");
      setRows(parsed);
      const response = await fetch("/api/pasajes/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed, fileHash: hash, preview: true }),
      });
      const data = (await response.json()) as { rows?: ResolvedRow[]; duplicateFile?: typeof duplicateFile; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo validar la solicitud.");
      setPreview(data.rows ?? []);
      setDuplicateFile(data.duplicateFile ?? null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/pasajes/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName, fileHash }),
      });
      const data = (await response.json()) as CreateResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo cargar la solicitud.");
      setResult(data);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  const valid = preview.filter((row) => row.status === "ok" || row.status === "warning");
  const withErrors = preview.filter((row) => row.status === "error").length;
  const withWarnings = preview.filter((row) => row.status === "warning").length;
  const codeChanges = preview.filter((row) => row.status === "excluded").length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Pasajes</div>
        <h2 className="mt-2 text-xl font-black">Cargar solicitud de pasaje de stock a Urbano</h2>
        <p className="mt-2 max-w-3xl text-xs text-[#62728a]">
          Subí el Excel de la solicitud. El cliente sale del shipper (SH) y del código: si el código es de otro cliente
          que el del shipper, se usa el del código y la fila queda con aviso. Cada pasaje lo aprueba quien tiene asignado
          el cliente destino (le llega un correo), y después se confirma la cantidad que realmente pasó Urbano.
        </p>

        {!result && (
          <label className="mt-4 inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#9fb9da] bg-[#f6f9fd] px-4 py-3 text-xs font-bold text-[#16365f] hover:bg-[#edf4fc]">
            <FileSpreadsheet size={16} />
            {fileName ? `Cambiar archivo (${fileName})` : "Elegir el Excel de la solicitud"}
            <input type="file" accept=".xls,.xlsx,.xlsm" className="sr-only" onChange={onFile} />
          </label>
        )}

        {loading && <p className="mt-4 text-xs font-semibold text-[#8a99ad]">Procesando…</p>}
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}

        {result ? (
          <div className="mt-4 space-y-3 overflow-y-auto text-xs">
            <p className="rounded-xl bg-[#e7f7eb] px-4 py-3 font-bold text-[#23783a]">
              Se cargaron {result.created} pasajes. Quedaron pendientes de aprobación del cliente destino.
            </p>
            {result.notifications.sent.length > 0 && (
              <p className="text-[#334b6b]">
                Avisos enviados por correo: {result.notifications.sent.map((item) => `${item.to} (${item.pasajes})`).join(", ")}.
              </p>
            )}
            {result.notifications.failed.length > 0 && (
              <p className="rounded-xl bg-[#fff0d9] px-4 py-3 font-bold text-[#985b00]">
                No se pudo avisar a: {result.notifications.failed.map((item) => `${item.to} (${item.error})`).join("; ")}. Los pasajes igual quedaron cargados.
              </p>
            )}
            {result.notifications.withoutRecipient.length > 0 && (
              <p className="text-[#985b00]">Sin nadie a quien avisar para: {result.notifications.withoutRecipient.join(", ")}.</p>
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
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="button" disabled={loading || valid.length === 0 || !!duplicateFile} onClick={() => void submit()}>
                Cargar {valid.length} {valid.length === 1 ? "pasaje" : "pasajes"} y avisar a los destinos
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
