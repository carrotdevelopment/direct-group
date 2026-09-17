"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  PackageCheck,
  PlusCircle,
  RefreshCw,
  Search,
  Users,
  X,
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
  pendingTangoEntry: boolean;
};

const manualOperations = ["DEVOLUCION", "PASAJE", "AJUSTE NO VALORIZADO", "AJUSTE VALORIZADO"] as const;

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
  origins?: string[];
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

type TangoSyncJob = {
  id: string;
  from: string;
  to: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  rowCount: number;
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
  attempts: number;
};

const activeSyncStatuses = new Set(["pending", "running"]);

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

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function syncJobLabel(job: TangoSyncJob | null) {
  if (!job) return "";
  if (job.status === "pending") return "En cola...";
  if (job.status === "running") {
    return `Importando... ${formatNumber(job.rowCount)} filas recibidas`;
  }
  if (job.status === "completed") return job.message || "Importación completada.";
  if (job.status === "failed") return job.message || "La importación falló.";
  return job.message || "Importación cancelada.";
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function handle(event: MouseEvent) {
      const el = detailsRef.current;
      if (el?.open && !el.contains(event.target as Node)) el.open = false;
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <details ref={detailsRef} className="group relative">
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFrom, setImportFrom] = useState(() =>
    toISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [importTo, setImportTo] = useState(() => toISODate(new Date()));
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [syncJob, setSyncJob] = useState<TangoSyncJob | null>(null);
  const lastCompletedJobId = useRef<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    operation: "DEVOLUCION" as (typeof manualOperations)[number],
    client: "",
    clientCode: "",
    quantity: "",
    deliveryDate: toISODate(new Date()),
    transferOrigin: "",
    comments: "",
  });
  const [manualError, setManualError] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [clientCodeMappings, setClientCodeMappings] = useState<
    { client: string; clientCode: string; active: boolean }[]
  >([]);

  useEffect(() => {
    fetch("/api/lookups?kind=client-codes")
      .then((response) => response.json() as Promise<{ mappings?: typeof clientCodeMappings }>)
      .then((data) => setClientCodeMappings(data.mappings ?? []))
      .catch(() => setClientCodeMappings([]));
  }, []);

  const manualClientOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clientCodeMappings.filter((m) => m.active).map((m) => m.client),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [clientCodeMappings],
  );

  const manualCodeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clientCodeMappings
            .filter((m) => m.active && m.client === manualForm.client)
            .map((m) => m.clientCode),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [clientCodeMappings, manualForm.client],
  );

  // Unión de los clientes que ya trajeron filas de Tango con los clientes
  // reales de Códigos cliente: sin esto, mientras tango_ingresos esté vacío
  // (nada sincronizado todavía) el selector queda sin opciones para elegir.
  const queryableClients = useMemo(
    () => Array.from(new Set([...options.clients, ...manualClientOptions])).sort((a, b) => a.localeCompare(b, "es")),
    [options.clients, manualClientOptions],
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

  const checkSyncStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/tango-sync");
      if (!response.ok) return;
      const data = (await response.json()) as { job: TangoSyncJob | null };
      setSyncJob(data.job);
      if (
        data.job?.status === "completed" &&
        data.job.id !== lastCompletedJobId.current
      ) {
        lastCompletedJobId.current = data.job.id;
        void loadRows();
      }
    } catch {
      // Silencioso: es solo un chequeo periódico de estado.
    }
  }, [loadRows]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void checkSyncStatus(), 0);
    return () => window.clearTimeout(timeout);
  }, [checkSyncStatus]);

  useEffect(() => {
    if (!syncJob || !activeSyncStatuses.has(syncJob.status)) return;
    const timeout = window.setTimeout(() => void checkSyncStatus(), 3000);
    return () => window.clearTimeout(timeout);
  }, [syncJob, checkSyncStatus]);

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError("");
    if (!importFrom || !importTo) {
      setImportError("Elegí las dos fechas.");
      return;
    }
    if (importFrom > importTo) {
      setImportError("La fecha Desde no puede ser posterior a Hasta.");
      return;
    }
    setImportSubmitting(true);
    try {
      const response = await fetch("/api/tango-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: importFrom, to: importTo }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo pedir la importación.");
      setSyncJob(data.job);
      setImportModalOpen(false);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "No se pudo pedir la importación.",
      );
    } finally {
      setImportSubmitting(false);
    }
  }

  async function cancelImport() {
    if (!syncJob) return;
    try {
      await fetch(`/api/tango-sync?id=${syncJob.id}`, { method: "DELETE" });
    } finally {
      void checkSyncStatus();
    }
  }

  async function submitManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualError("");
    const quantity = Number(manualForm.quantity);
    if (!manualForm.client.trim() || !manualForm.clientCode.trim()) {
      setManualError("Completá cliente y código cliente.");
      return;
    }
    if (!manualClientOptions.includes(manualForm.client)) {
      setManualError("Elegí un cliente válido de la lista.");
      return;
    }
    if (!manualCodeOptions.includes(manualForm.clientCode)) {
      setManualError("Elegí un código cliente válido y activo para ese cliente.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError("La cantidad tiene que ser un número mayor a cero.");
      return;
    }
    if (!manualForm.deliveryDate) {
      setManualError("Elegí una fecha.");
      return;
    }
    if (manualForm.operation === "PASAJE" && !manualForm.transferOrigin.trim()) {
      setManualError("Completá el origen del pasaje.");
      return;
    }
    setManualSubmitting(true);
    try {
      const response = await fetch("/api/local-db/ingresos/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: manualForm.operation,
          client: manualForm.client.trim(),
          clientCode: manualForm.clientCode.trim(),
          quantity,
          deliveryDate: manualForm.deliveryDate,
          transferOrigin: manualForm.transferOrigin.trim() || undefined,
          comments: manualForm.comments.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo registrar el movimiento.");
      setManualModalOpen(false);
      setManualForm({
        operation: "DEVOLUCION", client: "", clientCode: "", quantity: "",
        deliveryDate: toISODate(new Date()), transferOrigin: "", comments: "",
      });
      void loadRows();
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "No se pudo registrar el movimiento.");
    } finally {
      setManualSubmitting(false);
    }
  }

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
    setSelectedClients(queryableClients);
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
          meta={`${formatNumber(queryableClients.length)} disponibles en Tango`}
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
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadRows()}
              disabled={loading}
              className="h-10"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Actualizando..." : "Actualizar vista"}
            </Button>
            {syncJob && activeSyncStatuses.has(syncJob.status) ? (
              <Button variant="secondary" onClick={() => void cancelImport()} className="h-10">
                <X size={15} />
                Cancelar importación
              </Button>
            ) : (
              <Button onClick={() => setImportModalOpen(true)} className="h-10">
                <Download size={15} />
                Importar ingresos
              </Button>
            )}
            <Button variant="secondary" onClick={() => setManualModalOpen(true)} className="h-10">
              <PlusCircle size={15} />
              Registrar movimiento
            </Button>
          </div>
        </div>
        <div className="border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[11px] font-bold text-[#62728a]">
          {syncJob ? syncJobLabel(syncJob) : message}
        </div>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_.9fr_.9fr_.9fr]">
          <MultiSelectDropdown
            label="Clientes a consultar"
            helper="Elegí uno o varios. Sin cliente no se carga la tabla."
            options={queryableClients.map((client) => ({
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
                    {row.pendingTangoEntry ? (
                      <span
                        title="Cargado desde la web, todavía falta cargarlo en Tango"
                        className="ml-1 inline-flex rounded-full bg-[#eef3fb] px-2 py-1 text-[9px] font-black uppercase text-[#52647d] ring-1 ring-[#d8e3f0]"
                      >
                        Pendiente Tango
                      </span>
                    ) : null}
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

      {importModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            className="absolute inset-0"
            aria-label="Cerrar"
            onClick={() => setImportModalOpen(false)}
          />
          <form
            onSubmit={submitImport}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setImportModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Ingresos Tango</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              Importar ingresos
            </h2>
            <p className="mt-2 text-xs font-bold text-[#62728a]">
              Elegí el período a traer desde Tango. La importación corre en
              segundo plano y esta pantalla se actualiza sola cuando termina.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Desde
                <input
                  type="date"
                  value={importFrom}
                  onChange={(event) => setImportFrom(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Hasta
                <input
                  type="date"
                  value={importTo}
                  onChange={(event) => setImportTo(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                />
              </label>
            </div>
            {importError && (
              <div className="mt-4 rounded-xl bg-[#fce9e8] px-2 py-2 text-xs font-bold text-[#a43d39]">
                {importError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={importSubmitting}>
                {importSubmitting ? "Pidiendo..." : "Importar"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {manualModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            className="absolute inset-0"
            aria-label="Cerrar"
            onClick={() => setManualModalOpen(false)}
          />
          <form
            onSubmit={submitManual}
            className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setManualModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Ingresos Tango</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              Registrar movimiento
            </h2>
            <p className="mt-2 text-xs font-bold text-[#62728a]">
              Devoluciones, ajustes y pasajes que todavía no están cargados en
              Tango. Quedan marcados como &quot;Pendiente Tango&quot; hasta que
              alguien los carga también ahí.
            </p>
            <div className="mt-6 grid gap-4">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Operación
                <select
                  value={manualForm.operation}
                  onChange={(event) =>
                    setManualForm({
                      ...manualForm,
                      operation: event.target.value as (typeof manualOperations)[number],
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3]"
                >
                  {manualOperations.map((operation) => (
                    <option key={operation} value={operation}>
                      {operation}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-[11px] font-extrabold text-[#334b6b]">
                  Cliente
                  <select
                    value={manualForm.client}
                    onChange={(event) =>
                      setManualForm({ ...manualForm, client: event.target.value, clientCode: "" })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3]"
                  >
                    <option value="">Seleccionar cliente</option>
                    {manualClientOptions.map((client) => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] font-extrabold text-[#334b6b]">
                  Código cliente
                  <select
                    value={manualForm.clientCode}
                    onChange={(event) => setManualForm({ ...manualForm, clientCode: event.target.value })}
                    disabled={!manualForm.client}
                    className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3] disabled:bg-[#f8fafd] disabled:text-[#9aa3ad]"
                  >
                    <option value="">
                      {manualForm.client ? "Seleccionar código" : "Elegí un cliente primero"}
                    </option>
                    {manualCodeOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-[11px] font-extrabold text-[#334b6b]">
                  Cantidad
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={manualForm.quantity}
                    onChange={(event) => setManualForm({ ...manualForm, quantity: event.target.value })}
                    className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                  />
                </label>
                <label className="text-[11px] font-extrabold text-[#334b6b]">
                  Fecha
                  <input
                    type="date"
                    value={manualForm.deliveryDate}
                    onChange={(event) => setManualForm({ ...manualForm, deliveryDate: event.target.value })}
                    className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                  />
                </label>
              </div>
              {manualForm.operation === "PASAJE" && (
                <label className="text-[11px] font-extrabold text-[#334b6b]">
                  Origen del pasaje *
                  <input
                    value={manualForm.transferOrigin}
                    onChange={(event) => setManualForm({ ...manualForm, transferOrigin: event.target.value })}
                    list="manual-transfer-origin-options"
                    placeholder="Cliente que pasa el producto"
                    className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                  />
                  <datalist id="manual-transfer-origin-options">
                    {(options.origins ?? []).map((origin) => (
                      <option key={origin} value={origin} />
                    ))}
                    {manualClientOptions.map((client) => (
                      <option key={client} value={client} />
                    ))}
                  </datalist>
                </label>
              )}
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Comentarios
                <textarea
                  value={manualForm.comments}
                  onChange={(event) => setManualForm({ ...manualForm, comments: event.target.value })}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-[#dbe4ef] px-3 py-2 text-xs normal-case outline-none focus:border-[#7da4d3]"
                />
              </label>
            </div>
            {manualError && (
              <div className="mt-4 rounded-xl bg-[#fce9e8] px-2 py-2 text-xs font-bold text-[#a43d39]">
                {manualError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setManualModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={manualSubmitting}>
                {manualSubmitting ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
