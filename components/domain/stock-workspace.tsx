"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockRow = {
  id: string;
  vigente: boolean;
  clientCode: string;
  uniqueCode: string;
  product: string;
  supplier: string;
  category: string;
  totalOrder: number;
  physicalIncome: number;
  egress: number;
  theoreticalStock: number;
  realStock: number;
  pendingDeliveries: number;
  totalTransactions: number;
  firstIncomeDate: string;
  reportedStock: number;
  validity: number;
  transactionsPerDay: number;
  stockDays: number;
  packageSize: number;
  costDgNoVat: number;
  totalCost: number;
  stockValue: number;
  unitProfit: number;
  salePrice: number;
  hasStockData: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENTS = ["Santander"];
const today = new Date();
const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const MONTH_LABEL = MONTHS[today.getMonth()];
const YEAR = today.getFullYear();
const TOTAL_COLS = 29; // 3 sticky + 2 info + 6 mov + 3 si + 4 canjes + 6 nec + 5 costos

const STOCK_KEY = (c: string) => `stock-informado-v1-${c.toLowerCase()}`;

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function packageRound(value: number, size: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  if (!size || size <= 1) return Math.ceil(value);
  const rounded = Math.ceil(Math.abs(value) / size) * size;
  return value < 0 ? -rounded : rounded;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StockWorkspace() {
  const [client, setClient] = useState(CLIENTS[0]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSearch, setCodeSearch] = useState("");
  const [uniqueSearch, setUniqueSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [planningMonths, setPlanningMonths] = useState("2");

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadStock = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setStatus("Cargando...");
      try {
        const res = await fetch(
          `/api/local-db/stock?client=${encodeURIComponent(client)}`,
          { signal },
        );
        const data = (await res.json()) as { rows: StockRow[]; message?: string };
        if (!res.ok) throw new Error(data.message || "Error al cargar");

        const saved = JSON.parse(
          localStorage.getItem(STOCK_KEY(client)) || "{}",
        ) as Record<string, number>;
        const merged = data.rows.map((r) => ({
          ...r,
          vigente: r.vigente ?? true,
          reportedStock:
            r.clientCode in saved ? saved[r.clientCode] : r.reportedStock,
        }));

        setRows(merged);
        setStatus(data.message || "");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setRows([]);
        setStatus(
          err instanceof Error ? err.message : "No se pudo cargar el stock.",
        );
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStock(controller.signal);
    return () => controller.abort();
  }, [loadStock]);

  // ── Edit reported stock ───────────────────────────────────────────────────

  function updateReportedStock(clientCode: string, value: string) {
    const num = parseFloat(value);
    const next = Number.isFinite(num) ? num : 0;
    setRows((cur) =>
      cur.map((r) => (r.clientCode === clientCode ? { ...r, reportedStock: next } : r)),
    );
    const saved = JSON.parse(
      localStorage.getItem(STOCK_KEY(client)) || "{}",
    ) as Record<string, number>;
    saved[clientCode] = next;
    localStorage.setItem(STOCK_KEY(client), JSON.stringify(saved));
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const months = Number(planningMonths) || 0;

  const { activeRows, inactiveRows } = useMemo(() => {
    const cc = codeSearch.trim().toLowerCase();
    const uc = uniqueSearch.trim().toLowerCase();
    const pc = productSearch.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!cc || r.clientCode.toLowerCase().includes(cc)) &&
        (!uc || r.uniqueCode.toLowerCase().includes(uc)) &&
        (!pc || r.product.toLowerCase().includes(pc)),
    );
    return {
      activeRows: filtered.filter((r) => r.vigente),
      inactiveRows: filtered.filter(
        (r) => !r.vigente && (r.theoreticalStock > 0 || r.realStock > 0),
      ),
    };
  }, [rows, codeSearch, uniqueSearch, productSearch]);

  const totals = useMemo(
    () => ({
      vigentes: rows.filter((r) => r.vigente).length,
      noVigentesConStock: rows.filter(
        (r) => !r.vigente && (r.theoreticalStock > 0 || r.realStock > 0),
      ).length,
      realStock: rows.filter((r) => r.vigente).reduce((s, r) => s + r.realStock, 0),
      stockValue: rows.filter((r) => r.vigente).reduce((s, r) => s + r.stockValue, 0),
      sinDatos: rows.filter((r) => r.vigente && !r.hasStockData).length,
    }),
    [rows],
  );

  function calcRow(row: StockRow) {
    const webAvailable = row.reportedStock - row.totalTransactions;
    const adjustment = row.realStock - webAvailable;
    const requiredStock = row.transactionsPerDay * months * 30;
    const surplusShortage = row.theoreticalStock - requiredStock;
    const surplusShortageByPackage = packageRound(surplusShortage, row.packageSize);
    const finalPurchase = surplusShortageByPackage < 0 ? Math.abs(surplusShortageByPackage) : 0;
    return { webAvailable, adjustment, requiredStock, surplusShortage, surplusShortageByPackage, finalPurchase };
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  // Group header row cells (sticky top-0, h-7 = 28px fixed height)
  const grpBase = "sticky top-0 h-7 border-b border-[#c8d6e5] px-2 text-center text-[8.5px] font-black uppercase tracking-wide";
  // Column header cells (sticky top-7 = below group row)
  const colHdr = "sticky top-7 z-20 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 text-center text-[8px] font-black text-[#334b6b]";
  // Sticky column header cells (also left-pinned)
  const colHdrSticky = "sticky top-7 z-40 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 text-[8px] font-black text-[#334b6b]";
  // Body number cells
  const td = "border-b border-[#e8eef5] px-1.5 py-1.5 text-[8px] text-right tabular-nums";

  // ── Row renderer ──────────────────────────────────────────────────────────

  function renderRow(row: StockRow, section: "active" | "inactive") {
    const { webAvailable, adjustment, requiredStock, surplusShortage, surplusShortageByPackage, finalPurchase } =
      calcRow(row);
    const rowBg = section === "inactive"
      ? "bg-[#f9f8fb]"
      : row.hasStockData ? "bg-white" : "bg-[#fffcf0]";
    const stickyBg = section === "inactive"
      ? "bg-[#f3f0f9] bg-clip-padding"
      : row.hasStockData ? "bg-[#f8fafd] bg-clip-padding" : "bg-[#fffbee] bg-clip-padding";

    return (
      <tr key={row.id} className={rowBg}>
        {/* Sticky col 1: Código cliente */}
        <td
          className={`sticky left-0 z-30 w-[80px] min-w-[80px] max-w-[80px] border-b border-r border-[#e8eef5] border-r-[#d6e0ec] px-1.5 py-1.5 font-mono text-[8px] ${stickyBg}`}
          title={row.clientCode}
        >
          <div className="truncate">{row.clientCode}</div>
        </td>
        {/* Sticky col 2: Código único */}
        <td
          className={`sticky left-[80px] z-30 w-[90px] min-w-[90px] max-w-[90px] border-b border-r border-[#e8eef5] border-r-[#d6e0ec] px-1.5 py-1.5 font-mono text-[8px] ${stickyBg}`}
          title={row.uniqueCode}
        >
          <div className="truncate">{row.uniqueCode}</div>
        </td>
        {/* Sticky col 3: Producto */}
        <td
          className={`sticky left-[170px] z-30 w-[180px] min-w-[180px] max-w-[180px] border-b border-r border-[#e8eef5] border-r-[#c3d0df] px-1.5 py-1.5 text-[8px] font-medium text-[#334b6b] shadow-[6px_0_8px_-5px_rgba(16,35,63,.12)] ${stickyBg}`}
          title={row.product}
        >
          <div className="truncate">{row.product || "—"}</div>
        </td>
        {/* Info */}
        <td className={`${td} text-left text-[#425979]`}>{row.supplier || "—"}</td>
        <td className={`${td} text-left text-[#425979]`}>{row.category || "—"}</td>
        {/* Movimientos */}
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.totalOrder)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.physicalIncome)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.egress)}</td>
        <td className={`${td} bg-[#edf3ff] font-bold text-[#10233f]`}>{fmt(row.theoreticalStock)}</td>
        <td className={`${td} bg-[#edf3ff] font-bold text-[#10233f]`}>{fmt(row.realStock)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.pendingDeliveries)}</td>
        {/* Stock informado */}
        <td className="border-b border-[#e8eef5] bg-[#fffbec] px-1 py-1">
          <input
            type="number"
            value={row.reportedStock}
            onChange={(e) => updateReportedStock(row.clientCode, e.target.value)}
            className="h-6 w-full min-w-[60px] rounded border border-[#e4c878] bg-white px-1 text-right text-[7.5px] tabular-nums outline-none focus:border-[#b88a00] focus:ring-1 focus:ring-[#b88a00]/30"
          />
        </td>
        <td className={`${td} bg-[#fffbec]`}>{fmt(webAvailable)}</td>
        <td className={`${td} bg-[#fffbec]`}>{fmt(adjustment)}</td>
        {/* Canjes */}
        <td className={td}>{fmt(row.totalTransactions)}</td>
        <td className={`${td} text-center font-mono`}>{row.firstIncomeDate || "—"}</td>
        <td className={td}>{fmt(row.validity)}</td>
        <td className={td}>{row.transactionsPerDay > 0 ? fmt(row.transactionsPerDay) : "—"}</td>
        {/* Necesidad */}
        <td className={`${td} bg-[#f8f6fd]`}>{row.stockDays > 0 ? fmt(row.stockDays) : "—"}</td>
        <td className={`${td} bg-[#f8f6fd]`}>{fmt(requiredStock)}</td>
        <td
          className={`${td} bg-[#f2eefa] font-bold ${surplusShortage < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
        >
          {fmt(surplusShortage)}
        </td>
        <td
          className={`${td} bg-[#f2eefa] font-bold ${surplusShortageByPackage < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
        >
          {fmt(surplusShortageByPackage)}
        </td>
        <td className={`${td} bg-[#f8f6fd]`}>{fmt(row.packageSize)}</td>
        <td className={`${td} bg-[#f2eefa] font-bold text-[#334b6b]`}>{fmt(finalPurchase)}</td>
        {/* Costos */}
        <td className={`${td} bg-[#edf8f1]`}>{money(row.costDgNoVat)}</td>
        <td className={`${td} bg-[#edf8f1]`}>{money(row.totalCost)}</td>
        <td className={`${td} bg-[#dff0e6] font-bold`}>{money(row.stockValue)}</td>
        <td className={`${td} bg-[#edf8f1]`}>{money(row.unitProfit)}</td>
        <td className={`${td} bg-[#edf8f1]`}>{money(row.salePrice)}</td>
      </tr>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Stock actual por cliente"
        description="Visualización cruzada con ingresos, egresos y estructura de costos."
      />

      {/* Controls */}
      <section className="card mb-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[200px] flex-1 text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              {CLIENTS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {(status || loading) && (
          <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-2.5 text-[11px] font-bold text-[#62728a]">
            {loading ? "Cargando..." : status}
          </div>
        )}
      </section>

      {/* KPIs */}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Vigentes", value: fmt(totals.vigentes) },
          { label: "No vigentes con stock", value: fmt(totals.noVigentesConStock) },
          { label: "Stock real (vigentes)", value: fmt(totals.realStock) },
          { label: "Stock valorizado", value: `$${money(totals.stockValue)}` },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4">
            <div className="text-[10px] font-black uppercase text-[#62728a]">{label}</div>
            <div className="mt-2 text-2xl font-black text-[#10233f]">{value}</div>
          </div>
        ))}
      </section>

      {/* Table */}
      <section className="card w-full overflow-hidden">
        {/* Table controls bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-3">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              {client} · {MONTH_LABEL} {YEAR}
            </div>
            {totals.sinDatos > 0 && (
              <div className="mt-0.5 text-[10px] text-[#b76a18]">
                {totals.sinDatos} código{totals.sinDatos !== 1 ? "s" : ""} sin datos en la base de stock
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-[#62728a]">
            Meses stock
            <input
              type="number"
              min="0"
              step="0.5"
              value={planningMonths}
              onChange={(e) => setPlanningMonths(e.target.value)}
              className="h-8 w-20 rounded-lg border border-[#dbe4ef] bg-white px-2 text-right text-xs text-[#10233f] outline-none focus:border-[#0b5bbb]"
            />
          </label>
        </div>

        <div className="max-h-[calc(100vh-390px)] min-h-[300px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[2160px] table-fixed border-separate border-spacing-0 text-left text-[8px]">
            <thead>
              {/* Row 1 – group headers */}
              <tr>
                {/* Sticky placeholders (no label needed) */}
                <th className={`${grpBase} sticky left-0 z-50 w-[80px] min-w-[80px] bg-[#e4ecf5]`} />
                <th className={`${grpBase} sticky left-[80px] z-50 w-[90px] min-w-[90px] bg-[#e4ecf5]`} />
                <th className={`${grpBase} sticky left-[170px] z-50 w-[180px] min-w-[180px] bg-[#e4ecf5]`} />
                {/* Info (no label) */}
                <th colSpan={2} className={`${grpBase} z-20 bg-[#edf3f9] text-[#62728a]`} />
                {/* Movimientos */}
                <th colSpan={6} className={`${grpBase} z-20 bg-[#dceafe] text-[#1e4db7]`}>
                  Movimientos
                </th>
                {/* Stock informado */}
                <th colSpan={3} className={`${grpBase} z-20 bg-[#fef5d4] text-[#7a5b00]`}>
                  Stock informado
                </th>
                {/* Canjes */}
                <th colSpan={4} className={`${grpBase} z-20 bg-[#edf3f9] text-[#334b6b]`}>
                  Canjes
                </th>
                {/* Necesidad */}
                <th colSpan={6} className={`${grpBase} z-20 bg-[#ede8fa] text-[#4b3080]`}>
                  Necesidad de compra
                </th>
                {/* Costos */}
                <th colSpan={5} className={`${grpBase} z-20 bg-[#d8f0e3] text-[#1a5c30]`}>
                  Costos
                </th>
              </tr>

              {/* Row 2 – column headers */}
              <tr>
                {/* Sticky col 1 */}
                <th className={`${colHdrSticky} left-0 w-[80px] min-w-[80px] text-left`}>
                  <div className="mb-1 pl-0.5">Código</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]" />
                    <input
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                      aria-label="Buscar código cliente"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Sticky col 2 */}
                <th className={`${colHdrSticky} left-[80px] w-[90px] min-w-[90px] text-left`}>
                  <div className="mb-1 pl-0.5">Código único</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]" />
                    <input
                      value={uniqueSearch}
                      onChange={(e) => setUniqueSearch(e.target.value)}
                      aria-label="Buscar código único"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Sticky col 3 */}
                <th className={`${colHdrSticky} left-[170px] w-[180px] min-w-[180px] text-left shadow-[6px_0_8px_-5px_rgba(16,35,63,.18)]`}>
                  <div className="mb-1 pl-0.5">Producto</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      aria-label="Buscar producto"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Info */}
                <th className={`${colHdr} w-[88px]`}>Proveedor</th>
                <th className={`${colHdr} w-[88px]`}>Categoría</th>
                {/* Movimientos */}
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>Pedido tot.</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>Ing. físico</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>Egreso</th>
                <th className={`${colHdr} w-[64px] bg-[#e5eeff]`}>Stk. teórico</th>
                <th className={`${colHdr} w-[64px] bg-[#e5eeff]`}>Stk. real</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>Entg. pend.</th>
                {/* Stock informado */}
                <th className={`${colHdr} w-[72px] bg-[#fdf6de]`}>Stk. inf.</th>
                <th className={`${colHdr} w-[64px] bg-[#fdf6de]`}>Disp. WEB</th>
                <th className={`${colHdr} w-[64px] bg-[#fdf6de]`}>Ajuste</th>
                {/* Canjes */}
                <th className={`${colHdr} w-[64px]`}>Trans. tot.</th>
                <th className={`${colHdr} w-[72px]`}>Fecha 1° ing.</th>
                <th className={`${colHdr} w-[56px]`}>Vigencia</th>
                <th className={`${colHdr} w-[56px]`}>Trans./día</th>
                {/* Necesidad */}
                <th className={`${colHdr} w-[56px] bg-[#f5f2fe]`}>Días stk.</th>
                <th className={`${colHdr} w-[64px] bg-[#f5f2fe]`}>Stk. nec.</th>
                <th className={`${colHdr} w-[64px] bg-[#eee8fb]`}>Sobra/Falta</th>
                <th className={`${colHdr} w-[56px] bg-[#eee8fb]`}>S/F bulto</th>
                <th className={`${colHdr} w-[48px] bg-[#f5f2fe]`}>Bulto</th>
                <th className={`${colHdr} w-[64px] bg-[#eee8fb]`}>Compra final</th>
                {/* Costos */}
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>Costo DG</th>
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>Costo tot.</th>
                <th className={`${colHdr} w-[80px] bg-[#d9f0e3]`}>Val. stock</th>
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>Util. unit.</th>
                <th className={`${colHdr} w-[64px] bg-[#e8f5ee]`}>PV</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={TOTAL_COLS} className="py-16 text-center text-[10px] font-bold text-[#62728a]">
                    Cargando stock...
                  </td>
                </tr>
              ) : activeRows.length === 0 && inactiveRows.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS} className="py-16 text-center text-[10px] font-bold text-[#62728a]">
                    {rows.length === 0 ? "Sin datos de stock para este cliente." : "Sin resultados para la búsqueda."}
                  </td>
                </tr>
              ) : (
                <>
                  {activeRows.map((row) => renderRow(row, "active"))}

                  {inactiveRows.length > 0 && (
                    <>
                      <tr>
                        <td
                          colSpan={TOTAL_COLS}
                          className="border-y border-[#d5ccf0] bg-[#f2eefa] py-2 pl-4 text-[9px] font-black uppercase tracking-widest text-[#5f3da0]"
                        >
                          No vigentes con stock restante · {inactiveRows.length} código
                          {inactiveRows.length !== 1 ? "s" : ""}
                        </td>
                      </tr>
                      {inactiveRows.map((row) => renderRow(row, "inactive"))}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-2.5 text-[10px] text-[#62728a]">
          {activeRows.length} vigentes
          {inactiveRows.length > 0
            ? ` · ${inactiveRows.length} no vigentes con stock`
            : ""}
          {totals.sinDatos > 0 ? ` · ${totals.sinDatos} sin datos cruzados` : ""}
        </div>
      </section>
    </>
  );
}
