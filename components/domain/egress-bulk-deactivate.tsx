"use client";

import { useState } from "react";

export type EgressBatchOption = { id: string; fileName: string | null; createdAt: string; importedRows: number };

export function EgressBulkDeactivate({ client, batches, onComplete }: {
  client: string; batches: EgressBatchOption[]; onComplete: () => Promise<void>;
}) {
  const [mode, setMode] = useState("batch");
  const [batchId, setBatchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const scope = mode === "batch" ? { batchId } : { from, to };
  const ready = mode === "batch" ? !!batchId : !!from && !!to && from <= to;
  async function run(confirm: boolean) {
    setBusy(true); setMessage("");
    try {
      const query = new URLSearchParams({ client, preview: "1" });
      for (const [key, value] of Object.entries(scope)) if (value) query.set(key, value);
      const response = await fetch(confirm ? "/api/local-db/egresos" : `/api/local-db/egresos?${query}`, confirm ? {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client, scope }),
      } : undefined);
      const result = await response.json() as { count?: number; message?: string };
      if (!response.ok) throw new Error(result.message || "No se pudo completar la operación.");
      if (confirm) { setCount(null); setMessage(result.message || "Egresos inactivados."); await onComplete(); }
      else setCount(result.count ?? 0);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error inesperado."); }
    finally { setBusy(false); }
  }
  const inputClass = "rounded-lg border border-[#dbe4ef] bg-white px-3 py-2 text-xs";
  return <section className="card space-y-3 p-4" aria-label="Inactivar carga completa">
    <h2 className="text-sm font-bold">Inactivar archivo o rango de fechas</h2>
    <p className="text-xs text-[#62728a]">Afecta todos los egresos activos del cliente dentro del alcance elegido, aunque no estén visibles en la grilla. Se conserva el respaldo original.</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Tipo de baja" className={inputClass} value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setCount(null); }}>
        <option value="batch">Archivo / subida</option><option value="date">Fecha de operación</option>
      </select>
      {mode === "batch" ? <select aria-label="Subida a inactivar" className={inputClass} value={batchId} disabled={busy} onChange={e => { setBatchId(e.target.value); setCount(null); }}>
        <option value="">Elegí una subida</option>
        {batches.map(batch => <option key={batch.id} value={batch.id}>#{batch.id} · {batch.fileName || "Carga manual"} · {new Date(batch.createdAt).toLocaleString("es-AR")} · {batch.importedRows} filas</option>)}
      </select> : <>
        <label className="text-xs">Desde <input aria-label="Baja desde" type="date" className={inputClass} value={from} disabled={busy} onChange={e => { setFrom(e.target.value); setCount(null); }} /></label>
        <label className="text-xs">Hasta <input aria-label="Baja hasta" type="date" className={inputClass} value={to} disabled={busy} onChange={e => { setTo(e.target.value); setCount(null); }} /></label>
      </>}
      <button className={inputClass} disabled={busy || !ready} onClick={() => void run(false)}>Revisar alcance</button>
    </div>
    {count !== null && <div className="rounded-lg bg-[#fff0ef] p-3 text-xs" role="status">
      <p><strong>{count} egresos activos de {client}</strong> coinciden con este alcance.</p>
      {count > 0 && <button disabled={busy} className="mt-2 rounded bg-[#b7433f] px-3 py-2 font-bold text-white" onClick={() => void run(true)}>Confirmar inactivación</button>}
      <button disabled={busy} className="ml-3 underline" onClick={() => setCount(null)}>Cancelar</button>
    </div>}
    {message && <p className="text-xs" role="status">{message}</p>}
  </section>;
}
