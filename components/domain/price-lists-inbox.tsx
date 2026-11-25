"use client";

import { Inbox, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReceivedListGroup = {
  supplier: string;
  period: string;
  summary: { created: number; changed: number; same: number; unmatched: number } | null;
  files: { id: string; name: string; sender: string; receivedAt: string }[];
};

const monthLabel = (period: string) =>
  new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));

function summaryText(summary: ReceivedListGroup["summary"]) {
  if (!summary) return "No pude leer el archivo.";
  if (summary.created + summary.changed + summary.same + summary.unmatched === 0) return "El archivo no tiene el formato de lista de este proveedor.";
  return [
    `${summary.created} ${summary.created === 1 ? "precio nuevo" : "precios nuevos"}`,
    `${summary.changed} ${summary.changed === 1 ? "cambia" : "cambian"} lo cargado`,
    `${summary.same} ya ${summary.same === 1 ? "cargado igual" : "cargados iguales"}`,
    `${summary.unmatched} sin producto`,
  ].join(" · ");
}

// Listas que llegaron por correo y esperan revisión. Nada se carga hasta confirmar la vista previa.
export function PriceListsInbox({
  groups,
  busy,
  onReview,
  onDiscard,
}: {
  groups: ReceivedListGroup[];
  busy: boolean;
  onReview: (group: ReceivedListGroup) => void;
  onDiscard: (group: ReceivedListGroup) => void;
}) {
  if (!groups.length) return null;
  return (
    <section className="card mb-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-3">
        <Inbox size={16} className="text-[#0b5bbb]" />
        <h2 className="text-sm font-black text-[#10233f]">Listas recibidas por correo para revisar</h2>
      </div>
      <ul className="divide-y divide-[#e7edf4]">
        {groups.map((group) => (
          <li key={`${group.supplier}|${group.period}`} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-[11px]">
              <div className="text-xs font-bold text-[#10233f]">{group.supplier} · {monthLabel(group.period)}</div>
              <div className="mt-0.5 font-semibold text-[#425979]">{summaryText(group.summary)}</div>
              {group.files.map((file) => (
                <div key={file.id} className="mt-0.5 break-words text-[#5a6a82]">
                  {file.name} — {file.sender}, {dateLabel(file.receivedAt)}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" onClick={() => onReview(group)} disabled={busy}>Revisar precios</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onDiscard(group)} disabled={busy}><Trash2 size={13} /> Descartar</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
