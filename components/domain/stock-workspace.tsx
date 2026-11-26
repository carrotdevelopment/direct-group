"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Minus, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { ColPicker } from "@/components/domain/column-picker";
import { useOutsideClick } from "@/lib/use-outside-click";
import { CODE_TYPES, CODE_TYPE_LABEL, usesCodeType, type CodeType } from "@/lib/code-type";
import {
  amexCodeGroup, CONFIGURABLE_STOCK_COLUMNS, defaultStockColumns, groupBySupplier, isAmexClient, matchesColumnFilter, matchesFilters,
  nextSort, sortLines, stockCalc, sumColumn, stockExportFileName, stockExportSheet, STICKY_STOCK_COLUMNS, STOCK_COLUMNS,
  type BalanceFilter, type StockColumn, type StockLine, type StockRow, type StockSort, type TypeFilter,
} from "@/lib/stock-table";
import { informadoByIncome, parseInformado, resolveInformado, type SavedInformado } from "@/lib/stock-informado";

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

// Antes el stock informado se guardaba solo en el navegador: quedan ediciones viejas por pasar a la base.
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

// Vacío = sin informar. Guarda al salir de la celda o con Enter; Escape deshace.
function InformadoInput({ label, title, value, onSave }: { label: string; title: string; value: number | null; onSave: (value: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft === null) return;
    const next = parseInformado(draft);
    setDraft(null);
    if (next !== undefined && next !== value) onSave(next);
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      title={title}
      value={draft ?? value ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
      className="h-6 w-full min-w-[60px] rounded border border-[#e4c878] bg-white px-1 text-right text-[11px] tabular-nums outline-none focus:border-[#b88a00] focus:ring-1 focus:ring-[#b88a00]/30"
    />
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

type GroupKey = "info" | "mov" | "urbano" | "informado" | "canjes" | "necesidad" | "costos";

// Grupo de cada columna: el encabezado de arriba y los colores. Si el usuario mezcla columnas de distintos
// grupos, el encabezado de grupo se arma por tramos seguidos.
const GROUPS: Record<GroupKey, { label: string; head: string; sum: string; th: string; td: string }> = {
  info: { label: "", head: "bg-[#edf3f9] text-[#5a6a82]", sum: "bg-[#edf3f9] text-[#334b6b]", th: "", td: "" },
  mov: { label: "Movimientos", head: "bg-[#dceafe] text-[#1e4db7]", sum: "bg-[#e9f2ff] text-[#1e4db7]", th: "bg-[#eef5ff]", td: "bg-[#f6f9ff]" },
  urbano: { label: "Urbano", head: "bg-[#d9f1ee] text-[#0f5e57]", sum: "bg-[#e6f5f3] text-[#0f5e57]", th: "bg-[#e6f5f3]", td: "bg-[#eef8f7]" },
  informado: { label: "Stock informado", head: "bg-[#fef5d4] text-[#7a5b00]", sum: "bg-[#fef9e6] text-[#7a5b00]", th: "bg-[#fdf6de]", td: "bg-[#fffbec]" },
  canjes: { label: "Canjes", head: "bg-[#edf3f9] text-[#334b6b]", sum: "bg-[#f3f7fb] text-[#334b6b]", th: "", td: "" },
  necesidad: { label: "Necesidad de compra", head: "bg-[#ede8fa] text-[#4b3080]", sum: "bg-[#f5f2fe] text-[#4b3080]", th: "bg-[#f5f2fe]", td: "bg-[#f8f6fd]" },
  costos: { label: "Costos", head: "bg-[#d8f0e3] text-[#1a5c30]", sum: "bg-[#e8f5ee] text-[#1a5c30]", th: "bg-[#e8f5ee]", td: "bg-[#edf8f1]" },
};

type ConfigurableColumn = Exclude<StockColumn, (typeof STICKY_STOCK_COLUMNS)[number]>;

const COLUMN_META: Record<ConfigurableColumn, { group: GroupKey; width: number; sum?: boolean; title?: string }> = {
  type: { group: "info", width: 104 },
  category: { group: "info", width: 96 },
  totalOrder: { group: "mov", width: 72, sum: true },
  physicalIncome: { group: "mov", width: 72, sum: true },
  egress: { group: "mov", width: 72, sum: true },
  theoreticalStock: { group: "mov", width: 72, sum: true },
  realStock: { group: "mov", width: 72, sum: true },
  pendingDeliveries: { group: "mov", width: 72, sum: true },
  urbanoStock: { group: "urbano", width: 72, sum: true },
  urbanoDifference: { group: "urbano", width: 72, sum: true, title: "Stock Urbano menos stock real" },
  reportedStock: { group: "informado", width: 80, sum: true },
  webAvailable: { group: "informado", width: 72, sum: true },
  adjustment: { group: "informado", width: 72, sum: true },
  totalTransactions: { group: "canjes", width: 72, sum: true },
  firstIncomeDate: { group: "canjes", width: 80 },
  validity: { group: "canjes", width: 64 },
  transactionsPerDay: { group: "canjes", width: 64 },
  stockDays: { group: "necesidad", width: 64 },
  requiredStock: { group: "necesidad", width: 72, sum: true },
  surplusShortage: { group: "necesidad", width: 72, sum: true },
  surplusShortageByPackage: { group: "necesidad", width: 64, sum: true },
  packageSize: { group: "necesidad", width: 56 },
  finalPurchase: { group: "necesidad", width: 72, sum: true },
  costDgNoVat: { group: "costos", width: 80 },
  totalCost: { group: "costos", width: 80 },
  stockValue: { group: "costos", width: 88, sum: true },
  unitProfit: { group: "costos", width: 80 },
  salePrice: { group: "costos", width: 72 },
};

// Columnas fijas a la izquierda: código, código único, producto y proveedor.
const STICKY = [
  { key: "clientCode", width: 80, left: 0, mono: true },
  { key: "uniqueCode", width: 90, left: 80, mono: true },
  { key: "product", width: 260, left: 170, mono: false },
  { key: "supplier", width: 110, left: 430, mono: false },
] as const;
const STICKY_WIDTH = 540;

const columnLabel = (key: string) => STOCK_COLUMNS.find((column) => column.key === key)?.label ?? key;
const COLUMNS_KEY = (client: string) => `dg:stock:cols:${client.toLowerCase()}`;

// ─── Component ────────────────────────────────────────────────────────────────

export function StockWorkspace() {
  const [clients, setClients] = useState<string[]>([]);
  // Vacío hasta leer el último cliente elegido, para no cargar Santander de más al entrar.
  const [client, setClient] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  // Filas con las que se arma el orden y qué filas se ven. Editar el stock informado cambia `rows` pero no
  // esta copia, así la fila no salta de lugar; se actualiza al recargar o al cambiar el orden o un filtro.
  const [basis, setBasis] = useState<StockRow[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
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
  const [validity, setValidity] = useState<"" | "si" | "no">("");
  const [balance, setBalance] = useState<BalanceFilter>("");
  const [typeChoice, setTypeChoice] = useState<TypeFilter>("");
  const [savingType, setSavingType] = useState(false);
  const [notice, setNotice] = useState("");
  // Informados que quedaron solo en este navegador y difieren de los de la base.
  const [localEdits, setLocalEdits] = useState<Record<string, number>>({});
  const withType = usesCodeType(client);
  const amex = isAmexClient(client);
  const typeFilter: TypeFilter = withType ? typeChoice : "";

  // Columnas que eligió el usuario para este cliente (además de las fijas).
  const [columns, setColumns] = useState<ConfigurableColumn[]>([]);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [colSaveState, setColSaveState] = useState<"" | "saving" | "saved" | "error">("");
  const closeColPicker = useCallback(() => setColPickerOpen(false), []);
  const colPickerRef = useOutsideClick<HTMLDivElement>(closeColPicker, colPickerOpen);
  const columnsDirty = useRef(false);
  const draggedColumn = useRef<string | null>(null);
  const clientRef = useRef(client);
  useEffect(() => { clientRef.current = client; });
  const availableColumns = useMemo(
    () => (CONFIGURABLE_STOCK_COLUMNS as ConfigurableColumn[]).filter((key) => withType || key !== "type"),
    [withType],
  );

  useEffect(() => {
    if (!client) return;
    const allowed = new Set<string>(availableColumns);
    const clean = (list: string[]) => list.filter((key): key is ConfigurableColumn => allowed.has(key));
    let initial = defaultStockColumns(client, withType) as ConfigurableColumn[];
    try {
      const saved = localStorage.getItem(COLUMNS_KEY(client));
      if (saved) initial = clean(JSON.parse(saved) as string[]);
    } catch {}
    // Restore the column layout saved for this client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(initial);
    setColSaveState("");
    // Lo guardado para el usuario manda sobre lo de este navegador.
    const requested = client;
    fetch(`/api/columnas?view=${encodeURIComponent(`stock:${client}`)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { columns?: string[] | null } | null) => {
        if (data?.columns?.length && clientRef.current === requested) setColumns(clean(data.columns));
      })
      .catch(() => undefined);
  }, [client, withType, availableColumns]);

  async function saveColumns(list: string[] = columns, forClient = client) {
    setColSaveState("saving");
    try {
      const response = await fetch("/api/columnas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view: `stock:${forClient}`, columns: list }),
      });
      setColSaveState(response.ok ? "saved" : "error");
    } catch {
      setColSaveState("error");
    }
  }

  useEffect(() => {
    if (!client || columns.length === 0) return;
    try { localStorage.setItem(COLUMNS_KEY(client), JSON.stringify(columns)); } catch {}
    if (!columnsDirty.current) return;
    columnsDirty.current = false;
    const timer = setTimeout(() => void saveColumns(columns, client), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveColumns recibe todo por parámetro.
  }, [columns]);

  function changeColumns(update: (current: ConfigurableColumn[]) => ConfigurableColumn[]) {
    columnsDirty.current = true;
    setColumns(update);
  }
  const addColumn = (key: string) => changeColumns((current) => (current.includes(key as ConfigurableColumn) ? current : [...current, key as ConfigurableColumn]));
  const removeColumn = (key: string) => changeColumns((current) => current.filter((item) => item !== key));
  function moveColumnTo(key: string, target: string) {
    if (key === target) return;
    changeColumns((current) => {
      const from = current.indexOf(key as ConfigurableColumn);
      const to = current.indexOf(target as ConfigurableColumn);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, key as ConfigurableColumn);
      return next;
    });
  }
  function moveColumn(key: string, direction: -1 | 1) {
    changeColumns((current) => {
      const index = current.indexOf(key as ConfigurableColumn);
      if (index < 0) return current;
      const next = [...current];
      next.splice(index, 1);
      next.splice(Math.max(0, Math.min(current.length - 1, index + direction)), 0, key as ConfigurableColumn);
      return next;
    });
  }

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
    setFilters({});
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

        let saved: Record<string, number> = {};
        try {
          saved = JSON.parse(localStorage.getItem(STOCK_KEY(client)) || "{}") as Record<string, number>;
        } catch {}
        const current = new Map(data.rows.map((r) => [r.clientCode, r.reportedStock]));
        setLocalEdits(Object.fromEntries(Object.entries(saved).filter(([code, value]) => current.has(code) && current.get(code) !== value)));
        const loaded = data.rows.map((r) => ({ ...r, vigente: r.vigente ?? true }));
        setRows(loaded);
        setBasis(loaded);
        setStatus(data.message || "");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setRows([]);
        setBasis([]);
        setLocalEdits({});
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

  // Al cambiar el orden, un filtro o los meses se vuelve a ordenar con los valores actuales.
  function rearrange() {
    setBasis(rows);
  }

  // ── Edit reported stock ───────────────────────────────────────────────────

  async function saveReportedStock(values: { code: string; quantity: number | null }[]) {
    setNotice("");
    try {
      const response = await fetch("/api/local-db/stock/informado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, values }),
      });
      const data = (await response.json()) as { saved?: Record<string, SavedInformado>; message?: string };
      if (!response.ok || !data.saved) throw new Error(data.message || "No se pudo guardar el stock informado.");
      const saved = data.saved;
      setRows((current) =>
        current.map((row) => {
          const item = saved[row.clientCode.trim().toLowerCase()];
          if (!item) return row;
          return {
            ...row,
            reportedStock: resolveInformado(client, item, row.physicalIncome),
            reportedBy: { fixed: item.quantity !== null && !item.overIncome, user: item.updatedBy, at: item.updatedAt },
          };
        }),
      );
      const count = Object.keys(saved).length;
      setNotice(count === 1 ? `Stock informado de ${values[0].code} guardado.` : `${count} stocks informados guardados para todos.`);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar el stock informado.");
      return false;
    }
  }

  function discardLocalEdits() {
    try {
      localStorage.removeItem(STOCK_KEY(client));
    } catch {}
    setLocalEdits({});
  }

  async function shareLocalEdits() {
    const values = Object.entries(localEdits).map(([code, quantity]) => ({ code, quantity }));
    if (await saveReportedStock(values)) discardLocalEdits();
  }

  function informadoTitle(row: StockRow) {
    const by = row.reportedBy
      ? `Cambiado por ${row.reportedBy.user} el ${new Date(row.reportedBy.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}. `
      : "";
    if (!informadoByIncome(client)) return by || "Sin informar";
    return row.reportedBy?.fixed
      ? `${by}Número fijo: no sube con las entregas. Borralo para que vuelva al ingreso físico.`
      : `${by}Sube solo con cada ingreso físico.`;
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
  const filterKeys = useMemo(() => Object.entries(filters).filter(([, value]) => value.trim()), [filters]);

  const { activeGroups, inactiveGroups, activeRows, inactiveRows } = useMemo(() => {
    const currentById = new Map(rows.map((row) => [row.id, row]));
    const toLine = (row: StockRow): StockLine => ({ ...row, ...stockCalc(row, months) });
    // Qué filas se ven y en qué orden sale de `basis`; los valores que se muestran, de `rows`.
    const filteredBasis = basis.map(toLine).filter(
      (r) => matchesFilters(r, balance, typeFilter) && filterKeys.every(([key, value]) => matchesColumnFilter(r, key as StockColumn, value)),
    );
    const current = (lines: StockLine[]) => lines.map((line) => {
      const row = currentById.get(line.id);
      return row ? toLine(row) : line;
    });
    const bySupplier = (lines: StockLine[], prefix: string) =>
      grouped
        ? groupBySupplier(lines).map((group) => ({ label: [prefix, group.supplier || "Sin proveedor"].filter(Boolean).join(" · "), lines: group.lines }))
        : [{ label: prefix, lines }];
    const arrange = (lines: StockLine[]) => {
      const sorted = current(sortLines(lines, sort));
      // Amex: primero los códigos DG y al fondo los OFED, cada bloque con su encabezado.
      if (amex) {
        return [
          ...bySupplier(sorted.filter((line) => amexCodeGroup(line.clientCode) === "DG"), "DG"),
          ...bySupplier(sorted.filter((line) => amexCodeGroup(line.clientCode) === "OFED"), "OFED"),
        ].filter((group) => group.lines.length > 0);
      }
      return bySupplier(sorted, "");
    };
    const active = arrange(filteredBasis.filter((r) => r.vigente && validity !== "no"));
    const inactive = arrange(filteredBasis.filter((r) => !r.vigente && validity !== "si" && (r.theoreticalStock > 0 || r.realStock > 0)));
    return {
      activeGroups: active,
      inactiveGroups: inactive,
      activeRows: active.flatMap((group) => group.lines),
      inactiveRows: inactive.flatMap((group) => group.lines),
    };
  }, [rows, basis, filterKeys, months, validity, balance, typeFilter, sort, grouped, amex]);

  const totals = useMemo(
    () => ({
      vigentes: rows.filter((r) => r.vigente).length,
      noVigentesConStock: rows.filter(
        (r) => !r.vigente && (r.theoreticalStock > 0 || r.realStock > 0),
      ).length,
      realStock: rows.filter((r) => r.vigente).reduce((s, r) => s + r.realStock, 0),
      stockValue: rows.filter((r) => r.vigente).reduce((s, r) => s + r.stockValue, 0),
    }),
    [rows],
  );

  const visibleRows = [...activeRows, ...inactiveRows];
  const totalCols = STICKY.length + columns.length;
  const tableWidth = STICKY_WIDTH + columns.reduce((sum, key) => sum + COLUMN_META[key].width, 0);

  // Encabezado de grupos: tramos seguidos de columnas del mismo grupo.
  const groupRuns = useMemo(() => {
    const runs: { group: GroupKey; span: number }[] = [];
    for (const key of columns) {
      const group = COLUMN_META[key].group;
      const last = runs[runs.length - 1];
      if (last && last.group === group) last.span += 1;
      else runs.push({ group, span: 1 });
    }
    return runs;
  }, [columns]);

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
  // Totals row (sticky top-7 = below group row, h-6 = 24px fixed height)
  const sumBase = "sticky top-7 h-6 border-b border-[#c5d3e0] px-1.5 text-right text-[11px] font-black tabular-nums";
  // Column header cells (below group and totals rows)
  const colHdr = "sticky top-[52px] z-20 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 text-center align-top text-[11px] font-black text-[#334b6b]";
  // Sticky column header cells (also left-pinned)
  const colHdrSticky = "sticky top-[52px] z-40 border-b border-[#c5d3e0] bg-[#edf3f9] px-1.5 py-2 align-top text-[11px] font-black text-[#334b6b]";
  const controlClass = "h-8 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs font-semibold normal-case text-[#10233f] outline-none focus:border-[#0b5bbb]";
  // Body number cells
  const td = "border-b border-[#e8eef5] px-1.5 py-1.5 text-[11px] text-right tabular-nums";

  // ── Header pieces ─────────────────────────────────────────────────────────

  function sortButton(key: StockColumn) {
    const label = columnLabel(key);
    const direction = sort?.key === key ? sort.direction : null;
    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
    return (
      <button
        type="button"
        onClick={() => { setSort(nextSort(sort, key)); rearrange(); }}
        title={direction === "desc" ? "De mayor a menor" : direction === "asc" ? "De menor a mayor" : "Ordenar"}
        className={`inline-flex items-center gap-0.5 hover:text-[#0b5bbb] ${direction ? "text-[#0b5bbb]" : ""}`}
      >
        {label}
        <Icon size={10} className={`shrink-0 ${direction ? "" : "opacity-40"}`} />
      </button>
    );
  }

  // Filtro de cada columna: texto que contenga, o en números también >, <, >=, <= (por ejemplo "<0").
  function filterInput(key: StockColumn, numeric: boolean) {
    return (
      <div className="relative mt-1">
        <Search size={8} className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
        <input
          value={filters[key] ?? ""}
          onChange={(e) => { setFilters((current) => ({ ...current, [key]: e.target.value })); rearrange(); }}
          aria-label={`Filtrar ${columnLabel(key)}`}
          title={numeric ? "Filtrar: un número, o >, <, >=, <= (por ejemplo <0 o >=10)" : "Filtrar: lo que contenga"}
          className={`h-5 w-full rounded border bg-white py-0.5 pl-4 pr-1 text-[11px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb] ${filters[key]?.trim() ? "border-[#0b5bbb]" : "border-[#c5d3e0]"}`}
        />
      </div>
    );
  }

  // ── Row renderer ──────────────────────────────────────────────────────────

  function renderGroups(groups: { label: string; lines: StockLine[] }[], section: "active" | "inactive") {
    return groups.map((group) => (
      <Fragment key={group.label || "todos"}>
        {group.label && (
          <tr>
            <td colSpan={totalCols} className="border-y border-[#c8d6e5] bg-[#e4ecf5] py-1.5 text-[11px] font-black text-[#10233f]">
              <span className="sticky left-0 inline-block px-2">
                {group.label} · {group.lines.length} código{group.lines.length === 1 ? "" : "s"} · stock real{" "}
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

  function cell(row: StockLine, key: ConfigurableColumn) {
    const tint = GROUPS[COLUMN_META[key].group].td;
    switch (key) {
      case "type":
        return (
          <td key={key} className="border-b border-[#e8eef5] px-1 py-1">
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
        );
      case "category":
        return <td key={key} className={`${td} truncate text-left text-[#425979]`} title={row.category}>{row.category || "—"}</td>;
      case "theoreticalStock":
      case "realStock":
        return <td key={key} className={`${td} bg-[#edf3ff] font-bold text-[#10233f]`}>{fmt(row[key])}</td>;
      case "urbanoStock":
        return <td key={key} className={`${td} ${tint} font-bold text-[#0f5e57]`}>{row.urbanoStock === null ? "—" : fmt(row.urbanoStock)}</td>;
      case "urbanoDifference":
        return (
          <td key={key} className={`${td} ${tint} font-bold ${row.urbanoDifference === null || row.urbanoDifference === 0 ? "text-[#5a6a82]" : row.urbanoDifference < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}>
            {row.urbanoDifference === null ? "—" : fmt(row.urbanoDifference)}
          </td>
        );
      case "reportedStock":
        return (
          <td key={key} className={`border-b border-[#e8eef5] ${tint} px-1 py-1`}>
            <InformadoInput
              label={`Stock informado de ${row.clientCode}`}
              title={informadoTitle(row)}
              value={row.reportedStock}
              onSave={(quantity) => void saveReportedStock([{ code: row.clientCode, quantity }])}
            />
          </td>
        );
      case "webAvailable":
      case "adjustment":
        return <td key={key} className={`${td} ${tint}`}>{row[key] === null ? "—" : fmt(row[key])}</td>;
      case "firstIncomeDate":
        return <td key={key} className={`${td} text-center font-mono`}>{row.firstIncomeDate || "—"}</td>;
      case "transactionsPerDay":
      case "stockDays":
        return <td key={key} className={`${td} ${tint}`}>{row[key] > 0 ? fmt(row[key]) : "—"}</td>;
      case "surplusShortage":
      case "surplusShortageByPackage":
        return <td key={key} className={`${td} bg-[#f2eefa] font-bold ${row[key] < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}>{fmt(row[key])}</td>;
      case "finalPurchase":
        return <td key={key} className={`${td} bg-[#f2eefa] font-bold text-[#334b6b]`}>{fmt(row.finalPurchase)}</td>;
      case "costDgNoVat":
      case "totalCost":
      case "unitProfit":
      case "salePrice":
        return <td key={key} className={`${td} ${tint}`}>{money(row[key])}</td>;
      case "stockValue":
        return <td key={key} className={`${td} bg-[#dff0e6] font-bold`}>{money(row.stockValue)}</td>;
      default:
        return <td key={key} className={`${td} ${tint}`}>{fmt(row[key])}</td>;
    }
  }

  function renderRow(row: StockLine, section: "active" | "inactive") {
    const rowBg = section === "inactive"
      ? "bg-[#f9f8fb]"
      : row.hasStockData ? "bg-white" : "bg-[#fffcf0]";
    const stickyBg = section === "inactive"
      ? "bg-[#f3f0f9] bg-clip-padding"
      : row.hasStockData ? "bg-[#f8fafd] bg-clip-padding" : "bg-[#fffbee] bg-clip-padding";

    return (
      <tr key={row.id} className={rowBg}>
        {STICKY.map((column, index) => (
          <td
            key={column.key}
            style={{ left: column.left, width: column.width, minWidth: column.width, maxWidth: column.width }}
            className={`sticky z-30 border-b border-r border-[#e8eef5] px-1.5 py-1.5 text-[11px] ${column.mono ? "font-mono" : "font-medium text-[#334b6b]"} ${index === STICKY.length - 1 ? "border-r-[#c3d0df] shadow-[6px_0_8px_-5px_rgba(16,35,63,.12)]" : "border-r-[#d6e0ec]"} ${stickyBg}`}
            title={row[column.key]}
          >
            <div className="truncate">{row[column.key] || "—"}</div>
          </td>
        ))}
        {columns.map((key) => cell(row, key))}
      </tr>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageHeader title="Stock actual por cliente" />

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
            <input type="checkbox" checked={grouped} onChange={(e) => { setGrouped(e.target.checked); rearrange(); }} className="accent-[#0b5bbb]" />
            Agrupar por proveedor
          </label>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
            Vigencia
            <select value={validity} onChange={(e) => { setValidity(e.target.value as typeof validity); rearrange(); }} className={controlClass}>
              <option value="">Todos</option>
              <option value="si">Vigentes</option>
              <option value="no">No vigentes con stock</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
            Sobra/Falta
            <select value={balance} onChange={(e) => { setBalance(e.target.value as BalanceFilter); rearrange(); }} className={controlClass}>
              <option value="">Todos</option>
              <option value="falta">Negativo (falta)</option>
              <option value="sobra">Positivo (sobra)</option>
            </select>
          </label>
          {withType && (
            <>
              <label className="flex items-center gap-2 text-[11px] font-black uppercase text-[#5a6a82]">
                Tipo
                <select value={typeChoice} onChange={(e) => { setTypeChoice(e.target.value as TypeFilter); rearrange(); }} className={controlClass}>
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
          {filterKeys.length > 0 && (
            <button
              type="button"
              onClick={() => { setFilters({}); rearrange(); }}
              className="h-8 rounded-lg px-2 text-xs font-black text-[#0b5bbb] underline"
            >
              Limpiar filtros ({filterKeys.length})
            </button>
          )}
          <div className="relative" ref={colPickerRef}>
            <button
              type="button"
              onClick={() => setColPickerOpen((open) => !open)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs font-black text-[#334b6b] hover:bg-[#f2f6fb]"
              title="Elegí qué columnas ver y en qué orden (también podés arrastrar los encabezados)"
            >
              <Columns3 size={13} /> Columnas
              <span className="rounded-full bg-[#0b5bbb] px-1.5 text-[11px] font-black text-white">{columns.length}</span>
            </button>
            {colPickerOpen && (
              <ColPicker
                visibleCols={columns}
                allKeys={availableColumns}
                labelOf={columnLabel}
                onAdd={addColumn}
                onRemove={removeColumn}
                onMove={moveColumn}
                onMoveTo={moveColumnTo}
                onSave={() => void saveColumns()}
                saveState={colSaveState}
                onClose={closeColPicker}
              />
            )}
          </div>
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
              onChange={(e) => { setPlanningMonths(e.target.value); rearrange(); }}
              className="h-8 w-20 rounded-lg border border-[#dbe4ef] bg-white px-2 text-right text-xs text-[#10233f] outline-none focus:border-[#0b5bbb]"
            />
          </label>
          </div>
        </div>

        {Object.keys(localEdits).length > 0 && (
          <div role="status" className="flex flex-wrap items-center gap-3 border-b border-[#e4c878] bg-[#fffbec] px-5 py-2 text-[11px] font-bold text-[#7a5b00]">
            <span>
              Tenés {Object.keys(localEdits).length === 1 ? "un stock informado editado" : `${Object.keys(localEdits).length} stocks informados editados`} solo en
              este navegador: {Object.entries(localEdits).slice(0, 5).map(([code, value]) => `${code} = ${fmt(value)}`).join(" · ")}
              {Object.keys(localEdits).length > 5 ? "…" : ""}
            </span>
            <button type="button" onClick={() => void shareLocalEdits()} className="rounded-lg border border-[#b88a00] bg-white px-3 py-1 font-black hover:bg-[#fff4cf]">
              Guardarlos para todos
            </button>
            <button type="button" onClick={discardLocalEdits} className="rounded-lg px-2 py-1 font-black underline">
              Descartar
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-2 text-[11px] font-bold text-[#334b6b]">{notice}</div>
        )}
        <div className="max-h-[calc(100vh-200px)] min-h-[300px] overflow-auto overscroll-contain bg-white">
          <table
            style={{ zoom: zoom / 100, minWidth: tableWidth, width: tableWidth }}
            className="table-fixed border-separate border-spacing-0 text-left text-[11px]"
          >
            <thead>
              {/* Row 1 – group headers */}
              <tr>
                {STICKY.map((column) => (
                  <th key={column.key} style={{ left: column.left, width: column.width, minWidth: column.width }} className={`${grpBase} sticky z-50 bg-[#e4ecf5]`} />
                ))}
                {groupRuns.map((run, index) => (
                  <th key={`${run.group}-${index}`} colSpan={run.span} className={`${grpBase} z-20 ${GROUPS[run.group].head}`}>
                    {GROUPS[run.group].label}
                  </th>
                ))}
              </tr>

              {/* Row 2 – totals of the visible rows */}
              <tr>
                {STICKY.map((column, index) => (
                  <td key={column.key} style={{ left: column.left }} className={`${sumBase} z-50 bg-[#e4ecf5] ${index === 2 ? "text-[#334b6b]" : ""}`}>
                    {index === 2 ? "Total de lo que se ve" : ""}
                  </td>
                ))}
                {columns.map((key) => {
                  const meta = COLUMN_META[key];
                  if (!meta.sum) return <td key={key} className={`${sumBase} z-20 ${GROUPS[meta.group].sum}`} />;
                  const total = sumColumn(visibleRows, key);
                  return (
                    <td key={key} title={`Suma de ${columnLabel(key)} de las filas que se ven`} className={`${sumBase} z-20 ${GROUPS[meta.group].sum}`}>
                      {total === null ? "—" : fmt(Math.round(total))}
                    </td>
                  );
                })}
              </tr>

              {/* Row 3 – column headers, with a filter in each one */}
              <tr>
                {STICKY.map((column, index) => (
                  <th
                    key={column.key}
                    style={{ left: column.left, width: column.width, minWidth: column.width }}
                    className={`${colHdrSticky} text-left ${index === STICKY.length - 1 ? "shadow-[6px_0_8px_-5px_rgba(16,35,63,.18)]" : ""}`}
                  >
                    <div className="pl-0.5">{sortButton(column.key)}</div>
                    {filterInput(column.key, false)}
                  </th>
                ))}
                {columns.map((key) => {
                  const meta = COLUMN_META[key];
                  return (
                    <th
                      key={key}
                      draggable
                      onDragStart={() => { draggedColumn.current = key; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (draggedColumn.current) moveColumnTo(draggedColumn.current, key); draggedColumn.current = null; }}
                      style={{ width: meta.width, minWidth: meta.width }}
                      title={meta.title ?? "Arrastrá el encabezado para mover la columna"}
                      className={`${colHdr} cursor-grab ${GROUPS[meta.group].th}`}
                    >
                      <div>{sortButton(key)}</div>
                      {filterInput(key, !["type", "category", "firstIncomeDate"].includes(key))}
                    </th>
                  );
                })}
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
        </div>
      </section>
    </>
  );
}
