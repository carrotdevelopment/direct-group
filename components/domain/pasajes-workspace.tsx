"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, MapPin, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readDraft, saveDraft } from "@/lib/browser-draft";
import { PasajeBatchesSection, PasajeRangeExport, type PasajeBatch } from "@/components/domain/pasaje-batches";

type Mapping = { client: string; clientCode: string; uniqueCode: string; active: boolean };
type ProductLookup = { code: string; name: string };

type Pasaje = {
  id: string;
  fromClient: string;
  fromClientCode: string;
  toClient: string;
  toClientCode: string;
  uniqueCode: string;
  product: string | null;
  quantity: string;
  status: "no_destination" | "pending" | "approved" | "confirmed" | "accepted" | "rejected";
  comments: string | null;
  createdBy: string;
  createdAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseComment: string | null;
  confirmedQuantity: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  urbanoVoucher: string | null;
  urbanoCertificate?: string | null;
  requestDate: string | null;
  warning: string | null;
  sourceRow: number | null;
  fromDescription: string | null;
  batch: { fileName: string | null; requestDate: string | null } | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusBadge(status: string) {
  if (status === "pending") return "bg-[#fff0d9] text-[#985b00] ring-[#f4c16d]";
  if (status === "approved") return "bg-[#e5effb] text-[#0b5bbb] ring-[#bcd3f0]";
  if (status === "accepted" || status === "confirmed") return "bg-[#e7f7eb] text-[#23783a] ring-[#c9ebd1]";
  return "bg-[#fce9e8] text-[#a43d39] ring-[#f4c6c4]";
}

function statusLabel(status: string) {
  if (status === "pending") return "Pendiente";
  if (status === "approved") return "Aprobado";
  if (status === "confirmed") return "Confirmado";
  if (status === "accepted") return "Aceptado";
  return "Rechazado";
}

function pasajeStatusLabel(status: string) {
  return status === "rejected" ? "Rechazado" : statusLabel(status);
}

const isOpenPasaje = (p: { status: string }) => p.status === "pending" || p.status === "approved";
const lacksDestination = (p: { status: string }) => p.status === "no_destination";

export function PasajesWorkspace({
  restrictedClients,
  userName,
  seesAll = false,
}: {
  restrictedClients: string[] | null;
  userName: string;
  seesAll?: boolean;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [pasajes, setPasajes] = useState<Pasaje[]>([]);
  const [status, setStatus] = useState("Cargando...");
  const [pasajeModalOpen, setPasajeModalOpen] = useState(false);
  const [batches, setBatches] = useState<PasajeBatch[]>([]);
  const [selectedApprove, setSelectedApprove] = useState<Set<string>>(new Set());
  // Destino elegido para cada pasaje sin destino, como "cliente|código".
  const [destinationChoice, setDestinationChoice] = useState<Record<string, string>>({});
  const [realQuantity, setRealQuantity] = useState<Record<string, string>>({});
  const [selectedConfirm, setSelectedConfirm] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Pasaje confirmado que se está editando y su nueva cantidad.
  const [editing, setEditing] = useState<{ id: string; quantity: string } | null>(null);

  const productByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.code.toLowerCase(), product.name);
    return map;
  }, [products]);

  const canAct = (client: string) =>
    restrictedClients === null || restrictedClients.some((assigned) => assigned.toLowerCase() === client.toLowerCase());
  const createdByMe = (createdBy: string) => createdBy.trim().toLowerCase() === userName.trim().toLowerCase();

  async function loadAll() {
    try {
      const [mappingsRes, productsRes, pasajesRes, batchesRes] = await Promise.all([
        fetch("/api/lookups?kind=client-codes"),
        fetch("/api/lookups?kind=products"),
        fetch("/api/pasajes"),
        fetch("/api/pasajes/lotes", { cache: "no-store" }),
      ]);
      const [mappingsData, productsData, pasajesData, batchesData] = await Promise.all([
        mappingsRes.json(),
        productsRes.json(),
        pasajesRes.json(),
        batchesRes.ok ? batchesRes.json() : { batches: [] },
      ]);
      setBatches(batchesData.batches ?? []);
      setMappings(mappingsData.mappings ?? []);
      setProducts(productsData.products ?? []);
      setPasajes(pasajesData.pasajes ?? []);
      setStatus("Actualizado");
    } catch {
      setStatus("No pude cargar los datos.");
    }
  }

  useEffect(() => {
    // Synchronize the lists with the server when the page opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, []);

  async function respond(id: string, action: "cancel" | "approve") {
    setError("");
    if (action === "cancel" && !window.confirm("¿Rechazar el pasaje? Si ya egresó, el stock vuelve al origen y se borra el ingreso pendiente.")) return;
    try {
      const response = await fetch(`/api/pasajes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo procesar la respuesta.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la respuesta.");
    }
  }

  async function setDestination(p: Pasaje) {
    const [toClient, toClientCode] = (destinationChoice[p.id] ?? "").split("|");
    if (!toClient || !toClientCode) return setError("Elegí el cliente destino del pasaje.");
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/pasajes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "destination", toClient, toClientCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo guardar el destino.");
      setStatus(`Destino guardado: ${toClient}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el destino.");
    } finally {
      setBusy(false);
    }
  }

  // Códigos de otros clientes con el mismo código único que el origen: a esos puede ir el pasaje.
  const destinationOptions = (p: Pasaje) =>
    mappings
      .filter((m) => m.active && m.uniqueCode.toLowerCase() === p.uniqueCode.toLowerCase() && m.client.toLowerCase() !== p.fromClient.toLowerCase())
      .sort((a, b) => a.client.localeCompare(b.client, "es") || a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }));

  const destinationPicker = (p: Pasaje, label: string) => (
    <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <select
        aria-label="Cliente destino"
        value={destinationChoice[p.id] ?? ""}
        onChange={(event) => setDestinationChoice((current) => ({ ...current, [p.id]: event.target.value }))}
        className="h-9 min-w-0 flex-1 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs outline-none focus:border-[#7da4d3] sm:flex-none"
      >
        <option value="">{lacksDestination(p) ? "Elegí el destino" : "Otro destino"}</option>
        {destinationOptions(p)
          .filter((m) => lacksDestination(p) || m.client !== p.toClient || m.clientCode !== p.toClientCode)
          .map((m) => (
            <option key={`${m.client}|${m.clientCode}`} value={`${m.client}|${m.clientCode}`}>
              {m.client} · {m.clientCode}
            </option>
          ))}
      </select>
      <Button size="sm" className="whitespace-nowrap" variant={lacksDestination(p) ? "primary" : "secondary"} disabled={busy || !destinationChoice[p.id]} onClick={() => void setDestination(p)}>
        <MapPin size={14} /> {label}
      </Button>
    </span>
  );

  // Confirmación a mano de varios pasajes juntos.
  async function bulk(body: object, okMessage: string) {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/pasajes/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { done?: string[]; failed?: { id: string; message: string }[]; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo procesar.");
      if (data.failed?.length) setError(`${data.done?.length ?? 0} ${okMessage}; ${data.failed.length} no: ${[...new Set(data.failed.map((item) => item.message))].join(" ")}`);
      setStatus(`${data.done?.length ?? 0} ${okMessage}.`);
      setSelectedConfirm(new Set());
      setSelectedApprove(new Set());
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  }

  const realFor = (p: Pasaje) => realQuantity[p.id] ?? String(Number(p.quantity));
  // Aprueba la encargada del origen; confirma lo que llegó la del destino; rechaza la del origen o quien lo cargó.
  const canApprove = (p: Pasaje) => canAct(p.fromClient);
  const canConfirm = (p: Pasaje) => canAct(p.toClient);
  const canCancel = (p: Pasaje) => canAct(p.fromClient) || createdByMe(p.createdBy);
  const requestLabel = (p: Pasaje) => {
    const date = p.batch?.requestDate ?? p.requestDate;
    if (!date) return "";
    const [year, month, day] = date.slice(0, 10).split("-");
    return ` · Solicitud del ${day}/${month}/${year}${p.sourceRow ? `, fila ${p.sourceRow}` : ""}`;
  };

  async function confirmSelected(list: Pasaje[]) {
    const items = list.filter((p) => selectedConfirm.has(p.id)).map((p) => ({ id: p.id, quantity: Number(realFor(p)) }));
    const invalid = items.find((item) => !Number.isFinite(item.quantity) || item.quantity < 0);
    if (invalid) return setError("Revisá las cantidades: tienen que ser números mayores o iguales a cero.");
    const partial = items.filter((item) => item.quantity < Number(list.find((p) => p.id === item.id)?.quantity));
    if (!window.confirm(`Confirmar ${items.length} ${items.length === 1 ? "pasaje" : "pasajes"}${partial.length ? ` (${partial.length} con menos cantidad que la solicitada; la diferencia vuelve al origen)` : ""}? Ingresa al destino la cantidad real.`)) return;
    await bulk({ action: "confirm", items }, "pasajes confirmados");
  }

  async function saveEdit(p: Pasaje) {
    if (!editing) return;
    const quantity = editing.quantity.trim() === "" ? NaN : Number(editing.quantity);
    const requested = Number(p.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > requested) return setError(`La cantidad tiene que ser un número de 0 a ${requested}.`);
    const before = Number(p.confirmedQuantity ?? 0);
    if (quantity === before) return setEditing(null);
    if (!window.confirm(`¿Cambiar el pasaje de ${before} a ${quantity}? Se ajustan el egreso de ${p.fromClient} y el ingreso de ${p.toClient}.`)) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/pasajes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", quantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo editar el pasaje.");
      setEditing(null);
      setStatus(`Pasaje editado: ${quantity} de ${requested}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo editar el pasaje.");
    } finally {
      setBusy(false);
    }
  }

  const withoutDestination = pasajes.filter(lacksDestination);
  const awaitingApproval = pasajes.filter((p) => p.status === "pending");
  const awaitingArrival = pasajes.filter((p) => p.status === "approved");
  const resolvedPasajes = pasajes.filter((p) => !isOpenPasaje(p) && !lacksDestination(p));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-[11px] font-bold text-[#5a6a82] sm:inline">{status}</span>
          <Button size="sm" className="whitespace-nowrap" onClick={() => setPasajeModalOpen(true)}>
            <ArrowRightLeft size={15} /> Cargar pasaje
          </Button>
        </div>
      </div>

      {restrictedClients !== null && (
        <div className="mb-4 rounded-xl bg-[#eef3fb] px-4 py-3 text-xs font-bold text-[#52647d]">
          {restrictedClients.length
            ? `Tus clientes asignados: ${restrictedClients.join(", ")}. Podés cargar pasajes desde cualquier cliente.`
            : "Podés cargar pasajes desde cualquier cliente. Para aprobar o confirmar, pedile a un administrador que te asigne clientes en Permisos."}
          {seesAll && " Como encargada de pasajes, ves los pasajes de todos los clientes; los aprueba y confirma la encargada de cada uno."}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
      )}

        <div className="space-y-4">
          <details className="group rounded-xl bg-[#eef3fb] px-4 py-2 text-xs font-bold text-[#52647d]">
            <summary className="cursor-pointer list-none text-[#0b5bbb] marker:hidden">
              <span className="group-open:hidden">¿Cómo funcionan los pasajes?</span>
              <span className="hidden group-open:inline">Ocultar explicación</span>
            </summary>
            <p className="mt-2 pb-1">
              Los pasajes se cargan de a uno acá (&quot;Cargar pasaje&quot;). Cuando los aprueba la encargada del cliente origen, egresan del
              origen y queda el ingreso pendiente en el destino; cuando Urbano avisa por correo que llegaron, los confirma la
              encargada del cliente destino. El Excel para mandarle a Urbano y la planilla para subir en Urbano se bajan en
              &quot;Exportar por fechas&quot;.
            </p>
          </details>

          {withoutDestination.length > 0 && (
          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Sin destino</h2>
              <p className="mt-1 text-[11px] font-semibold text-[#5a6a82]">
                Quedaron de cuando los pasajes se armaban solos con las salidas de Urbano (ya no se crean nuevos). Elegí a qué
                cliente fue cada uno y sigue como cualquier pasaje; si no era un pasaje, cancelalo y el stock vuelve al origen.
              </p>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {withoutDestination.map((p) => {
                const options = destinationOptions(p);
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 text-xs">
                      <div className="font-bold text-[#10233f]">
                        {p.fromClient} ({p.fromClientCode}) → ?
                      </div>
                      <div className="mt-0.5 text-[#5a6a82]">
                        {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Salieron: {Number(p.quantity)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#5a6a82]">
                        {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                        {p.comments ? ` · ${p.comments}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {options.length ? destinationPicker(p, "Guardar destino") : (
                        <span className="text-[11px] font-bold text-[#a43d39]">
                          Ningún otro cliente tiene el código único {p.uniqueCode}: cargalo en Códigos Cliente.
                        </span>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => respond(p.id, "cancel")}>
                        <X size={14} /> Cancelar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          )}

          <section className="card animate-enter overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e8f1] bg-white p-4">
              <div>
                <h2 className="text-sm font-black text-[#10233f]">1 · Esperando aprobación del origen ({awaitingApproval.length})</h2>
                <p className="mt-1 text-[11px] font-semibold text-[#5a6a82]">
                  Todavía no movieron stock: la cantidad queda comprometida. Al aprobarlo la encargada del cliente origen, egresa
                  del origen y queda el ingreso pendiente en el destino; si lo rechaza, no se mueve nada.
                </p>
              </div>
              {(() => {
                const mine = awaitingApproval.filter(canApprove);
                const selected = mine.filter((p) => selectedApprove.has(p.id));
                return mine.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedApprove(selected.length === mine.length ? new Set() : new Set(mine.map((p) => p.id)))}>
                      {selected.length === mine.length ? "Quitar selección" : `Seleccionar todos (${mine.length})`}
                    </Button>
                    <Button size="sm" disabled={busy || selected.length === 0} onClick={() => void bulk({ action: "approve", ids: selected.map((p) => p.id) }, "pasajes aprobados")}>
                      <Check size={14} /> Aprobar {selected.length || ""}
                    </Button>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="max-h-[520px] divide-y divide-[#e7edf4] overflow-auto">
              {awaitingApproval.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#5a6a82]">No hay pasajes esperando aprobación.</p>
              )}
              {awaitingApproval.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-start gap-3 text-xs">
                    {canApprove(p) && (
                      <input
                        type="checkbox"
                        aria-label="Incluir en la aprobación"
                        className="mt-1"
                        checked={selectedApprove.has(p.id)}
                        onChange={(event) => setSelectedApprove((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(p.id); else next.delete(p.id);
                          return next;
                        })}
                      />
                    )}
                    <div className="min-w-0">
                        <div className="font-bold text-[#10233f]">
                          {p.fromClient} ({p.fromClientCode}) → {p.toClient} ({p.toClientCode})
                        </div>
                        <div className="mt-0.5 text-[#5a6a82]">
                          {p.fromDescription || productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · {Number(p.quantity)} u.
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#5a6a82]">
                          Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                          {p.comments ? ` · ${p.comments}` : ""}
                        </div>
                        {p.warning && <div className="mt-0.5 text-[11px] font-bold text-[#985b00]">{p.warning}</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canApprove(p) ? (
                      <Button size="sm" onClick={() => void respond(p.id, "approve")}>
                        <Check size={14} /> Aprobar
                      </Button>
                    ) : (
                      <span className="text-[11px] font-bold text-[#5a6a82]">Lo aprueba la encargada de {p.fromClient}</span>
                    )}
                    {canCancel(p) && (
                      <Button size="sm" variant="secondary" onClick={() => void respond(p.id, "cancel")}>
                        <X size={14} /> Rechazar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card animate-enter overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e8f1] bg-white p-4">
              <div>
                <h2 className="text-sm font-black text-[#10233f]">2 · Esperando que llegue al destino ({awaitingArrival.length})</h2>
                <p className="mt-1 text-[11px] font-semibold text-[#5a6a82]">
                  Aprobados por el origen. Cuando Urbano avisa por correo que llegaron, la encargada del cliente destino confirma
                  cuántas unidades llegaron: ingresan al destino; si llegaron menos, la diferencia vuelve al origen; con 0, se revierte.
                </p>
              </div>
              {(() => {
                const mine = awaitingArrival.filter(canConfirm);
                const selected = mine.filter((p) => selectedConfirm.has(p.id));
                return mine.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedConfirm(selected.length === mine.length ? new Set() : new Set(mine.map((p) => p.id)))}>
                      {selected.length === mine.length ? "Quitar selección" : `Seleccionar todos (${mine.length})`}
                    </Button>
                    <Button size="sm" disabled={busy || selected.length === 0} onClick={() => void confirmSelected(awaitingArrival)}>
                      <Check size={14} /> Confirmar {selected.length || ""}
                    </Button>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="max-h-[520px] divide-y divide-[#e7edf4] overflow-auto">
              {awaitingArrival.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#5a6a82]">No hay pasajes esperando que lleguen al destino.</p>
              )}
              {awaitingArrival.map((p) => {
                const requested = Number(p.quantity);
                const real = Number(realFor(p));
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-start gap-3 text-xs">
                      {canConfirm(p) && (
                      <input
                        type="checkbox"
                        aria-label="Incluir en la confirmación"
                        className="mt-1"
                        checked={selectedConfirm.has(p.id)}
                        onChange={(event) => setSelectedConfirm((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(p.id); else next.delete(p.id);
                          return next;
                        })}
                      />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-[#10233f]">
                          {p.fromClient} ({p.fromClientCode}) → {p.toClient} ({p.toClientCode})
                        </div>
                        <div className="mt-0.5 text-[#5a6a82]">
                          {p.fromDescription || productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · {Number(p.quantity)} u.
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#5a6a82]">
                          Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                          {p.comments ? ` · ${p.comments}` : ""}
                        </div>
                        {p.warning && <div className="mt-0.5 text-[11px] font-bold text-[#985b00]">{p.warning}</div>}
                        {p.respondedBy && p.respondedAt && (
                          <div className="mt-0.5 text-[11px] text-[#5a6a82]">Aprobado por {p.respondedBy} el {formatDateTime(p.respondedAt)}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {canConfirm(p) ? (
                        <label className="flex items-center gap-2 text-[11px] font-extrabold text-[#334b6b]">
                          Llegaron
                          <input
                            type="number"
                            min="0"
                            max={requested}
                            value={realFor(p)}
                            onChange={(event) => {
                              setRealQuantity((current) => ({ ...current, [p.id]: event.target.value }));
                              setSelectedConfirm((current) => new Set(current).add(p.id));
                            }}
                            className="h-9 w-20 rounded-lg border border-[#dbe4ef] px-2 text-right text-xs tabular-nums outline-none focus:border-[#7da4d3]"
                          />
                          <span className={real < requested ? "text-[#985b00]" : "text-[#5a6a82]"}>
                            {real === 0 ? "no llegó" : real < requested ? `faltan ${requested - real}` : `de ${requested}`}
                          </span>
                        </label>
                      ) : (
                        <span className="text-[11px] font-bold text-[#5a6a82]">Lo confirma la encargada de {p.toClient}</span>
                      )}
                      {canCancel(p) && (
                        <Button size="sm" variant="secondary" onClick={() => void respond(p.id, "cancel")}>
                          <X size={14} /> Rechazar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <PasajeRangeExport />
          <PasajeBatchesSection batches={batches} />

          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Historial</h2>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {resolvedPasajes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#5a6a82]">Todavía no hay pasajes resueltos.</p>
              )}
              {resolvedPasajes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-xs">
                    <div className="font-bold text-[#10233f]">
                      {p.fromClient} ({p.fromClientCode}) → {p.toClient} ({p.toClientCode})
                    </div>
                    <div className="mt-0.5 text-[#5a6a82]">
                      {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Cantidad: {p.quantity}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5a6a82]">
                      Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}
                      {p.respondedBy && p.respondedAt ? ` · ${p.status === "rejected" ? "Rechazado" : "Aprobado"} por ${p.respondedBy} el ${formatDateTime(p.respondedAt)}` : ""}
                      {p.responseComment ? ` · ${p.responseComment}` : ""}
                      {p.status === "confirmed" && p.confirmedAt
                        ? ` · Confirmado por ${p.confirmedBy} el ${formatDateTime(p.confirmedAt)}: ${Number(p.confirmedQuantity) === 0 ? "no llegó" : `llegaron ${Number(p.confirmedQuantity)} de ${Number(p.quantity)}`}`
                        : ""}
                      {p.urbanoCertificate ? ` · ID Urbano ${p.urbanoCertificate}` : ""}
                      {p.urbanoVoucher ? ` · Comprobante de Urbano ${p.urbanoVoucher}` : ""}
                      {requestLabel(p)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editing?.id === p.id ? (
                      <>
                        <label className="flex items-center gap-2 text-[11px] font-extrabold text-[#334b6b]">
                          Llegaron
                          <input
                            type="number"
                            min="0"
                            max={Number(p.quantity)}
                            autoFocus
                            value={editing.quantity}
                            onChange={(event) => setEditing({ id: p.id, quantity: event.target.value })}
                            className="h-9 w-20 rounded-lg border border-[#dbe4ef] px-2 text-right text-xs tabular-nums outline-none focus:border-[#7da4d3]"
                          />
                          <span className="text-[#5a6a82]">de {Number(p.quantity)}</span>
                        </label>
                        <Button size="sm" disabled={busy} onClick={() => void saveEdit(p)}>
                          <Check size={14} /> Guardar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                          <X size={14} /> Cancelar
                        </Button>
                      </>
                    ) : p.status === "confirmed" && canConfirm(p) ? (
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ id: p.id, quantity: String(Number(p.confirmedQuantity ?? 0)) })}>
                        <Pencil size={14} /> Editar
                      </Button>
                    ) : null}
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${statusBadge(p.status)}`}>
                      {pasajeStatusLabel(p.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

      {pasajeModalOpen && (
        <PasajeModal
          mappings={mappings}
          productByCode={productByCode}
          allowedClients={null}
          draftKey={`pasaje:${userName}`}
          onClose={() => setPasajeModalOpen(false)}
          onCreated={(warning) => {
            setPasajeModalOpen(false);
            setStatus(warning ? `Pasaje cargado. ${warning}` : "Pasaje cargado: espera la aprobación de la encargada del origen.");
            void loadAll();
          }}
        />
      )}
    </>
  );
}

function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  emptyText,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options).slice(0, 100);
  }, [options, query]);

  return (
    <div className="relative text-[11px] font-extrabold text-[#334b6b]">
      {label}
      <input
        value={open ? query : selected?.label ?? ""}
        disabled={disabled}
        placeholder={placeholder ?? "Buscá y elegí..."}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`mt-2 h-11 w-full rounded-xl border bg-white px-3 text-xs outline-none transition disabled:bg-[#f2f5f9] ${
          open ? "border-[#0b5bbb] font-normal ring-3 ring-[#e5eef9]" : `border-[#dbe4ef] ${selected ? "font-bold text-[#10233f]" : "font-normal"}`
        }`}
      />
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-2xl border border-[#dbe4ef] bg-white p-2 shadow-xl">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs font-semibold text-[#5a6a82]">{emptyText ?? "Sin resultados."}</div>
          )}
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                option.value === value ? "bg-[#eef5ff] text-[#0b5bbb]" : "text-[#334b6b] hover:bg-[#f4f7fb]"
              }`}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Desplegable de una opción con el mismo aspecto que los filtros de Ingresos y Egresos: caja con flecha,
// panel redondeado, buscador cuando hay muchas opciones y la elegida marcada.
function ChoiceDropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  hint,
  detail,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  hint?: React.ReactNode;
  // Dato chico a la derecha de cada opción (por ejemplo, el stock).
  detail?: (option: string) => string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((option) => option.toLowerCase().includes(q)) : options;
  const isOff = disabled || options.length === 0;

  return (
    <div ref={ref} className="relative text-[11px] font-extrabold text-[#334b6b]">
      {label}
      <button
        type="button"
        disabled={isOff}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        className={`mt-2 flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-xs font-normal normal-case outline-none transition disabled:cursor-not-allowed disabled:bg-[#f2f5f9] ${
          open ? "border-[#0b5bbb] ring-3 ring-[#e5eef9]" : "border-[#dbe4ef]"
        }`}
      >
        <span className={`truncate ${value ? "font-bold text-[#10233f]" : "text-[#8a98ab]"}`}>{value || placeholder}</span>
        <ChevronDown size={15} className={`shrink-0 text-[#5a6a82] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {hint}
      {open && !isOff && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-56 overflow-hidden rounded-2xl border border-[#dbe4ef] bg-white shadow-xl">
          {options.length > 8 && (
            <div className="border-b border-[#dbe4ef] p-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Buscar en la lista"
                placeholder="Buscar..."
                className="h-8 w-full rounded-lg border border-[#dbe4ef] px-2.5 text-xs font-normal normal-case outline-none focus:border-[#7da4d3]"
              />
            </div>
          )}
          <div role="listbox" className="max-h-64 overflow-auto p-2">
            {visible.length === 0 && <p className="px-3 py-2 text-xs font-semibold text-[#5a6a82]">Sin resultados.</p>}
            {visible.map((option) => {
              const isSelected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                    isSelected ? "bg-[#eef5ff] text-[#0b5bbb]" : "text-[#334b6b] hover:bg-[#f4f7fb]"
                  }`}
                >
                  <span className="truncate">{option}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {detail?.(option) && <span className="text-[11px] font-semibold text-[#5a6a82]">{detail(option)}</span>}
                    {isSelected && <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function distinct(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

const selectClass =
  "mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case font-normal outline-none focus:border-[#7da4d3] disabled:bg-[#f2f5f9]";

type PasajeDraft = {
  sku: string;
  fromClient: string;
  fromClientCode: string;
  toClient: string;
  toClientCode: string;
  quantity: string;
  comments: string;
};

const emptyDraft: PasajeDraft = {
  sku: "",
  fromClient: "",
  fromClientCode: "",
  toClient: "",
  toClientCode: "",
  quantity: "",
  comments: "",
};

// Clientes y códigos disponibles para un SKU: el SKU es el mismo para todos, lo que
// cambia es el código cliente de cada empresa.
function optionsForSku(mappings: Mapping[], sku: string, allowedClients: string[] | null) {
  const forSku = sku ? mappings.filter((m) => m.active && sameText(m.uniqueCode, sku)) : [];
  const fromPool = allowedClients ? forSku.filter((m) => allowedClients.some((c) => sameText(c, m.client))) : forSku;
  return { forSku, fromPool };
}

function codesFor(pool: Mapping[], client: string) {
  return pool
    .filter((m) => sameText(m.client, client))
    .map((m) => m.clientCode)
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

function validateDraft(draft: PasajeDraft, mappings: Mapping[], allowedClients: string[] | null) {
  if (!draft.sku) return "Elegí el código único del producto.";
  const { forSku, fromPool } = optionsForSku(mappings, draft.sku, allowedClients);
  if (!draft.fromClient || !draft.fromClientCode) return "Elegí el cliente origen y su código cliente.";
  if (!fromPool.some((m) => sameText(m.client, draft.fromClient) && sameText(m.clientCode, draft.fromClientCode))) {
    return "El origen no tiene ese código único asignado o no está entre tus clientes.";
  }
  if (!draft.toClient || !draft.toClientCode) return "Elegí el cliente destino y su código cliente.";
  if (!forSku.some((m) => sameText(m.client, draft.toClient) && sameText(m.clientCode, draft.toClientCode))) {
    return "El destino no tiene ese código único asignado.";
  }
  if (sameText(draft.fromClient, draft.toClient) && sameText(draft.fromClientCode, draft.toClientCode)) {
    return "El origen y el destino no pueden ser el mismo código cliente.";
  }
  const quantity = Number(draft.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return "Ingresá una cantidad mayor a cero.";
  return null;
}

function PasajeModal({
  mappings,
  productByCode,
  allowedClients,
  draftKey,
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
  productByCode: Map<string, string>;
  allowedClients: string[] | null;
  // Dónde se guarda lo escrito, para seguir después si salen de la pantalla.
  draftKey: string;
  onClose: () => void;
  onCreated: (warning: string | null) => void;
}) {
  const [draft, setDraft] = useState<PasajeDraft>(() => ({ ...emptyDraft, ...readDraft<PasajeDraft>(draftKey) }));
  useEffect(() => {
    saveDraft(draftKey, Object.values(draft).some((value) => value.trim()) ? draft : null);
  }, [draftKey, draft]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Stock disponible del código origen elegido (stock real menos pasajes sin confirmar).
  const [originStock, setOriginStock] = useState<{ key: string; real: number; reserved: number; available: number } | null>(null);
  const originKey = draft.fromClient && draft.fromClientCode ? `${draft.fromClient}|${draft.fromClientCode}` : "";
  useEffect(() => {
    if (!originKey) return;
    const controller = new AbortController();
    const [client, code] = originKey.split("|");
    fetch(`/api/pasajes/stock?client=${encodeURIComponent(client)}&code=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { real: number; reserved: number; available: number } | null) => setOriginStock(data ? { key: originKey, ...data } : null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [originKey]);
  const stock = originStock && originStock.key === originKey ? originStock : null;
  const requested = Number(draft.quantity);
  const shortage = !!stock && Number.isFinite(requested) && requested > 0 && requested > stock.available;
  // Origen: cliente y SKU origen (código cliente). El producto (código único) sale del SKU origen, y del
  // otro lado solo aparecen los clientes y SKU nuevos de ese mismo producto.
  const activeMappings = useMemo(() => mappings.filter((m) => m.active && m.uniqueCode), [mappings]);
  const fromClients = useMemo(() => {
    const pool = allowedClients ? activeMappings.filter((m) => allowedClients.some((c) => sameText(c, m.client))) : activeMappings;
    return distinct(pool.map((m) => m.client));
  }, [activeMappings, allowedClients]);
  const fromCodeOptions = useMemo(
    () =>
      activeMappings
        .filter((m) => sameText(m.client, draft.fromClient))
        .sort((a, b) => a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }))
        .map((m) => {
          const name = productByCode.get(m.uniqueCode.toLowerCase());
          return { value: m.clientCode, label: name ? `${m.clientCode} · ${name}` : m.clientCode };
        }),
    [activeMappings, draft.fromClient, productByCode],
  );
  const { forSku } = optionsForSku(mappings, draft.sku, allowedClients);
  const isOriginCode = (client: string, code: string) => sameText(client, draft.fromClient) && sameText(code, draft.fromClientCode);
  const destinations = forSku.filter((m) => !isOriginCode(m.client, m.clientCode));
  const toClients = distinct(destinations.map((m) => m.client));
  const toCodes = codesFor(destinations, draft.toClient);
  const productName = draft.sku ? productByCode.get(draft.sku.toLowerCase()) : undefined;

  // Stock de cada SKU nuevo posible del cliente destino: sirve para elegir cuando el cliente tiene más de un
  // código para el mismo producto (por ejemplo Amex, con DG99 y OFED).
  const [destinationStock, setDestinationStock] = useState<Record<string, number>>({});
  const toCodesKey = draft.toClient ? `${draft.toClient}|${toCodes.join(",")}` : "";
  useEffect(() => {
    if (!toCodesKey) return;
    const [client, list] = toCodesKey.split("|");
    const codes = list ? list.split(",") : [];
    if (codes.length < 2) return;
    const controller = new AbortController();
    void Promise.all(
      codes.map((code) =>
        fetch(`/api/pasajes/stock?client=${encodeURIComponent(client)}&code=${encodeURIComponent(code)}`, { signal: controller.signal })
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { real: number } | null) => [`${client}|${code}`, data?.real] as const)
          .catch(() => [`${client}|${code}`, undefined] as const),
      ),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      setDestinationStock((current) => {
        const next = { ...current };
        for (const [key, value] of entries) if (typeof value === "number") next[key] = value;
        return next;
      });
    });
    return () => controller.abort();
  }, [toCodesKey]);

  function chooseFromClient(client: string) {
    const codes = activeMappings.filter((m) => sameText(m.client, client));
    const only = codes.length === 1 ? codes[0] : null;
    setDraft({ ...draft, fromClient: client, fromClientCode: only?.clientCode ?? "", sku: only?.uniqueCode ?? "", toClient: "", toClientCode: "" });
  }

  function chooseFromCode(code: string) {
    const mapping = activeMappings.find((m) => sameText(m.client, draft.fromClient) && sameText(m.clientCode, code));
    const sku = mapping?.uniqueCode ?? "";
    // Si el destino elegido sigue teniendo el mismo producto, se mantiene; si no, se limpia.
    const keepTo = !!sku && sameText(sku, draft.sku);
    setDraft({ ...draft, fromClientCode: code, sku, toClient: keepTo ? draft.toClient : "", toClientCode: keepTo ? draft.toClientCode : "" });
  }

  function chooseToClient(client: string) {
    const codes = codesFor(destinations, client);
    setDraft({ ...draft, toClient: client, toClientCode: codes.length === 1 ? codes[0] : "" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateDraft(draft, mappings, allowedClients);
    if (problem) return setError(problem);
    if (shortage && !window.confirm(`${draft.fromClientCode} tiene ${stock.available} disponibles y se piden ${requested}. ¿Generar el pasaje igual?`)) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/pasajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromClient: draft.fromClient,
          fromClientCode: draft.fromClientCode,
          toClient: draft.toClient,
          toClientCode: draft.toClientCode,
          uniqueCode: draft.sku,
          quantity: Number(draft.quantity),
          comments: draft.comments,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo generar el pasaje.");
      saveDraft(draftKey, null);
      onCreated(data.pasaje?.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el pasaje.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#5a6a82] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Nuevo pasaje</div>
        <h2 className="mt-2 text-xl font-black">Registrar pasaje entre clientes</h2>
        <p className="mt-1 text-xs text-[#5a6a82]">
          Elegí el cliente y el SKU origen: del otro lado solo aparecen los clientes y SKU nuevos del mismo producto. Queda
          esperando la aprobación de la encargada del origen: ahí egresa y se crea el ingreso pendiente en el destino, que se
          confirma cuando Urbano informa la recepción.
        </p>
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceDropdown
              label="Cliente origen"
              value={draft.fromClient}
              options={fromClients}
              onChange={chooseFromClient}
              placeholder="Elegí un cliente"
            />
            <SearchSelect
              label="SKU origen"
              value={draft.fromClientCode}
              options={fromCodeOptions}
              disabled={!draft.fromClient}
              onChange={chooseFromCode}
              placeholder={draft.fromClient ? "Buscá por SKU o producto" : "Primero elegí el cliente"}
            />
          </div>
          {draft.sku && (
            <div className="rounded-xl bg-[#eef5ff] px-4 py-2.5 text-xs font-bold text-[#0b5bbb]">
              Producto: {productName ? `${productName} · ` : ""}
              {draft.sku}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceDropdown
              label="Cliente destino"
              value={draft.toClient}
              options={toClients}
              disabled={!draft.sku}
              onChange={chooseToClient}
              placeholder={draft.sku ? "Elegí un cliente" : "Primero elegí el SKU origen"}
            />
            <ChoiceDropdown
              label="SKU nuevo"
              value={draft.toClientCode}
              options={toCodes}
              disabled={!draft.toClient}
              onChange={(code) => setDraft({ ...draft, toClientCode: code })}
              placeholder={draft.toClient ? "Elegí un SKU" : "Primero elegí el cliente"}
              detail={(code) => {
                const value = destinationStock[`${draft.toClient}|${code}`];
                return typeof value === "number" ? `stock ${value}` : undefined;
              }}
              hint={
                toCodes.length > 1 ? (
                  <span className="mt-1 block text-[11px] font-bold text-[#985b00]">
                    {draft.toClient} tiene {toCodes.length} SKU para este producto: elegí a cuál entra.
                  </span>
                ) : null
              }
            />
          </div>
          {draft.sku && toClients.length === 0 && (
            <p className="text-[11px] font-bold text-[#985b00]">
              Ningún otro cliente tiene este producto asignado: para pasarlo hay que cargar su código cliente en Códigos
              cliente.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Cantidad
              <input
                type="number"
                min="1"
                value={draft.quantity}
                onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                className={selectClass}
              />
              {stock && (
                <span className={`mt-1 block text-[11px] font-bold ${shortage ? "text-[#985b00]" : "text-[#5a6a82]"}`}>
                  Disponible en {draft.fromClientCode}: {stock.available}
                  {stock.reserved > 0 ? ` (stock real ${stock.real}, ${stock.reserved} en otros pasajes sin confirmar)` : ""}
                </span>
              )}
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Comentario (opcional)
              <input
                value={draft.comments}
                onChange={(event) => setDraft({ ...draft, comments: event.target.value })}
                className={selectClass}
              />
            </label>
          </div>
        </div>
        {shortage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff0d9] px-4 py-3 text-xs font-bold text-[#985b00]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              No alcanza el stock: {draft.fromClient} tiene {stock.available} disponibles en {draft.fromClientCode} y se piden {requested}.
              Si lo generás igual, al aprobarlo egresa {requested} y el stock del origen queda en negativo.
            </span>
          </div>
        )}
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { setDraft(emptyDraft); setError(""); }}>
            Vaciar
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {shortage ? "Generar igual" : "Generar pasaje"}
          </Button>
        </div>
      </form>
    </div>
  );
}
