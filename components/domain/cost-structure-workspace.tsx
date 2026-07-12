"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronUp,
  Save,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

// ── Types ─────────────────────────────────────────────────────────────────────

type RateItem = {
  id: string;
  rateName: string;
  rateKey: string;
  applies: boolean;
  valuePct: number;
  appliesTo: "COSTO" | "PRECIO";
  sortOrder: number;
};

type ClientConfig = { effectiveFrom: string; items: RateItem[] };
type ClientData = { id: string; name: string; active: boolean; configs: ClientConfig[] };

type CostRow = {
  id: string;
  active: boolean;
  stock: number;
  date: string;
  clientCode: string;
  uniqueCode: string;
  costDgUpdatedAt: string | null;
  publicPriceUpdatedAt: string | null;
  product: string;
  supplier: string;
  category: string;
  publicPrice: number;
  vatRate: number;
  markup: number;
  costDgNoVat: number;
  freightNoVat: number;
  pvcNoVat: number;
  pvcWithVat: number;
  latestSupplierCostDg: number;
  supplierCostDgDate: string | null;
  hasPriceAlert: boolean;
  segment: "active" | "inactive_with_stock" | "inactive";
  pvcHistory: Array<{ period: string; pvcWithVat: number }>;
  freightCriterion: { mode: "pct" | "fixed"; value: number; effectiveFrom: string } | null;
  // Transient — set by applyBulkFreight, sent to API on save:
  freightMode?: "pct" | "fixed";
  freightValue?: number;
};

