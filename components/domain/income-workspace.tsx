"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Database,
  PackageCheck,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type TangoIncomeRow = {
  id: string;
  rowIndex: number;
  client: string;
  operation: string;
  orderDate: string;
  orderYear: number | null;
  orderMonth: number | null;
  orderNumber: string;
  clientCode: string;
  uniqueCode: string;
  quantity: number;
  source: string;
  deliveryDate: string;
  delivered: number;
  pending: number;
  comments: string;
  status: "complete" | "pending" | "without-order-date";
};

type TangoIncomeSummary = {
  exists: boolean;
  filePath: string;
  lastUpdated: string | null;
  totalRows: number;
  clients: number;
  operations: number;
  totalQuantity: number;
  totalDelivered: number;
  pendingQuantity: number;
  pendingRows: number;
};

type TangoIncomeOptions = {
  clients: string[];
  operations: string[];
  years: number[];
};

type TangoIncomeResponse = {
  summary: TangoIncomeSummary;
  options: TangoIncomeOptions;
  rows: TangoIncomeRow[];
  totalFiltered: number;
  viewSummary: TangoIncomeViewSummary;
};

type TangoIncomeViewSummary = {
  totalRows: number;
  totalQuantity: number;
  totalDelivered: number;
  pendingQuantity: number;
  pendingRows: number;
  unmatchedRows: number;
};

const defaultViewSummary: TangoIncomeViewSummary = {
  totalRows: 0,
  totalQuantity: 0,
  totalDelivered: 0,
  pendingQuantity: 0,
  pendingRows: 0,
  unmatchedRows: 0,
};

const defaultSummary: TangoIncomeSummary = {
  exists: false,
  filePath: "",
  lastUpdated: null,
  totalRows: 0,
  clients: 0,
  operations: 0,
  totalQuantity: 0,
  totalDelivered: 0,
  pendingQuantity: 0,
  pendingRows: 0,
};

const defaultOptions: TangoIncomeOptions = {
  clients: [],
  operations: [],
  years: [],
};

const months = [
  { label: "Enero", value: 1 },
  { label: "Febrero", value: 2 },
  { label: "Marzo", value: 3 },
  { label: "Abril", value: 4 },
  { label: "Mayo", value: 5 },
  { label: "Junio", value: 6 },
  { label: "Julio", value: 7 },
  { label: "Agosto", value: 8 },
  { label: "Septiembre", value: 9 },
  { label: "Octubre", value: 10 },
  { label: "Noviembre", value: 11 },
  { label: "Diciembre", value: 12 },
];

const numberFormatter = new Intl.NumberFormat("es-AR");
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatLastUpdated(value: string | null) {
  if (!value) return "Sin sincronizar";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: TangoIncomeRow["status"]) {
  if (status === "pending") return "Pendiente";
  if (status === "without-order-date") return "Sin fecha pedido";
  return "Completo";
}

function statusClass(status: TangoIncomeRow["status"]) {
  if (status === "pending") {
    return "bg-[#fff0d9] text-[#985b00] ring-[#f4c16d]";
  }
  if (status === "without-order-date") {
    return "bg-[#eef3fb] text-[#52647d] ring-[#d8e3f0]";
  }
  return "bg-[#e7f7eb] text-[#23783a] ring-[#c9ebd1]";
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-[10px] font-black uppercase text-[#62728a]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f] outline-none transition focus:border-[#0b5bbb] focus:ring-3 focus:ring-[#e5eef9]"
      >
        {children}
      </select>
    </label>
  );
}

function KpiCard({
  icon,
  label,
  value,
  meta,
  tone = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta: string;
  tone?: "blue" | "green" | "amber";
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#0b5bbb]",
    green: "bg-[#e7f7eb] text-[#23783a]",
    amber: "bg-[#fff0d9] text-[#985b00]",
  };

  return (
    <div className="card flex items-center gap-4 p-5">
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#8a9584]">
          {label}
        </div>
        <div className="mt-1 text-2xl font-black tracking-[-.04em] text-[#10233f]">
          {value}
        </div>
        <div className="mt-1 text-[11px] font-bold text-[#8a9584]">{meta}</div>
      </div>
    </div>
  );
}

