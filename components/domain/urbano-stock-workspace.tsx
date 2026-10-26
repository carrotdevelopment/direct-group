"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, FileSpreadsheet, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { parseUrbanoStockSheet, reportDateFromFileName, type ResolvedUrbanoStockRow, type UrbanoStockRow } from "@/lib/urbano-stock";

type Load = { id: string; fileName: string | null; reportDate: string; source: string; createdBy: string; createdAt: string; rowCount: number; totalQuantity: number };
type LoadItem = { clientCode: string; product: string; quantity: number; unavailable: number; pendingPickup: number; client: string | null; uniqueCode: string | null };
type PreviousLoad = { fileName: string | null; reportDate: string; createdBy: string; createdAt: string };

const fmt = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);

function formatDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function UrbanoStockWorkspace({ canWrite }: { canWrite: boolean }) {
  const [loads, setLoads] = useState<Load[]>([]);
  const [portalConfigured, setPortalConfigured] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [items, setItems] = useState<LoadItem[]>([]);
  const [search, setSearch] = useState("");
  const [onlyWithStock, setOnlyWithStock] = useState(false);

  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [rows, setRows] = useState<UrbanoStockRow[]>([]);
  const [preview, setPreview] = useState<ResolvedUrbanoStockRow[]>([]);
  const [duplicateFile, setDuplicateFile] = useState<PreviousLoad | null>(null);
  const [sameDate, setSameDate] = useState<PreviousLoad | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/stock/urbano");
    const data = (await response.json()) as { loads?: Load[]; portalConfigured?: boolean; message?: string };
    if (!response.ok) throw new Error(data.message || "No se pudieron leer las cargas.");
    setLoads(data.loads ?? []);
    setPortalConfigured(!!data.portalConfigured);
    setSelected((current) => (current && data.loads?.some((load) => load.id === current) ? current : data.loads?.[0]?.id ?? ""));
  }, []);

  useEffect(() => {
    // The async loader owns the state transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory().catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudieron leer las cargas."));
  }, [loadHistory]);

  useEffect(() => {
    if (!selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/stock/urbano?load=${selected}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ items?: LoadItem[] }>)
      .then((data) => setItems(data.items ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected]);

  async function requestPreview(parsed: UrbanoStockRow[], hash: string, date: string) {
    const response = await fetch("/api/stock/urbano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed, fileHash: hash, reportDate: date, preview: true }),
    });
    const data = (await response.json()) as { rows?: ResolvedUrbanoStockRow[]; duplicateFile?: PreviousLoad | null; sameDate?: PreviousLoad | null; message?: string };
    if (!response.ok) throw new Error(data.message || "No se pudo validar el reporte.");
    setPreview(data.rows ?? []);
    setDuplicateFile(data.duplicateFile ?? null);
    setSameDate(data.sameDate ?? null);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    setPreview([]);
    setFileName(file.name);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // Huella del archivo: el mismo reporte no se puede cargar dos veces.
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const firstRow = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s.r + 1;
      const parsed = parseUrbanoStockSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }), firstRow);
      if (parsed.length === 0) throw new Error("El reporte no tiene filas con códigos.");
      const date = reportDateFromFileName(file.name) ?? todayIso();
      setFileHash(hash);
      setRows(parsed);
      setReportDate(date);
      await requestPreview(parsed, hash, date);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function changeDate(date: string) {
    setReportDate(date);
    if (!rows.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    try {
      await requestPreview(rows, fileHash, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el reporte.");
    }
  }

  function clearUpload() {
    setRows([]);
    setPreview([]);
    setFileName("");
    setFileHash("");
    setDuplicateFile(null);
    setSameDate(null);
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/stock/urbano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, fileName, fileHash, reportDate }),
      });
      const data = (await response.json()) as { id?: string; saved?: number; replaced?: number; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo guardar la carga.");
      setNotice(
        `Se guardó el stock de Urbano del ${formatDate(reportDate)}: ${data.saved} códigos.` +
          (data.replaced ? " Reemplazó la carga anterior de esa fecha." : ""),
      );
      clearUpload();
      setSelected(data.id ?? "");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la carga.");
    } finally {
      setBusy(false);
    }
  }

  async function syncFromPortal() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/stock/urbano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal: true }),
      });
      const data = (await response.json()) as { id?: string; saved?: number; replaced?: number; totalQuantity?: number; withoutClient?: number; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo traer el stock del portal de Urbano.");
      setNotice(
        `Se trajo el stock del portal de Urbano: ${data.saved} códigos, ${fmt(data.totalQuantity ?? 0)} unidades.` +
          (data.withoutClient ? ` ${data.withoutClient} códigos no están en Códigos cliente.` : "") +
          (data.replaced ? " Reemplazó la carga de hoy." : ""),
      );
      clearUpload();
      setSelected(data.id ?? "");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo traer el stock del portal de Urbano.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(load: Load) {
    if (!window.confirm(`¿Borrar la carga del ${formatDate(load.reportDate)}? El stock Urbano vuelve a tomar la carga anterior.`)) return;
    setError("");
    const response = await fetch(`/api/stock/urbano?load=${load.id}`, { method: "DELETE" });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || "No se pudo borrar la carga.");
      return;
    }
    setNotice(`Se borró la carga del ${formatDate(load.reportDate)}.`);
    await loadHistory();
  }

  const counts = useMemo(() => ({
    ok: preview.filter((row) => row.status === "ok").length,
    warning: preview.filter((row) => row.status === "warning").length,
    error: preview.filter((row) => row.status === "error").length,
    total: preview.filter((row) => row.status !== "error").reduce((sum, row) => sum + row.quantity, 0),
  }), [preview]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) =>
      (!onlyWithStock || item.quantity > 0 || item.unavailable > 0 || item.pendingPickup > 0) &&
      (!term || [item.clientCode, item.product, item.client ?? "", item.uniqueCode ?? ""].some((value) => value.toLowerCase().includes(term))),
    );
  }, [items, search, onlyWithStock]);

  const selectedLoad = loads.find((load) => load.id === selected);
  const toSave = counts.ok + counts.warning;

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Carga de stock Urbano"
        description="Reporte “Stock en línea” del portal de clientes de Urbano: se trae solo todos los días o se sube el Excel exportado (con todas las columnas). La pantalla Stock muestra la cantidad física de la última carga en la columna “Stk. Urbano” y la compara con el stock real."
      />

      {canWrite && (
        <section className="card mb-4 p-5">
          <div className="flex flex-wrap items-end gap-4">
            {portalConfigured && (
              <Button type="button" disabled={busy} onClick={() => void syncFromPortal()}>
                <CloudDownload size={16} />
                Traer de Urbano ahora
              </Button>
            )}
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#9fb9da] bg-[#f6f9fd] px-4 py-3 text-xs font-bold text-[#16365f] hover:bg-[#edf4fc]">
              <FileSpreadsheet size={16} />
              {fileName ? `Cambiar archivo (${fileName})` : "Elegir el Excel del reporte"}
              <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="sr-only" onChange={onFile} />
            </label>
            {preview.length > 0 && (
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Fecha del reporte
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => void changeDate(event.target.value)}
                  className="mt-2 block h-10 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
                />
              </label>
            )}
          </div>

          {busy && <p className="mt-4 text-xs font-semibold text-[#8a99ad]">Procesando…</p>}
          {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
          {notice && <div className="mt-4 rounded-xl bg-[#e7f7eb] px-4 py-3 text-xs font-bold text-[#23783a]">{notice}</div>}

          {preview.length > 0 && (
            <>
              <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-bold">
                <span className="rounded-full bg-[#e7f7eb] px-3 py-1 text-[#23783a]">{counts.ok} correctos</span>
                {counts.warning > 0 && <span className="rounded-full bg-[#fff0d9] px-3 py-1 text-[#985b00]">{counts.warning} con aviso (se guardan igual)</span>}
                {counts.error > 0 && <span className="rounded-full bg-[#fce9e8] px-3 py-1 text-[#a43d39]">{counts.error} con error (no se guardan)</span>}
                <span className="text-[#8a99ad]">Física total: {fmt(counts.total)}</span>
              </div>
              {duplicateFile && (
                <div className="mt-3 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
                  Este archivo ya se cargó (reporte del {formatDate(duplicateFile.reportDate)}): lo cargó {duplicateFile.createdBy} el{" "}
                  {new Date(duplicateFile.createdAt).toLocaleString("es-AR")}.
                </div>
              )}
              {!duplicateFile && sameDate && (
                <div className="mt-3 rounded-xl bg-[#fff0d9] px-4 py-3 text-xs font-bold text-[#985b00]">
                  Ya hay una carga del {formatDate(sameDate.reportDate)} ({sameDate.fileName ?? "sin nombre"}, de {sameDate.createdBy}). Si guardás, se reemplaza por esta.
                </div>
              )}
              <div className="mt-3 max-h-[45vh] overflow-auto rounded-xl border border-[#e1e8f1]">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-[#f4f7fb] text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2 text-right">Física</th>
                      <th className="px-3 py-2 text-right" title="Incluido en Física">No disp.</th>
                      <th className="px-3 py-2 text-right">Pend. recogida</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7]">
                    {preview.map((row) => (
                      <tr key={row.row} className={row.status === "error" ? "bg-[#fff8f8]" : row.status === "warning" ? "bg-[#fffaf1]" : "bg-white"}>
                        <td className="px-3 py-2 text-[#8a99ad]">{row.row}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-[#10233f]">{row.clientCode}</td>
                        <td className="max-w-[320px] px-3 py-2 text-[#334b6b]">
                          <div className="truncate" title={row.product}>{row.product}</div>
                          <div className="text-[#8a99ad]">{row.uniqueCode ?? ""}</div>
                        </td>
                        <td className="px-3 py-2 text-[#334b6b]">{row.client ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{Number.isFinite(row.quantity) ? fmt(row.quantity) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#62728a]">{Number.isFinite(row.unavailable) ? fmt(row.unavailable) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#62728a]">{Number.isFinite(row.pendingPickup) ? fmt(row.pendingPickup) : "—"}</td>
                        <td className="max-w-[300px] px-3 py-2">
                          <div className="flex items-start gap-1.5">
                            {row.status === "ok" && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#23783a]" />}
                            {row.status === "warning" && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#985b00]" />}
                            {row.status === "error" && <XCircle size={14} className="mt-0.5 shrink-0 text-[#a43d39]" />}
                            <span className={row.status === "error" ? "text-[#a43d39]" : row.status === "warning" ? "text-[#985b00]" : "text-[#23783a]"}>
                              {row.messages.length ? row.messages.join(" ") : "Correcto"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={clearUpload}>Cancelar</Button>
                <Button type="button" disabled={busy || toSave === 0 || !!duplicateFile || !reportDate} onClick={() => void save()}>
                  Guardar stock de Urbano ({toSave} códigos)
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <div className="border-b border-[#dbe4ef] px-5 py-3 text-xs font-black text-[#10233f]">Cargas</div>
          {loads.length === 0 ? (
            <p className="px-5 py-8 text-center text-[11px] font-bold text-[#8a99ad]">Todavía no hay cargas del reporte de Urbano.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-[#eef2f7] overflow-auto">
              {loads.map((load) => (
                <li key={load.id} className={load.id === selected ? "bg-[#edf4fc]" : "bg-white hover:bg-[#f6f9fd]"}>
                  <div className="flex items-start gap-2 px-5 py-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(load.id)}>
                      <div className="flex items-center gap-2 text-xs font-black text-[#10233f]">
                        Reporte del {formatDate(load.reportDate)}
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${load.source === "portal" ? "bg-[#e7f0fb] text-[#0b5bbb]" : "bg-[#eef1f5] text-[#52647d]"}`}>
                          {load.source === "portal" ? "Portal" : "Excel"}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-[#62728a]" title={load.fileName ?? ""}>{load.fileName ?? "sin nombre"}</div>
                      <div className="text-[10px] text-[#8a99ad]">
                        {load.rowCount} códigos · física {fmt(load.totalQuantity)} · {load.createdBy}, {new Date(load.createdAt).toLocaleString("es-AR")}
                      </div>
                    </button>
                    {canWrite && (
                      <button type="button" aria-label="Borrar carga" onClick={() => void remove(load)} className="rounded-lg p-1.5 text-[#a43d39] hover:bg-[#fce9e8]">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-3">
            <div className="text-xs font-black text-[#10233f]">
              {selectedLoad ? `Stock informado por Urbano · ${formatDate(selectedLoad.reportDate)}` : "Stock informado por Urbano"}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#62728a]">
                <input type="checkbox" checked={onlyWithStock} onChange={(event) => setOnlyWithStock(event.target.checked)} />
                Solo con cantidad
              </label>
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#7b8da6]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar código o producto"
                  className="h-8 w-56 rounded-lg border border-[#dbe4ef] bg-white pl-7 pr-2 text-xs outline-none focus:border-[#0b5bbb]"
                />
              </div>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[#f4f7fb] text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
                <tr>
                  <th className="px-4 py-2">Código</th>
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2 text-right">Física</th>
                  <th className="px-4 py-2 text-right" title="Incluido en Física">No disp.</th>
                  <th className="px-4 py-2 text-right">Pend. recogida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f7]">
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center font-bold text-[#8a99ad]">{items.length ? "Sin resultados." : "Sin datos."}</td>
                  </tr>
                ) : visibleItems.map((item) => (
                  <tr key={item.clientCode} className="bg-white">
                    <td className="whitespace-nowrap px-4 py-2 font-mono font-bold text-[#10233f]">{item.clientCode}</td>
                    <td className="max-w-[360px] px-4 py-2 text-[#334b6b]">
                      <div className="truncate" title={item.product}>{item.product}</div>
                      <div className="text-[#8a99ad]">{item.uniqueCode ?? ""}</div>
                    </td>
                    <td className="px-4 py-2 text-[#334b6b]">{item.client ?? <span className="text-[#985b00]">Sin código cliente</span>}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{fmt(item.quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#62728a]">{fmt(item.unavailable)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#62728a]">{fmt(item.pendingPickup)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
