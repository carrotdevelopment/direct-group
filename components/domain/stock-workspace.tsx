"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Minus, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { CODE_TYPES, CODE_TYPE_LABEL, usesCodeType, type CodeType } from "@/lib/code-type";
import {
  groupBySupplier, matchesFilters, nextSort, sortLines, stockCalc, stockExportFileName, stockExportSheet, STOCK_COLUMNS,
  type BalanceFilter, type StockColumn, type StockLine, type StockRow, type StockSort, type TypeFilter,
} from "@/lib/stock-table";

// Zoom de la tabla, en porcentaje. Se recuerda en este navegador.
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const ZOOM_KEY = "dg:stock:zoom";
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)));

function readSavedZoom() {
  try {
    const saved = Number(window.localStorage.getItem(ZOOM_KEY));
    return saved ? clampZoom(saved) : 100;
  } catch {
    return 100;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const today = new Date();
const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const MONTH_LABEL = MONTHS[today.getMonth()];
const YEAR = today.getFullYear();
const BASE_COLS = 31; // 3 sticky + 2 info + 6 mov + 2 urbano + 3 si + 4 canjes + 6 nec + 5 costos

const STOCK_KEY = (c: string) => `stock-informado-v1-${c.toLowerCase()}`;
const LAST_CLIENT_KEY = "stock-ultimo-cliente";

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

// ─── Component ────────────────────────────────────────────────────────────────

export function StockWorkspace() {
  const [clients, setClients] = useState<string[]>([]);
  // Vacío hasta leer el último cliente elegido, para no cargar Santander de más al entrar.
  const [client, setClient] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSearch, setCodeSearch] = useState("");
  const [uniqueSearch, setUniqueSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [zoom, setZoomState] = useState(100);
  // El zoom guardado se lee después de montar, para que el HTML del servidor y el del navegador coincidan.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setZoomState(readSavedZoom()));
    return () => cancelAnimationFrame(frame);
  }, []);
  const setZoom = (value: number) => {
    const next = clampZoom(value);
    setZoomState(next);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      // Sin almacenamiento el zoom vale solo para esta visita.
    }
  };
  const [planningMonths, setPlanningMonths] = useState("2");
  const [sort, setSort] = useState<StockSort>(null);
  const [grouped, setGrouped] = useState(false);
  const [balance, setBalance] = useState<BalanceFilter>("");
  const [typeChoice, setTypeChoice] = useState<TypeFilter>("");
  const [savingType, setSavingType] = useState(false);
  const [notice, setNotice] = useState("");
  const withType = usesCodeType(client);
  const typeFilter: TypeFilter = withType ? typeChoice : "";
  const totalCols = BASE_COLS + (withType ? 1 : 0);

  useEffect(() => {
    let last = "";
    try {
      last = localStorage.getItem(LAST_CLIENT_KEY) || "";
    } catch {}
    // Restore the client chosen last time in this browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClient(last);
  }, []);

  function chooseClient(next: string) {
    setClient(next);
    setNotice("");
    try {
      localStorage.setItem(LAST_CLIENT_KEY, next);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/local-db/stock?clients=1")
      .then((response) => response.json() as Promise<{ clients?: string[] }>)
      .then((data) => {
        const names = data.clients;
        if (names && names.length === 0) {
          setClients([]);
          setClient("");
          setStatus("No tenés clientes asignados. Pedile a un administrador que te los asigne en Permisos.");
        }
        if (!names?.length) return;
        setClients(names);
        // Si el último cliente guardado ya no está en la lista (o no hay), se usa el primero.
        setClient((current) => (names.includes(current) ? current : names[0]));
      })
      .catch(() => undefined);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadStock = useCallback(
    async (signal?: AbortSignal) => {
      if (!client) return;
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
    // The async loader owns the state transition and cancellation lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // ── Regular / especial ────────────────────────────────────────────────────

  async function changeType(codes: string[], type: CodeType) {
    setSavingType(true);
    setNotice("");
    try {
      const response = await fetch("/api/local-db/stock/tipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, codes, type }),
      });
      const data = (await response.json()) as { codes?: string[]; message?: string };
      if (!response.ok || !data.codes) throw new Error(data.message || "No se pudo cambiar el tipo.");
      const saved = new Set(data.codes);
      setRows((current) => current.map((row) => (saved.has(row.clientCode.trim().toLowerCase()) ? { ...row, type } : row)));
      setNotice(`${saved.size} código${saved.size === 1 ? "" : "s"} a ${CODE_TYPE_LABEL[type]}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cambiar el tipo.");
    } finally {
      setSavingType(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const months = Number(planningMonths) || 0;

  const { activeGroups, inactiveGroups, activeRows, inactiveRows } = useMemo(() => {
    const cc = codeSearch.trim().toLowerCase();
    const uc = uniqueSearch.trim().toLowerCase();
    const pc = productSearch.trim().toLowerCase();
    const filtered = rows.map((r): StockLine => ({ ...r, ...stockCalc(r, months) })).filter(
      (r) =>
        matchesFilters(r, balance, typeFilter) &&
        (!cc || r.clientCode.toLowerCase().includes(cc)) &&
        (!uc || r.uniqueCode.toLowerCase().includes(uc)) &&
        (!pc || r.product.toLowerCase().includes(pc)),
    );
    const arrange = (lines: StockLine[]) => {
      const sorted = sortLines(lines, sort);
      return grouped ? groupBySupplier(sorted) : [{ supplier: "", lines: sorted }];
    };
    const active = arrange(filtered.filter((r) => r.vigente));
    const inactive = arrange(filtered.filter((r) => !r.vigente && (r.theoreticalStock > 0 || r.realStock > 0)));
    return {
      activeGroups: active,
      inactiveGroups: inactive,
      activeRows: active.flatMap((group) => group.lines),
      inactiveRows: inactive.flatMap((group) => group.lines),
    };
  }, [rows, codeSearch, uniqueSearch, productSearch, months, balance, typeFilter, sort, grouped]);

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

  const visibleRows = [...activeRows, ...inactiveRows];

  async function exportStock() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(stockExportSheet(visibleRows, withType)), "Stock");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = stockExportFileName(client, new Date());
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  // Group header row cells (sticky top-0, h-7 = 28px fixed height)
  const grpBase = "sticky top-0 h-7 border-b border-[#c8d6e5] px-2 text-center text-[11px] font-black uppercase tracking-wide";
  // Column header cells (sticky top-7 = below group row)
  const colHdr = "sticky top-7 z-20 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 text-center text-[11px] font-black text-[#334b6b]";
  // Sticky column header cells (also left-pinned)
  const colHdrSticky = "sticky top-7 z-40 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 text-[11px] font-black text-[#334b6b]";
  const controlClass = "h-8 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs font-semibold normal-case text-[#10233f] outline-none focus:border-[#0b5bbb]";
  // Body number cells
  const td = "border-b border-[#e8eef5] px-1.5 py-1.5 text-[11px] text-right tabular-nums";

  // ── Row renderer ──────────────────────────────────────────────────────────

  function sortButton(key: StockColumn) {
    const label = STOCK_COLUMNS.find((column) => column.key === key)?.label;
    const direction = sort?.key === key ? sort.direction : null;
    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
    return (
      <button
        type="button"
        onClick={() => setSort(nextSort(sort, key))}
        title={direction === "desc" ? "De mayor a menor" : direction === "asc" ? "De menor a mayor" : "Ordenar"}
        className={`inline-flex items-center gap-0.5 hover:text-[#0b5bbb] ${direction ? "text-[#0b5bbb]" : ""}`}
      >
        {label}
        <Icon size={10} className={`shrink-0 ${direction ? "" : "opacity-40"}`} />
      </button>
    );
  }

  function renderGroups(groups: { supplier: string; lines: StockLine[] }[], section: "active" | "inactive") {
    return groups.map((group) => (
      <Fragment key={group.supplier || "sin-proveedor"}>
        {grouped && (
          <tr>
            <td colSpan={totalCols} className="border-y border-[#c8d6e5] bg-[#e4ecf5] py-1.5 text-[11px] font-black text-[#10233f]">
              <span className="sticky left-0 inline-block px-2">
                {group.supplier || "Sin proveedor"} · {group.lines.length} código{group.lines.length === 1 ? "" : "s"} · stock real{" "}
                {fmt(group.lines.reduce((sum, line) => sum + line.realStock, 0))} · compra final{" "}
                {fmt(group.lines.reduce((sum, line) => sum + line.finalPurchase, 0))} · valorizado $
                {money(group.lines.reduce((sum, line) => sum + line.stockValue, 0))}
              </span>
            </td>
          </tr>
        )}
        {group.lines.map((line) => renderRow(line, section))}
      </Fragment>
    ));
  }

  function renderRow(row: StockLine, section: "active" | "inactive") {
    const { webAvailable, adjustment, requiredStock, surplusShortage, surplusShortageByPackage, finalPurchase } = row;
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
          className={`sticky left-0 z-30 w-[80px] min-w-[80px] max-w-[80px] border-b border-r border-[#e8eef5] border-r-[#d6e0ec] px-1.5 py-1.5 font-mono text-[11px] ${stickyBg}`}
          title={row.clientCode}
        >
          <div className="truncate">{row.clientCode}</div>
        </td>
        {/* Sticky col 2: Código único */}
        <td
          className={`sticky left-[80px] z-30 w-[90px] min-w-[90px] max-w-[90px] border-b border-r border-[#e8eef5] border-r-[#d6e0ec] px-1.5 py-1.5 font-mono text-[11px] ${stickyBg}`}
          title={row.uniqueCode}
        >
          <div className="truncate">{row.uniqueCode}</div>
        </td>
        {/* Sticky col 3: Producto */}
        <td
          className={`sticky left-[170px] z-30 w-[180px] min-w-[180px] max-w-[180px] border-b border-r border-[#e8eef5] border-r-[#c3d0df] px-1.5 py-1.5 text-[11px] font-medium text-[#334b6b] shadow-[6px_0_8px_-5px_rgba(16,35,63,.12)] ${stickyBg}`}
          title={row.product}
        >
          <div className="truncate">{row.product || "—"}</div>
        </td>
        {/* Info */}
        {withType && (
          <td className="border-b border-[#e8eef5] px-1 py-1">
            <select
              aria-label={`Tipo de ${row.clientCode}`}
              value={row.type ?? ""}
              disabled={savingType}
              onChange={(e) => void changeType([row.clientCode], e.target.value as CodeType)}
              className={`h-6 w-full rounded border border-[#dbe4ef] bg-white px-0.5 text-[11px] font-bold ${row.type === "ESPECIAL" ? "text-[#5f3da0]" : row.type ? "text-[#334b6b]" : "text-[#b76a18]"}`}
            >
              {!row.type && <option value="" disabled>Sin clasificar</option>}
              {CODE_TYPES.map((type) => <option key={type} value={type}>{CODE_TYPE_LABEL[type]}</option>)}
            </select>
          </td>
        )}
        <td className={`${td} text-left text-[#425979]`}>{row.supplier || "—"}</td>
        <td className={`${td} text-left text-[#425979]`}>{row.category || "—"}</td>
        {/* Movimientos */}
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.totalOrder)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.physicalIncome)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.egress)}</td>
        <td className={`${td} bg-[#edf3ff] font-bold text-[#10233f]`}>{fmt(row.theoreticalStock)}</td>
        <td className={`${td} bg-[#edf3ff] font-bold text-[#10233f]`}>{fmt(row.realStock)}</td>
        <td className={`${td} bg-[#f6f9ff]`}>{fmt(row.pendingDeliveries)}</td>
        {/* Stock Urbano */}
        <td className={`${td} bg-[#eef8f7] font-bold text-[#0f5e57]`}>{row.urbanoStock === null ? "—" : fmt(row.urbanoStock)}</td>
        <td
          className={`${td} bg-[#eef8f7] font-bold ${row.urbanoDifference === null || row.urbanoDifference === 0 ? "text-[#5a6a82]" : row.urbanoDifference < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
        >
          {row.urbanoDifference === null ? "—" : fmt(row.urbanoDifference)}
        </td>
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
              onChange={(e) => chooseClient(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              {clients.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        {(status || loading) && (
          <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-2.5 text-[11px] font-bold text-[#5a6a82]">
            {loading ? "Cargando..." : status}
          </div>
        )}
      </section>

      {/* KPIs */}
      <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Vigentes", value: fmt(totals.vigentes) },
          { label: "No vigentes con stock", value: fmt(totals.noVigentesConStock) },
          { label: "Stock real (vigentes)", value: fmt(totals.realStock) },
          { label: "Stock valorizado", value: `$${money(totals.stockValue)}` },
        ].map(({ label, value }) => (
          <div key={label} className="card min-w-0 px-3 py-2.5">
            <div className="truncate text-[11px] font-black uppercase text-[#5a6a82]">{label}</div>
            <div className="truncate text-lg font-black leading-tight text-[#10233f]">{value}</div>
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
              <div className="mt-0.5 text-[11px] text-[#b76a18]">
                {totals.sinDatos} código{totals.sinDatos !== 1 ? "s" : ""} sin datos en la base de stock
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#5a6a82]">
            Zoom
            <button
              type="button"
              aria-label="Achicar la tabla"
              onClick={() => setZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] bg-white text-[#334b6b] hover:bg-[#f2f6fb] disabled:opacity-40"
            >
              <Minus size={13} />
            </button>
            <input
              type="range"
              aria-label="Zoom de la tabla"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-[#0b5bbb]"
            />
            <button
              type="button"
              aria-label="Agrandar la tabla"
              onClick={() => setZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] bg-white text-[#334b6b] hover:bg-[#f2f6fb] disabled:opacity-40"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              title="Volver al 100%"
              className="w-11 rounded-lg px-1 py-1 text-right text-xs normal-case text-[#10233f] hover:bg-[#f2f6fb]"
            >
              {zoom}%
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="accent-[#0b5bbb]" />
            Agrupar por proveedor
          </label>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
            Sobra/Falta
            <select value={balance} onChange={(e) => setBalance(e.target.value as BalanceFilter)} className={controlClass}>
              <option value="">Todos</option>
              <option value="falta">Negativo (falta)</option>
              <option value="sobra">Positivo (sobra)</option>
            </select>
          </label>
          {withType && (
            <>
              <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
                Tipo
                <select value={typeChoice} onChange={(e) => setTypeChoice(e.target.value as TypeFilter)} className={controlClass}>
                  <option value="">Todos</option>
                  <option value="REGULAR">Regulares</option>
                  <option value="ESPECIAL">Especiales</option>
                  <option value="SIN">Sin clasificar</option>
                </select>
              </label>
              <select
                aria-label="Pasar los códigos que se ven a otro tipo"
                value=""
                disabled={savingType || !visibleRows.length}
                onChange={(e) => {
                  const type = e.target.value as CodeType;
                  if (window.confirm(`¿Pasar los ${visibleRows.length} códigos que se ven a ${CODE_TYPE_LABEL[type]}?`)) {
                    void changeType(visibleRows.map((row) => row.clientCode), type);
                  }
                }}
                className={controlClass}
              >
                <option value="" disabled>{`Pasar los ${visibleRows.length} que se ven a…`}</option>
                {CODE_TYPES.map((type) => <option key={type} value={type}>{CODE_TYPE_LABEL[type]}</option>)}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => void exportStock()}
            disabled={loading || !visibleRows.length}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs font-black text-[#334b6b] hover:bg-[#f2f6fb] disabled:opacity-40"
          >
            <Download size={13} /> Exportar Excel
          </button>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
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
        </div>

        {notice && (
          <div role="status" className="border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-2 text-[11px] font-bold text-[#334b6b]">{notice}</div>
        )}
        <div className="max-h-[calc(100vh-330px)] min-h-[300px] overflow-auto overscroll-contain bg-white">
          <table
            style={{ zoom: zoom / 100, minWidth: withType ? 2394 : 2290 }}
            className="table-fixed border-separate border-spacing-0 text-left text-[11px]"
          >
            <thead>
              {/* Row 1 – group headers */}
              <tr>
                {/* Sticky placeholders (no label needed) */}
                <th className={`${grpBase} sticky left-0 z-50 w-[80px] min-w-[80px] bg-[#e4ecf5]`} />
                <th className={`${grpBase} sticky left-[80px] z-50 w-[90px] min-w-[90px] bg-[#e4ecf5]`} />
                <th className={`${grpBase} sticky left-[170px] z-50 w-[180px] min-w-[180px] bg-[#e4ecf5]`} />
                {/* Info (no label) */}
                <th colSpan={withType ? 3 : 2} className={`${grpBase} z-20 bg-[#edf3f9] text-[#5a6a82]`} />
                {/* Movimientos */}
                <th colSpan={6} className={`${grpBase} z-20 bg-[#dceafe] text-[#1e4db7]`}>
                  Movimientos
                </th>
                {/* Stock Urbano */}
                <th colSpan={2} className={`${grpBase} z-20 bg-[#d9f1ee] text-[#0f5e57]`}>
                  Urbano
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
                  <div className="mb-1 pl-0.5">{sortButton("clientCode")}</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                    <input
                      value={codeSearch}
                      onChange={(e) => setCodeSearch(e.target.value)}
                      aria-label="Buscar código cliente"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[11px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Sticky col 2 */}
                <th className={`${colHdrSticky} left-[80px] w-[90px] min-w-[90px] text-left`}>
                  <div className="mb-1 pl-0.5">{sortButton("uniqueCode")}</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                    <input
                      value={uniqueSearch}
                      onChange={(e) => setUniqueSearch(e.target.value)}
                      aria-label="Buscar código único"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[11px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Sticky col 3 */}
                <th className={`${colHdrSticky} left-[170px] w-[180px] min-w-[180px] text-left shadow-[6px_0_8px_-5px_rgba(16,35,63,.18)]`}>
                  <div className="mb-1 pl-0.5">{sortButton("product")}</div>
                  <div className="relative">
                    <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      aria-label="Buscar producto"
                      className="h-5 w-full rounded border border-[#c5d3e0] bg-white py-0.5 pl-4 pr-1 text-[11px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                {/* Info */}
                {withType && <th className={`${colHdr} w-[104px]`}>{sortButton("type")}</th>}
                <th className={`${colHdr} w-[88px]`}>{sortButton("supplier")}</th>
                <th className={`${colHdr} w-[88px]`}>{sortButton("category")}</th>
                {/* Movimientos */}
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>{sortButton("totalOrder")}</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>{sortButton("physicalIncome")}</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>{sortButton("egress")}</th>
                <th className={`${colHdr} w-[64px] bg-[#e5eeff]`}>{sortButton("theoreticalStock")}</th>
                <th className={`${colHdr} w-[64px] bg-[#e5eeff]`}>{sortButton("realStock")}</th>
                <th className={`${colHdr} w-[64px] bg-[#eef5ff]`}>{sortButton("pendingDeliveries")}</th>
                {/* Stock Urbano */}
                <th className={`${colHdr} w-[64px] bg-[#e6f5f3]`}>{sortButton("urbanoStock")}</th>
                <th className={`${colHdr} w-[64px] bg-[#e6f5f3]`} title="Stock Urbano menos stock real">{sortButton("urbanoDifference")}</th>
                {/* Stock informado */}
                <th className={`${colHdr} w-[72px] bg-[#fdf6de]`}>{sortButton("reportedStock")}</th>
                <th className={`${colHdr} w-[64px] bg-[#fdf6de]`}>{sortButton("webAvailable")}</th>
                <th className={`${colHdr} w-[64px] bg-[#fdf6de]`}>{sortButton("adjustment")}</th>
                {/* Canjes */}
                <th className={`${colHdr} w-[64px]`}>{sortButton("totalTransactions")}</th>
                <th className={`${colHdr} w-[72px]`}>{sortButton("firstIncomeDate")}</th>
                <th className={`${colHdr} w-[56px]`}>{sortButton("validity")}</th>
                <th className={`${colHdr} w-[56px]`}>{sortButton("transactionsPerDay")}</th>
                {/* Necesidad */}
                <th className={`${colHdr} w-[56px] bg-[#f5f2fe]`}>{sortButton("stockDays")}</th>
                <th className={`${colHdr} w-[64px] bg-[#f5f2fe]`}>{sortButton("requiredStock")}</th>
                <th className={`${colHdr} w-[64px] bg-[#eee8fb]`}>{sortButton("surplusShortage")}</th>
                <th className={`${colHdr} w-[56px] bg-[#eee8fb]`}>{sortButton("surplusShortageByPackage")}</th>
                <th className={`${colHdr} w-[48px] bg-[#f5f2fe]`}>{sortButton("packageSize")}</th>
                <th className={`${colHdr} w-[64px] bg-[#eee8fb]`}>{sortButton("finalPurchase")}</th>
                {/* Costos */}
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>{sortButton("costDgNoVat")}</th>
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>{sortButton("totalCost")}</th>
                <th className={`${colHdr} w-[80px] bg-[#d9f0e3]`}>{sortButton("stockValue")}</th>
                <th className={`${colHdr} w-[72px] bg-[#e8f5ee]`}>{sortButton("unitProfit")}</th>
                <th className={`${colHdr} w-[64px] bg-[#e8f5ee]`}>{sortButton("salePrice")}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-[11px] font-bold text-[#5a6a82]">
                    Cargando stock...
                  </td>
                </tr>
              ) : activeRows.length === 0 && inactiveRows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-[11px] font-bold text-[#5a6a82]">
                    {rows.length === 0 ? "Sin datos de stock para este cliente." : "Sin resultados con estos filtros."}
                  </td>
                </tr>
              ) : (
                <>
                  {renderGroups(activeGroups, "active")}

                  {inactiveRows.length > 0 && (
                    <>
                      <tr>
                        <td
                          colSpan={totalCols}
                          className="border-y border-[#d5ccf0] bg-[#f2eefa] py-2 pl-4 text-[11px] font-black uppercase tracking-widest text-[#5f3da0]"
                        >
                          No vigentes con stock restante · {inactiveRows.length} código
                          {inactiveRows.length !== 1 ? "s" : ""}
                        </td>
                      </tr>
                      {renderGroups(inactiveGroups, "inactive")}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-2.5 text-[11px] text-[#5a6a82]">
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