function selectedSummary<T extends string | number>(
  selected: T[],
  options: { label: string; value: T }[],
  emptyLabel: string,
) {
  if (selected.length === 0) return emptyLabel;
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? "1";
  }
  return `${selected.length} seleccionados`;
}

function MultiSelectDropdown<T extends string | number>({
  label,
  helper,
  options,
  selected,
  onToggle,
  onClear,
  onSelectAll,
  emptyLabel = "Todos",
}: {
  label: string;
  helper?: string;
  options: { label: string; value: T }[];
  selected: T[];
  onToggle: (value: T) => void;
  onClear: () => void;
  onSelectAll?: () => void;
  emptyLabel?: string;
}) {
  return (
    <details className="group relative">
      <summary className="list-none text-[10px] font-black uppercase text-[#62728a]">
        {label}
        <div className="mt-1 flex h-10 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f] outline-none transition group-open:border-[#0b5bbb] group-open:ring-3 group-open:ring-[#e5eef9]">
          <span className="truncate">
            {selectedSummary(selected, options, emptyLabel)}
          </span>
          <ChevronDown
            size={15}
            className="shrink-0 text-[#62728a] transition group-open:rotate-180"
          />
        </div>
        {helper ? (
          <div className="mt-1 text-[10px] font-bold normal-case text-[#8a9584]">
            {helper}
          </div>
        ) : null}
      </summary>
      <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full min-w-56 overflow-hidden rounded-2xl border border-[#dbe4ef] bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#dbe4ef] bg-[#f8fafd] px-3 py-2">
          {onSelectAll ? (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[10px] font-black uppercase text-[#0b5bbb]"
            >
              Todos
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-black uppercase text-[#0b5bbb]"
          >
            Limpiar
          </button>
        </div>
        <div className="max-h-64 overflow-auto p-2">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onToggle(option.value)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                  isSelected
                    ? "bg-[#eef5ff] text-[#0b5bbb]"
                    : "text-[#334b6b] hover:bg-[#f4f7fb]"
                }`}
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    isSelected
                      ? "border-[#0b5bbb] bg-[#0b5bbb] text-white"
                      : "border-[#b8c8d8] bg-white"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export function IncomeWorkspace() {
  const [summary, setSummary] = useState<TangoIncomeSummary>(defaultSummary);
  const [options, setOptions] = useState<TangoIncomeOptions>(defaultOptions);
  const [rows, setRows] = useState<TangoIncomeRow[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [viewSummary, setViewSummary] =
    useState<TangoIncomeViewSummary>(defaultViewSummary);
  const [operationFilter, setOperationFilter] = useState("");
  const [selectedYears, setSelectedYears] = useState<number[]>([currentYear]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([
    currentMonth,
  ]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    "Vista de solo lectura desde la consulta Tango. Las correcciones se hacen en Tango Gestión.",
  );

  const loadRows = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      selectedClients.forEach((client) => params.append("client", client));
      if (operationFilter) params.set("operation", operationFilter);
      selectedYears.forEach((year) => params.append("year", String(year)));
      selectedMonths.forEach((month) => params.append("month", String(month)));
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (selectedClients.length === 0) params.set("metaOnly", "1");
      params.set("limit", "900");

      const response = await fetch(`/api/local-db/ingresos?${params}`, {
        signal,
      });
      const data = (await response.json()) as TangoIncomeResponse;
      if (!response.ok) throw new Error("No pude leer la consulta de Tango.");
      setSummary(data.summary);
      setOptions(data.options);
      setRows(data.rows);
      setTotalFiltered(data.totalFiltered);
      setViewSummary(
        selectedClients.length === 0 ? defaultViewSummary : data.viewSummary,
      );
      setMessage(
        data.summary.exists
          ? selectedClients.length === 0
            ? "Elegí uno o varios clientes para consultar los ingresos de Tango."
            : "Datos leídos desde Consulta ingresos Tango.xlsx. Esta pantalla no modifica Tango."
          : "No encontré Consulta ingresos Tango.xlsx en la carpeta de bases locales.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "No pude cargar.");
    } finally {
      setLoading(false);
    }
  }, [
    selectedClients,
    operationFilter,
    selectedYears,
    selectedMonths,
    statusFilter,
    search,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void loadRows(controller.signal);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadRows]);

  const limitedNotice = useMemo(() => {
    if (selectedClients.length === 0) {
      return "Seleccioná al menos un cliente para cargar la consulta.";
    }
    if (totalFiltered <= rows.length) return "";
    return `Mostrando ${formatNumber(rows.length)} de ${formatNumber(
      totalFiltered,
    )} filas filtradas. Refiná filtros para ver menos filas.`;
  }, [rows.length, selectedClients.length, totalFiltered]);

  function toggleClient(client: string) {
    setSelectedClients((current) =>
      current.includes(client)
        ? current.filter((item) => item !== client)
        : [...current, client],
    );
  }

  function selectAllClients() {
    setSelectedClients(options.clients);
  }

  function clearClients() {
    setSelectedClients([]);
  }

  function toggleYear(year: number) {
    setSelectedYears((current) =>
      current.includes(year)
        ? current.filter((item) => item !== year)
        : [...current, year],
    );
  }

  function toggleMonth(month: number) {
    setSelectedMonths((current) =>
      current.includes(month)
        ? current.filter((item) => item !== month)
        : [...current, month],
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Ingresos"
        title="Ingresos Tango"
        description="Vista de control sobre la consulta de Tango Gestión. La web no carga ni modifica ingresos: muestra lo registrado en Tango y lo cruza con nuestros códigos cliente."
      />

      <section className="mb-4 grid gap-4 xl:grid-cols-4">
        <KpiCard
          icon={<Users size={20} />}
          label="Clientes elegidos"
          value={formatNumber(selectedClients.length)}
          meta={`${formatNumber(options.clients.length)} disponibles en Tango`}
        />
        <KpiCard
          icon={<Database size={20} />}
          label="Filas consultadas"
          value={formatNumber(viewSummary.totalRows)}
          meta={`${formatNumber(summary.totalRows)} filas en la consulta`}
        />
        <KpiCard
          icon={<PackageCheck size={20} />}
          label="Unidades pendientes"
          value={formatNumber(viewSummary.pendingQuantity)}
          meta={`${formatNumber(viewSummary.pendingRows)} filas con saldo`}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="A revisar"
          value={formatNumber(
            viewSummary.pendingRows + viewSummary.unmatchedRows,
          )}
          meta={`${formatNumber(
            viewSummary.pendingRows,
          )} pendientes · ${formatNumber(viewSummary.unmatchedRows)} sin match`}
          tone="amber"
        />
      </section>

      <section className="card mb-4 overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] bg-white px-5 py-4">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              Sincronización Tango
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] font-bold text-[#62728a]">
              <span className="inline-flex items-center gap-1">
                <Clock3 size={13} />
                Última lectura: {formatLastUpdated(summary.lastUpdated)}
              </span>
              <span className="truncate">
                Fuente: {summary.filePath || "Consulta ingresos Tango.xlsx"}
              </span>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => void loadRows()}
            disabled={loading}
            className="h-10"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Actualizando..." : "Actualizar vista"}
          </Button>
        </div>
        <div className="border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[11px] font-bold text-[#62728a]">
          {message}
        </div>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_.9fr_.9fr_.9fr]">
          <MultiSelectDropdown
            label="Clientes a consultar"
            helper="Elegí uno o varios. Sin cliente no se carga la tabla."
            options={options.clients.map((client) => ({
              label: client,
              value: client,
            }))}
            selected={selectedClients}
            onToggle={toggleClient}
            onClear={clearClients}
            onSelectAll={selectAllClients}
            emptyLabel="Seleccionar clientes"
          />
          <SelectField
            label="Operación Tango"
            value={operationFilter}
            onChange={setOperationFilter}
          >
            <option value="">Todas</option>
            {options.operations.map((operation) => (
              <option key={operation} value={operation}>
                {operation}
              </option>
            ))}
          </SelectField>
          <MultiSelectDropdown
            label="Año pedido"
            helper="Arranca en el año actual."
            options={options.years.map((year) => ({
              label: String(year),
              value: year,
            }))}
            selected={selectedYears}
            onToggle={toggleYear}
            onClear={() => setSelectedYears([])}
          />
          <MultiSelectDropdown
            label="Mes pedido"
            helper="Arranca en el mes actual."
            options={months}
            selected={selectedMonths}
            onToggle={toggleMonth}
            onClear={() => setSelectedMonths([])}
          />
          <SelectField label="Estado" value={statusFilter} onChange={setStatusFilter}>
            <option value="">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="complete">Completos</option>
            <option value="without-order-date">Sin fecha pedido</option>
          </SelectField>
        </div>
        <div className="grid gap-3 px-5 pb-4 md:grid-cols-[.8fr_1.2fr]">
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Búsqueda
            <div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-[#dbe4ef] bg-white px-3 focus-within:border-[#0b5bbb] focus-within:ring-3 focus-within:ring-[#e5eef9]">
              <Search size={15} className="text-[#8a9bb0]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="OC, código, origen, comentario..."
                className="h-full min-w-0 flex-1 bg-transparent text-xs normal-case text-[#10233f] outline-none"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-4">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              Consulta1 · ingresos visualizados
            </div>
            <div className="mt-1 text-[10px] font-bold text-[#62728a]">
              {limitedNotice ||
                `Mostrando ${formatNumber(rows.length)} filas de ${formatNumber(
                  totalFiltered,
                )} filtradas.`}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#eef5ff] px-3 py-2 text-[10px] font-black uppercase tracking-[.1em] text-[#0b5bbb]">
            <CheckCircle2 size={14} />
            Solo lectura
          </div>
        </div>
        <div className="max-h-[calc(100vh-430px)] min-h-[360px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1420px] table-fixed border-separate border-spacing-0 text-left text-[11px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#eaf1df] text-[10px] font-black uppercase text-[#34452f]">
                <th className="w-28 px-3 py-3">Estado</th>
                <th className="w-28 px-3 py-3">Cliente</th>
                <th className="w-44 px-3 py-3">Operación</th>
                <th className="w-24 px-3 py-3 text-center">Pedido</th>
                <th className="w-36 px-3 py-3">Orden compra</th>
                <th className="w-32 px-3 py-3">Código cliente</th>
                <th className="w-32 px-3 py-3">Código único DG</th>
                <th className="w-24 px-3 py-3 text-right">Cantidad</th>
                <th className="w-24 px-3 py-3 text-right">Entregado</th>
                <th className="w-24 px-3 py-3 text-right">Pendiente</th>
                <th className="w-40 px-3 py-3">Origen pasaje</th>
                <th className="w-24 px-3 py-3 text-center">Entrega</th>
                <th className="w-64 px-3 py-3">Comentarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e8f1]">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.pending > 0
                      ? "bg-[#fffaf0] text-[#6e4a0a]"
                      : "text-[#334b6b]"
                  }
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase ring-1 ${statusClass(
                        row.status,
                      )}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-black uppercase text-[#10233f]">
                    {row.client || "-"}
                  </td>
                  <td className="truncate px-3 py-2" title={row.operation}>
                    {row.operation || "-"}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {row.orderDate || "-"}
                  </td>
                  <td className="truncate px-3 py-2" title={row.orderNumber}>
                    {row.orderNumber || "-"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[#10233f]">
                    {row.clientCode || "-"}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {row.uniqueCode || (
                      <span className="text-[#b7433f]">Sin match</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(row.quantity)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(row.delivered)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-black tabular-nums ${
                      row.pending > 0 ? "text-[#b76b00]" : "text-[#23783a]"
                    }`}
                  >
                    {formatNumber(row.pending)}
                  </td>
                  <td className="truncate px-3 py-2" title={row.source}>
                    {row.source || "-"}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {row.deliveryDate || "-"}
                  </td>
                  <td className="truncate px-3 py-2" title={row.comments}>
                    {row.comments || "-"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-5 py-12 text-center text-sm font-bold text-[#62728a]"
                  >
                    {selectedClients.length === 0
                      ? "Seleccioná uno o varios clientes para visualizar ingresos."
                      : "No hay ingresos para los filtros seleccionados."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] font-bold text-[#62728a]">
          Tango sigue siendo la fuente de verdad. Si una fila está mal, se corrige
          en Tango y luego se actualiza esta consulta.
        </div>
      </section>
    </>
  );
}
