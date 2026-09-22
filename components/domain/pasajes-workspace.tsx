"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, SlidersHorizontal, X } from "lucide-react";
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
  status: "pending" | "accepted" | "rejected";
  comments: string | null;
  createdBy: string;
  createdAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseComment: string | null;
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
  if (status === "accepted") return "bg-[#e7f7eb] text-[#23783a] ring-[#c9ebd1]";
  return "bg-[#fce9e8] text-[#a43d39] ring-[#f4c6c4]";
}

function statusLabel(status: string) {
  if (status === "pending") return "Pendiente";
  if (status === "accepted") return "Aceptado";
  return "Rechazado";
}

function ClientCodeSelect({
  label,
  mappings,
  clientValue,
  codeValue,
  onChange,
}: {
  label: string;
  mappings: Mapping[];
  clientValue: string;
  codeValue: string;
  onChange: (client: string, clientCode: string, uniqueCode: string) => void;
}) {
  const clients = useMemo(
    () =>
      Array.from(new Set(mappings.filter((m) => m.active).map((m) => m.client)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es")),
    [mappings],
  );
  const codes = useMemo(
    () =>
      mappings
        .filter((m) => m.active && m.client === clientValue)
        .sort((a, b) => a.clientCode.localeCompare(b.clientCode, "es", { numeric: true })),
    [mappings, clientValue],
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

export function PasajesWorkspace() {
  const [tab, setTab] = useState<"pasajes" | "ajustes">("pasajes");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [products, setProducts] = useState<ProductLookup[]>([]);
  const [pasajes, setPasajes] = useState<Pasaje[]>([]);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [status, setStatus] = useState("Cargando...");
  const [pasajeModalOpen, setPasajeModalOpen] = useState(false);
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
  const [error, setError] = useState("");

  const productByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.code.toLowerCase(), product.name);
    return map;
  }, [products]);

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

  const pendingPasajes = pasajes.filter((p) => p.status === "pending");
  const resolvedPasajes = pasajes.filter((p) => p.status !== "pending");
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
            Pasajes {pendingPasajes.length > 0 && `(${pendingPasajes.length})`}
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
            <Button size="sm" onClick={() => setPasajeModalOpen(true)}>
              <ArrowRightLeft size={15} /> Nuevo pasaje
            </Button>
          ) : (
            <Button size="sm" onClick={() => setAjusteModalOpen(true)}>
              <SlidersHorizontal size={15} /> Nuevo ajuste
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>
      )}

      {tab === "pasajes" ? (
        <div className="space-y-4">
          <section className="card animate-enter overflow-hidden">
            <div className="border-b border-[#e1e8f1] bg-white p-4">
              <h2 className="text-sm font-black text-[#10233f]">Pendientes de aceptación</h2>
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
                      Generado por {p.createdBy} el {formatDateTime(p.createdAt)}
                      {p.comments ? ` · ${p.comments}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => respond("pasajes", p.id, "reject")}>
                      <X size={14} /> Rechazar
                    </Button>
                    <Button size="sm" onClick={() => respond("pasajes", p.id, "accept")}>
                      <Check size={14} /> Aceptar
                    </Button>
                  </div>
                </div>
              ))}
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
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => respond("ajustes", a.id, "reject")}>
                      <X size={14} /> Rechazar
                    </Button>
                    <Button size="sm" onClick={() => respond("ajustes", a.id, "accept")}>
                      <Check size={14} /> Aceptar
                    </Button>
                  </div>
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
          onClose={() => setPasajeModalOpen(false)}
          onCreated={() => {
            setPasajeModalOpen(false);
            void loadAll();
          }}
        />
      )}
      {ajusteModalOpen && (
        <AjusteModal
          mappings={mappings}
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

function PasajeModal({
  mappings,
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fromClient, setFromClient] = useState("");
  const [fromClientCode, setFromClientCode] = useState("");
  const [fromUniqueCode, setFromUniqueCode] = useState("");
  const [toClient, setToClient] = useState("");
  const [toClientCode, setToClientCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsedQuantity = Number(quantity);
    if (!fromClient || !fromClientCode) return setError("Elegí la empresa emisora y su código cliente.");
    if (!toClient || !toClientCode) return setError("Elegí la empresa receptora y su código cliente.");
    if (!parsedQuantity || parsedQuantity <= 0) return setError("Ingresá una cantidad mayor a cero.");
    setSubmitting(true);
    try {
      const response = await fetch("/api/pasajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromClient,
          fromClientCode,
          toClient,
          toClientCode,
          uniqueCode: fromUniqueCode,
          quantity: parsedQuantity,
          comments,
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
      <form onSubmit={submit} className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Nuevo pasaje</div>
        <h2 className="mt-2 text-xl font-black">Registrar pasaje entre clientes</h2>
        <p className="mt-1 text-xs text-[#62728a]">
          La empresa receptora deberá aceptarlo para que impacte en el stock. Si lo rechaza, no pasa nada.
        </p>
        <div className="mt-5 space-y-4">
          <ClientCodeSelect
            label="Empresa emisora"
            mappings={mappings}
            clientValue={fromClient}
            codeValue={fromClientCode}
            onChange={(client, code, uniqueCode) => {
              setFromClient(client);
              setFromClientCode(code);
              setFromUniqueCode(uniqueCode);
            }}
          />
          <ClientCodeSelect
            label="Empresa receptora"
            mappings={mappings}
            clientValue={toClient}
            codeValue={toClientCode}
            onChange={(client, code) => {
              setToClient(client);
              setToClientCode(code);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
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
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Comentario (opcional)
              <input
                value={comments}
                onChange={(event) => setComments(event.target.value)}
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
            Generar pasaje
          </Button>
        </div>
      </form>
    </div>
  );
}

function AjusteModal({
  mappings,
  onClose,
  onCreated,
}: {
  mappings: Mapping[];
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
