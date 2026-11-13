"use client";

import { Download, Mail } from "lucide-react";

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
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe4ef] bg-white px-2.5 text-[10px] font-bold text-[#334b6b] hover:bg-[#f2f6fb]";

function displayDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

// Los Excel de un lote: la solicitud para mandar a Urbano por correo y, por cada shipper origen, la planilla
// de egresos para subir en Urbano, en los dos formatos que usan.
export function BatchDownloads({ batch }: { batch: PasajeBatch }) {
  const base = `/api/pasajes/lotes/${batch.id}/excel`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`${base}?formato=correo`} className={linkClass} title="Solicitud con origen y destino, para mandar a Urbano por correo">
        <Mail size={13} /> Excel para el correo
      </a>
      {batch.origins.map((origin) =>
        origin.shipper ? (
          <span key={`${origin.shipper}|${origin.client}`} className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#52647d]">
              Carga Urbano · {origin.client} {origin.shipper} ({origin.count}):
            </span>
            <a
              href={`${base}?${new URLSearchParams({ formato: "urbano", shipper: origin.shipper, cliente: origin.client })}`}
              className={linkClass}
              title="Planilla de egresos para subir en Urbano: Descripcion, N° Certificado, Nombre y Apellido…"
            >
              <Download size={13} /> Formato Descripción
            </a>
            <a
              href={`${base}?${new URLSearchParams({ formato: "urbano-id", shipper: origin.shipper, cliente: origin.client })}`}
              className={linkClass}
              title="Planilla de egresos para subir en Urbano: ID, Nombre y Apellido, Dirección, Código, Cantidad, Fecha…"
            >
              <Download size={13} /> Formato ID
            </a>
          </span>
        ) : (
          <span key={`|${origin.client}`} className="text-[10px] font-bold text-[#a43d39]">
            {origin.client} no tiene shipper en la tabla de shippers: cargalo para exportar la planilla de Urbano.
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
        <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
          Por cada carga: el Excel para mandarle a Urbano por correo y la planilla de egresos para subir en Urbano, una por
          shipper de origen. Los pasajes rechazados no salen en los Excel.
        </p>
      </div>
      <div className="max-h-[360px] divide-y divide-[#e7edf4] overflow-auto">
        {batches.length === 0 && <p className="p-4 text-xs font-semibold text-[#8a99ad]">Todavía no hay lotes cargados.</p>}
        {batches.map((batch) => (
          <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-xs">
              <div className="font-bold text-[#10233f]">
                Solicitud del {displayDate(batch.requestDate)} · {batch.count} {batch.count === 1 ? "pasaje" : "pasajes"}, {batch.units} u.
              </div>
              <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                {batch.origins.map((origin) => origin.client).join(", ")} → {batch.destinations.join(", ")} · Cargó {batch.createdBy}
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
