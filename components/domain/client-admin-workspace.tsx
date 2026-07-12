"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type RateItem = {
  id: string;
  clientId: string;
  clientName: string;
  effectiveFrom: string;
  rateName: string;
  rateKey: string;
  applies: boolean;
  valuePct: number;
  appliesTo: "COSTO" | "PRECIO";
  sortOrder: number;
  createdAt?: string;
};

type ClientConfig = {
  effectiveFrom: string;
  items: RateItem[];
};

type Client = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  configs: ClientConfig[];
};

type ApiResponse = { clients: Client[] };

const APPLIES_TO_OPTIONS: { value: "COSTO" | "PRECIO"; label: string; description: string }[] = [
  { value: "COSTO", label: "Costo DG", description: "Se aplica sobre el Costo DG sin IVA" },
  { value: "PRECIO", label: "PVC sin IVA", description: "Se aplica sobre el precio de venta sin IVA" },
];

const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodDisplay(period: string) {
  const [year, month] = period.split("-");
  return `${months[Number(month) - 1]} ${year}`;
}

type DraftRateItem = Omit<RateItem, "id" | "clientId" | "clientName" | "effectiveFrom">;

function emptyRateItem(): DraftRateItem {
  return { rateName: "", rateKey: "", applies: true, valuePct: 0, appliesTo: "PRECIO", sortOrder: 99 };
}

