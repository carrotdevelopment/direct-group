"use client";

import { useState } from "react";
import { CalendarRange, Download, Mail } from "lucide-react";
import { urbanoTemplate } from "@/lib/pasaje-export";

export type PasajeBatch = {
  id: string;
  fileName: string | null;
  requestDate: string;
  createdBy: string;
  createdAt: string;
  count: number;
  units: number;
  destinations: string[];
  origins: { shipper: string; client: string; count: number }[];
};

const linkClass =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe4ef] bg-white px-2.5 text-[11px] font-bold text-[#334b6b] hover:bg-[#f2f6fb]";

function displayDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

// Los Excel de un lote: la solicitud para mandar a Urbano por correo y, por cada shipper origen, la planilla
// de egresos para subir en Urbano. Si el shipper tiene su planilla cargada sale esa; si no, se elige entre
// los dos formatos genéricos.
export function BatchDownloads({ batch, withRequest = true }: { batch: PasajeBatch; withRequest?: boolean }) {
  return <ExcelLinks base={`/api/pasajes/lotes/${batch.id}/excel`} origins={batch.origins} withRequest={withRequest} />;
}

// extra: parámetros que se agregan a cada descarga (por ejemplo, desde y hasta).
function ExcelLinks({
  base, origins, withRequest = true, extra = {},
}: { base: string; origins: PasajeBatch["origins"]; withRequest?: boolean; extra?: Record<string, string> }) {
  const url = (params: Record<string, string>) => `${base}?${new URLSearchParams({ ...extra, ...params })}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {withRequest && (
        <a
          href={url({ formato: "correo" })}
          className={linkClass}
          title="Solicitud con origen y destino, para mandar a Urbano por correo"
        >
          <Mail size={13} /> Exportar solicitud
        </a>
      )}
      {origins.map((origin) =>
        origin.shipper ? (
          <span
            key={`${origin.shipper}|${origin.client}`}
            className="inline-flex flex-wrap items-center gap-1.5"
          >
            <span className="text-[11px] font-bold text-[#52647d]">
              Carga Urbano · {origin.client} {origin.shipper} ({origin.count}):
            </span>
            {urbanoTemplate(origin.shipper) ? (
              <a
                href={url({ formato: "urbano", shipper: origin.shipper, cliente: origin.client })}
                className={linkClass}
                title={`Planilla de egresos para subir en Urbano, con el formato de ${origin.client}`}
              >
                <Download size={13} /> Planilla para Urbano
              </a>
            ) : (
              <>
                <a
                  href={url({ formato: "urbano", shipper: origin.shipper, cliente: origin.client })}
                  className={linkClass}
                  title="Planilla de egresos para subir en Urbano: Descripcion, N° Certificado, Nombre y Apellido…"
                >
                  <Download size={13} /> Formato Descripción
                </a>
                <a
                  href={url({ formato: "urbano-id", shipper: origin.shipper, cliente: origin.client })}
                  className={linkClass}
                  title="Planilla de egresos para subir en Urbano: ID, Nombre y Apellido, Dirección, Código, Cantidad, Fecha…"
                >
                  <Download size={13} /> Formato ID
                </a>
              </>
            )}
          </span>
        ) : (
          <span
            key={`|${origin.client}`}
            className="text-[11px] font-bold text-[#a43d39]"
          >
            {origin.client} no tiene shipper en la tabla de shippers: cargalo
            para exportar la planilla de Urbano.
          </span>
        ),
      )}
    </div>
  );
}

export function PasajeBatchesSection({ batches }: { batches: PasajeBatch[] }) {
  return (
    <section className="card animate-enter overflow-hidden">
      <div className="border-b border-[#e1e8f1] bg-white p-4">
        <h2 className="text-sm font-black text-[#10233f]">Lotes cargados</h2>
        <p className="mt-1 text-[11px] font-semibold text-[#5a6a82]">
          Por cada carga: el Excel para mandarle a Urbano por correo y la
          planilla de egresos para subir en Urbano, una por shipper de origen.
          Los pasajes rechazados no salen en los Excel.
        </p>
      </div>
      <div className="max-h-[360px] divide-y divide-[#e7edf4] overflow-auto">
        {batches.length === 0 && (
          <p className="p-4 text-xs font-semibold text-[#5a6a82]">
            Todavía no hay lotes cargados.
          </p>
        )}
        {batches.map((batch) => (
          <div
            key={batch.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 text-xs">
              <div className="font-bold text-[#10233f]">
                Solicitud del {displayDate(batch.requestDate)} · {batch.count}{" "}
                {batch.count === 1 ? "pasaje" : "pasajes"}, {batch.units} u.
              </div>
              <div className="mt-0.5 text-[11px] text-[#5a6a82]">
                {batch.origins.map((origin) => origin.client).join(", ")} →{" "}
                {batch.destinations.join(", ")} · Cargó {batch.createdBy}
                {batch.fileName ? ` · ${batch.fileName}` : ""}
              </div>
            </div>
            <BatchDownloads batch={batch} />
          </div>
        ))}
      </div>
    </section>
  );
}

type RangeSummary = {
  from: string;
  to: string;
  count: number;
  units: number;
  origins: PasajeBatch["origins"];
  destinations: string[];
};

const dateInputClass =
  "h-9 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs font-semibold text-[#10233f] outline-none focus:border-[#7da4d3]";

// Hoy en Argentina, como AAAA-MM-DD (para el valor inicial de las fechas).
function todayIso() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// Exportar por fechas: la solicitud y las planillas de Urbano con todos los pasajes solicitados entre dos
// días (de cualquier lote o cargados de a uno), sin importar en qué carga entraron.
export function PasajeRangeExport() {
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [summary, setSummary] = useState<RangeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch(`/api/pasajes/exportar?${new URLSearchParams({ desde: from, hasta: to })}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudieron buscar los pasajes.");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron buscar los pasajes.");
    } finally {
      setBusy(false);
    }
  }

  // Si cambian las fechas, el resultado anterior ya no vale.
  const current = summary && summary.from === from && summary.to === to ? summary : null;

  return (
    <section className="card animate-enter overflow-hidden">
      <div className="border-b border-[#e1e8f1] bg-white p-4">
        <h2 className="text-sm font-black text-[#10233f]">Exportar por fechas</h2>
        <p className="mt-1 text-[11px] font-semibold text-[#5a6a82]">
          La solicitud y las planillas para Urbano con todos los pasajes solicitados entre dos días, de
          cualquier carga. Los pasajes rechazados no salen.
        </p>
      </div>
      <div className="space-y-3 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <label className="grid gap-1 text-[11px] font-bold text-[#52647d]">
            Desde
            <input type="date" required className={dateInputClass} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-[#52647d]">
            Hasta
            <input type="date" required className={dateInputClass} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="submit"
            disabled={busy || !from || !to}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0b5bbb] px-3 text-xs font-bold text-white hover:bg-[#094c9c] disabled:opacity-50"
          >
            <CalendarRange size={14} /> {busy ? "Buscando…" : "Ver pasajes"}
          </button>
        </form>
        {error && <p className="text-xs font-bold text-[#a43d39]">{error}</p>}
        {current && current.count === 0 && (
          <p className="text-xs font-semibold text-[#5a6a82]">No hay pasajes solicitados entre esas fechas.</p>
        )}
        {current && current.count > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#10233f]">
              {current.count} {current.count === 1 ? "pasaje" : "pasajes"}, {current.units} u. ·{" "}
              {current.origins.map((origin) => origin.client).join(", ")} → {current.destinations.join(", ")}
            </p>
            <ExcelLinks base="/api/pasajes/exportar/excel" origins={current.origins} extra={{ desde: current.from, hasta: current.to }} />
          </div>
        )}
      </div>
    </section>
  );
}
