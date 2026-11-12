"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  if (status === "pending") return "Pendiente";
  if (status === "confirmed") return "Confirmado";
  if (status === "accepted") return "Aceptado";
  return "Rechazado";
}

function pasajeStatusLabel(status: string) {
  return status === "rejected" ? "Cancelado" : statusLabel(status);
}

const isOpenPasaje = (p: { status: string }) => p.status === "pending" || p.status === "approved";
const lacksDestination = (p: { status: string }) => p.status === "no_destination";
// Quien figura como creador de los pasajes que salen de Urbano (URBANO_ACTOR en el servidor).
const URBANO_ACTOR = "Urbano (automático)";

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
  // Los ajustes se cargan solo de los clientes asignados; los pasajes los crea la salida de Urbano.
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

  async function respond(kind: "pasajes" | "ajustes", id: string, action: "accept" | "reject" | "cancel") {
    setError("");
    if (action === "cancel" && !window.confirm("¿Cancelar el pasaje? Se revierte el egreso y el stock vuelve al origen.")) return;
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
    if (!window.confirm(`Confirmar ${items.length} ${items.length === 1 ? "pasaje" : "pasajes"}${partial.length ? ` (${partial.length} con menos cantidad que la solicitada; la diferencia vuelve al origen)` : ""}? Ingresa al destino la cantidad real.`)) return;
    await bulk({ action: "confirm", items }, "pasajes confirmados");
  }

  const withoutDestination = pasajes.filter(lacksDestination);
  const openPasajes = pasajes.filter(isOpenPasaje);
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
          {tab === "ajustes" && (
            <Button size="sm" disabled={cannotCreateAjuste} onClick={() => setAjusteModalOpen(true)}>
              <SlidersHorizontal size={15} /> Nuevo ajuste
            </Button>
          )}
        </div>
      </div>

      {restrictedClients !== null && (
        <div className="mb-4 rounded-xl bg-[#eef3fb] px-4 py-3 text-xs font-bold text-[#52647d]">
          {restrictedClients.length
            ? `Tus clientes asignados: ${restrictedClients.join(", ")}. Podés cargar ajustes de tus clientes.`
            : "Para cargar ajustes, pedile a un administrador que te asigne clientes en Permisos."}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
      )}

      {tab === "pasajes" ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#eef3fb] px-4 py-3 text-xs font-bold text-[#52647d]">
            Los pasajes no se cargan a mano: se crean solos cada mañana con las salidas que Urbano informa como
            &quot;Pasaje de stock&quot;, y egresan del origen en ese momento. Urbano no informa el destino, así que hay que elegirlo.
          </div>

          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Sin destino</h2>
              <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
                Urbano informó la salida del origen. Elegí a qué cliente fue: después se confirma solo cuando Urbano informa la recepción.
                Si no era un pasaje, cancelalo y el stock vuelve al origen.
              </p>
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {withoutDestination.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes sin destino.</p>
              )}
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

          <section className="card animate-enter overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e8f1] bg-white p-4">
              <div>
                <h2 className="text-sm font-black text-[#10233f]">Esperando a Urbano</h2>
                <p className="mt-1 text-[10px] font-semibold text-[#8a99ad]">
                  El egreso ya está registrado y el ingreso sigue pendiente. Se confirma solo cuando Urbano informa una recepción
                  con la misma cantidad. Si informa otra cantidad, revisalo y confirmá a mano: si pasó menos, la diferencia vuelve
                  al origen; con 0, se revierte el egreso.
                </p>
              </div>
              {(() => {
                const mine = openPasajes.filter(canConfirm);
                const selected = mine.filter((p) => selectedConfirm.has(p.id));
                return mine.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedConfirm(selected.length === mine.length ? new Set() : new Set(mine.map((p) => p.id)))}>
                      {selected.length === mine.length ? "Quitar selección" : `Seleccionar todos (${mine.length})`}
                    </Button>
                    <Button size="sm" disabled={busy || selected.length === 0} onClick={() => void confirmSelected(openPasajes)}>
                      <Check size={14} /> Confirmar {selected.length || ""}
                    </Button>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="divide-y divide-[#e7edf4]">
              {openPasajes.length === 0 && (
                <p className="p-4 text-xs font-semibold text-[#8a99ad]">No hay pasajes esperando lo que informe Urbano.</p>
              )}
              {openPasajes.map((p) => {
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
                          Generado por {p.createdBy} el {formatDateTime(p.createdAt)}{requestLabel(p)}
                          {p.comments ? ` · ${p.comments}` : ""}
                        </div>
                        {p.warning && <div className="mt-0.5 text-[10px] font-bold text-[#985b00]">{p.warning}</div>}
                        {p.urbanoInformed && (
                          <div className={`mt-0.5 text-[10px] font-bold ${p.urbanoInformed.exact ? "text-[#23783a]" : "text-[#985b00]"}`}>
                            {p.urbanoInformed.exact
                              ? `Urbano ya informó la recepción${p.urbanoInformed.vouchers.length ? ` (${p.urbanoInformed.vouchers.join(", ")})` : ""}: se confirma en la próxima carga de movimientos.`
                              : `Para revisar: Urbano informó ${p.urbanoInformed.received} y se pidieron ${requested}${p.urbanoInformed.vouchers.length ? ` (${p.urbanoInformed.vouchers.join(", ")})` : ""}.`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Un pasaje creado desde Urbano tuvo el destino elegido a mano: se puede corregir. */}
                      {p.createdBy === URBANO_ACTOR && destinationOptions(p).length > 1 && destinationPicker(p, "Cambiar destino")}
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
                        <span className="text-[10px] font-bold text-[#8a99ad]">A mano lo confirma {p.createdBy} o quien tenga {p.fromClient}</span>
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
                      Generado por {p.createdBy} el {formatDateTime(p.createdAt)}
                      {p.respondedBy && p.respondedAt ? ` · ${p.status === "rejected" ? "Cancelado" : "Aprobado"} por ${p.respondedBy} el ${formatDateTime(p.respondedAt)}` : ""}
                      {p.responseComment ? ` · ${p.responseComment}` : ""}
                      {p.status === "confirmed" && p.confirmedAt
                        ? ` · Confirmado por ${p.confirmedBy} el ${formatDateTime(p.confirmedAt)}: ${Number(p.confirmedQuantity) === 0 ? "no se realizó" : `pasó ${Number(p.confirmedQuantity)} de ${Number(p.quantity)}`}`
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
