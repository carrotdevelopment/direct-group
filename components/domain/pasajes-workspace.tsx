"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, FileSpreadsheet, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasajeSolicitudModal } from "@/components/domain/pasaje-solicitud-modal";

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
  status: "pending" | "approved" | "confirmed" | "accepted" | "rejected";
  comments: string | null;
  createdBy: string;
  createdAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseComment: string | null;
  confirmedQuantity: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  requestDate: string | null;
  warning: string | null;
  sourceRow: number | null;
  batch: { fileName: string | null; requestDate: string | null } | null;
};

type Ajuste = {
  id: string;
  client: string;
  clientCode: string;
  uniqueCode: string;
  product: string | null;
  quantity: string;
  status: "pending" | "accepted" | "rejected";
  reason: string | null;
  createdBy: string;
  createdAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseComment: string | null;
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
  if (status === "pending") return "Pendiente aprobación";
  if (status === "approved") return "Aprobado · esperando a Urbano";
  if (status === "confirmed") return "Confirmado";
  if (status === "accepted") return "Aceptado";
  return "Rechazado";
}

function ClientCodeSelect({
  label,
  mappings,
  clientValue,
  codeValue,
  onChange,
  requireUniqueCode,
  allowedClients,
}: {
  label: string;
  mappings: Mapping[];
  clientValue: string;
  codeValue: string;
  onChange: (client: string, clientCode: string, uniqueCode: string) => void;
  // Cuando viene seteado (ej. el SKU ya elegido del lado emisor de un
  // pasaje), solo se ofrecen clientes/códigos que tengan ese mismo código
  // único — no tiene sentido mover un producto a un cliente que no lo tiene
  // asignado.
  requireUniqueCode?: string;
  // Clientes que el usuario tiene asignados en Permisos (null = sin restricción).
  allowedClients?: string[] | null;
}) {
  const pool = useMemo(
    () =>
      mappings.filter(
        (m) =>
          m.active &&
          (!requireUniqueCode || m.uniqueCode.toLowerCase() === requireUniqueCode.toLowerCase()) &&
          (!allowedClients || allowedClients.some((client) => client.toLowerCase() === m.client.toLowerCase())),
      ),
    [mappings, requireUniqueCode, allowedClients],
  );
  const clients = useMemo(
    () =>
      Array.from(new Set(pool.map((m) => m.client)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es")),
    [pool],
  );
  const codes = useMemo(
    () =>
      pool
        .filter((m) => m.client === clientValue)
        .sort((a, b) => a.clientCode.localeCompare(b.clientCode, "es", { numeric: true })),
    [pool, clientValue],
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[11px] font-extrabold text-[#334b6b]">
        {label}
        <select
          value={clientValue}
          onChange={(event) => onChange(event.target.value, "", "")}
          className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3]"
        >
          <option value="">Elegí un cliente</option>
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>
        {requireUniqueCode && clients.length === 0 && (
          <span className="mt-1 block text-[10px] font-bold text-[#a43d39]">
            Ningún cliente tiene el código único {requireUniqueCode} asignado.
          </span>
        )}
      </label>
      <label className="text-[11px] font-extrabold text-[#334b6b]">
        Código cliente
        <select
          value={codeValue}
          disabled={!clientValue}
          onChange={(event) => {
            const mapping = codes.find((m) => m.clientCode === event.target.value);
            onChange(clientValue, event.target.value, mapping?.uniqueCode ?? "");
          }}
          className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3] disabled:bg-[#f2f5f9]"
        >
          <option value="">Elegí un código</option>
          {codes.map((m) => (
            <option key={m.clientCode} value={m.clientCode}>
              {m.clientCode} · {m.uniqueCode}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function PasajesWorkspace({
  restrictedClients,
  userName,
}: {
  restrictedClients: string[] | null;
  userName: string;
}) {
  const [tab, setTab] = useState<"pasajes" | "ajustes">("pasajes");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [pasajes, setPasajes] = useState<Pasaje[]>([]);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [status, setStatus] = useState("Cargando...");
  const [pasajeModalOpen, setPasajeModalOpen] = useState(false);
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
  const [solicitudModalOpen, setSolicitudModalOpen] = useState(false);
  const [realQuantity, setRealQuantity] = useState<Record<string, string>>({});
  const [selectedConfirm, setSelectedConfirm] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const productByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.code.toLowerCase(), product.name);
    return map;
  }, [products]);

  const canAct = (client: string) =>
    restrictedClients === null || restrictedClients.some((assigned) => assigned.toLowerCase() === client.toLowerCase());
  const isOwn = (createdBy: string) =>
    restrictedClients !== null && createdBy.trim().toLowerCase() === userName.trim().toLowerCase();
  const createdByMe = (createdBy: string) => createdBy.trim().toLowerCase() === userName.trim().toLowerCase();
  // Los pasajes se generan desde cualquier cliente (los aprueba quien tiene el destino); los
  // ajustes, solo de los clientes asignados.
  const cannotCreateAjuste = restrictedClients !== null && restrictedClients.length === 0;

  async function loadAll() {
    try {
      const [mappingsRes, productsRes, pasajesRes, ajustesRes] = await Promise.all([
        fetch("/api/lookups?kind=client-codes"),
        fetch("/api/lookups?kind=products"),
        fetch("/api/pasajes"),
        fetch("/api/ajustes"),
      ]);
      const [mappingsData, productsData, pasajesData, ajustesData] = await Promise.all([
        mappingsRes.json(),
        productsRes.json(),
        pasajesRes.json(),
        ajustesRes.json(),
      ]);
      setMappings(mappingsData.mappings ?? []);
      setProducts(productsData.products ?? []);
      setPasajes(pasajesData.pasajes ?? []);
      setAjustes(ajustesData.ajustes ?? []);
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

  async function respond(kind: "pasajes" | "ajustes", id: string, action: "accept" | "reject") {
    setError("");
    const label = kind === "pasajes" ? "el pasaje" : "el ajuste";
    if (action === "reject" && !window.confirm(`¿Rechazar ${label}? El stock queda sin cambios.`)) return;
    try {
      const response = await fetch(`/api/${kind}/${id}`, {
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

  // Acciones sobre varios pasajes juntos (los de una solicitud a Urbano).
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
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  }

  const realFor = (p: Pasaje) => realQuantity[p.id] ?? String(Number(p.quantity));
  const canConfirm = (p: Pasaje) => canAct(p.fromClient) || createdByMe(p.createdBy);
  const requestLabel = (p: Pasaje) => {
    const date = p.batch?.requestDate ?? p.requestDate;
    if (!date) return "";
    const [year, month, day] = date.slice(0, 10).split("-");
    return ` · Solicitud a Urbano del ${day}/${month}/${year}${p.sourceRow ? `, fila ${p.sourceRow}` : ""}`;
  };

  async function confirmSelected(list: Pasaje[]) {
    const items = list.filter((p) => selectedConfirm.has(p.id)).map((p) => ({ id: p.id, quantity: Number(realFor(p)) }));
    const invalid = items.find((item) => !Number.isFinite(item.quantity) || item.quantity < 0);
    if (invalid) return setError("Revisá las cantidades: tienen que ser números mayores o iguales a cero.");
    const partial = items.filter((item) => item.quantity < Number(list.find((p) => p.id === item.id)?.quantity));
    if (!window.confirm(`Confirmar ${items.length} ${items.length === 1 ? "pasaje" : "pasajes"}${partial.length ? ` (${partial.length} con menos cantidad que la solicitada; la diferencia queda en el origen)` : ""}? Se mueve el stock por la cantidad real.`)) return;
    await bulk({ action: "confirm", items }, "pasajes confirmados");
  }

  const pendingPasajes = pasajes.filter((p) => p.status === "pending");
  const approvedPasajes = pasajes.filter((p) => p.status === "approved");
  const resolvedPasajes = pasajes.filter((p) => p.status !== "pending" && p.status !== "approved");
  const pendingAjustes = ajustes.filter((a) => a.status === "pending");
  const resolvedAjustes = ajustes.filter((a) => a.status !== "pending");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#dbe4ef] bg-white p-1">
          <button
            onClick={() => setTab("pasajes")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "pasajes" ? "bg-[#0b5bbb] text-white" : "text-[#425979] hover:bg-[#edf4fc]"}`}
          >
            Pasajes {pendingPasajes.length + approvedPasajes.length > 0 && `(${pendingPasajes.length + approvedPasajes.length})`}
          </button>
          <button
            onClick={() => setTab("ajustes")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "ajustes" ? "bg-[#0b5bbb] text-white" : "text-[#425979] hover:bg-[#edf4fc]"}`}
          >
            Ajustes {pendingAjustes.length > 0 && `(${pendingAjustes.length})`}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#8a99ad]">{status}</span>
          {tab === "pasajes" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setSolicitudModalOpen(true)}>
                <FileSpreadsheet size={15} /> Cargar solicitud a Urbano
              </Button>
              <Button size="sm" onClick={() => setPasajeModalOpen(true)}>
                <ArrowRightLeft size={15} /> Nuevo pasaje
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={cannotCreateAjuste} onClick={() => setAjusteModalOpen(true)}>
              <SlidersHorizontal size={15} /> Nuevo ajuste
            </Button>
          )}
        </div>
      </div>

      {restrictedClients !== null && (
        <div className="mb-4 rounded-xl bg-[#eef3fb] px-4 py-3 text-xs font-bold text-[#52647d]">
          {restrictedClients.length
            ? `Tus clientes asignados: ${restrictedClients.join(", ")}. Podés generar pasajes desde cualquier cliente (los aprueba quien tenga asignado el destino), aprobar los que lleguen a tus clientes y cargar ajustes de tus clientes.`
            : "Podés generar pasajes desde cualquier cliente: los aprueba quien tenga asignado el destino. Para aprobar pasajes o cargar ajustes, pedile a un administrador que te asigne clientes en Permisos."}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
      )}

      {tab === "pasajes" ? (
        <div className="space-y-4">
          <section className="card animate-enter overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Pendientes de aprobación</h2>
              {(() => {
                const mine = pendingPasajes.filter((p) => canAct(p.toClient) && !isOwn(p.createdBy));
                return mine.length > 1 ? (
                  <Button size="sm" disabled={busy} onClick={() => {
                    if (window.confirm(`Aprobar los ${mine.length} pasajes pendientes que te tocan aprobar?`)) void bulk({ action: "approve", ids: mine.map((p) => p.id) }, "pasajes aprobados");
                  }}>
                    <Check size={14} /> Aprobar todos ({mine.length})
                  </Button>
                ) : null;
              })()}
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {pendingPasajes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes pendientes.</p>
              )}
              {pendingPasajes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-xs">
                    <div className="font-bold text-[#10233f]">
                      {p.fromClient} ({p.fromClientCode}) → {p.toClient} ({p.toClientCode})
                    </div>
                    <div className="mt-0.5 text-[#62728a]">
                      {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Cantidad: {p.quantity}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                      Generado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                      {p.comments ? ` · ${p.comments}` : ""}
                    </div>
                    {p.warning && <div className="mt-0.5 text-[10px] font-bold text-[#985b00]">{p.warning}</div>}
                  </div>
                  {canAct(p.toClient) && !isOwn(p.createdBy) ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => respond("pasajes", p.id, "reject")}>
                        <X size={14} /> Rechazar
                      </Button>
                      <Button size="sm" onClick={() => respond("pasajes", p.id, "accept")}>
                        <Check size={14} /> Aprobar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-[#8a99ad]">
                      Esperando la aprobación de {p.toClient}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card animate-enter overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e8f1] bg-white p-4">
              <div>
                <h2 className="text-sm font-black text-[#10233f]">Aprobados · cargar lo que pasó Urbano</h2>
                <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
                  Todavía no se movió stock. Cargá la cantidad que realmente pasó Urbano y confirmá: egresa del origen e
                  ingresa al destino esa cantidad. Si pasó menos, la diferencia queda en el origen; con 0, no se realizó.
                </p>
              </div>
              {(() => {
                const mine = approvedPasajes.filter(canConfirm);
                const selected = mine.filter((p) => selectedConfirm.has(p.id));
                return mine.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedConfirm(selected.length === mine.length ? new Set() : new Set(mine.map((p) => p.id)))}>
                      {selected.length === mine.length ? "Quitar selección" : `Seleccionar todos (${mine.length})`}
                    </Button>
                    <Button size="sm" disabled={busy || selected.length === 0} onClick={() => void confirmSelected(approvedPasajes)}>
                      <Check size={14} /> Confirmar {selected.length || ""}
                    </Button>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {approvedPasajes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes esperando lo que informe Urbano.</p>
              )}
              {approvedPasajes.map((p) => {
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
                        <div className="mt-0.5 text-[#62728a]">
                          {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Solicitado: {requested}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                          Aprobado por {p.respondedBy} el {p.respondedAt ? formatDateTime(p.respondedAt) : ""}{requestLabel(p)}
                          {p.responseComment ? ` · ${p.responseComment}` : ""}
                        </div>
                      </div>
                    </div>
                    {canConfirm(p) ? (
                      <label className="flex items-center gap-2 text-[11px] font-extrabold text-[#334b6b]">
                        Pasó
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
                        <span className={real < requested ? "text-[#985b00]" : "text-[#8a99ad]"}>
                          {real === 0 ? "no se realizó" : real < requested ? `faltan ${requested - real}` : `de ${requested}`}
                        </span>
                      </label>
                    ) : (
                      <span className="text-[10px] font-bold text-[#8a99ad]">Lo confirma {p.createdBy} o quien tenga {p.fromClient}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Historial</h2>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {resolvedPasajes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">Todavía no hay pasajes resueltos.</p>
              )}
              {resolvedPasajes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-xs">
                    <div className="font-bold text-[#10233f]">
                      {p.fromClient} ({p.fromClientCode}) → {p.toClient} ({p.toClientCode})
                    </div>
                    <div className="mt-0.5 text-[#62728a]">
                      {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Cantidad: {p.quantity}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                      {p.respondedBy} el {p.respondedAt ? formatDateTime(p.respondedAt) : ""}
                      {p.responseComment ? ` · ${p.responseComment}` : ""}
                      {p.status === "confirmed" && p.confirmedAt
                        ? ` · Confirmado por ${p.confirmedBy} el ${formatDateTime(p.confirmedAt)}: ${Number(p.confirmedQuantity) === 0 ? "no se realizó" : `pasó ${Number(p.confirmedQuantity)} de ${Number(p.quantity)}`}`
                        : ""}
                      {requestLabel(p)}
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusBadge(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Pendientes de aceptación</h2>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {pendingAjustes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay ajustes pendientes.</p>
              )}
              {pendingAjustes.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-xs">
                    <div className="font-bold text-[#10233f]">
                      {a.client} ({a.clientCode})
                    </div>
                    <div className="mt-0.5 text-[#62728a]">
                      {productByCode.get(a.uniqueCode.toLowerCase()) || a.product || a.uniqueCode} · Cantidad:{" "}
                      {Number(a.quantity) > 0 ? `+${a.quantity}` : a.quantity}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                      Generado por {a.createdBy} el {formatDateTime(a.createdAt)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </div>
                  </div>
                  {canAct(a.client) && !isOwn(a.createdBy) ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => respond("ajustes", a.id, "reject")}>
                        <X size={14} /> Rechazar
                      </Button>
                      <Button size="sm" onClick={() => respond("ajustes", a.id, "accept")}>
                        <Check size={14} /> Aceptar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-[#8a99ad]">Esperando la aprobación de otra persona</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Historial</h2>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {resolvedAjustes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">Todavía no hay ajustes resueltos.</p>
              )}
              {resolvedAjustes.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="text-xs">
                    <div className="font-bold text-[#10233f]">
                      {a.client} ({a.clientCode})
                    </div>
                    <div className="mt-0.5 text-[#62728a]">
                      {productByCode.get(a.uniqueCode.toLowerCase()) || a.product || a.uniqueCode} · Cantidad:{" "}
                      {Number(a.quantity) > 0 ? `+${a.quantity}` : a.quantity}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                      {a.respondedBy} el {a.respondedAt ? formatDateTime(a.respondedAt) : ""}
                      {a.responseComment ? ` · ${a.responseComment}` : ""}
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusBadge(a.status)}`}>
                    {statusLabel(a.status)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {pasajeModalOpen && (
        <PasajeModal
          mappings={mappings}
          productByCode={productByCode}
          allowedClients={null}
          onClose={() => setPasajeModalOpen(false)}
          onCreated={() => {
            setPasajeModalOpen(false);
            void loadAll();
          }}
        />
      )}
      {solicitudModalOpen && (
        <PasajeSolicitudModal onClose={() => setSolicitudModalOpen(false)} onCreated={() => void loadAll()} />
      )}
      {ajusteModalOpen && (
        <AjusteModal
          mappings={mappings}
          allowedClients={restrictedClients}
          onClose={() => setAjusteModalOpen(false)}
          onCreated={() => {
            setAjusteModalOpen(false);
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
        className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs font-normal outline-none focus:border-[#7da4d3] disabled:bg-[#f2f5f9]"
      />
      {open && !disabled && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[#dbe4ef] bg-white shadow-lg">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[11px] font-semibold text-[#8a99ad]">{emptyText ?? "Sin resultados."}</div>
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
              className={`block w-full px-3 py-2 text-left text-xs font-normal hover:bg-[#edf4fc] ${option.value === value ? "bg-[#f4f8fc] font-bold" : ""}`}
            >
              {option.label}
            </button>
          ))}
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

function skuOptionsFrom(mappings: Mapping[], productByCode: Map<string, string>) {
  return distinct(mappings.filter((m) => m.active && m.uniqueCode).map((m) => m.uniqueCode)).map((code) => {
    const name = productByCode.get(code.toLowerCase());
    return { value: code, label: name ? `${name} - ${code}` : code };
  });
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
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
  productByCode: Map<string, string>;
  allowedClients: string[] | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState<PasajeDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const skuOptions = useMemo(() => skuOptionsFrom(mappings, productByCode), [mappings, productByCode]);
  const { forSku, fromPool } = optionsForSku(mappings, draft.sku, allowedClients);
  const fromClients = distinct(fromPool.map((m) => m.client));
  const toClients = distinct(forSku.map((m) => m.client));
  const fromCodes = codesFor(fromPool, draft.fromClient);
  const toCodes = codesFor(forSku, draft.toClient).filter(
    (code) => !(sameText(draft.toClient, draft.fromClient) && sameText(code, draft.fromClientCode)),
  );

  function chooseSku(sku: string) {
    const { fromPool: pool } = optionsForSku(mappings, sku, allowedClients);
    const clients = distinct(pool.map((m) => m.client));
    const fromClient = clients.length === 1 ? clients[0] : "";
    const codes = fromClient ? codesFor(pool, fromClient) : [];
    setDraft({ ...draft, sku, fromClient, fromClientCode: codes.length === 1 ? codes[0] : "", toClient: "", toClientCode: "" });
  }

  function chooseFromClient(client: string) {
    const codes = codesFor(fromPool, client);
    setDraft({ ...draft, fromClient: client, fromClientCode: codes.length === 1 ? codes[0] : "", toClientCode: "" });
  }

  function chooseToClient(client: string) {
    const codes = codesFor(forSku, client).filter(
      (code) => !(sameText(client, draft.fromClient) && sameText(code, draft.fromClientCode)),
    );
    setDraft({ ...draft, toClient: client, toClientCode: codes.length === 1 ? codes[0] : "" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateDraft(draft, mappings, allowedClients);
    if (problem) return setError(problem);
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
      onCreated();
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
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Nuevo pasaje</div>
        <h2 className="mt-2 text-xl font-black">Registrar pasaje entre clientes</h2>
        <p className="mt-1 text-xs text-[#62728a]">
          Elegí primero el producto: se habilitan los clientes y códigos que lo tienen asignado. El receptor lo aprueba y
          después el emisor confirma la cantidad enviada.
        </p>
        <div className="mt-5 space-y-4">
          <SearchSelect
            label="Producto (nombre - código único)"
            value={draft.sku}
            options={skuOptions}
            onChange={chooseSku}
            placeholder="Buscá por nombre o código único"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Cliente origen
              <select
                value={draft.fromClient}
                disabled={!draft.sku}
                onChange={(event) => chooseFromClient(event.target.value)}
                className={selectClass}
              >
                <option value="">{draft.sku ? "Elegí un cliente" : "Primero elegí el producto"}</option>
                {fromClients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
              {draft.sku && fromClients.length === 0 && (
                <span className="mt-1 block text-[10px] font-bold text-[#a43d39]">
                  Ninguno de tus clientes tiene este producto asignado.
                </span>
              )}
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Código cliente origen
              <select
                value={draft.fromClientCode}
                disabled={!draft.fromClient}
                onChange={(event) => setDraft({ ...draft, fromClientCode: event.target.value, toClientCode: "" })}
                className={selectClass}
              >
                <option value="">Elegí un código</option>
                {fromCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Cliente destino
              <select
                value={draft.toClient}
                disabled={!draft.sku}
                onChange={(event) => chooseToClient(event.target.value)}
                className={selectClass}
              >
                <option value="">{draft.sku ? "Elegí un cliente" : "Primero elegí el producto"}</option>
                {toClients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Código cliente destino
              <select
                value={draft.toClientCode}
                disabled={!draft.toClient}
                onChange={(event) => setDraft({ ...draft, toClientCode: event.target.value })}
                className={selectClass}
              >
                <option value="">Elegí un código</option>
                {toCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draft.sku && toClients.length <= 1 && (
            <p className="text-[10px] font-bold text-[#985b00]">
              Solo un cliente tiene este producto asignado: para pasarlo a otro hay que cargar su código cliente en
              Códigos cliente.
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
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            Generar pasaje
          </Button>
        </div>
      </form>
    </div>
  );
}

function AjusteModal({
  mappings,
  allowedClients,
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
  allowedClients: string[] | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [client, setClient] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [uniqueCode, setUniqueCode] = useState("");
  const [direction, setDirection] = useState<"suma" | "resta">("resta");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsedQuantity = Number(quantity);
    if (!client || !clientCode) return setError("Elegí el cliente y su código cliente.");
    if (!parsedQuantity || parsedQuantity <= 0) return setError("Ingresá una cantidad mayor a cero.");
    if (!reason.trim()) return setError("Contá el motivo del ajuste (rotura, faltante, sobrante, etc.).");
    setSubmitting(true);
    try {
      const response = await fetch("/api/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client,
          clientCode,
          uniqueCode,
          quantity: direction === "suma" ? parsedQuantity : -parsedQuantity,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo generar el ajuste.");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el ajuste.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Nuevo ajuste</div>
        <h2 className="mt-2 text-xl font-black">Registrar ajuste de stock</h2>
        <p className="mt-1 text-xs text-[#62728a]">
          Necesita que otra persona lo apruebe antes de impactar en el stock.
        </p>
        <div className="mt-5 space-y-4">
          <ClientCodeSelect
            label="Cliente"
            mappings={mappings}
            allowedClients={allowedClients}
            clientValue={client}
            codeValue={clientCode}
            onChange={(nextClient, nextCode, nextUniqueCode) => {
              setClient(nextClient);
              setClientCode(nextCode);
              setUniqueCode(nextUniqueCode);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Tipo
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as "suma" | "resta")}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3]"
              >
                <option value="resta">Resta stock (rotura, faltante)</option>
                <option value="suma">Suma stock (sobrante)</option>
              </select>
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Cantidad
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
              />
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b] sm:col-span-1">
              Motivo
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Rotura, faltante..."
                className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
              />
            </label>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            Generar ajuste
          </Button>
        </div>
      </form>
    </div>
  );
}