type HistoryRow = {
  period: string;
  clientCode: string;
  uniqueCode: string;
  product: string;
  supplier: string;
  vatRate: number;
  freightNoVat: number;
  pvcNoVat: number;
  pvcWithVat: number;
  profitPercentage: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = new Date();
const currentPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

const months = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function parseMoneyInput(raw: string) {
  const n = Number(raw.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// "2026-07" or "2026-07-01" → "07/2026"
function displayPeriod(value: string | null) {
  if (!value) return "—";
  const [y, m] = value.split("-");
  return y && m ? `${m}/${y}` : value;
}

type CalcResult = {
  ppNoVat: number;
  costoBreakdown: Array<RateItem & { amount: number }>;
  precioBreakdown: Array<RateItem & { amount: number }>;
  totalCost: number;
  profit: number;
  profitPct: number;
};

function calculate(row: CostRow, costoItems: RateItem[], precioItems: RateItem[]): CalcResult {
  const ppNoVat = row.vatRate > 0 ? round2(row.publicPrice / (1 + row.vatRate / 100)) : row.publicPrice;
  const costoBreakdown = costoItems.map((r) => ({
    ...r,
    amount: round2((row.costDgNoVat * r.valuePct) / 100),
  }));
  const precioBreakdown = precioItems.map((r) => ({
    ...r,
    amount: round2((row.pvcNoVat * r.valuePct) / 100),
  }));
  const totalCost = round2(
    row.costDgNoVat +
      costoBreakdown.reduce((s, r) => s + r.amount, 0) +
      precioBreakdown.reduce((s, r) => s + r.amount, 0) +
      row.freightNoVat,
  );
  const profit = round2(row.pvcNoVat - totalCost);
  const profitPct = totalCost === 0 ? 0 : round2((profit / totalCost) * 100);
  return { ppNoVat, costoBreakdown, precioBreakdown, totalCost, profit, profitPct };
}

// Closed-form formula: pvcNoVat = A(1+p) / (1 - R(1+p))
// A = costDg × (1 + Σ costoRates) + freight
// R = Σ precioRates (as fractions)
// p = targetProfitPct / 100
function proposedPvcNoVat(
  costDg: number,
  freight: number,
  targetProfitPct: number,
  costoItems: RateItem[],
  precioItems: RateItem[],
): number | null {
  const p = targetProfitPct / 100;
  const costoSum = costoItems.reduce((s, r) => s + r.valuePct / 100, 0);
  const A = costDg * (1 + costoSum) + freight;
  const R = precioItems.reduce((s, r) => s + r.valuePct / 100, 0);
  const denominator = 1 - R * (1 + p);
  if (denominator <= 0 || !Number.isFinite(denominator)) return null;
  return round2((A * (1 + p)) / denominator);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CostStructureWorkspace() {
  const [clientList, setClientList] = useState<ClientData[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [client, setClient] = useState("");

  const [rows, setRows] = useState<CostRow[]>([]);
  const [originalRows, setOriginalRows] = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Elegí un cliente y cargá la estructura.");
  const [saved, setSaved] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [inactiveStockOpen, setInactiveStockOpen] = useState(true);
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const [saveMonth, setSaveMonth] = useState(String(currentMonth));
  const [saveYear, setSaveYear] = useState(String(currentYear));

  const [freightMode, setFreightMode] = useState<"pct" | "fixed">("pct");
  const [freightBulkValue, setFreightBulkValue] = useState("");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [proposedIds, setProposedIds] = useState<Set<string>>(new Set());
  const [showRates, setShowRates] = useState(false);

  const [sortKey, setSortKey] = useState<
    "costDgUpdatedAt" | "publicPriceUpdatedAt" | "profitAmt" | "profitPct" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // History panel
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyEditId, setHistoryEditId] = useState<string | null>(null);
  const [historyEditValues, setHistoryEditValues] = useState<{
    freightNoVat: string;
    pvcNoVat: string;
    pvcWithVat: string;
  } | null>(null);
  const [historyDeleteConfirm, setHistoryDeleteConfirm] = useState<string | null>(null);

  const [clientCodeSearch, setClientCodeSearch] = useState("");
  const [uniqueCodeSearch, setUniqueCodeSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/local-db/clients")
      .then((r) => r.json())
      .then((data: { clients: ClientData[] }) => {
        const list = data.clients ?? [];
        setClientList(list);
        if (list.length > 0) setClient(list[0].name);
      })
      .catch(() => setStatus("No se pudieron cargar los clientes."))
      .finally(() => setClientsLoading(false));
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const activeRateConfig = useMemo(() => {
    const cd = clientList.find((c) => c.name === client);
    if (!cd) return null;
    return (
      cd.configs
        .filter((cfg) => cfg.effectiveFrom <= currentPeriodKey)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
    );
  }, [clientList, client]);

  const costoRates = useMemo(
    () => activeRateConfig?.items.filter((r) => r.applies && r.appliesTo === "COSTO") ?? [],
    [activeRateConfig],
  );
  const precioRates = useMemo(
    () => activeRateConfig?.items.filter((r) => r.applies && r.appliesTo === "PRECIO") ?? [],
    [activeRateConfig],
  );

  const suppliers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const cc = clientCodeSearch.trim().toLowerCase();
    const uc = uniqueCodeSearch.trim().toLowerCase();
    const pr = productSearch.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!cc || row.clientCode.toLowerCase().includes(cc)) &&
        (!uc || row.uniqueCode.toLowerCase().includes(uc)) &&
        (!pr || row.product.toLowerCase().includes(pr)) &&
        (!supplierFilter || row.supplier === supplierFilter),
    );
  }, [rows, clientCodeSearch, uniqueCodeSearch, productSearch, supplierFilter]);

  const alertCount = rows.filter((r) => r.hasPriceAlert).length;
  const someSelected = filteredRows.some((r) => selectedIds.has(r.id));
  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function loadStructure() {
    if (!client) return;
    setLoading(true);
    setSaved(false);
    setSelectedIds(new Set());
    setProposedIds(new Set());
    setExpandedIds(new Set());
    setStatus("Cargando estructura...");
    try {
      const res = await fetch(
        `/api/local-db/cost-structures?client=${encodeURIComponent(client)}`,
      );
      const data = (await res.json()) as { rows: CostRow[]; message?: string };
      if (!res.ok) throw new Error(data.message || "No pude cargar");
      setRows(data.rows);
      setOriginalRows(data.rows);
      setStatus(data.message || "Estructura cargada.");
    } catch (err) {
      setRows([]);
      setStatus(err instanceof Error ? err.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(
    id: string,
    field: "freightNoVat" | "pvcNoVat" | "pvcWithVat",
    value: string,
  ) {
    const num = field === "freightNoVat" ? Number(value) : parseMoneyInput(value);
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (field === "pvcNoVat") {
          return { ...row, pvcNoVat: num, pvcWithVat: round2(num * (1 + row.vatRate / 100)) };
        }
        if (field === "pvcWithVat") {
          return { ...row, pvcWithVat: num, pvcNoVat: round2(num / (1 + row.vatRate / 100)) };
        }
        return { ...row, freightNoVat: num };
      }),
    );
    setSaved(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(filteredRows.map((r) => r.id)),
    );
  }

  function selectAlerted() {
    setSelectedIds(new Set(rows.filter((r) => r.hasPriceAlert).map((r) => r.id)));
  }

  function applyPvcProposal() {
    const proposed = new Set<string>();
    setRows((prev) =>
      prev.map((row) => {
        if (!selectedIds.has(row.id) || row.segment !== "active") return row;
        const calc = calculate(row, costoRates, precioRates);
        // Accept new supplier cost for alerted rows; keep current for non-alerted
        const targetCostDg = row.hasPriceAlert ? row.latestSupplierCostDg : row.costDgNoVat;
        const newPvc = proposedPvcNoVat(
          targetCostDg,
          row.freightNoVat,
          calc.profitPct,
          costoRates,
          precioRates,
        );
        if (newPvc === null) return row;
        proposed.add(row.id);
        return {
          ...row,
          costDgNoVat: targetCostDg,
          pvcNoVat: newPvc,
          pvcWithVat: round2(newPvc * (1 + row.vatRate / 100)),
          hasPriceAlert: false,
        };
      }),
    );
    setProposedIds((prev) => new Set([...prev, ...proposed]));
    setSaved(false);
  }

  function pendingChanges() {
    const origMap = new Map(originalRows.map((r) => [r.id, r]));
    return rows.filter((row) => {
      const orig = origMap.get(row.id);
      if (!orig) return false;
      return (
        Math.abs(row.freightNoVat - orig.freightNoVat) > 0.001 ||
        Math.abs(row.pvcNoVat - orig.pvcNoVat) > 0.001 ||
        Math.abs(row.pvcWithVat - orig.pvcWithVat) > 0.001
      );
    });
  }

  async function saveStructure() {
    if (rows.length === 0) return;
    setSaving(true);
    setStatus("Guardando...");
    try {
      const res = await fetch("/api/local-db/cost-structures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, month: Number(saveMonth), year: Number(saveYear), rows }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) throw new Error(data.message || "Error al guardar");
      setStatus(data.message || "Estructura guardada.");
      setProposedIds(new Set());
      setOriginalRows(rows);
      setShowConfirmModal(false);
      setSaved(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al guardar.");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  function updateFreight(id: string, value: string) {
    const newFreight = parseMoneyInput(value);
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const calc = calculate(row, costoRates, precioRates);
        const newPvc = proposedPvcNoVat(row.costDgNoVat, newFreight, calc.profitPct, costoRates, precioRates);
        if (newPvc === null) return { ...row, freightNoVat: newFreight };
        return {
          ...row,
          freightNoVat: newFreight,
          pvcNoVat: newPvc,
          pvcWithVat: round2(newPvc * (1 + row.vatRate / 100)),
        };
      }),
    );
    setSaved(false);
  }

  function applyBulkFreight() {
    const amount = parseFloat(freightBulkValue.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return;
    setRows((prev) =>
      prev.map((row) => {
        if (!selectedIds.has(row.id) || row.segment !== "active") return row;
        const newFreight = freightMode === "pct"
          ? round2((row.costDgNoVat * amount) / 100)
          : round2(amount);
        const calc = calculate(row, costoRates, precioRates);
        const newPvc = proposedPvcNoVat(row.costDgNoVat, newFreight, calc.profitPct, costoRates, precioRates);
        if (newPvc === null) return { ...row, freightNoVat: newFreight, freightMode: freightMode, freightValue: amount };
        return {
          ...row,
          freightNoVat: newFreight,
          freightMode: freightMode,
          freightValue: amount,
          pvcNoVat: newPvc,
          pvcWithVat: round2(newPvc * (1 + row.vatRate / 100)),
        };
      }),
    );
    setSaved(false);
  }

  // ── Sort ─────────────────────────────────────────────────────────────────

  function toggleSort(key: NonNullable<typeof sortKey>) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortRows(rows: CostRow[]): CostRow[] {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === "costDgUpdatedAt" || sortKey === "publicPriceUpdatedAt") {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        cmp = av.localeCompare(bv);
      } else {
        const ca = calculate(a, costoRates, precioRates);
        const cb = calculate(b, costoRates, precioRates);
        cmp = (sortKey === "profitAmt" ? ca.profit : ca.profitPct) -
              (sortKey === "profitAmt" ? cb.profit : cb.profitPct);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  // ── History handlers ─────────────────────────────────────────────────────

  async function searchHistory() {
    if (!historySearch.trim()) return;
    if (!client) { setHistoryStatus("Seleccioná un cliente primero."); return; }
    setHistoryLoading(true);
    setHistoryStatus("Buscando...");
    setHistoryRows([]);
    setHistoryEditId(null);
    setHistoryEditValues(null);
    setHistoryDeleteConfirm(null);
    try {
      const res = await fetch(
        `/api/local-db/cost-structures?client=${encodeURIComponent(client)}&historyFor=${encodeURIComponent(historySearch.trim())}`,
      );
      const data = (await res.json()) as { rows: HistoryRow[]; message?: string };
      if (!res.ok) throw new Error(data.message || "Error al buscar");
      setHistoryRows(data.rows);
      setHistoryStatus(data.message || "");
    } catch (err) {
      setHistoryStatus(err instanceof Error ? err.message : "Error al buscar.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveHistoryEdit(uniqueCode: string, period: string) {
    if (!historyEditValues) return;
    const freightNoVat = parseMoneyInput(historyEditValues.freightNoVat);
    const pvcNoVat = parseMoneyInput(historyEditValues.pvcNoVat);
    const pvcWithVat = parseMoneyInput(historyEditValues.pvcWithVat);
    try {
      const res = await fetch("/api/local-db/cost-structures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, uniqueCode, period, freightNoVat, pvcNoVat, pvcWithVat }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; profitPercentage?: number };
      if (!res.ok || data.ok === false) throw new Error(data.message || "Error al guardar");
      setHistoryRows((prev) =>
        prev.map((r) =>
          r.uniqueCode === uniqueCode && r.period === period
            ? { ...r, freightNoVat, pvcNoVat, pvcWithVat, profitPercentage: data.profitPercentage ?? r.profitPercentage }
            : r,
        ),
      );
      setHistoryEditId(null);
      setHistoryEditValues(null);
      setHistoryStatus("Registro actualizado.");
    } catch (err) {
      setHistoryStatus(err instanceof Error ? err.message : "Error al guardar.");
    }
  }

  async function deleteHistoryRow(uniqueCode: string, period: string) {
    try {
      const params = new URLSearchParams({ client, uniqueCode, period });
      const res = await fetch(`/api/local-db/cost-structures?${params}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) throw new Error(data.message || "Error al eliminar");
      setHistoryRows((prev) => prev.filter((r) => !(r.uniqueCode === uniqueCode && r.period === period)));
      setHistoryDeleteConfirm(null);
      setHistoryStatus("Registro eliminado.");
    } catch (err) {
      setHistoryStatus(err instanceof Error ? err.message : "Error al eliminar.");
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const formulaCell = "whitespace-nowrap bg-[#f3f7fc] px-2 py-1 text-right tabular-nums text-[#334b6b]";
  const sourceCell = "bg-[#f8fafd] px-2 py-1 text-[#425979]";
  const numberInput =
    "h-7 w-full min-w-[52px] rounded border border-[#b9cce3] bg-white px-1 text-right text-[8px] tabular-nums outline-none focus:border-[#0b5bbb] focus:ring-2 focus:ring-[#dce9f8]";
  const stickyTh =
    "sticky top-0 z-40 border-b border-r border-[#c3d0df] bg-[#eaf1df] bg-clip-padding px-1 py-2 text-center font-black text-[#34452f]";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        eyebrow="Estructura de costos"
        title="Estructura mensual por cliente"
        description="Editá flete y PVC por período. Las tasas del cliente se aplican automáticamente desde la configuración vigente."
      />

      {/* ── Filter card ──────────────────────────────────────────────────── */}
      <section className="card mb-4 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(260px,1fr)_180px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setSaved(false);
                setRows([]);
              }}
              disabled={clientsLoading}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              {clientList.map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={loadStructure}
              disabled={loading || !client}
              className="h-11 w-full"
            >
              {loading ? "Cargando..." : "Cargar estructura"}
            </Button>
          </div>
        </div>

        {/* Status + rates toggle */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3">
          <div className="flex-1 text-[11px] font-bold text-[#62728a]">
            {status}
            {alertCount > 0 && (
              <span className="ml-2 font-extrabold text-[#b7433f]">
                ⚠ {alertCount} con alerta de precio
              </span>
            )}
          </div>
          {activeRateConfig && (
            <button
              type="button"
              onClick={() => setShowRates((p) => !p)}
              className="flex items-center gap-1 text-[10px] font-bold text-[#0b5bbb] hover:underline"
            >
              <Calculator size={12} />
              {showRates ? "Ocultar tasas" : `Tasas vigentes · desde ${activeRateConfig.effectiveFrom}`}
            </button>
          )}
        </div>

        {/* Rates panel */}
        {showRates && activeRateConfig && (
          <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-white p-4">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
              {client} — tasas desde {activeRateConfig.effectiveFrom}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeRateConfig.items.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl border px-3 py-2 text-[11px] ${r.applies ? "border-[#dbe4ef] bg-[#f8fafd]" : "border-[#eee] bg-[#fafafa] opacity-50"}`}
                >
                  <div className="font-bold text-[#10233f]">{r.rateName}</div>
                  <div className="mt-0.5 text-[10px] text-[#74849a]">
                    {r.applies
                      ? `${r.valuePct}% sobre ${r.appliesTo === "COSTO" ? "Costo DG" : "PVC s/IVA"}`
                      : "No aplica"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-3">
          <div className="text-xs font-black text-[#10233f]">
            {client || "—"}
          </div>
          {suppliers.length > 1 && (
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="h-7 rounded-lg border border-[#dbe4ef] bg-white px-2 text-[10px]"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}


          <div className="ml-auto flex items-center gap-2">
            {alertCount > 0 && (
              <button
                type="button"
                onClick={selectAlerted}
                className="flex items-center gap-1 rounded-lg border border-[#f0c4c2] bg-[#fce9e8] px-3 py-1.5 text-[10px] font-bold text-[#b7433f] hover:bg-[#fbdad8]"
              >
                <AlertTriangle size={12} /> Seleccionar {alertCount} alertas
              </button>
            )}
            {/* Bulk freight panel — always visible, editable only con selección */}
            <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition ${someSelected ? "border-[#dbe4ef] bg-[#f4f8fc]" : "border-[#edf0f4] bg-[#f9fafc] opacity-60"}`}>
              <span className="text-[9px] font-bold text-[#62728a]">
                {someSelected ? `Flete · ${selectedIds.size} sel.` : "Flete"}
              </span>
              <div className="flex overflow-hidden rounded border border-[#dbe4ef] bg-white text-[10px]">
                <button
                  type="button"
                  disabled={!someSelected}
                  onClick={() => setFreightMode("pct")}
                  className={`px-2 py-0.5 font-bold transition ${freightMode === "pct" ? "bg-[#0b5bbb] text-white" : "text-[#62728a] hover:bg-[#edf4fc]"} disabled:cursor-default`}
                >
                  %
                </button>
                <button
                  type="button"
                  disabled={!someSelected}
                  onClick={() => setFreightMode("fixed")}
                  className={`px-2 py-0.5 font-bold transition ${freightMode === "fixed" ? "bg-[#0b5bbb] text-white" : "text-[#62728a] hover:bg-[#edf4fc]"} disabled:cursor-default`}
                >
                  $
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder={freightMode === "pct" ? "% Costo DG" : "$ por producto"}
                value={freightBulkValue}
                disabled={!someSelected}
                onChange={(e) => setFreightBulkValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyBulkFreight()}
                className="h-6 w-28 rounded border border-[#dbe4ef] bg-white px-1.5 text-[10px] outline-none focus:border-[#0b5bbb] disabled:bg-[#f4f6f8] disabled:cursor-default"
              />
              <button
                type="button"
                onClick={applyBulkFreight}
                disabled={!someSelected || !freightBulkValue}
                className="h-6 rounded bg-[#0b5bbb] px-2 text-[10px] font-bold text-white hover:bg-[#0a4fa8] disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!someSelected}
              onClick={applyPvcProposal}
              className="h-8 text-[10px]"
            >
              <Calculator size={13} /> Proponer PVC · mantener margen
            </Button>
            <div className="flex items-center gap-1 rounded-lg border border-[#dbe4ef] bg-[#f4f8fc] px-2 py-1">
              <span className="text-[9px] font-bold text-[#62728a]">Período PVC</span>
              <select
                value={saveMonth}
                onChange={(e) => setSaveMonth(e.target.value)}
                className="h-6 rounded border border-[#dbe4ef] bg-white px-1 text-[10px]"
              >
                {months.map((m, i) => {
                  const monthNum = i + 1;
                  if (Number(saveYear) === currentYear && monthNum > currentMonth) return null;
                  return <option key={m} value={monthNum}>{m}</option>;
                })}
              </select>
              <select
                value={saveYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setSaveYear(e.target.value);
                  if (y === currentYear && Number(saveMonth) > currentMonth) {
                    setSaveMonth(String(currentMonth));
                  }
                }}
                className="h-6 rounded border border-[#dbe4ef] bg-white px-1 text-[10px]"
              >
                {Array.from({ length: 4 }, (_, i) => currentYear - 3 + i).map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => setShowConfirmModal(true)}
              disabled={rows.length === 0 || saving || loading}
              size="sm"
              className="h-8 text-[10px]"
            >
              <Save size={13} />
              {saving ? "Guardando..." : saved ? "Guardado ✓" : "Guardar"}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1480px] table-fixed border-separate border-spacing-0 text-left text-[8px]">
            <thead>
              <tr>
                {/* Checkbox */}
                <th className={`${stickyTh} left-0 z-50 w-7`}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 accent-[#0b5bbb]"
                  />
                </th>
                {/* Alert */}
                <th className={`${stickyTh} left-7 z-50 w-5`} />
                {/* Sticky text cols */}
                <th className={`${stickyTh} left-12 z-50 w-16`}>
                  <div>Cód.</div>
                  <InlineSearch value={clientCodeSearch} onChange={setClientCodeSearch} />
                </th>
                <th className={`${stickyTh} left-28 z-50 w-[76px]`}>
                  <div>Cód.Único</div>
                  <InlineSearch value={uniqueCodeSearch} onChange={setUniqueCodeSearch} />
                </th>
                <th
                  className={`${stickyTh} left-[182px] z-50 w-36 shadow-[6px_0_8px_-5px_rgba(16,35,63,.55)]`}
                >
                  <div>Producto</div>
                  <InlineSearch value={productSearch} onChange={setProductSearch} />
                </th>
                {/* Regular cols */}
                <th className="sticky top-0 z-10 w-20 border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f]">
                  Proveedor
                </th>
                <th className="sticky top-0 z-10 w-20 border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f]">
                  Categoría
                </th>
                {/* Price-file cols — blue tint */}
                <th
                  className="sticky top-0 z-10 w-14 cursor-pointer select-none border-b border-[#c3d0df] bg-[#ddeaf8] px-1 py-2 text-center font-black text-[#1a3a5c] hover:bg-[#cfe0f5]"
                  onClick={() => toggleSort("costDgUpdatedAt")}
                >
                  <span className="inline-flex items-center justify-center gap-0.5">
                    Fecha costo
                    <span className="text-[7px]">
                      {sortKey === "costDgUpdatedAt" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
                <th className="sticky top-0 z-10 w-20 border-b border-[#c3d0df] bg-[#ddeaf8] px-1 py-2 text-center font-black text-[#1a3a5c]">
                  Costo DG s/IVA
                </th>
                <th className="sticky top-0 z-10 w-[72px] border-b border-[#c3d0df] bg-[#ddeaf8] px-1 py-2 text-center font-black text-[#1a3a5c]">
                  PP s/IVA
                </th>
                <th className="sticky top-0 z-10 w-16 border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f]">
                  Flete s/IVA
                </th>
                <th
                  className="sticky top-0 z-10 w-14 cursor-pointer select-none border-b border-[#c3d0df] bg-[#fce6df] px-1 py-2 text-center font-black text-[#5c2a24] hover:bg-[#f5ccc0]"
                  onClick={() => toggleSort("publicPriceUpdatedAt")}
                >
                  <span className="inline-flex items-center justify-center gap-0.5">
                    Fecha PVC
                    <span className="text-[7px]">
                      {sortKey === "publicPriceUpdatedAt" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
                <th className="sticky top-0 z-10 w-20 border-b border-[#c3d0df] bg-[#fce6df] px-1 py-2 text-center font-black text-[#5c2a24]">
                  PVC s/IVA
                </th>
                <th className="sticky top-0 z-10 w-20 border-b border-[#c3d0df] bg-[#fce6df] px-1 py-2 text-center font-black text-[#5c2a24]">
                  PVC c/IVA
                </th>
                <th
                  className="sticky top-0 z-10 w-16 cursor-pointer select-none border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f] hover:bg-[#d8e8cb]"
                  onClick={() => toggleSort("profitAmt")}
                >
                  <span className="inline-flex items-center justify-center gap-0.5">
                    Utilidad $
                    <span className="text-[7px]">
                      {sortKey === "profitAmt" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
                <th
                  className="sticky top-0 z-10 w-12 cursor-pointer select-none border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f] hover:bg-[#d8e8cb]"
                  onClick={() => toggleSort("profitPct")}
                >
                  <span className="inline-flex items-center justify-center gap-0.5">
                    Util. %
                    <span className="text-[7px]">
                      {sortKey === "profitPct" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
                <th className="sticky top-0 z-10 w-10 border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2 text-center font-black text-[#34452f]">
                  Stock
                </th>
                <th className="sticky top-0 z-10 w-8 border-b border-[#c3d0df] bg-[#eaf1df] px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {(["active", "inactive_with_stock", "inactive"] as const).map((seg) => {
                const segRows = sortRows(filteredRows.filter((r) => r.segment === seg));
                if (segRows.length === 0) return null;

                const isCollapsible = seg !== "active";
                const isOpen = seg === "active" ? true : seg === "inactive_with_stock" ? inactiveStockOpen : inactiveOpen;
                const setOpen = seg === "inactive_with_stock"
                  ? () => setInactiveStockOpen((p) => !p)
                  : () => setInactiveOpen((p) => !p);

                const labelText =
                  seg === "active"
                    ? `Activos (${segRows.length})`
                    : seg === "inactive_with_stock"
                      ? `Inactivos con stock (${segRows.length})`
                      : `Inactivos (${segRows.length})`;

                const labelBg =
                  seg === "active"
                    ? "bg-[#eaf1df] text-[#34452f]"
                    : seg === "inactive_with_stock"
                      ? "bg-[#fff4e8] text-[#7a4a1a]"
                      : "bg-[#f2f4f7] text-[#62728a]";

                return (
                  <>
                    <tr key={`seg-${seg}`}>
                      <td
                        colSpan={18}
                        className={`border-b border-t border-[#d0dbe8] px-4 py-1.5 text-[9px] font-extrabold uppercase tracking-wider ${labelBg}`}
                      >
                        {isCollapsible ? (
                          <button
                            type="button"
                            onClick={setOpen}
                            className="flex items-center gap-1.5 hover:underline"
                          >
                            {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {labelText}
                          </button>
                        ) : (
                          labelText
                        )}
                      </td>
                    </tr>

                    {isOpen && segRows.map((row) => {
                const calc = calculate(row, costoRates, precioRates);
                const isExpanded = expandedIds.has(row.id);
                const isSelected = selectedIds.has(row.id);
                const isProposed = proposedIds.has(row.id);

                const rowBg =
                  seg === "inactive_with_stock"
                    ? isProposed ? "bg-[#edf7ff]" : "bg-[#fff8f0]"
                    : seg === "inactive"
                      ? "bg-[#f7f8fa]"
                      : isProposed
                        ? "bg-[#edf7ff]"
                        : "bg-white";
                const stickyBg =
                  seg === "inactive_with_stock"
                    ? isProposed ? "bg-[#edf7ff] bg-clip-padding" : "bg-[#fff8f0] bg-clip-padding"
                    : seg === "inactive"
                      ? "bg-[#f7f8fa] bg-clip-padding"
                      : isProposed
                        ? "bg-[#edf7ff] bg-clip-padding"
                        : "bg-[#f8fafd] bg-clip-padding";

                return (
                  <>
                    <tr
                      key={row.id}
                      className={`${rowBg} border-b border-[#e1e8f1]`}
                    >
                      {/* Checkbox */}
                      <td
                        className={`sticky left-0 z-30 w-7 border-r border-[#d6e0ec] px-1 py-1 text-center ${stickyBg}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                          className="h-3.5 w-3.5 accent-[#0b5bbb]"
                        />
                      </td>
                      {/* Alert */}
                      <td
                        className={`sticky left-7 z-30 w-5 border-r border-[#d6e0ec] px-0.5 py-1 text-center ${stickyBg}`}
                      >
                        {row.hasPriceAlert ? (
                          <span title="Proveedor actualizó el precio">
                            <AlertTriangle size={11} className="text-[#b7433f]" />
                          </span>
                        ) : isProposed ? (
                          <span
                            title="PVC propuesto"
                            className="text-[8px] font-black text-[#0b5bbb]"
                          >
                            ✓
                          </span>
                        ) : null}
                      </td>
                      {/* Sticky text cols */}
                      <td
                        className={`sticky left-12 z-30 w-16 truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickyBg}`}
                        title={row.clientCode}
                      >
                        {row.clientCode || "—"}
                      </td>
                      <td
                        className={`sticky left-28 z-30 w-[76px] truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickyBg}`}
                        title={row.uniqueCode}
                      >
                        {row.uniqueCode}
                      </td>
                      <td
                        className={`sticky left-[182px] z-30 w-36 truncate border-r border-[#c3d0df] px-1.5 py-1 font-medium text-[#334b6b] shadow-[6px_0_8px_-5px_rgba(16,35,63,.55)] ${stickyBg}`}
                        title={row.product}
                      >
                        {row.product}
                      </td>
                      {/* Regular cells */}
                      <td className={`${sourceCell} truncate`} title={row.supplier}>
                        {row.supplier}
                      </td>
                      <td className={`${sourceCell} truncate`}>
                        {row.category || "—"}
                      </td>
                      {/* Price-file cols — blue tint */}
                      <td className="bg-[#eef5fc] px-2 py-1 text-center tabular-nums text-[7.5px] text-[#1a3a5c]">
                        {displayPeriod(row.costDgUpdatedAt)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right tabular-nums ${row.hasPriceAlert ? "bg-[#fff0ec] font-bold text-[#b7433f]" : "bg-[#eef5fc] text-[#1a3a5c]"}`}
                      >
                        {money(row.costDgNoVat)}
                      </td>
                      <td className="bg-[#eef5fc] px-2 py-1 text-right tabular-nums text-[#1a3a5c]">
                        {money(calc.ppNoVat)}
                      </td>
                      {/* Flete editable — recalcula PVC manteniendo margen */}
                      <td className="px-1.5 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={money(row.freightNoVat)}
                          onChange={(e) => updateFreight(row.id, e.target.value)}
                          className={numberInput}
                        />
                      </td>
                      {/* Fecha PVC */}
                      <td className="bg-[#fff5f3] px-2 py-1 text-center tabular-nums text-[7.5px] text-[#7a4a3a]">
                        {displayPeriod(row.publicPriceUpdatedAt)}
                      </td>
                      {/* PVC s/IVA editable */}
                      <td className="bg-[#fff5f3] px-1.5 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={money(row.pvcNoVat)}
                          onChange={(e) => updateRow(row.id, "pvcNoVat", e.target.value)}
                          className={numberInput}
                        />
                      </td>
                      {/* PVC c/IVA auto-linked */}
                      <td className="bg-[#fff5f3] px-1.5 py-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={money(row.pvcWithVat)}
                          onChange={(e) => updateRow(row.id, "pvcWithVat", e.target.value)}
                          className={numberInput}
                        />
                      </td>
                      {/* Utilidad */}
                      <td
                        className={`${formulaCell} font-bold ${calc.profitPct < 20 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                      >
                        {money(calc.profit)}
                      </td>
                      <td
                        className={`${formulaCell} font-bold ${calc.profitPct < 20 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                      >
                        {money(calc.profitPct)}%
                      </td>
                      {/* Stock — moved to end */}
                      <td className={`${sourceCell} text-right tabular-nums`}>
                        {row.stock > 0 ? row.stock : "—"}
                      </td>
                      {/* Expand toggle */}
                      <td className="bg-[#f8fafd] px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                          className="grid h-5 w-5 place-items-center rounded text-[#62728a] hover:bg-[#edf4fc]"
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${row.id}-detail`} className="bg-[#f8fafd]">
                        <td
                          colSpan={18}
                          className="border-b border-[#dbe4ef] px-8 py-4"
                        >

                          <div className="grid gap-5 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
                            {/* Costos sobre Costo DG */}
                            <div>
                              <div className="mb-2 font-extrabold uppercase tracking-wide text-[#62728a]">
                                Costos sobre Costo DG
                              </div>
                              {costoRates.length > 0 ? (
                                costoRates.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex justify-between gap-2 py-0.5 text-[#334b6b]"
                                  >
                                    <span>
                                      {r.rateName} ({r.valuePct}%)
                                    </span>
                                    <span className="tabular-nums">
                                      ${money(round2((row.costDgNoVat * r.valuePct) / 100))}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[#74849a]">Sin tasas sobre costo</div>
                              )}
                              <div className="mt-1 flex justify-between border-t border-[#dbe4ef] pt-1 font-bold text-[#10233f]">
                                <span>
                                  Flete s/IVA
                                  {(() => {
                                    const c = (row.freightMode && row.freightValue != null)
                                      ? { mode: row.freightMode, value: row.freightValue, effectiveFrom: null }
                                      : row.freightCriterion;
                                    if (!c) return null;
                                    return (
                                      <span className="ml-1.5 rounded bg-[#edf4fc] px-1.5 py-0.5 text-[8px] font-semibold text-[#0b5bbb]">
                                        {c.mode === "pct"
                                          ? `${c.value}% Costo DG`
                                          : `$${money(c.value)} fijo`}
                                        {c.effectiveFrom && (
                                          <span className="ml-1 opacity-70">· desde {displayPeriod(c.effectiveFrom)}</span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </span>
                                <span className="tabular-nums">${money(row.freightNoVat)}</span>
                              </div>
                            </div>

                            {/* Costos sobre PVC */}
                            <div>
                              <div className="mb-2 font-extrabold uppercase tracking-wide text-[#62728a]">
                                Costos sobre PVC
                              </div>
                              {precioRates.length > 0 ? (
                                precioRates.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex justify-between gap-2 py-0.5 text-[#334b6b]"
                                  >
                                    <span>
                                      {r.rateName} ({r.valuePct}%)
                                    </span>
                                    <span className="tabular-nums">
                                      ${money(round2((row.pvcNoVat * r.valuePct) / 100))}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[#74849a]">Sin tasas sobre precio</div>
                              )}
                              <div className="mt-1 flex justify-between border-t border-[#dbe4ef] pt-1 font-bold text-[#10233f]">
                                <span>Costo total</span>
                                <span className="tabular-nums">${money(calc.totalCost)}</span>
                              </div>
                            </div>

                            {/* Precio público y alerta */}
                            <div>
                              <div className="mb-2 font-extrabold uppercase tracking-wide text-[#62728a]">
                                Precio público
                              </div>
                              <div className="flex justify-between py-0.5 text-[#334b6b]">
                                <span>PP público c/IVA</span>
                                <span className="tabular-nums">${money(row.publicPrice)}</span>
                              </div>
                              <div className="flex justify-between py-0.5 text-[#334b6b]">
                                <span>PP s/IVA</span>
                                <span className="tabular-nums">${money(calc.ppNoVat)}</span>
                              </div>
                              <div className="flex justify-between py-0.5 text-[#334b6b]">
                                <span>IVA</span>
                                <span>{row.vatRate}%</span>
                              </div>
                              <div className="flex justify-between py-0.5 text-[#334b6b]">
                                <span>Mark Up</span>
                                <span>{row.markup}%</span>
                              </div>
                              {row.costDgUpdatedAt && (
                                <div className="mt-1 text-[9px] text-[#74849a]">
                                  Precio proveedor al {row.costDgUpdatedAt}
                                </div>
                              )}
                              {/* Alert section */}
                              {row.hasPriceAlert && row.latestSupplierCostDg > 0 && (
                                <div className="mt-2 rounded-lg bg-[#fce9e8] px-3 py-2">
                                  <div className="font-bold text-[#b7433f]">
                                    ⚠ Proveedor actualizó el costo
                                  </div>
                                  <div className="mt-1 text-[#b7433f]">
                                    <div>
                                      En estructura: ${money(row.costDgNoVat)}
                                    </div>
                                    <div>
                                      Nuevo costo proveedor: $
                                      {money(row.latestSupplierCostDg)}
                                      {row.supplierCostDgDate && (
                                        <> · {row.supplierCostDgDate}</>
                                      )}
                                    </div>
                                    <div className="mt-1 text-[9px]">
                                      Seleccioná esta fila y usá "Proponer PVC" para
                                      actualizar el precio manteniendo el margen.
                                    </div>
                                  </div>
                                </div>
                              )}
                              {isProposed && !row.hasPriceAlert && (
                                <div className="mt-2 rounded-lg bg-[#e8f4ff] px-3 py-2 font-bold text-[#0b5bbb]">
                                  ✓ PVC actualizado · pendiente de guardar
                                </div>
                              )}
                            </div>

                            {/* Historial PVC */}
                            {row.pvcHistory.length > 0 && (
                              <div>
                                <div className="mb-2 font-extrabold uppercase tracking-wide text-[#62728a]">
                                  Historial PVC
                                </div>
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b border-[#dbe4ef] text-[9px] font-extrabold text-[#8190a4]">
                                      <th className="pb-1 text-left">Período</th>
                                      <th className="pb-1 text-right">PVC c/IVA</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.pvcHistory.map((h) => (
                                      <tr key={h.period} className="border-b border-[#f0f4f8]">
                                        <td className="py-0.5 text-[#334b6b]">{displayPeriod(h.period)}</td>
                                        <td className="py-0.5 text-right tabular-nums text-[#334b6b]">${money(h.pvcWithVat)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
                  </>
                );
              })}
            </tbody>
          </table>

          {rows.length === 0 && !loading && (
            <div className="py-20 text-center text-xs text-[#74849a]">
              {client
                ? "Cargá la estructura para ver todos los códigos del cliente."
                : "Seleccioná un cliente para comenzar."}
            </div>
          )}
        </div>

        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
          Mostrando {filteredRows.length} de {rows.length} productos · Campos rosados: PVC
          s/IVA y c/IVA (se sincronizan automáticamente) · Celeste: fórmulas automáticas
          {someSelected && (
            <span className="ml-2 font-bold text-[#10233f]">
              · {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </section>

      {/* ── History panel ────────────────────────────────────────────────── */}
      <section className="card mt-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((p) => !p)}
          className="flex w-full items-center gap-2 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-left"
        >
          {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="text-xs font-extrabold text-[#10233f]">Historial de registros</span>
          <span className="ml-auto text-[10px] text-[#74849a]">
            Consultá, editá o eliminá registros de períodos anteriores
          </span>
        </button>

        {historyOpen && (
          <div className="p-5">
            {/* Search */}
            <div className="mb-4 flex gap-2">
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchHistory()}
                placeholder="Código cliente (ej. DIR012)"
                className="h-9 flex-1 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#0b5bbb] focus:ring-2 focus:ring-[#dce9f8]"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={searchHistory}
                disabled={historyLoading || !historySearch.trim()}
                className="h-9"
              >
                <Search size={13} />
                {historyLoading ? "Buscando..." : "Buscar"}
              </Button>
            </div>

            {historyStatus && (
              <div className="mb-3 text-[11px] font-semibold text-[#62728a]">{historyStatus}</div>
            )}

            {historyRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[#dbe4ef]">
                <table className="w-full border-separate border-spacing-0 text-[11px]">
                  <thead>
                    <tr>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-left text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Período</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-left text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Cód.</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-left text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Cód.Único</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-left text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Producto</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-right text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Flete s/IVA</th>
                      <th className="border-b border-[#c3d0df] bg-[#fce6df] px-3 py-2 text-right text-[9px] font-extrabold uppercase tracking-wide text-[#5c2a24]">PVC s/IVA</th>
                      <th className="border-b border-[#c3d0df] bg-[#fce6df] px-3 py-2 text-right text-[9px] font-extrabold uppercase tracking-wide text-[#5c2a24]">PVC c/IVA</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-right text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Util.%</th>
                      <th className="border-b border-[#c3d0df] bg-[#eaf1df] px-3 py-2 text-center text-[9px] font-extrabold uppercase tracking-wide text-[#34452f]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => {
                      const key = `${row.uniqueCode}::${row.period}`;
                      const isEditing = historyEditId === key;
                      const isDeleting = historyDeleteConfirm === key;
                      const hInput =
                        "h-6 w-[88px] rounded border border-[#b9cce3] bg-white px-1 text-right text-[10px] tabular-nums outline-none focus:border-[#0b5bbb] focus:ring-1 focus:ring-[#dce9f8]";
                      return (
                        <tr
                          key={key}
                          className={`border-b border-[#e1e8f1] transition-colors ${isEditing ? "bg-[#f0f7ff]" : isDeleting ? "bg-[#fff5f3]" : "bg-white hover:bg-[#f8fafd]"}`}
                        >
                          <td className="px-3 py-1.5 tabular-nums text-[#62728a]">{displayPeriod(row.period)}</td>
                          <td className="px-3 py-1.5 font-mono text-[#425979]">{row.clientCode}</td>
                          <td className="px-3 py-1.5 font-mono text-[#425979]">{row.uniqueCode}</td>
                          <td className="max-w-[200px] truncate px-3 py-1.5 text-[#334b6b]" title={row.product}>{row.product}</td>

                          {isEditing && historyEditValues ? (
                            <>
                              <td className="bg-[#f5f9f2] px-1.5 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={historyEditValues.freightNoVat}
                                  onChange={(e) =>
                                    setHistoryEditValues((p) => p ? { ...p, freightNoVat: e.target.value } : p)
                                  }
                                  className={hInput}
                                />
                              </td>
                              <td className="bg-[#fff5f3] px-1.5 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={historyEditValues.pvcNoVat}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const parsed = parseMoneyInput(raw);
                                    setHistoryEditValues((p) =>
                                      p ? { ...p, pvcNoVat: raw, pvcWithVat: money(round2(parsed * (1 + row.vatRate / 100))) } : p,
                                    );
                                  }}
                                  className={hInput}
                                />
                              </td>
                              <td className="bg-[#fff5f3] px-1.5 py-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={historyEditValues.pvcWithVat}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const parsed = parseMoneyInput(raw);
                                    setHistoryEditValues((p) =>
                                      p ? { ...p, pvcWithVat: raw, pvcNoVat: money(round2(parsed / (1 + row.vatRate / 100))) } : p,
                                    );
                                  }}
                                  className={hInput}
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="bg-[#f5f9f2] px-3 py-1.5 text-right tabular-nums text-[#334b6b]">${money(row.freightNoVat)}</td>
                              <td className="bg-[#fff5f3] px-3 py-1.5 text-right tabular-nums text-[#7a4a3a]">${money(row.pvcNoVat)}</td>
                              <td className="bg-[#fff5f3] px-3 py-1.5 text-right tabular-nums text-[#7a4a3a]">${money(row.pvcWithVat)}</td>
                            </>
                          )}

                          <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.profitPercentage < 20 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}>
                            {money(row.profitPercentage)}%
                          </td>

                          <td className="px-3 py-1.5 text-center">
                            {isDeleting ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[9px] font-bold text-[#b7433f]">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => deleteHistoryRow(row.uniqueCode, row.period)}
                                  className="rounded bg-[#b7433f] px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-[#9e3935]"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setHistoryDeleteConfirm(null)}
                                  className="rounded bg-[#e9f1fb] px-1.5 py-0.5 text-[9px] font-bold text-[#334b6b] hover:bg-[#dbe4ef]"
                                >
                                  No
                                </button>
                              </div>
                            ) : isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => saveHistoryEdit(row.uniqueCode, row.period)}
                                  className="rounded bg-[#0b5bbb] px-2 py-0.5 text-[9px] font-bold text-white hover:bg-[#0a4fa8]"
                                >
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setHistoryEditId(null); setHistoryEditValues(null); }}
                                  className="rounded bg-[#e9f1fb] px-2 py-0.5 text-[9px] font-bold text-[#334b6b] hover:bg-[#dbe4ef]"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHistoryEditId(key);
                                    setHistoryDeleteConfirm(null);
                                    setHistoryEditValues({
                                      freightNoVat: money(row.freightNoVat),
                                      pvcNoVat: money(row.pvcNoVat),
                                      pvcWithVat: money(row.pvcWithVat),
                                    });
                                  }}
                                  className="rounded border border-[#dbe4ef] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#334b6b] hover:bg-[#edf4fc]"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setHistoryDeleteConfirm(key); setHistoryEditId(null); setHistoryEditValues(null); }}
                                  className="rounded border border-[#f0c4c2] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#b7433f] hover:bg-[#fce9e8]"
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Confirmation modal ───────────────────────────────────────────── */}
      {showConfirmModal && (() => {
        const changes = pendingChanges();
        const origMap = new Map(originalRows.map((r) => [r.id, r]));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-[#dbe4ef] px-6 py-4">
                <div className="text-sm font-extrabold text-[#10233f]">Confirmar cambios</div>
                <div className="mt-0.5 text-[11px] text-[#62728a]">
                  Período a guardar: <span className="font-bold">{months[Number(saveMonth) - 1]} {saveYear}</span>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
                {changes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#74849a]">
                    No hay cambios respecto a la última carga.
                  </div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-[#dbe4ef] text-[9px] font-extrabold uppercase tracking-wide text-[#8190a4]">
                        <th className="pb-2 text-left">Cód.</th>
                        <th className="pb-2 text-left">Producto</th>
                        <th className="pb-2 text-right">Flete antes</th>
                        <th className="pb-2 text-right">Flete después</th>
                        <th className="pb-2 text-right">PVC c/IVA antes</th>
                        <th className="pb-2 text-right">PVC c/IVA después</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((row) => {
                        const orig = origMap.get(row.id)!;
                        const freightChanged = Math.abs(row.freightNoVat - orig.freightNoVat) > 0.001;
                        const pvcChanged = Math.abs(row.pvcWithVat - orig.pvcWithVat) > 0.001;
                        return (
                          <tr key={row.id} className="border-b border-[#f0f4f8]">
                            <td className="py-1.5 font-mono text-[#425979]">{row.clientCode}</td>
                            <td className="py-1.5 text-[#334b6b]">{row.product}</td>
                            <td className={`py-1.5 text-right tabular-nums ${freightChanged ? "text-[#74849a] line-through" : "text-[#74849a]"}`}>
                              ${money(orig.freightNoVat)}
                            </td>
                            <td className={`py-1.5 text-right tabular-nums font-bold ${freightChanged ? "text-[#0b5bbb]" : "text-[#74849a]"}`}>
                              ${money(row.freightNoVat)}
                            </td>
                            <td className={`py-1.5 text-right tabular-nums ${pvcChanged ? "text-[#74849a] line-through" : "text-[#74849a]"}`}>
                              ${money(orig.pvcWithVat)}
                            </td>
                            <td className={`py-1.5 text-right tabular-nums font-bold ${pvcChanged ? "text-[#0b5bbb]" : "text-[#74849a]"}`}>
                              ${money(row.pvcWithVat)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[#dbe4ef] px-6 py-4">
                <div className="text-[11px] text-[#62728a]">
                  {changes.length > 0
                    ? `${changes.length} fila${changes.length > 1 ? "s" : ""} con cambios`
                    : "Sin cambios detectados"}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowConfirmModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={saveStructure} disabled={saving}>
                    <Save size={13} />
                    {saving ? "Guardando..." : "Confirmar y guardar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative mt-1">
      <Search
        size={9}
        className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-full rounded-md border border-[#b8c8d8] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
      />
    </div>
  );
}