export function ClientAdminWorkspace() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(null);

  // New client modal
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientError, setClientError] = useState("");

  // New config modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configClientId, setConfigClientId] = useState<string | null>(null);
  const [configMonth, setConfigMonth] = useState(String(currentMonth));
  const [configYear, setConfigYear] = useState(String(currentYear));
  const [configItems, setConfigItems] = useState<DraftRateItem[]>([]);
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    fetch("/api/local-db/clients")
      .then((r) => r.json())
      .then((data: ApiResponse) => setClients(data.clients ?? []))
      .catch(() => setStatus("No se pudieron cargar los clientes."))
      .finally(() => setLoading(false));
  }, []);

  async function persistClients(next: Client[]) {
    setSaving(true);
    try {
      const allRates = next.flatMap((c) => c.configs.flatMap((cfg) => cfg.items));
      const res = await fetch("/api/local-db/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: next.map(({ id, name, active, createdAt }) => ({ id, name, active, createdAt })),
          rates: allRates,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message ?? "Error al guardar.");
      setClients(next);
      setStatus("Guardado correctamente.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Client modal ──────────────────────────────────────────────────────────

  function openNewClient() {
    setEditingClientId(null);
    setClientName("");
    setClientError("");
    setClientModalOpen(true);
  }

  function openEditClient(client: Client) {
    setEditingClientId(client.id);
    setClientName(client.name);
    setClientError("");
    setClientModalOpen(true);
  }

  function saveClient(e: FormEvent) {
    e.preventDefault();
    const trimmed = clientName.trim();
    if (!trimmed) { setClientError("El nombre es obligatorio."); return; }
    const duplicate = clients.some(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase() && c.id !== editingClientId,
    );
    if (duplicate) { setClientError("Ya existe un cliente con ese nombre."); return; }

    let next: Client[];
    if (editingClientId) {
      next = clients.map((c) =>
        c.id === editingClientId ? { ...c, name: trimmed } : c,
      );
    } else {
      const id = `client-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
      next = [...clients, { id, name: trimmed, active: true, configs: [] }];
    }
    persistClients(next);
    setClientModalOpen(false);
  }

  function toggleClientActive(clientId: string) {
    const next = clients.map((c) =>
      c.id === clientId ? { ...c, active: !c.active } : c,
    );
    persistClients(next);
  }

  // ── Config modal ──────────────────────────────────────────────────────────

  function openNewConfig(client: Client) {
    setConfigClientId(client.id);
    setConfigMonth(String(currentMonth));
    setConfigYear(String(currentYear));
    // Clone latest config items as starting point, or use empty defaults
    const latest = client.configs[0];
    setConfigItems(
      latest
        ? latest.items.map(({ rateName, rateKey, applies, valuePct, appliesTo, sortOrder }) => ({
            rateName, rateKey, applies, valuePct, appliesTo, sortOrder,
          }))
        : [{ rateName: "", rateKey: "", applies: true, valuePct: 0, appliesTo: "PRECIO" as const, sortOrder: 1 }],
    );
    setConfigError("");
    setConfigModalOpen(true);
  }

  function addRateRow() {
    setConfigItems((prev) => [...prev, { ...emptyRateItem(), sortOrder: prev.length + 1 }]);
  }

  function removeRateRow(index: number) {
    setConfigItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRateRow(index: number, field: string, value: string | boolean | number) {
    setConfigItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === "rateName" && typeof value === "string") {
          updated.rateKey = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        }
        return updated;
      }),
    );
  }

  function saveConfig(e: FormEvent) {
    e.preventDefault();
    if (!configClientId) return;
    const hasEmpty = configItems.some((r) => !r.rateName.trim());
    if (hasEmpty) { setConfigError("Todos los ítems deben tener un nombre."); return; }

    const period = periodLabel(Number(configYear), Number(configMonth));
    const client = clients.find((c) => c.id === configClientId)!;
    const newItems: RateItem[] = configItems.map((item, i) => ({
      id: `rate-${configClientId}-${item.rateKey || i}-${period}-${Date.now()}`,
      clientId: configClientId,
      clientName: client.name,
      effectiveFrom: period,
      ...item,
      sortOrder: i + 1,
    }));

    // Replace items for this period, keep other periods
    const otherItems = client.configs
      .filter((cfg) => cfg.effectiveFrom !== period)
      .flatMap((cfg) => cfg.items);
    const allItems = [...otherItems, ...newItems].sort((a, b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom),
    );
    const periods = Array.from(new Set(allItems.map((r) => r.effectiveFrom)));
    const newConfigs: ClientConfig[] = periods.map((p) => ({
      effectiveFrom: p,
      items: allItems.filter((r) => r.effectiveFrom === p).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    const next = clients.map((c) =>
      c.id === configClientId ? { ...c, configs: newConfigs } : c,
    );
    persistClients(next);
    setConfigModalOpen(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-24 text-center text-sm text-[#74849a]">Cargando clientes...</div>
    );
  }

  const activeClients = clients.filter((c) => c.active);
  const inactiveClients = clients.filter((c) => !c.active);

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Clientes"
        description="Gestioná la lista de clientes y la configuración de tasas para la estructura de costos."
      />

      {status && (
        <div className="mb-4 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3 text-[11px] font-bold text-[#62728a]">
          {status}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4">
          <div>
            <div className="eyebrow">Panel de administración</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">
              {activeClients.length} clientes activos
            </h2>
          </div>
          <Button size="sm" onClick={openNewClient} disabled={saving}>
            <Plus size={15} /> Nuevo cliente
          </Button>
        </div>

        <div className="divide-y divide-[#e7edf4]">
          {clients.map((client) => {
            const isExpanded = expandedId === client.id;
            const isHistoryExpanded = historyExpandedId === client.id;
            const latestConfig = client.configs[0];
            const hasHistory = client.configs.length > 1;

            return (
              <div key={client.id} className={client.active ? "" : "bg-[#fafafa] opacity-70"}>
                {/* Client row */}
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#10233f]">{client.name}</span>
                      <button type="button" onClick={() => toggleClientActive(client.id)}>
                        <Badge tone={client.active ? "success" : "neutral"} dot>
                          {client.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </button>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#74849a]">
                      {latestConfig
                        ? `Config. vigente desde ${periodDisplay(latestConfig.effectiveFrom)} · ${latestConfig.items.filter((r) => r.applies).length} tasas activas`
                        : "Sin configuración de tasas"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEditClient(client)}
                      className="h-8 px-3 text-[10px]"
                    >
                      <Pencil size={13} /> Editar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openNewConfig(client)}
                      disabled={saving}
                      className="h-8 px-3 text-[10px]"
                    >
                      <Plus size={13} /> Nueva config
                    </Button>
                    {latestConfig && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : client.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#dbe4ef] text-[#62728a] hover:bg-[#edf4fc]"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Config detail */}
                {isExpanded && latestConfig && (
                  <div className="border-t border-[#e7edf4] bg-[#f8fafd] px-5 pb-4 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
                        Tasas vigentes desde {periodDisplay(latestConfig.effectiveFrom)}
                      </div>
                      {hasHistory && (
                        <button
                          type="button"
                          onClick={() => setHistoryExpandedId(isHistoryExpanded ? null : client.id)}
                          className="flex items-center gap-1 text-[10px] font-bold text-[#0b5bbb] hover:underline"
                        >
                          <History size={12} />
                          {isHistoryExpanded ? "Ocultar historial" : `Ver historial (${client.configs.length - 1} versión${client.configs.length > 2 ? "es" : ""})`}
                        </button>
                      )}
                    </div>
                    <RateTable items={latestConfig.items} />

                    {isHistoryExpanded && (
                      <div className="mt-4 space-y-3">
                        {client.configs.slice(1).map((cfg) => (
                          <div key={cfg.effectiveFrom}>
                            <div className="mb-1 text-[10px] font-bold text-[#74849a]">
                              Desde {periodDisplay(cfg.effectiveFrom)}
                            </div>
                            <RateTable items={cfg.items} muted />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {clients.length === 0 && (
          <div className="py-16 text-center text-xs text-[#74849a]">
            No hay clientes cargados. Creá el primero.
          </div>
        )}
      </section>

      {/* ── Client modal ───────────────────────────────────────────────────── */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button className="absolute inset-0" aria-label="Cerrar" onClick={() => setClientModalOpen(false)} />
          <form
            onSubmit={saveClient}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setClientModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Clientes</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              {editingClientId ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <div className="mt-5">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Nombre del cliente *
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ej: Santander"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                  autoFocus
                />
              </label>
            </div>
            {clientError && (
              <div className="mt-3 rounded-xl bg-[#fce9e8] px-3 py-2 text-xs font-bold text-[#a43d39]">
                {clientError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setClientModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Config modal ────────────────────────────────────────────────────── */}
      {configModalOpen && configClientId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button className="absolute inset-0" aria-label="Cerrar" onClick={() => setConfigModalOpen(false)} />
          <form
            onSubmit={saveConfig}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setConfigModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">
              {clients.find((c) => c.id === configClientId)?.name}
            </div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">Nueva configuración de tasas</h2>
            <p className="mt-1 text-[11px] text-[#62728a]">
              Definí las tasas que aplican a este cliente y desde cuándo rigen. La configuración anterior se conserva como historial.
            </p>

            <div className="mt-5 flex gap-3">
              <label className="flex-1 text-[11px] font-extrabold text-[#334b6b]">
                Mes
                <select
                  value={configMonth}
                  onChange={(e) => setConfigMonth(e.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
                >
                  {months.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-[11px] font-extrabold text-[#334b6b]">
                Año
                <select
                  value={configYear}
                  onChange={(e) => setConfigYear(e.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
                >
                  {Array.from({ length: 6 }, (_, i) => currentYear - 1 + i).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-[#334b6b]">Tasas</span>
                <button
                  type="button"
                  onClick={addRateRow}
                  className="flex items-center gap-1 text-[10px] font-bold text-[#0b5bbb] hover:underline"
                >
                  <Plus size={12} /> Agregar tasa
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#dbe4ef]">
                <table className="w-full min-w-[560px] text-[11px]">
                  <thead>
                    <tr className="border-b border-[#dbe4ef] bg-[#f8fafd] text-left font-bold text-[#425979]">
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-2 py-2 text-center">¿Aplica?</th>
                      <th className="px-2 py-2 text-right">Valor %</th>
                      <th className="px-2 py-2">Base de cálculo</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e7edf4]">
                    {configItems.map((item, index) => (
                      <tr key={index} className={item.applies ? "" : "opacity-50"}>
                        <td className="px-3 py-1.5">
                          <input
                            value={item.rateName}
                            onChange={(e) => updateRateRow(index, "rateName", e.target.value)}
                            placeholder="Ej: Imp. Misiones"
                            className="h-7 w-full rounded-md border border-[#dbe4ef] px-2 text-[11px] outline-none focus:border-[#7da4d3]"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.applies}
                            onChange={(e) => updateRateRow(index, "applies", e.target.checked)}
                            className="h-4 w-4 rounded accent-[#0b5bbb]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={item.valuePct}
                            onChange={(e) => updateRateRow(index, "valuePct", Number(e.target.value))}
                            disabled={!item.applies}
                            className="h-7 w-20 rounded-md border border-[#dbe4ef] px-2 text-right text-[11px] outline-none focus:border-[#7da4d3] disabled:bg-[#f8fafd]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={item.appliesTo}
                            onChange={(e) => updateRateRow(index, "appliesTo", e.target.value)}
                            disabled={!item.applies}
                            className="h-7 w-full rounded-md border border-[#dbe4ef] px-2 text-[11px] outline-none focus:border-[#7da4d3] disabled:bg-[#f8fafd]"
                          >
                            {APPLIES_TO_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeRateRow(index)}
                            className="grid h-6 w-6 place-items-center rounded text-[#b7433f] hover:bg-[#fce9e8]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 rounded-xl bg-[#edf4fc] px-3 py-2 text-[10px] text-[#425979]">
                <strong>Costo DG:</strong> la tasa se aplica sobre el costo del proveedor sin IVA (ej: Seguro).
                <span className="mx-2">·</span>
                <strong>PVC sin IVA:</strong> la tasa se aplica sobre el precio de venta sin IVA (ej: IB, impuestos).
              </div>
            </div>

            {configError && (
              <div className="mt-3 rounded-xl bg-[#fce9e8] px-3 py-2 text-xs font-bold text-[#a43d39]">
                {configError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfigModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                <Save size={15} /> {saving ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function RateTable({ items, muted = false }: { items: RateItem[]; muted?: boolean }) {
  const active = items.filter((r) => r.applies);
  const inactive = items.filter((r) => !r.applies);
  return (
    <div className={`overflow-x-auto rounded-xl border border-[#dbe4ef] ${muted ? "opacity-60" : ""}`}>
      <table className="w-full min-w-[480px] text-[11px]">
        <thead>
          <tr className="border-b border-[#dbe4ef] bg-[#f8fafd] text-left font-bold text-[#425979]">
            <th className="px-3 py-2">Tasa</th>
            <th className="px-2 py-2 text-right">Valor %</th>
            <th className="px-2 py-2">Base de cálculo</th>
            <th className="px-2 py-2 text-center">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7edf4]">
          {[...active, ...inactive].map((item) => (
            <tr key={item.id} className={item.applies ? "" : "opacity-40"}>
              <td className="px-3 py-1.5 font-medium text-[#10233f]">{item.rateName}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[#334b6b]">
                {item.applies ? `${item.valuePct}%` : "—"}
              </td>
              <td className="px-2 py-1.5 text-[#425979]">
                {item.applies ? (item.appliesTo === "COSTO" ? "Costo DG" : "PVC sin IVA") : "—"}
              </td>
              <td className="px-2 py-1.5 text-center">
                <Badge tone={item.applies ? "success" : "neutral"}>
                  {item.applies ? "Aplica" : "No aplica"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
