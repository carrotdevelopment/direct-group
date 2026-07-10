"use client";

import {
  type ClipboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClipboardPaste, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type Mapping = {
  id: string;
  client: string;
  month: number;
  year: number;
  uniqueCode: string;
  clientCode: string;
};

type DraftRow = { uniqueCode: string; clientCode: string };
type DraftSortKey = "uniqueCode" | "clientCode";
type DraftSort = { key: DraftSortKey; direction: "asc" | "desc" };

const baseClients = [
  "Macro",
  "Provincia",
  "Producteca",
  "Credicoop REG",
  "HSBC",
  "Santander",
  "Credicoop ES",
  "Massalin",
  "Pampa",
  "CTC",
  "Supervielle",
  "Amex Futuro",
  "Amex",
  "Comafi",
  "Importados",
  "Syngenta",
  "Umiles",
];

const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const currentYear = new Date().getFullYear();
const blankRows = (amount = 8): DraftRow[] =>
  Array.from({ length: amount }, () => ({ uniqueCode: "", clientCode: "" }));

function periodIndex(mapping: Pick<Mapping, "year" | "month">) {
  return mapping.year * 12 + mapping.month;
}

function periodLabel(month: number, year: number) {
  return `${months[month - 1] ?? month} ${year}`;
}

function normalizeClient(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalClient(value: string) {
  const normalized = normalizeClient(value);
  const known = baseClients.find(
    (clientName) => clientName.toLowerCase() === normalized.toLowerCase(),
  );
  if (known) return known;
  return normalized
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function resolveRowsForPeriod(
  mappings: Mapping[],
  targetClient: string,
  targetMonth: number,
  targetYear: number,
) {
  const targetPeriod = targetYear * 12 + targetMonth;
  const clientMappings = mappings.filter(
    (mapping) => canonicalClient(mapping.client) === targetClient,
  );
  const exactRows = clientMappings.filter(
    (mapping) => mapping.month === targetMonth && mapping.year === targetYear,
  );
  const sourcePeriod =
    exactRows.length > 0
      ? targetPeriod
      : Math.max(
          0,
          ...clientMappings
            .filter((mapping) => periodIndex(mapping) <= targetPeriod)
            .map(periodIndex),
        );
  const rows =
    exactRows.length > 0
      ? exactRows
      : sourcePeriod > 0
        ? clientMappings.filter(
            (mapping) => periodIndex(mapping) === sourcePeriod,
          )
        : [];

  return {
    rows: rows.sort((left, right) =>
      left.uniqueCode.localeCompare(right.uniqueCode, "es", {
        numeric: true,
      }),
    ),
    sourceMonth: sourcePeriod ? sourcePeriod % 12 || 12 : null,
    sourceYear: sourcePeriod ? Math.floor((sourcePeriod - 1) / 12) : null,
    isExact: exactRows.length > 0,
  };
}

export function ClientCodeWorkspace() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [client, setClient] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [loadedClient, setLoadedClient] = useState("");
  const [loadedMonth, setLoadedMonth] = useState<number | null>(null);
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  const [sourceMonth, setSourceMonth] = useState<number | null>(null);
  const [sourceYear, setSourceYear] = useState<number | null>(null);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => blankRows());
  const [selectedDraftRows, setSelectedDraftRows] = useState<Set<number>>(
    new Set(),
  );
  const dragMode = useRef<"select" | "deselect" | null>(null);
  const [message, setMessage] = useState("");
  const [dbStatus, setDbStatus] = useState(
    "Seleccioná filtros y apretá Cargar para leer el Excel local.",
  );
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [historyClient, setHistoryClient] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [loadedHistoryClient, setLoadedHistoryClient] = useState("");
  const [loadedHistoryMonth, setLoadedHistoryMonth] = useState("");
  const [loadedHistoryYear, setLoadedHistoryYear] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [draftSort, setDraftSort] = useState<DraftSort | null>(null);

  useEffect(() => {
    const stopDragging = () => {
      dragMode.current = null;
    };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  const selectedMonth = Number(month);
  const selectedYear = Number(year);
  const loadedPeriod =
    loadedMonth && loadedYear ? loadedYear * 12 + loadedMonth : 0;
  const hasLoadedPeriod = Boolean(loadedClient && loadedMonth && loadedYear);
  const hasPendingPeriod =
    hasLoadedPeriod &&
    Boolean(client && month && year) &&
    (client !== loadedClient ||
      selectedMonth !== loadedMonth ||
      selectedYear !== loadedYear);

  const clients = useMemo(
    () =>
      Array.from(
        new Set([
          ...baseClients,
          ...mappings.map((mapping) => canonicalClient(mapping.client)),
        ]),
      )
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "es")),
    [mappings],
  );

  const historyYears = useMemo(
    () => Array.from({ length: 8 }, (_, index) => currentYear - 3 + index),
    [],
  );

  const filteredHistory = useMemo(() => {
    if (!loadedHistoryClient || !loadedHistoryMonth || !loadedHistoryYear)
      return [];
    return mappings
      .filter((mapping) => {
        const matchesClient =
          canonicalClient(mapping.client) === loadedHistoryClient;
        const matchesMonth = mapping.month === Number(loadedHistoryMonth);
        const matchesYear = mapping.year === Number(loadedHistoryYear);
        return matchesClient && matchesMonth && matchesYear;
      })
      .sort(
        (left, right) =>
          periodIndex(right) - periodIndex(left) ||
          canonicalClient(right.client).localeCompare(
            canonicalClient(left.client),
            "es",
          ) ||
          right.uniqueCode.localeCompare(left.uniqueCode, "es", {
            numeric: true,
          }),
      );
  }, [mappings, loadedHistoryClient, loadedHistoryMonth, loadedHistoryYear]);

  const currentMonthRows = useMemo(
    () =>
      mappings
        .filter(
          (mapping) =>
            hasLoadedPeriod &&
            canonicalClient(mapping.client) === loadedClient &&
            mapping.month === loadedMonth &&
            mapping.year === loadedYear,
        )
        .sort((left, right) =>
          left.uniqueCode.localeCompare(right.uniqueCode, "es", {
            numeric: true,
          }),
        ),
    [hasLoadedPeriod, loadedClient, loadedMonth, loadedYear, mappings],
  );

  const preview = useMemo(
    () =>
      draftRows
        .filter((row) => row.uniqueCode.trim() && row.clientCode.trim())
        .map((row) => ({
          uniqueCode: row.uniqueCode.trim(),
          clientCode: row.clientCode.trim(),
        })),
    [draftRows],
  );

  const latestAssignmentByCode = useMemo(() => {
    const index = new Map<string, Mapping>();
    if (!loadedClient || !loadedPeriod) return index;
    for (const mapping of mappings) {
      if (
        canonicalClient(mapping.client) !== loadedClient ||
        periodIndex(mapping) > loadedPeriod
      ) {
        continue;
      }
      const normalizedCode = mapping.uniqueCode.trim();
      const current = index.get(normalizedCode);
      if (!current || periodIndex(mapping) > periodIndex(current)) {
        index.set(normalizedCode, mapping);
      }
    }
    return index;
  }, [loadedClient, loadedPeriod, mappings]);

  function sortDraftBy(key: DraftSortKey) {
    const nextSort: DraftSort =
      draftSort?.key === key
        ? { key, direction: draftSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    setDraftSort(nextSort);
    setDraftRows((currentRows) =>
      [...currentRows].sort((left, right) => {
        const leftEmpty = !left.uniqueCode.trim() && !left.clientCode.trim();
        const rightEmpty = !right.uniqueCode.trim() && !right.clientCode.trim();
        if (leftEmpty && rightEmpty) return 0;
        if (leftEmpty) return 1;
        if (rightEmpty) return -1;
        const comparison = left[nextSort.key].localeCompare(
          right[nextSort.key],
          "es",
          { numeric: true, sensitivity: "base" },
        );
        return nextSort.direction === "asc" ? comparison : -comparison;
      }),
    );
    setSelectedDraftRows(new Set());
  }

  function latestAssigned(uniqueCode: string) {
    return latestAssignmentByCode.get(uniqueCode.trim());
  }

  const autoCompleted = useMemo(
    () =>
      draftRows.filter((row) => {
        const assigned = latestAssignmentByCode.get(row.uniqueCode.trim());
        return assigned && assigned.clientCode === row.clientCode.trim();
      }).length,
    [draftRows, latestAssignmentByCode],
  );

  async function persist(next: Mapping[]) {
    setMappings(next);
    setDbStatus("Guardando en Excel...");
    try {
      const response = await fetch("/api/local-db/client-codes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: next }),
      });
      if (!response.ok) throw new Error("Excel write failed");
      setDbStatus("Excel local sincronizado");
    } catch {
      setDbStatus("No pude guardar en el Excel local");
    }
  }

  async function loadMappingsFromExcel() {
    setIsLoadingDb(true);
    setDbStatus("Leyendo Excel local...");
    try {
      const response = await fetch("/api/local-db/client-codes");
      if (!response.ok) throw new Error("Excel read failed");
      const data = (await response.json()) as { mappings: Mapping[] };
      setMappings(data.mappings);
      setDbStatus("Excel local sincronizado");
      return data.mappings;
    } catch {
      setDbStatus("No pude leer el Excel local");
      return mappings;
    } finally {
      setIsLoadingDb(false);
    }
  }

  function updateDraft(rowIndex: number, field: keyof DraftRow, value: string) {
    setDraftRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowIndex) return row;
        if (field === "uniqueCode") {
          const assigned = latestAssigned(value);
          return {
            ...row,
            uniqueCode: value,
            clientCode: assigned?.clientCode ?? "",
          };
        }
        return { ...row, clientCode: value };
      }),
    );
    setMessage("");
  }

  function changeClient(nextClient: string) {
    setClient(nextClient);
    setMessage("");
  }

  async function loadSelectedPeriod() {
    if (!client || !month || !year) {
      setMessage("Seleccioná cliente, mes y año antes de cargar.");
      return;
    }
    setIsLoadingPeriod(true);
    setMessage("");
    const loadedMappings = await loadMappingsFromExcel();
    window.setTimeout(() => {
      const resolved = resolveRowsForPeriod(
        loadedMappings,
        client,
        selectedMonth,
        selectedYear,
      );

      setLoadedClient(client);
      setLoadedMonth(selectedMonth);
      setLoadedYear(selectedYear);
      setSourceMonth(resolved.sourceMonth);
      setSourceYear(resolved.sourceYear);
      setDraftRows(
        resolved.rows.length > 0
          ? [
              ...resolved.rows.map((mapping) => ({
                uniqueCode: mapping.uniqueCode,
                clientCode: mapping.clientCode,
              })),
              ...blankRows(3),
            ]
          : blankRows(),
      );
      setMessage(
        resolved.rows.length > 0 && !resolved.isExact
          ? `No había carga para ${periodLabel(
              selectedMonth,
              selectedYear,
            )}; traje como base ${periodLabel(
              resolved.sourceMonth ?? selectedMonth,
              resolved.sourceYear ?? selectedYear,
            )}. Guardá el mes para crear la nueva foto.`
          : "",
      );
      setSelectedDraftRows(new Set());
      setIsLoadingPeriod(false);
    }, 120);
  }

  async function loadHistory() {
    if (!historyClient || !historyMonth || !historyYear) {
      setMessage("Seleccioná cliente, mes y año para consultar el histórico.");
      return;
    }
    setIsLoadingHistory(true);
    await loadMappingsFromExcel();
    window.setTimeout(() => {
      setLoadedHistoryClient(historyClient);
      setLoadedHistoryMonth(historyMonth);
      setLoadedHistoryYear(historyYear);
      setIsLoadingHistory(false);
    }, 120);
  }

  function startDraftDrag(
    event: MouseEvent<HTMLTableCellElement>,
    rowIndex: number,
  ) {
    event.preventDefault();
    const mode = selectedDraftRows.has(rowIndex) ? "deselect" : "select";
    dragMode.current = mode;
    setSelectedDraftRows((current) => {
      const next = new Set(current);
      if (mode === "select") next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }

  function continueDraftDrag(rowIndex: number) {
    const mode = dragMode.current;
    if (!mode) return;
    setSelectedDraftRows((current) => {
      const alreadyMatches =
        mode === "select" ? current.has(rowIndex) : !current.has(rowIndex);
      if (alreadyMatches) return current;
      const next = new Set(current);
      if (mode === "select") next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }

  function toggleAllDraftRows() {
    setSelectedDraftRows((current) =>
      current.size === draftRows.length
        ? new Set()
        : new Set(draftRows.map((_, index) => index)),
    );
  }

  function removeDraftRows() {
    if (selectedDraftRows.size === 0) return;
    const remaining = draftRows.filter(
      (_, index) => !selectedDraftRows.has(index),
    );
    setDraftRows(remaining.length > 0 ? remaining : blankRows());
    setSelectedDraftRows(new Set());
    setMessage("");
  }

  function pasteRows(
    event: ClipboardEvent<HTMLInputElement>,
    startIndex: number,
  ) {
    const clipboard = event.clipboardData.getData("text");
    if (!clipboard.includes("\t") && !clipboard.includes("\n")) return;
    event.preventDefault();
    const incoming = clipboard
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [uniqueCode = "", clientCode = ""] = line
          .split(/\t|;|,/)
          .map((value) => value.trim());
        const assigned = latestAssigned(uniqueCode);
        return {
          uniqueCode,
          clientCode: clientCode || assigned?.clientCode || "",
        };
      })
      .filter(
        (row) => !/c[oó]digo/i.test(`${row.uniqueCode} ${row.clientCode}`),
      );

    setDraftRows((currentRows) => {
      const requiredLength = Math.max(
        currentRows.length,
        startIndex + incoming.length,
        8,
      );
      const next = [
        ...currentRows,
        ...blankRows(requiredLength - currentRows.length),
      ];
      incoming.forEach((row, offset) => {
        next[startIndex + offset] = row;
      });
      return next;
    });
    setMessage("");
  }

  async function processRows() {
    if (!hasLoadedPeriod || !loadedMonth || !loadedYear || preview.length === 0)
      return;

    const existingOtherPeriods = mappings.filter(
      (mapping) =>
        !(
          canonicalClient(mapping.client) === loadedClient &&
          mapping.month === loadedMonth &&
          mapping.year === loadedYear
        ),
    );

    const newRows = preview.map((row) => ({
      id: `monthly-${loadedClient}-${loadedYear}-${loadedMonth}-${row.uniqueCode}`,
      client: loadedClient,
      month: loadedMonth,
      year: loadedYear,
      uniqueCode: row.uniqueCode,
      clientCode: row.clientCode,
    }));

    await persist([...existingOtherPeriods, ...newRows]);
    setDraftRows(blankRows());
    setSelectedDraftRows(new Set());
    setMessage(
      `${newRows.length} asignaciones guardadas para ${periodLabel(
        loadedMonth,
        loadedYear,
      )}`,
    );
  }

  async function clearHistory() {
    if (!window.confirm("¿Eliminar toda la base mensual de códigos cliente?"))
      return;
    await persist([]);
    setMessage("Base mensual eliminada");
  }

  return (
    <>
      <div className="mb-3 rounded-xl border border-[#dbe4ef] bg-white px-4 py-2 text-[10px] font-bold text-[#62728a]">
        <span className="inline-flex items-center gap-2">
          {isLoadingDb && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
          )}
          {isLoadingDb ? "Cargando datos..." : dbStatus}
        </span>
      </div>
      <PageHeader
        eyebrow="Códigos cliente"
        title="Asignación mensual de códigos"
        description="La base guarda una foto por cliente, mes y año. Si una asignación no cambia durante varios meses, figura repetida en cada mes correspondiente."
      />

      <section className="card mb-4 overflow-hidden">
        <div className="border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4">
          <div className="eyebrow">Asignar códigos</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">
            Pegá la foto mensual
          </h2>
          <p className="mt-1 text-[11px] text-[#62728a]">
            Elegí cliente, mes y año. Después pegá Código Único y Código
            Cliente. Si el código ya existía en meses anteriores, se completa
            automáticamente.
          </p>
        </div>
        <div className="grid gap-3 border-b border-[#e1e8f1] p-5 sm:grid-cols-[1fr_180px_140px_150px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(event) => changeClient(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Mes
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              <option value="">Seleccionar mes</option>
              {months.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Año
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              <option value="">Seleccionar año</option>
              {Array.from(
                { length: 8 },
                (_, index) => currentYear - 3 + index,
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={loadSelectedPeriod}
              disabled={
                isLoadingDb || isLoadingPeriod || !client || !month || !year
              }
              className="h-11 w-full"
            >
              {isLoadingDb || isLoadingPeriod ? "Cargando..." : "Cargar"}
            </Button>
          </div>
        </div>

        <div className="p-5">
          <div className="mx-auto mb-3 flex max-w-4xl flex-col gap-3 rounded-xl bg-[#f4f7fb] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] font-semibold text-[#62728a]">
              {hasLoadedPeriod ? (
                <>
                  Período cargado: <strong>{loadedClient}</strong> ·{" "}
                  <strong>{periodLabel(loadedMonth!, loadedYear!)}</strong>
                  {sourceMonth &&
                    sourceYear &&
                    (sourceMonth !== loadedMonth ||
                      sourceYear !== loadedYear) && (
                      <>
                        {" "}
                        · Base tomada de{" "}
                        <strong>{periodLabel(sourceMonth, sourceYear)}</strong>
                      </>
                    )}
                  {hasPendingPeriod
                    ? " · Hay filtros seleccionados pendientes de cargar."
                    : " · Para seleccionar filas, mantené presionado y arrastrá sobre la primera columna."}
                </>
              ) : (
                "Seleccioná cliente, mes y año y apretá Cargar para empezar."
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={preview.length === 0}
                onClick={() => {
                  setDraftRows(blankRows());
                  setSelectedDraftRows(new Set());
                }}
              >
                Limpiar
              </Button>
              <Button
                size="sm"
                disabled={
                  !hasLoadedPeriod ||
                  preview.length === 0 ||
                  hasPendingPeriod ||
                  isLoadingPeriod
                }
                onClick={processRows}
              >
                <ClipboardPaste size={14} /> Guardar mes
              </Button>
            </div>
          </div>
          <div className="relative mx-auto max-h-[360px] max-w-4xl overflow-auto rounded-xl border border-[#dbe4ef]">
            {(isLoadingDb || isLoadingPeriod) && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-white/75 backdrop-blur-[1px]">
                <div className="flex items-center gap-3 rounded-2xl border border-[#dbe4ef] bg-white px-4 py-3 text-xs font-black text-[#0b5bbb] shadow-sm">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
                  Cargando datos...
                </div>
              </div>
            )}
            <table className="w-full table-fixed select-none text-[11px]">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                  <th className="w-28 border-r border-[#dbe4ef] px-2 py-2 text-center">
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las filas"
                        checked={
                          draftRows.length > 0 &&
                          selectedDraftRows.size === draftRows.length
                        }
                        onChange={toggleAllDraftRows}
                        className="h-4 w-4 accent-[#0b5bbb]"
                      />
                      Seleccionar
                    </span>
                  </th>
                  <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => sortDraftBy("uniqueCode")}
                      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/80 hover:text-[#0b5bbb]"
                    >
                      Código único{" "}
                      {draftSort?.key === "uniqueCode"
                        ? draftSort.direction === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => sortDraftBy("clientCode")}
                      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/80 hover:text-[#0b5bbb]"
                    >
                      Código cliente{" "}
                      {draftSort?.key === "clientCode"
                        ? draftSort.direction === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row, index) => (
                  <tr
                    key={index}
                    onMouseEnter={() => continueDraftDrag(index)}
                    className={`border-t border-[#e7edf4] ${
                      selectedDraftRows.has(index) ? "bg-[#dfeafa]" : ""
                    }`}
                  >
                    <td
                      onMouseDown={(event) => startDraftDrag(event, index)}
                      className={`cursor-ns-resize border-r border-[#e7edf4] px-2 py-1 text-center text-[9px] font-bold ${
                        selectedDraftRows.has(index)
                          ? "bg-[#d3e3f7] text-[#0b5bbb]"
                          : "bg-[#f8fafd] text-[#8a99ad]"
                      }`}
                    >
                      <span className="pointer-events-none inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar fila ${index + 1}`}
                          checked={selectedDraftRows.has(index)}
                          readOnly
                          className="h-3.5 w-3.5 accent-[#0b5bbb]"
                        />
                        Fila {index + 1}
                      </span>
                    </td>
                    <td className="border-r border-[#e7edf4] p-0">
                      <input
                        value={row.uniqueCode}
                        onChange={(event) =>
                          updateDraft(index, "uniqueCode", event.target.value)
                        }
                        onPaste={(event) => pasteRows(event, index)}
                        autoFocus={index === 0}
                        placeholder={
                          index === 0 ? "Pegá códigos únicos acá" : ""
                        }
                        className="h-8 w-full select-text border-0 bg-transparent px-3 font-mono text-[11px] outline-none focus:bg-[#edf4fc]"
                      />
                    </td>
                    <td className="p-0">
                      <input
                        value={row.clientCode}
                        onChange={(event) =>
                          updateDraft(index, "clientCode", event.target.value)
                        }
                        onPaste={(event) => pasteRows(event, index)}
                        placeholder={
                          row.uniqueCode && !row.clientCode
                            ? "Sin asignación previa"
                            : ""
                        }
                        className="h-8 w-full select-text border-0 bg-transparent px-3 font-mono text-[11px] outline-none focus:bg-[#edf4fc]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mx-auto mt-3 flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-semibold text-[#62728a]">
              {preview.length} completas · {autoCompleted} recuperadas
              automáticamente · {selectedDraftRows.size} seleccionadas ·{" "}
              {currentMonthRows.length} ya guardadas en este mes
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedDraftRows.size > 0 ? "danger" : "secondary"}
                size="sm"
                disabled={selectedDraftRows.size === 0}
                onClick={removeDraftRows}
                className={
                  selectedDraftRows.size === 0
                    ? "border-[#e1e5ea] bg-[#f1f3f5] text-[#9aa3ad] opacity-100"
                    : ""
                }
              >
                <Trash2 size={14} /> Eliminar filas ({selectedDraftRows.size})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDraftRows((rows) => [...rows, ...blankRows(5)])
                }
              >
                Agregar 5 filas
              </Button>
            </div>
          </div>
          {message && (
            <div className="mt-3 rounded-xl bg-[#e9f1fb] px-4 py-3 text-xs font-bold text-[#0b5bbb]">
              {message}
            </div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dbe4ef] px-5 py-4">
          <div>
            <div className="eyebrow">Base mensual</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">
              Histórico por mes y año
            </h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={mappings.length === 0}
            onClick={clearHistory}
          >
            <Trash2 size={14} /> Limpiar base
          </Button>
        </div>
        <div className="grid gap-3 border-b border-[#e1e8f1] bg-[#fafcff] p-5 sm:grid-cols-[1fr_1fr_1fr_150px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Filtrar cliente
            <select
              value={historyClient}
              onChange={(event) => setHistoryClient(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Filtrar mes
            <select
              value={historyMonth}
              onChange={(event) => setHistoryMonth(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Seleccionar mes</option>
              {months.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Filtrar año
            <select
              value={historyYear}
              onChange={(event) => setHistoryYear(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Seleccionar año</option>
              {historyYears.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={loadHistory}
              disabled={
                isLoadingDb ||
                isLoadingHistory ||
                !historyClient ||
                !historyMonth ||
                !historyYear
              }
              className="h-10 w-full"
            >
              {isLoadingDb || isLoadingHistory ? "Cargando..." : "Cargar"}
            </Button>
          </div>
        </div>
        <div className="relative max-h-[420px] overflow-auto">
          {(isLoadingDb || isLoadingHistory) && (
            <div className="absolute inset-0 z-10 grid min-h-[180px] place-items-center bg-white/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbe4ef] bg-white px-4 py-3 text-xs font-black text-[#0b5bbb] shadow-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
                Cargando datos...
              </div>
            </div>
          )}
          <table className="w-full min-w-[760px] text-left text-[10.5px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="px-5 py-2">Cliente</th>
                <th className="px-4 py-2">Mes</th>
                <th className="px-4 py-2">Año</th>
                <th className="px-4 py-2">Código único</th>
                <th className="px-4 py-2">Código cliente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4]">
              {filteredHistory.slice(0, 500).map((mapping) => (
                <tr key={mapping.id}>
                  <td className="px-5 py-2 font-semibold text-[#10233f]">
                    {canonicalClient(mapping.client)}
                  </td>
                  <td className="px-4 py-2 text-[#425979]">
                    {months[mapping.month - 1] ?? mapping.month}
                  </td>
                  <td className="px-4 py-2 text-[#425979]">{mapping.year}</td>
                  <td className="px-4 py-2 font-mono text-[#425979]">
                    {mapping.uniqueCode}
                  </td>
                  <td className="px-4 py-2 font-mono text-[#425979]">
                    {mapping.clientCode}
                  </td>
                </tr>
              ))}
              {!isLoadingDb &&
                !isLoadingHistory &&
                (!loadedHistoryClient ||
                  !loadedHistoryMonth ||
                  !loadedHistoryYear) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-xs font-bold text-[#8a99ad]"
                    >
                      Seleccioná cliente, mes y año para consultar el histórico.
                    </td>
                  </tr>
                )}
              {!isLoadingDb &&
                !isLoadingHistory &&
                loadedHistoryClient &&
                loadedHistoryMonth &&
                loadedHistoryYear &&
                filteredHistory.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-xs font-bold text-[#8a99ad]"
                    >
                      No hay asignaciones para esos filtros.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#e9ece9] bg-[#fafbfa] px-5 py-3 text-[10px] font-semibold text-[#7e8780]">
          {loadedHistoryClient && loadedHistoryMonth && loadedHistoryYear ? (
            <>
              Consulta cargada: {loadedHistoryClient} ·{" "}
              {periodLabel(
                Number(loadedHistoryMonth),
                Number(loadedHistoryYear),
              )}{" "}
              · Mostrando {Math.min(filteredHistory.length, 500)} de{" "}
              {filteredHistory.length} filas filtradas · {mappings.length} filas
              mensuales totales
            </>
          ) : (
            <>
              Sin consulta cargada · {mappings.length} filas mensuales totales
            </>
          )}
        </div>
      </section>
    </>
  );
}
