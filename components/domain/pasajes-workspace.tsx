"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, FileSpreadsheet, MapPin, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasajeBatchesSection, type PasajeBatch } from "@/components/domain/pasaje-batches";
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
  urbanoInformed: { received: number; vouchers: string[]; exact: boolean } | null;
  requestDate: string | null;
  warning: string | null;
  sourceRow: number | null;
  fromDescription: string | null;
  batch: { fileName: string | null; requestDate: string | null } | null;
};

type UrbanoOutgoing = {
  id: number;
  date: string;
  voucher: string | null;
  company: string | null;
  client: string | null;
  clientCode: string;
  product: string | null;
  outQuantity: number;
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
  const [solicitudModalOpen, setSolicitudModalOpen] = useState(false);
  const [batches, setBatches] = useState<PasajeBatch[]>([]);
  const [urbanoWithoutPasaje, setUrbanoWithoutPasaje] = useState<UrbanoOutgoing[]>([]);
  const [selectedApprove, setSelectedApprove] = useState<Set<string>>(new Set());
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
  // Destino elegido para cada pasaje sin destino, como "cliente|código".
  const [destinationChoice, setDestinationChoice] = useState<Record<string, string>>({});
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
  // Los ajustes se cargan solo de los clientes asignados; los pasajes, desde cualquier cliente.
  const cannotCreateAjuste = restrictedClients !== null && restrictedClients.length === 0;

  async function loadAll() {
    try {
      const [mappingsRes, productsRes, pasajesRes, ajustesRes, batchesRes, controlRes] = await Promise.all([
        fetch("/api/lookups?kind=client-codes"),
        fetch("/api/lookups?kind=products"),
        fetch("/api/pasajes"),
        fetch("/api/ajustes"),
        fetch("/api/pasajes/lotes", { cache: "no-store" }),
        fetch("/api/pasajes/control-urbano", { cache: "no-store" }),
      ]);
      const [mappingsData, productsData, pasajesData, ajustesData, batchesData, controlData] = await Promise.all([
        mappingsRes.json(),
        productsRes.json(),
        pasajesRes.json(),
        ajustesRes.json(),
        batchesRes.ok ? batchesRes.json() : { batches: [] },
        controlRes.ok ? controlRes.json() : { outgoings: [] },
      ]);
      setBatches(batchesData.batches ?? []);
      setUrbanoWithoutPasaje(controlData.outgoings ?? []);
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

  async function respond(kind: "pasajes" | "ajustes", id: string, action: "accept" | "reject" | "cancel" | "approve") {
    setError("");
    if (action === "cancel" && !window.confirm("¿Rechazar el pasaje? Se revierte el egreso, el stock vuelve al origen y se borra el ingreso pendiente.")) return;
    if (action === "reject" && !window.confirm("¿Rechazar el ajuste? El stock queda sin cambios.")) return;
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
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Cliente destino"
        value={destinationChoice[p.id] ?? ""}
        onChange={(event) => setDestinationChoice((current) => ({ ...current, [p.id]: event.target.value }))}
        className="h-9 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs outline-none focus:border-[#7da4d3]"
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
      <Button size="sm" variant={lacksDestination(p) ? "primary" : "secondary"} disabled={busy || !destinationChoice[p.id]} onClick={() => void setDestination(p)}>
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

  const withoutDestination = pasajes.filter(lacksDestination);
  const openPasajes = pasajes.filter(isOpenPasaje);
  const awaitingApproval = pasajes.filter((p) => p.status === "pending");
  const awaitingArrival = pasajes.filter((p) => p.status === "approved");
  const resolvedPasajes = pasajes.filter((p) => !isOpenPasaje(p) && !lacksDestination(p));
  const pendingPasajes = withoutDestination.length + openPasajes.length;
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
            Pasajes {pendingPasajes > 0 && `(${pendingPasajes})`}
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
              <Button size="sm" variant="secondary" onClick={() => setPasajeModalOpen(true)}>
                <ArrowRightLeft size={15} /> Un pasaje
              </Button>
              <Button size="sm" onClick={() => setSolicitudModalOpen(true)}>
                <FileSpreadsheet size={15} /> Cargar pasajes
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
            ? `Tus clientes asignados: ${restrictedClients.join(", ")}. Podés cargar pasajes desde cualquier cliente y ajustes de tus clientes.`
            : "Podés cargar pasajes desde cualquier cliente. Para cargar ajustes, pedile a un administrador que te asigne clientes en Permisos."}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
      )}

      {tab === "pasajes" ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#eef3fb] px-4 py-3 text-xs font-bold text-[#52647d]">
            Los pasajes se cargan acá (&quot;Cargar pasajes&quot;): egresan del origen en el momento y dejan el ingreso pendiente en
            el destino. Los aprueba la encargada del cliente origen y, cuando Urbano avisa por correo que llegaron, los confirma la
            encargada del cliente destino. De cada carga se bajan el Excel para mandarle a Urbano y la planilla para subir en Urbano.
          </div>

          {urbanoWithoutPasaje.length > 0 && (
            <section className="card animate-enter overflow-hidden border border-[#f4c16d]">
              <div className="border-b border-[#f4dcae] bg-[#fff8ec] p-4">
                <h2 className="flex items-center gap-2 text-sm font-black text-[#985b00]">
                  <AlertTriangle size={15} /> Salidas de Urbano sin pasaje cargado ({urbanoWithoutPasaje.length})
                </h2>
                <p className="mt-1 text-[10px] font-semibold text-[#985b00]">
                  Urbano sacó estas unidades como &quot;Pasaje de stock&quot; y no hay un pasaje cargado con el mismo código origen y
                  cantidad. No tocan el stock: cargá el pasaje (se vincula solo) o avisale a Urbano si no correspondía.
                </p>
              </div>
              <div className="max-h-[260px] divide-y divide-[#f4e6cc] overflow-auto">
                {urbanoWithoutPasaje.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
                    <div>
                      <span className="font-bold text-[#10233f]">{item.client ?? `Cuenta ${item.company ?? "?"}`} ({item.clientCode})</span>
                      <span className="text-[#62728a]"> · {item.product || "—"} · Salieron {item.outQuantity}</span>
                    </div>
                    <span className="text-[10px] text-[#8a99ad]">{formatDateTime(item.date)}{item.voucher ? ` · ${item.voucher}` : ""}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {withoutDestination.length > 0 && (
          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Sin destino</h2>
              <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
                Pasajes que se crearon solos con una salida de Urbano, antes de que se cargaran en la plataforma. Elegí a qué
                cliente fue y sigue como cualquier pasaje; si no era un pasaje, cancelalo y el stock vuelve al origen.
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
                      <div className="mt-0.5 text-[#62728a]">
                        {productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · Salieron: {Number(p.quantity)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                        {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                        {p.comments ? ` · ${p.comments}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {options.length ? destinationPicker(p, "Guardar destino") : (
                        <span className="text-[10px] font-bold text-[#a43d39]">
                          Ningún otro cliente tiene el código único {p.uniqueCode}: cargalo en Códigos Cliente.
                        </span>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => respond("pasajes", p.id, "cancel")}>
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
                <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
                  El egreso del origen ya está hecho y el ingreso al destino quedó pendiente. Lo aprueba la encargada del cliente
                  origen; si lo rechaza, el stock vuelve al origen y se borra el ingreso pendiente.
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
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes esperando aprobación.</p>
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
                        <div className="mt-0.5 text-[#62728a]">
                          {p.fromDescription || productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · {Number(p.quantity)} u.
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                          Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                          {p.comments ? ` · ${p.comments}` : ""}
                        </div>
                        {p.warning && <div className="mt-0.5 text-[10px] font-bold text-[#985b00]">{p.warning}</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canApprove(p) ? (
                      <Button size="sm" onClick={() => void respond("pasajes", p.id, "approve")}>
                        <Check size={14} /> Aprobar
                      </Button>
                    ) : (
                      <span className="text-[10px] font-bold text-[#8a99ad]">Lo aprueba la encargada de {p.fromClient}</span>
                    )}
                    {canCancel(p) && (
                      <Button size="sm" variant="secondary" onClick={() => void respond("pasajes", p.id, "cancel")}>
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
                <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
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
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes esperando que lleguen al destino.</p>
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
                        <div className="mt-0.5 text-[#62728a]">
                          {p.fromDescription || productByCode.get(p.uniqueCode.toLowerCase()) || p.product || p.uniqueCode} · {Number(p.quantity)} u.
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#8a99ad]">
                          Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                          {p.comments ? ` · ${p.comments}` : ""}
                        </div>
                        {p.warning && <div className="mt-0.5 text-[10px] font-bold text-[#985b00]">{p.warning}</div>}
                        {p.respondedBy && p.respondedAt && (
                          <div className="mt-0.5 text-[10px] text-[#8a99ad]">Aprobado por {p.respondedBy} el {formatDateTime(p.respondedAt)}</div>
                        )}
                        {p.urbanoInformed && (
                          <div className={`mt-0.5 text-[10px] font-bold ${p.urbanoInformed.exact ? "text-[#23783a]" : "text-[#985b00]"}`}>
                            {p.urbanoInformed.exact
                              ? `En los movimientos de Urbano ya figura una recepción de ${p.urbanoInformed.received}${p.urbanoInformed.vouchers.length ? ` (${p.urbanoInformed.vouchers.join(", ")})` : ""}.`
                              : `En los movimientos de Urbano figura una recepción de ${p.urbanoInformed.received} y se pasaron ${requested}${p.urbanoInformed.vouchers.length ? ` (${p.urbanoInformed.vouchers.join(", ")})` : ""}.`}
                          </div>
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
                          <span className={real < requested ? "text-[#985b00]" : "text-[#8a99ad]"}>
                            {real === 0 ? "no llegó" : real < requested ? `faltan ${requested - real}` : `de ${requested}`}
                          </span>
                        </label>
                      ) : (
                        <span className="text-[10px] font-bold text-[#8a99ad]">Lo confirma la encargada de {p.toClient}</span>
                      )}
                      {canCancel(p) && (
                        <Button size="sm" variant="secondary" onClick={() => void respond("pasajes", p.id, "cancel")}>
                          <X size={14} /> Rechazar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <PasajeBatchesSection batches={batches} />

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
                      Cargado por {p.createdBy} el {formatDateTime(p.createdAt)}
                      {p.respondedBy && p.respondedAt ? ` · ${p.status === "rejected" ? "Rechazado" : "Aprobado"} por ${p.respondedBy} el ${formatDateTime(p.respondedAt)}` : ""}
                      {p.responseComment ? ` · ${p.responseComment}` : ""}
                      {p.status === "confirmed" && p.confirmedAt
                        ? ` · Confirmado por ${p.confirmedBy} el ${formatDateTime(p.confirmedAt)}: ${Number(p.confirmedQuantity) === 0 ? "no llegó" : `llegaron ${Number(p.confirmedQuantity)} de ${Number(p.quantity)}`}`
                        : ""}
                      {p.urbanoVoucher ? ` · Comprobante de Urbano ${p.urbanoVoucher}` : ""}
                      {requestLabel(p)}
                    </div>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusBadge(p.status)}`}>
                    {pasajeStatusLabel(p.status)}
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
          onCreated={(warning) => {
            setPasajeModalOpen(false);
            setStatus(warning ? `Pasaje cargado. ${warning}` : "Pasaje cargado: espera la aprobación de la encargada del origen.");
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
  onCreated: (warning: string | null) => void;
}) {
  const [draft, setDraft] = useState<PasajeDraft>(emptyDraft);
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
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Nuevo pasaje</div>
        <h2 className="mt-2 text-xl font-black">Registrar pasaje entre clientes</h2>
        <p className="mt-1 text-xs text-[#62728a]">
          Elegí primero el producto: se habilitan los clientes y códigos que lo tienen asignado. Al generarlo egresa del
          origen y deja creado el ingreso pendiente en el destino, que se confirma cuando Urbano informa la recepción.
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
              {stock && (
                <span className={`mt-1 block text-[10px] font-bold ${shortage ? "text-[#985b00]" : "text-[#62728a]"}`}>
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
              Si lo generás igual, egresa {requested} y el stock del origen queda en negativo.
            </span>
          </div>
        )}
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
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
