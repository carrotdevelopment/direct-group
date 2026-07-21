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
  uniqueCode: string;
  clientCode: string;
  assignedMonth: number;
  assignedYear: number;
  active: boolean;
  reactivatedAt?: string;
  correctedAt?: string;
  correctionReason?: string;
  voidedAt?: string;
  voidReason?: string;
};

type ProductReference = {
  code: string;
};

type DraftRow = {
  uniqueCode: string;
  clientCode: string;
  isNew: boolean;
  assignedMonth?: number;
  assignedYear?: number;
};
type DraftSortKey = "uniqueCode" | "clientCode" | "assignedPeriod";
type DraftSort = { key: DraftSortKey; direction: "asc" | "desc" };
type HistorySortKey =
  | "client"
  | "uniqueCode"
  | "clientCode"
  | "assignedMonth"
  | "assignedYear"
  | "active";
type HistorySort = { key: HistorySortKey; direction: "asc" | "desc" };

type PendingChange = {
  kind: "new" | "updated" | "corrected" | "deactivated" | "reactivated" | "voided";
  uniqueCode: string;
  clientCode: string;
  previousClientCode?: string;
};

type PendingState = {
  changes: PendingChange[];
  unchangedCount: number;
  finalMappings: Mapping[];
};

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
const currentMonth = new Date().getMonth() + 1;
const HISTORY_PAGE_SIZE = 100;

const blankRows = (amount = 8): DraftRow[] =>
  Array.from({ length: amount }, () => ({
    uniqueCode: "",
    clientCode: "",
    isNew: true,
  }));

function periodIndex(mapping: Pick<Mapping, "assignedYear" | "assignedMonth">) {
  return mapping.assignedYear * 12 + mapping.assignedMonth;
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
    (c) => c.toLowerCase() === normalized.toLowerCase(),
  );
  if (known) return known;
  return normalized
    .toLowerCase()
    .replace(/\b\p{L}/gu, (l) => l.toUpperCase());
}

function relationKey(uniqueCode: string, clientCode: string) {
  return `${uniqueCode.trim().toUpperCase()}::${clientCode.trim().toUpperCase()}`;
}

function codeKey(value: string) {
  return value.trim().toUpperCase();
}

function compareValues(left: string | number | boolean, right: string | number | boolean) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function historySortValue(mapping: Mapping, key: HistorySortKey) {
  if (key === "client") return canonicalClient(mapping.client);
  return mapping[key];
}

function compareHistoryRows(
  left: Mapping,
  right: Mapping,
  sort: HistorySort,
) {
  const primary =
    compareValues(
      historySortValue(left, sort.key),
      historySortValue(right, sort.key),
    ) * (sort.direction === "asc" ? 1 : -1);
  if (primary !== 0) return primary;
  return (
    periodIndex(right) - periodIndex(left) ||
    canonicalClient(left.client).localeCompare(canonicalClient(right.client), "es") ||
    left.uniqueCode.localeCompare(right.uniqueCode, "es", { numeric: true }) ||
    left.clientCode.localeCompare(right.clientCode, "es", { numeric: true })
  );
}

function draftSortValue(row: DraftRow, key: DraftSortKey) {
  if (key === "assignedPeriod") {
    if (!row.assignedYear || !row.assignedMonth) return 0;
    return row.assignedYear * 12 + row.assignedMonth;
  }
  return row[key];
}

export function ClientCodeWorkspace() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [productCodes, setProductCodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [productCatalogLoaded, setProductCatalogLoaded] = useState(false);
  const [client, setClient] = useState("");
  const [month, setMonth] = useState(String(currentMonth));
  const [year, setYear] = useState(String(currentYear));
  const [assignmentMode, setAssignmentMode] = useState<"active" | "inactive">(
    "active",
  );
  const [draftFilter, setDraftFilter] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => blankRows());
  const [selectedNewRows, setSelectedNewRows] = useState<Set<number>>(
    new Set(),
  );
  const [toDeactivate, setToDeactivate] = useState<Set<string>>(new Set());
  const [selectedToReactivate, setSelectedToReactivate] = useState<
    Set<string>
  >(new Set());
  const dragMode = useRef<"select" | "deselect" | null>(null);
  const [message, setMessage] = useState("");
  const [draftError, setDraftError] = useState("");
  const [highlightedDuplicates, setHighlightedDuplicates] = useState<{
    uniqueCodes: Set<string>;
    clientCodes: Set<string>;
  }>(() => ({ uniqueCodes: new Set(), clientCodes: new Set() }));
  const [dbStatus, setDbStatus] = useState("Leyendo Excel local...");
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [historyClient, setHistoryClient] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [activeFilterMonth, setActiveFilterMonth] = useState("");
  const [activeFilterYear, setActiveFilterYear] = useState("");
  const [historyUniqueCode, setHistoryUniqueCode] = useState("");
  const [historyClientCode, setHistoryClientCode] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyActiveOnly, setHistoryActiveOnly] = useState(true);
  const [draftSort, setDraftSort] = useState<DraftSort | null>(null);
  const [historySort, setHistorySort] = useState<HistorySort>({
    key: "assignedYear",
    direction: "desc",
  });
  const [pending, setPending] = useState<PendingState | null>(null);
  const activeTableScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stopDragging = () => {
      dragMode.current = null;
    };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  const selectedMonth = Number(month);
  const selectedYear = Number(year);

  const clients = useMemo(
    () =>
      Array.from(
        new Set([
          ...baseClients,
          ...mappings.map((m) => canonicalClient(m.client)),
        ]),
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es")),
    [mappings],
  );

  const historyYears = useMemo(
    () => Array.from({ length: 4 }, (_, i) => currentYear - 3 + i),
    [],
  );

  const availableHistoryMonths = useMemo(() => {
    const selected = Number(historyYear);
    const maxMonth = selected === currentYear ? currentMonth : 12;
    return months
      .map((name, index) => ({ name, value: index + 1 }))
      .filter((option) => option.value <= maxMonth);
  }, [historyYear]);

  const filteredHistory = useMemo(() => {
    const nUC = historyUniqueCode.trim().toLowerCase();
    const nCC = historyClientCode.trim().toLowerCase();
    const rows = mappings
      .filter((m) => {
        if (historyActiveOnly && (!m.active || m.voidedAt)) return false;
        if (historyClient && canonicalClient(m.client) !== historyClient)
          return false;
        if (historyMonth && m.assignedMonth !== Number(historyMonth))
          return false;
        if (historyYear && m.assignedYear !== Number(historyYear)) return false;
        if (nUC && !m.uniqueCode.toLowerCase().includes(nUC)) return false;
        if (nCC && !m.clientCode.toLowerCase().includes(nCC)) return false;
        return true;
      });
    const latestByPair = new Map<string, Mapping>();
    for (const mapping of rows) {
      const key = [
        canonicalClient(mapping.client).toUpperCase(),
        mapping.uniqueCode.trim().toUpperCase(),
        mapping.clientCode.trim().toUpperCase(),
        mapping.voidedAt ? "VOIDED" : mapping.active ? "ACTIVE" : "INACTIVE",
      ].join("::");
      const current = latestByPair.get(key);
      if (!current || periodIndex(mapping) > periodIndex(current)) {
        latestByPair.set(key, mapping);
      }
    }
    return Array.from(latestByPair.values()).sort((a, b) =>
      compareHistoryRows(a, b, historySort),
    );
  }, [
    mappings,
    historyClient,
    historyMonth,
    historyYear,
    historyUniqueCode,
    historyClientCode,
    historyActiveOnly,
    historySort,
  ]);

  const historyPageRows = useMemo(
    () =>
      filteredHistory.slice(
        historyPage * HISTORY_PAGE_SIZE,
        (historyPage + 1) * HISTORY_PAGE_SIZE,
      ),
    [filteredHistory, historyPage],
  );

  const assignmentYears = useMemo(
    () => Array.from({ length: 4 }, (_, i) => currentYear - 3 + i),
    [],
  );

  const availableAssignmentMonths = useMemo(() => {
    const selected = Number(year);
    const maxMonth = selected === currentYear ? currentMonth : 12;
    return months
      .map((name, index) => ({ name, value: index + 1 }))
      .filter((option) => option.value <= maxMonth);
  }, [year]);

  const availableActiveFilterMonths = useMemo(() => {
    const selected = Number(activeFilterYear);
    const maxMonth = selected === currentYear ? currentMonth : 12;
    return months
      .map((name, index) => ({ name, value: index + 1 }))
      .filter((option) => option.value <= maxMonth);
  }, [activeFilterYear]);

  const activeAssignmentByCode = useMemo(() => {
    const index = new Map<string, Mapping>();
    if (!client) return index;
    const canonicalized = canonicalClient(client);
    for (const m of mappings) {
      if (!m.active || m.voidedAt || canonicalClient(m.client) !== canonicalized) continue;
      index.set(m.uniqueCode.trim(), m);
    }
    return index;
  }, [client, mappings]);

  const activeAssignmentByRelation = useMemo(() => {
    const index = new Map<string, Mapping>();
    if (!client) return index;
    const canonicalized = canonicalClient(client);
    for (const mapping of mappings) {
      if (
        !mapping.active ||
        mapping.voidedAt ||
        canonicalClient(mapping.client) !== canonicalized
      ) {
        continue;
      }
      index.set(relationKey(mapping.uniqueCode, mapping.clientCode), mapping);
    }
    return index;
  }, [client, mappings]);

  const filteredDraftEntries = useMemo(() => {
    const query = draftFilter.trim().toLowerCase();
    return draftRows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        const isEmpty = !row.uniqueCode.trim() && !row.clientCode.trim();
        if (isEmpty) return true;
        if (!row.isNew) {
          if (activeFilterYear && row.assignedYear !== Number(activeFilterYear)) {
            return false;
          }
          if (activeFilterMonth && row.assignedMonth !== Number(activeFilterMonth)) {
            return false;
          }
        }
        if (!query) return true;
        return (
          row.uniqueCode.toLowerCase().includes(query) ||
          row.clientCode.toLowerCase().includes(query)
        );
      });
  }, [draftRows, draftFilter, activeFilterMonth, activeFilterYear]);

  const filteredInactiveAssignments = useMemo(() => {
    if (!client) return [];
    const canonicalized = canonicalClient(client);
    const query = draftFilter.trim().toLowerCase();
    const activePairs = new Set(
      mappings
        .filter(
          (m) => m.active && !m.voidedAt && canonicalClient(m.client) === canonicalized,
        )
        .map(
          (m) =>
            `${m.uniqueCode.trim().toUpperCase()}::${m.clientCode.trim().toUpperCase()}`,
        ),
    );
    const inactiveRows = mappings
      .filter(
        (m) =>
          !m.active &&
          !m.voidedAt &&
          !m.reactivatedAt &&
          canonicalClient(m.client) === canonicalized &&
          !activePairs.has(
            `${m.uniqueCode.trim().toUpperCase()}::${m.clientCode.trim().toUpperCase()}`,
          ),
      )
      .filter(
        (m) =>
          !query ||
          m.uniqueCode.toLowerCase().includes(query) ||
          m.clientCode.toLowerCase().includes(query),
      );
    const latestByPair = new Map<string, Mapping>();
    for (const mapping of inactiveRows) {
      const key = `${mapping.uniqueCode.trim().toUpperCase()}::${mapping.clientCode.trim().toUpperCase()}`;
      const current = latestByPair.get(key);
      if (!current || periodIndex(mapping) > periodIndex(current)) {
        latestByPair.set(key, mapping);
      }
    }
    return Array.from(latestByPair.values()).sort(
      (a, b) =>
        periodIndex(b) - periodIndex(a) ||
        a.uniqueCode.localeCompare(b.uniqueCode, "es", { numeric: true }) ||
        a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }),
    );
  }, [client, mappings, draftFilter]);

  const activeAssignmentsCount = useMemo(() => {
    if (!client) return 0;
    const canonicalized = canonicalClient(client);
    return mappings.filter(
      (m) => m.active && !m.voidedAt && canonicalClient(m.client) === canonicalized,
    ).length;
  }, [client, mappings]);

  const preview = useMemo(
    () =>
      draftRows
        .filter(
          (r) =>
            r.uniqueCode.trim() &&
            r.clientCode.trim() &&
            !toDeactivate.has(relationKey(r.uniqueCode, r.clientCode)),
        )
        .map((r) => ({
          uniqueCode: r.uniqueCode.trim(),
          clientCode: r.clientCode.trim(),
        })),
    [draftRows, toDeactivate],
  );

  const invalidPreviewUniqueCodes = useMemo(() => {
    if (!productCatalogLoaded) return [];
    return Array.from(
      new Set(
        draftRows
          .filter(
            (row) =>
              row.isNew &&
              row.uniqueCode.trim() &&
              row.clientCode.trim() &&
              !toDeactivate.has(relationKey(row.uniqueCode, row.clientCode)),
          )
          .map((row) => row.uniqueCode)
          .filter((uniqueCode) => !productCodes.has(codeKey(uniqueCode))),
      ),
    );
  }, [draftRows, productCatalogLoaded, productCodes, toDeactivate]);

  const hasNewPreviewRows = useMemo(
    () =>
      draftRows.some(
        (row) =>
          row.isNew &&
          row.uniqueCode.trim() &&
          row.clientCode.trim() &&
          !toDeactivate.has(relationKey(row.uniqueCode, row.clientCode)),
      ),
    [draftRows, toDeactivate],
  );

  const visibleActiveDeactivateKeys = useMemo(
    () =>
      filteredDraftEntries
        .map(({ row }) => row)
        .filter((row) => !row.isNew && row.uniqueCode.trim() && row.clientCode.trim())
        .map((row) => relationKey(row.uniqueCode, row.clientCode)),
    [filteredDraftEntries],
  );

  const allVisibleActiveMarked =
    visibleActiveDeactivateKeys.length > 0 &&
    visibleActiveDeactivateKeys.every((key) => toDeactivate.has(key));

  const saveDisabledReason = useMemo(() => {
    if (!client) return "Seleccioná un cliente para poder guardar asignaciones.";
    if (isLoadingDb) return "Esperá a que termine de cargar la base local.";
    if (assignmentMode === "active") {
      if (preview.length === 0 && toDeactivate.size === 0) {
        return "Cargá al menos una asignación nueva, corregí una existente o marcá una activa para desactivar.";
      }
      if (hasNewPreviewRows && !productCatalogLoaded) {
        return "Todavía no se pudo validar contra Productos.";
      }
      if (invalidPreviewUniqueCodes.length > 0) {
        return "Hay códigos únicos que no existen en Productos.";
      }
      return "";
    }
    if (selectedToReactivate.size === 0) {
      return "Seleccioná al menos una asignación inactiva para reactivar.";
    }
    return "";
  }, [
    assignmentMode,
    client,
    hasNewPreviewRows,
    invalidPreviewUniqueCodes.length,
    isLoadingDb,
    preview.length,
    productCatalogLoaded,
    selectedToReactivate.size,
    toDeactivate.size,
  ]);

  function sortDraftBy(key: DraftSortKey) {
    const nextSort: DraftSort =
      draftSort?.key === key
        ? { key, direction: draftSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    setDraftSort(nextSort);
    setDraftRows((rows) => {
      const prefilled = rows.filter((r) => !r.isNew);
      const newRows = rows.filter((r) => r.isNew);
      const sorted = [...prefilled].sort((a, b) => {
        const left = draftSortValue(a, key);
        const right = draftSortValue(b, key);
        const cmp =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "es", {
                numeric: true,
                sensitivity: "base",
              });
        return nextSort.direction === "asc" ? cmp : -cmp;
      });
      return [...sorted, ...newRows];
    });
    setSelectedNewRows(new Set());
  }

  function sortHistoryBy(key: HistorySortKey) {
    setHistoryPage(0);
    setHistorySort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  function historyHeader(key: HistorySortKey, label: string) {
    const active = historySort.key === key;
    return (
      <button
        type="button"
        onClick={() => sortHistoryBy(key)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/80 hover:text-[#0b5bbb]"
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        <span className={active ? "text-[#0b5bbb]" : "text-[#9aa9bc]"}>
          {active ? (historySort.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }

  function activeAssigned(uniqueCode: string) {
    return activeAssignmentByCode.get(uniqueCode.trim());
  }

  async function persist(next: Mapping[]) {
    setMappings(next);
    setDbStatus("Guardando en Excel...");
    try {
      const response = await fetch("/api/local-db/client-codes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: next }),
      });
      if (!response.ok) throw new Error("write failed");
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
      if (!response.ok) throw new Error("read failed");
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

  async function loadProductCodesFromExcel() {
    try {
      const response = await fetch("/api/local-db/products");
      if (!response.ok) throw new Error("read products failed");
      const data = (await response.json()) as { products: ProductReference[] };
      setProductCodes(
        new Set(
          data.products
            .map((product) => codeKey(product.code))
            .filter(Boolean),
        ),
      );
      setProductCatalogLoaded(true);
    } catch {
      setProductCodes(new Set());
      setProductCatalogLoaded(false);
    }
  }

  function updateDraft(
    rowIndex: number,
    field: "uniqueCode" | "clientCode",
    value: string,
  ) {
    setDraftRows((rows) =>
      rows.map((row, i) => {
        if (i !== rowIndex) return row;
        if (field === "uniqueCode") {
          if (!row.isNew) return row; // pre-filled uniqueCode is readonly
          const assigned = activeAssigned(value);
          return { ...row, uniqueCode: value, clientCode: assigned?.clientCode ?? "" };
        }
        return { ...row, clientCode: value };
      }),
    );
    setMessage("");
    setDraftError("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
  }

  function populateDraftFromMappings(
    source: Mapping[],
    canonicalized: string,
  ) {
    const active = source
      .filter((m) => m.active && !m.voidedAt && canonicalClient(m.client) === canonicalized)
      .sort((a, b) =>
        a.uniqueCode.localeCompare(b.uniqueCode, "es", { numeric: true }),
      );
    setDraftRows([
      ...active.map((m) => ({
        uniqueCode: m.uniqueCode,
        clientCode: m.clientCode,
        assignedMonth: m.assignedMonth,
        assignedYear: m.assignedYear,
        isNew: false,
      })),
      ...blankRows(3),
    ]);
  }

  function changeClient(nextClient: string) {
    setClient(nextClient);
    setMessage("");
    setDraftError("");
    setDraftFilter("");
    setToDeactivate(new Set());
    setSelectedToReactivate(new Set());
    setSelectedNewRows(new Set());
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
    setDraftSort(null);
    if (!nextClient) {
      setDraftRows(blankRows());
      return;
    }
    populateDraftFromMappings(mappings, canonicalClient(nextClient));
  }

  function changeMode(mode: "active" | "inactive") {
    setAssignmentMode(mode);
    setDraftFilter("");
    setToDeactivate(new Set());
    setSelectedToReactivate(new Set());
    setSelectedNewRows(new Set());
    setMessage("");
    setDraftError("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
  }

  function toggleDeactivate(uniqueCode: string, clientCode: string) {
    const key = relationKey(uniqueCode, clientCode);
    setToDeactivate((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleVisibleActiveDeactivation() {
    setToDeactivate((current) => {
      const next = new Set(current);
      const allSelected =
        visibleActiveDeactivateKeys.length > 0 &&
        visibleActiveDeactivateKeys.every((key) => next.has(key));
      if (allSelected) {
        visibleActiveDeactivateKeys.forEach((key) => next.delete(key));
      } else {
        visibleActiveDeactivateKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  }

  function changeAssignmentYear(nextYear: string) {
    setYear(nextYear);
    const maxMonth = Number(nextYear) === currentYear ? currentMonth : 12;
    if (Number(month) > maxMonth) {
      setMonth(String(maxMonth));
    }
  }

  function changeActiveFilterYear(nextYear: string) {
    setActiveFilterYear(nextYear);
    const maxMonth = Number(nextYear) === currentYear ? currentMonth : 12;
    if (activeFilterMonth && Number(activeFilterMonth) > maxMonth) {
      setActiveFilterMonth("");
    }
  }

  function changeHistoryYear(nextYear: string) {
    setHistoryYear(nextYear);
    const maxMonth = Number(nextYear) === currentYear ? currentMonth : 12;
    if (historyMonth && Number(historyMonth) > maxMonth) {
      setHistoryMonth("");
    }
  }

  function toggleReactivate(mappingId: string) {
    setSelectedToReactivate((current) => {
      const next = new Set(current);
      if (next.has(mappingId)) next.delete(mappingId);
      else next.add(mappingId);
      return next;
    });
  }

  function toggleAllInactive() {
    const allIds = new Set(filteredInactiveAssignments.map((m) => m.id));
    setSelectedToReactivate((current) => {
      const allSelected = filteredInactiveAssignments.every((m) =>
        current.has(m.id),
      );
      if (allSelected) {
        const next = new Set(current);
        allIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(current);
      allIds.forEach((id) => next.add(id));
      return next;
    });
  }

  useEffect(() => {
    // Initial synchronization with the local Excel-backed API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadMappingsFromExcel(), loadProductCodesFromExcel()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reset history pagination whenever any history filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryPage(0);
  }, [
    historyClient,
    historyMonth,
    historyYear,
    historyUniqueCode,
    historyClientCode,
    historyActiveOnly,
  ]);

  function startDraftDrag(
    event: MouseEvent<HTMLTableCellElement>,
    rowIndex: number,
  ) {
    event.preventDefault();
    const mode = selectedNewRows.has(rowIndex) ? "deselect" : "select";
    dragMode.current = mode;
    setSelectedNewRows((current) => {
      const next = new Set(current);
      if (mode === "select") next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  }

  function continueDraftDrag(rowIndex: number) {
    const mode = dragMode.current;
    if (!mode) return;
    setSelectedNewRows((current) => {
      const matches =
        mode === "select" ? current.has(rowIndex) : !current.has(rowIndex);
      if (matches) return current;
      const next = new Set(current);
      if (mode === "select") next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
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
          .map((v) => v.trim());
        const assigned = activeAssigned(uniqueCode);
        return {
          uniqueCode,
          clientCode: clientCode || assigned?.clientCode || "",
        };
      })
      .filter(
        (r) => !/c[oó]digo/i.test(`${r.uniqueCode} ${r.clientCode}`),
      );

    setDraftRows((rows) => {
      const requiredLen = Math.max(
        rows.length,
        startIndex + incoming.length,
        8,
      );
      const next: DraftRow[] = [
        ...rows,
        ...blankRows(requiredLen - rows.length),
      ];
      incoming.forEach((incomingRow, offset) => {
        const idx = startIndex + offset;
        const existing = next[idx];
        if (existing && !existing.isNew) {
          next[idx] = { ...existing, clientCode: incomingRow.clientCode };
        } else {
          next[idx] = { ...incomingRow, isNew: true };
        }
      });
      return next;
    });
    setMessage("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
  }

  function reviewChanges() {
    if (assignmentMode === "active") reviewActiveChanges();
    else reviewInactiveChanges();
  }

  function reviewActiveChanges() {
    if (!client || (preview.length === 0 && toDeactivate.size === 0)) return;

    if (hasNewPreviewRows && !productCatalogLoaded) {
      setDraftError(
        "No pude validar contra Productos. Revisá que Base Productos DG.xlsx esté disponible antes de guardar asignaciones.",
      );
      return;
    }

    if (invalidPreviewUniqueCodes.length > 0) {
      setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
      setDraftError(
        `Código único inexistente en Productos: ${invalidPreviewUniqueCodes.join(", ")}. Primero cargalo en el maestro de Productos.`,
      );
      return;
    }

    const seenCC = new Set<string>();
    const dupCC: string[] = [];
    for (const row of preview) {
      const key = codeKey(row.clientCode);
      if (seenCC.has(key)) {
        if (!dupCC.includes(row.clientCode)) dupCC.push(row.clientCode);
      } else seenCC.add(key);
    }
    if (dupCC.length > 0) {
      setHighlightedDuplicates({
        uniqueCodes: new Set(),
        clientCodes: new Set(dupCC.map(codeKey)),
      });
      setDraftError(
        `Código cliente repetido: ${dupCC.join(", ")}. Un código cliente no puede apuntar a dos productos distintos.`,
      );
      return;
    }

    const seenUnique = new Set<string>();
    const dupUnique: string[] = [];
    for (const row of preview) {
      const uniqueKey = codeKey(row.uniqueCode);
      if (seenUnique.has(uniqueKey)) {
        if (!dupUnique.includes(row.uniqueCode)) dupUnique.push(row.uniqueCode);
      } else seenUnique.add(uniqueKey);
    }
    if (dupUnique.length > 0) {
      setHighlightedDuplicates({
        uniqueCodes: new Set(dupUnique.map(codeKey)),
        clientCodes: new Set(),
      });
      setDraftError(
        `Código único repetido: ${dupUnique.join(", ")}. Para un mismo cliente solo puede quedar activa una relación por código único.`,
      );
      return;
    }

    setDraftError("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
    const canonicalized = canonicalClient(client);
    const nextMappings = [...mappings];
    const changes: PendingChange[] = [];
    let unchangedCount = 0;

    for (const key of toDeactivate) {
      const idx = nextMappings.findIndex(
        (m) =>
          m.active &&
          !m.voidedAt &&
          canonicalClient(m.client) === canonicalized &&
          relationKey(m.uniqueCode, m.clientCode) === key,
      );
      if (idx !== -1) {
        const existing = nextMappings[idx];
        nextMappings[idx] = { ...existing, active: false };
        changes.push({
          kind: "deactivated",
          uniqueCode: existing.uniqueCode,
          clientCode: existing.clientCode,
        });
      }
    }

    for (const row of preview) {
      const activeByClientCodeIdx = nextMappings.findIndex(
        (m) =>
          m.active &&
          !m.voidedAt &&
          canonicalClient(m.client) === canonicalized &&
          codeKey(m.clientCode) === codeKey(row.clientCode),
      );
      if (
        activeByClientCodeIdx !== -1 &&
        codeKey(nextMappings[activeByClientCodeIdx].uniqueCode) !== codeKey(row.uniqueCode)
      ) {
        setDraftError(
          `El código cliente ${row.clientCode} ya está activo para el código único ${nextMappings[activeByClientCodeIdx].uniqueCode}.`,
        );
        return;
      }

      const idx = nextMappings.findIndex(
        (m) =>
          m.active &&
          !m.voidedAt &&
          canonicalClient(m.client) === canonicalized &&
          codeKey(m.uniqueCode) === codeKey(row.uniqueCode),
      );
      if (idx !== -1) {
        const existing = nextMappings[idx];
        if (
          codeKey(existing.uniqueCode) === codeKey(row.uniqueCode) &&
          codeKey(existing.clientCode) === codeKey(row.clientCode)
        ) {
          unchangedCount++;
          continue;
        }
        if (periodIndex(existing) >= selectedYear * 12 + selectedMonth) {
          nextMappings[idx] = {
            ...existing,
            clientCode: row.clientCode,
            assignedMonth: selectedMonth,
            assignedYear: selectedYear,
            correctedAt: new Date().toISOString(),
            correctionReason: "Corrección manual desde Códigos cliente",
          };
          changes.push({
            kind: "corrected",
            uniqueCode: row.uniqueCode,
            clientCode: row.clientCode,
            previousClientCode: existing.clientCode.trim(),
          });
          continue;
        } else {
          nextMappings[idx] = { ...existing, active: false };
          changes.push({
            kind: "updated",
            uniqueCode: row.uniqueCode,
            clientCode: row.clientCode,
            previousClientCode: existing.clientCode.trim(),
          });
        }
      } else {
        changes.push({ kind: "new", uniqueCode: row.uniqueCode, clientCode: row.clientCode });
      }
      nextMappings.push({
        id: crypto.randomUUID(),
        client: canonicalized,
        uniqueCode: row.uniqueCode,
        clientCode: row.clientCode,
        assignedMonth: selectedMonth,
        assignedYear: selectedYear,
        active: true,
      });
    }

    if (changes.length === 0) {
      setMessage("Sin cambios — todas las asignaciones ya estaban vigentes.");
      return;
    }
    setPending({ changes, unchangedCount, finalMappings: nextMappings });
  }

  function reviewInactiveChanges(
    mappingIds: Set<string> = selectedToReactivate,
  ) {
    if (!client || mappingIds.size === 0) return;
    const canonicalized = canonicalClient(client);
    const nextMappings = [...mappings];
    const changes: PendingChange[] = [];
    const now = new Date().toISOString();

    for (const mappingId of mappingIds) {
      const selectedIndex = nextMappings.findIndex(
        (m) =>
          m.id === mappingId &&
          !m.active &&
          !m.voidedAt &&
          !m.reactivatedAt &&
          canonicalClient(m.client) === canonicalized,
      );
      const selectedInactive =
        selectedIndex >= 0 ? nextMappings[selectedIndex] : undefined;
      if (!selectedInactive) continue;
      const clientCode = codeKey(selectedInactive.clientCode);
      const uniqueCode = codeKey(selectedInactive.uniqueCode);
      const activeClientCodeConflict = nextMappings.find(
        (mapping) =>
          mapping.active &&
          !mapping.voidedAt &&
          canonicalClient(mapping.client) === canonicalized &&
          codeKey(mapping.clientCode) === clientCode &&
          codeKey(mapping.uniqueCode) !== uniqueCode,
      );
      if (activeClientCodeConflict) {
        setDraftError(
          `El código cliente ${selectedInactive.clientCode} ya está activo para el código único ${activeClientCodeConflict.uniqueCode}.`,
        );
        return;
      }
      const activeSameUnique = nextMappings.find(
        (mapping) =>
          mapping.active &&
          !mapping.voidedAt &&
          canonicalClient(mapping.client) === canonicalized &&
          codeKey(mapping.uniqueCode) === uniqueCode,
      );
      if (
        activeSameUnique &&
        periodIndex(activeSameUnique) >= selectedYear * 12 + selectedMonth
      ) {
        setDraftError(
          `Para reactivar ${selectedInactive.uniqueCode}, elegí un período posterior a ${periodLabel(activeSameUnique.assignedMonth, activeSameUnique.assignedYear)}.`,
        );
        return;
      }
      for (const [index, mapping] of nextMappings.entries()) {
        if (
          mapping.active &&
          !mapping.voidedAt &&
          canonicalClient(mapping.client) === canonicalized &&
          codeKey(mapping.uniqueCode) === uniqueCode
        ) {
          nextMappings[index] = { ...mapping, active: false };
        }
      }
      nextMappings[selectedIndex] = {
        ...selectedInactive,
        active: false,
        reactivatedAt: now,
      };
      nextMappings.push({
        id: crypto.randomUUID(),
        client: canonicalized,
        uniqueCode: selectedInactive.uniqueCode,
        clientCode: selectedInactive.clientCode,
        assignedMonth: selectedMonth,
        assignedYear: selectedYear,
        active: true,
      });
      changes.push({
        kind: "reactivated",
        uniqueCode: selectedInactive.uniqueCode,
        clientCode: selectedInactive.clientCode,
      });
    }

    if (changes.length === 0) return;
    setPending({ changes, unchangedCount: 0, finalMappings: nextMappings });
  }

  async function commitChanges() {
    if (!pending || !client) return;
    const { finalMappings, changes } = pending;
    setPending(null);
    await persist(finalMappings);

    const canonicalized = canonicalClient(client);
    populateDraftFromMappings(finalMappings, canonicalized);
    setSelectedNewRows(new Set());
    setToDeactivate(new Set());
    setSelectedToReactivate(new Set());
    if (assignmentMode === "inactive") setAssignmentMode("active");

    const n = (k: PendingChange["kind"]) =>
      changes.filter((c) => c.kind === k).length;
    const parts: string[] = [];
    const nw = n("new"),
      up = n("updated"),
      co = n("corrected"),
      de = n("deactivated"),
      re = n("reactivated"),
      vo = n("voided");
    if (nw > 0) parts.push(`${nw} nueva${nw !== 1 ? "s" : ""}`);
    if (up > 0) parts.push(`${up} actualizada${up !== 1 ? "s" : ""}`);
    if (co > 0) parts.push(`${co} corregida${co !== 1 ? "s" : ""}`);
    if (de > 0) parts.push(`${de} desactivada${de !== 1 ? "s" : ""}`);
    if (re > 0) parts.push(`${re} reactivada${re !== 1 ? "s" : ""}`);
    if (vo > 0) parts.push(`${vo} anulada${vo !== 1 ? "s" : ""}`);
    setMessage(
      `${parts.join(" · ")} para ${canonicalized} · ${periodLabel(selectedMonth, selectedYear)}`,
    );
  }

  async function voidMappings(mappingIds: Set<string>) {
    const selectedMappings = mappings.filter(
      (row) => mappingIds.has(row.id) && !row.voidedAt,
    );
    if (selectedMappings.length === 0) return;
    const first = selectedMappings[0];
    const reason = window.prompt(
      selectedMappings.length === 1
        ? `Motivo de eliminación para ${first.uniqueCode} / ${first.clientCode}`
        : `Motivo de eliminación para ${selectedMappings.length} asignaciones seleccionadas`,
      "Error de carga",
    );
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setDraftError("Para eliminar una asignación necesitás indicar un motivo.");
      return;
    }
    const selectedIds = new Set(selectedMappings.map((row) => row.id));
    const nextMappings = mappings.map((row) =>
      selectedIds.has(row.id)
        ? {
            ...row,
            active: false,
            voidedAt: new Date().toISOString(),
            voidReason: cleanReason,
          }
        : row,
    );
    await persist(nextMappings);
    if (client) populateDraftFromMappings(nextMappings, canonicalClient(client));
    setSelectedToReactivate((current) => {
      const next = new Set(current);
      selectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setMessage(
      selectedMappings.length === 1
        ? `Asignación eliminada: ${first.uniqueCode} / ${first.clientCode}. Motivo: ${cleanReason}`
        : `${selectedMappings.length} asignaciones eliminadas. Motivo: ${cleanReason}`,
    );
    setDraftError("");
  }

  async function voidMapping(mappingId: string) {
    await voidMappings(new Set([mappingId]));
  }

  function scrollActiveTableToEnd() {
    const container = activeTableScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
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
        title="Asignación de códigos"
        description="Cada asignación queda registrada con su fecha. Si un código cambia, la asignación anterior se conserva como inactiva y se crea una nueva."
      />

      <section className="card mb-4 overflow-hidden">
        <div className="border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4">
          <div className="eyebrow">Asignar códigos</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">
            Gestionar asignaciones
          </h2>
        </div>

        {/* Client + mode selector */}
        <div className="flex flex-wrap items-end gap-4 border-b border-[#e1e8f1] p-5">
          <label className="flex-1 text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(e) => changeClient(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 pb-0.5">
            <span className="text-[11px] font-extrabold text-[#334b6b]">
              Mostrar
            </span>
            <div className="flex rounded-xl border border-[#dbe4ef] bg-[#f4f7fb] p-0.5">
              {(["active", "inactive"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeMode(mode)}
                  className={`rounded-lg px-4 py-1.5 text-[11px] font-bold transition ${
                    assignmentMode === mode
                      ? "bg-white text-[#0b5bbb] shadow-sm"
                      : "text-[#62728a] hover:text-[#10233f]"
                  }`}
                >
                  {mode === "active" ? "Activas" : "Inactivas"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[#e1e8f1] bg-[#fafcff] px-5 py-3">
          <label className="min-w-[260px] flex-1 text-[11px] font-extrabold text-[#334b6b]">
            Buscar
            <input
              value={draftFilter}
              onChange={(e) => setDraftFilter(e.target.value)}
              placeholder="Código único o código cliente..."
              className="mt-1.5 h-9 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </label>
          {assignmentMode === "active" && (
            <>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Filtrar año vigente
                <select
                  value={activeFilterYear}
                  onChange={(e) => changeActiveFilterYear(e.target.value)}
                  className="mt-1.5 h-9 w-32 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
                >
                  <option value="">Todos</option>
                  {assignmentYears.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Filtrar mes vigente
                <select
                  value={activeFilterMonth}
                  onChange={(e) => setActiveFilterMonth(e.target.value)}
                  className="mt-1.5 h-9 w-40 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
                >
                  <option value="">Todos</option>
                  {availableActiveFilterMonths.map((option) => (
                    <option key={option.name} value={option.value}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {/* ACTIVE MODE TABLE */}
        {assignmentMode === "active" && (
          <div className="p-5">
            <div
              ref={activeTableScrollRef}
              className="relative mx-auto max-h-[400px] overflow-auto rounded-xl border border-[#dbe4ef]"
            >
              {isLoadingDb && (
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
                    <th className="w-24 border-r border-[#dbe4ef] px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label="Marcar todas las activas visibles para desactivar"
                        checked={allVisibleActiveMarked}
                        disabled={visibleActiveDeactivateKeys.length === 0}
                        onChange={toggleVisibleActiveDeactivation}
                        className="h-4 w-4 accent-[#0b5bbb]"
                      />
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
                    <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
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
                    <th className="w-36 border-r border-[#dbe4ef] px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => sortDraftBy("assignedPeriod")}
                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/80 hover:text-[#0b5bbb]"
                      >
                        Asignado en{" "}
                        {draftSort?.key === "assignedPeriod"
                          ? draftSort.direction === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </button>
                    </th>
                    <th className="w-28 px-2 py-2 text-center text-[10px]">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDraftEntries.map(({ row, originalIndex }) => {
                    const isBlank =
                      !row.uniqueCode.trim() && !row.clientCode.trim();
                    const markedDea = toDeactivate.has(
                      relationKey(row.uniqueCode, row.clientCode),
                    );
                    const activeRelation = activeAssignmentByRelation.get(
                      relationKey(row.uniqueCode, row.clientCode),
                    );
                    const assignedMonth =
                      row.assignedMonth ?? activeRelation?.assignedMonth;
                    const assignedYear =
                      row.assignedYear ?? activeRelation?.assignedYear;
                    const unknownUniqueCode =
                      Boolean(row.uniqueCode.trim()) &&
                      productCatalogLoaded &&
                      !productCodes.has(codeKey(row.uniqueCode));
                    const duplicateUniqueCode =
                      Boolean(row.uniqueCode.trim()) &&
                      highlightedDuplicates.uniqueCodes.has(codeKey(row.uniqueCode));
                    const duplicateClientCode =
                      Boolean(row.clientCode.trim()) &&
                      highlightedDuplicates.clientCodes.has(codeKey(row.clientCode));
                    return (
                      <tr
                        key={originalIndex}
                        onMouseEnter={() =>
                          row.isNew && continueDraftDrag(originalIndex)
                        }
                        className={`border-t border-[#e7edf4] transition ${
                          markedDea
                            ? "bg-[#fdf2f2] opacity-60"
                            : row.isNew && selectedNewRows.has(originalIndex)
                              ? "bg-[#dfeafa]"
                              : ""
                        }`}
                      >
                        {/* Selection cell */}
                        <td
                          onMouseDown={(e) =>
                            row.isNew && startDraftDrag(e, originalIndex)
                          }
                          className={`border-r border-[#e7edf4] px-2 py-1 text-center ${
                            row.isNew
                              ? "cursor-ns-resize"
                              : "cursor-default"
                          } ${
                            row.isNew && selectedNewRows.has(originalIndex)
                              ? "bg-[#d3e3f7]"
                              : "bg-[#f8fafd]"
                          }`}
                        >
                          {row.isNew ? (
                            <span className="pointer-events-none inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar fila ${originalIndex + 1}`}
                                checked={selectedNewRows.has(originalIndex)}
                                readOnly
                                className="h-3.5 w-3.5 accent-[#0b5bbb]"
                              />
                              <span className="text-[9px] font-bold text-[#8a99ad]">
                                Nueva
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                aria-label={`Marcar ${row.uniqueCode} para desactivar`}
                                checked={markedDea}
                                onChange={() =>
                                  toggleDeactivate(
                                    row.uniqueCode.trim(),
                                    row.clientCode.trim(),
                                  )
                                }
                                className="h-3.5 w-3.5 accent-[#b7433f]"
                              />
                              <span className="text-[9px] font-bold text-[#b0bbc8]">
                                #{originalIndex + 1}
                              </span>
                            </span>
                          )}
                        </td>

                        {/* Unique code */}
                        <td
                          className={`border-r border-[#e7edf4] p-0 ${
                            unknownUniqueCode || duplicateUniqueCode ? "bg-[#fff1f0]" : ""
                          }`}
                          title={
                            duplicateUniqueCode
                              ? "Código único repetido"
                              : unknownUniqueCode
                              ? "Este código único no existe en Productos"
                              : undefined
                          }
                        >
                          {row.isNew ? (
                            <div className="relative">
                              <input
                                value={row.uniqueCode}
                                onChange={(e) =>
                                  updateDraft(
                                    originalIndex,
                                    "uniqueCode",
                                    e.target.value,
                                  )
                                }
                                onPaste={(e) => pasteRows(e, originalIndex)}
                                autoFocus={originalIndex === 0 && isBlank}
                                placeholder={isBlank ? "Pegá códigos únicos acá" : ""}
                                className={`h-8 w-full select-text border-0 bg-transparent px-3 pr-24 font-mono text-[11px] outline-none focus:bg-[#edf4fc] ${
                                  unknownUniqueCode || duplicateUniqueCode
                                    ? "font-bold text-[#b42318] focus:bg-[#fff1f0]"
                                    : ""
                                }`}
                              />
                              {duplicateUniqueCode ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#b42318]">
                                  Repetido
                                </span>
                              ) : unknownUniqueCode ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#b42318]">
                                  No existe
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span
                              className={`flex h-8 items-center px-3 font-mono text-[11px] ${
                                unknownUniqueCode || duplicateUniqueCode
                                  ? "font-bold text-[#b42318]"
                                  : markedDea
                                  ? "line-through text-[#9aa3ad]"
                                  : "text-[#10233f]"
                              }`}
                            >
                              {row.uniqueCode}
                              {duplicateUniqueCode ? (
                                <span className="ml-2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#b42318]">
                                  Repetido
                                </span>
                              ) : unknownUniqueCode ? (
                                <span className="ml-2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#b42318]">
                                  No existe
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>

                        {/* Client code */}
                        <td
                          className={`border-r border-[#e7edf4] p-0 ${
                            duplicateClientCode ? "bg-[#fff1f0]" : ""
                          }`}
                          title={duplicateClientCode ? "Código cliente repetido" : undefined}
                        >
                          <div className="relative">
                            <input
                              value={row.clientCode}
                              onChange={(e) =>
                                updateDraft(
                                  originalIndex,
                                  "clientCode",
                                  e.target.value,
                                )
                              }
                              onPaste={(e) => pasteRows(e, originalIndex)}
                              disabled={markedDea}
                              placeholder={
                                row.isNew && row.uniqueCode && !row.clientCode
                                  ? "Sin asignación previa"
                                  : ""
                              }
                              className={`h-8 w-full select-text border-0 bg-transparent px-3 pr-24 font-mono text-[11px] outline-none focus:bg-[#edf4fc] disabled:text-[#9aa3ad] ${
                                duplicateClientCode
                                  ? "font-bold text-[#b42318] focus:bg-[#fff1f0]"
                                  : markedDea
                                    ? "line-through"
                                    : ""
                              }`}
                            />
                            {duplicateClientCode && (
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#b42318]">
                                Repetido
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assigned period */}
                        <td className="border-r border-[#e7edf4] px-3 py-1 font-medium text-[#62728a]">
                          {row.isNew
                            ? periodLabel(selectedMonth, selectedYear)
                            : assignedMonth && assignedYear
                              ? periodLabel(assignedMonth, assignedYear)
                              : "Sin dato"}
                        </td>

                        {/* Action */}
                        <td className="px-2 py-1 text-center">
                          {!row.isNew && !isBlank && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleDeactivate(
                                  row.uniqueCode.trim(),
                                  row.clientCode.trim(),
                                )
                              }
                              className={`rounded-lg px-2 py-1 text-[9px] font-extrabold transition ${
                                markedDea
                                  ? "bg-[#e9f1fb] text-[#0b5bbb] hover:bg-[#d3e3f7]"
                                  : "bg-[#fce9e8] text-[#a43d39] hover:bg-[#f5c2c1]"
                              }`}
                            >
                              {markedDea ? "Deshacer" : "Desactivar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Active mode controls below table */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[10px] font-semibold text-[#62728a]">
                {activeAssignmentsCount} activas en la base ·{" "}
                {visibleActiveDeactivateKeys.length} visibles por filtro ·{" "}
                {toDeactivate.size > 0 && (
                  <span className="text-[#a43d39]">
                    {toDeactivate.size} marcada{toDeactivate.size !== 1 ? "s" : ""} para desactivar ·{" "}
                  </span>
                )}
                {selectedNewRows.size} fila{selectedNewRows.size !== 1 ? "s" : ""} nueva{selectedNewRows.size !== 1 ? "s" : ""} seleccionada{selectedNewRows.size !== 1 ? "s" : ""}
                <span className="ml-2 text-[#8a99ad]">
                  Para corregir una activa, editá su código cliente y guardá.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={toDeactivate.size > 0 ? "danger" : "secondary"}
                  size="sm"
                  disabled={toDeactivate.size === 0}
                  onClick={reviewActiveChanges}
                  className={
                    toDeactivate.size === 0
                      ? "border-[#e1e5ea] bg-[#f1f3f5] text-[#9aa3ad] opacity-100"
                      : ""
                  }
                >
                  <Trash2 size={14} /> Desactivar asignaciones ({toDeactivate.size})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={scrollActiveTableToEnd}
                >
                  Ir al final
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setDraftRows((rows) => [...rows, ...blankRows(5)])
                  }
                >
                  Agregar filas nuevas
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* INACTIVE MODE TABLE */}
        {assignmentMode === "inactive" && (
          <div className="p-5">
            <div className="relative mx-auto max-h-[400px] overflow-auto rounded-xl border border-[#dbe4ef]">
              {isLoadingDb && (
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
                    <th className="w-12 border-r border-[#dbe4ef] px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        checked={
                          filteredInactiveAssignments.length > 0 &&
                          filteredInactiveAssignments.every((m) =>
                            selectedToReactivate.has(m.id),
                          )
                        }
                        onChange={toggleAllInactive}
                        className="h-4 w-4 accent-[#0b5bbb]"
                      />
                    </th>
                    <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
                      Código único
                    </th>
                    <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
                      Código cliente
                    </th>
                    <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
                      Asignado en
                    </th>
                    <th className="w-40 px-3 py-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7edf4]">
                  {filteredInactiveAssignments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-8 text-center text-xs font-bold text-[#8a99ad]"
                      >
                        {!client
                          ? "Seleccioná un cliente para ver sus asignaciones inactivas."
                          : "No hay asignaciones inactivas para este cliente."}
                      </td>
                    </tr>
                  ) : (
                    filteredInactiveAssignments.map((m) => (
                      <tr
                        key={m.id}
                        className={`transition ${
                          selectedToReactivate.has(m.id)
                            ? "bg-[#e9f1fb]"
                            : ""
                        }`}
                      >
                        <td className="border-r border-[#e7edf4] px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedToReactivate.has(m.id)}
                            onChange={() => toggleReactivate(m.id)}
                            className="h-4 w-4 accent-[#0b5bbb]"
                          />
                        </td>
                        <td className="border-r border-[#e7edf4] px-3 py-2 font-mono text-[#10233f]">
                          {m.uniqueCode}
                        </td>
                        <td className="border-r border-[#e7edf4] px-3 py-2 font-mono text-[#425979]">
                          {m.clientCode}
                        </td>
                        <td className="px-3 py-2 text-[#62728a]">
                          {months[m.assignedMonth - 1]} {m.assignedYear}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => reviewInactiveChanges(new Set([m.id]))}
                              className="rounded-lg bg-[#e9f1fb] px-2 py-1 text-[9px] font-extrabold text-[#0b5bbb] transition hover:bg-[#d3e3f7]"
                              title="Reactivar esta asignación"
                            >
                              Reactivar
                            </button>
                            <button
                              type="button"
                              onClick={() => void voidMapping(m.id)}
                              className="rounded-lg bg-[#fce9e8] px-2 py-1 text-[9px] font-extrabold text-[#a43d39] transition hover:bg-[#f5c2c1]"
                              title="Eliminar por error de carga. En la base queda anulado para auditoría."
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-[10px] font-semibold text-[#62728a]">
              {filteredInactiveAssignments.length} inactivas ·{" "}
              {selectedToReactivate.size} seleccionadas
            </div>
          </div>
        )}

        {/* Error / message */}
        {draftError && (
          <div className="mx-5 mb-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
            {draftError}
          </div>
        )}
        {message && (
          <div className="mx-5 mb-4 rounded-xl bg-[#e9f1fb] px-4 py-3 text-xs font-bold text-[#0b5bbb]">
            {message}
          </div>
        )}

        {/* Footer: month/year + save */}
        <div className="flex flex-wrap items-end justify-end gap-4 border-t border-[#e1e8f1] bg-[#fafcff] px-5 py-4">
          <div className="flex flex-wrap items-end justify-end gap-3">
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Año nueva asignación
              <select
                value={year}
                onChange={(e) => changeAssignmentYear(e.target.value)}
                className="mt-1.5 h-9 w-28 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
              >
                {assignmentYears.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-extrabold text-[#334b6b]">
              Mes nueva asignación
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1.5 h-9 w-40 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
              >
                {availableAssignmentMonths.map((option) => (
                  <option key={option.name} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col items-end gap-2">
            {assignmentMode === "active" ? (
              <Button
                size="sm"
                disabled={Boolean(saveDisabledReason)}
                title={saveDisabledReason || undefined}
                onClick={reviewChanges}
              >
                <ClipboardPaste size={14} />
                Guardar asignaciones
              </Button>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  disabled={Boolean(saveDisabledReason)}
                  title={saveDisabledReason || undefined}
                  onClick={() => reviewInactiveChanges()}
                >
                  <ClipboardPaste size={14} />
                  Reactivar seleccionadas
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={Boolean(saveDisabledReason)}
                  title={saveDisabledReason || undefined}
                  onClick={() => void voidMappings(selectedToReactivate)}
                >
                  <Trash2 size={14} />
                  Eliminar seleccionadas
                </Button>
              </div>
            )}
            {saveDisabledReason && (
              <p className="max-w-sm text-right text-[10px] font-bold text-[#62728a]">
                {saveDisabledReason}
              </p>
            )}
          </div>
        </div>

      </section>

      {/* CONSULTA */}
      <section className="card overflow-hidden">
        <div className="border-b border-[#dbe4ef] px-5 py-4">
          <div className="eyebrow">Consulta</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">
            Buscar en la base de códigos cliente
          </h2>
        </div>
        <div className="grid gap-3 border-b border-[#e1e8f1] bg-[#fafcff] p-5 sm:grid-cols-[2fr_120px_160px_1fr_1fr]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={historyClient}
              onChange={(e) => setHistoryClient(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Todos</option>
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Año asignación
            <select
              value={historyYear}
              onChange={(e) => changeHistoryYear(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Todos</option>
              {historyYears.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Mes asignación
            <select
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            >
              <option value="">Todos</option>
              {availableHistoryMonths.map((option) => (
                <option key={option.name} value={option.value}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Código único
            <input
              value={historyUniqueCode}
              onChange={(e) => setHistoryUniqueCode(e.target.value)}
              placeholder="Buscar..."
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Código cliente
            <input
              value={historyClientCode}
              onChange={(e) => setHistoryClientCode(e.target.value)}
              placeholder="Buscar..."
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </label>
        </div>
        <div className="flex items-center gap-3 border-b border-[#e1e8f1] bg-[#fafcff] px-5 py-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-[#334b6b]">
            <input
              type="checkbox"
              checked={historyActiveOnly}
              onChange={(e) => setHistoryActiveOnly(e.target.checked)}
              className="h-4 w-4 accent-[#0b5bbb]"
            />
            Solo activas
          </label>
        </div>
        <div className="relative max-h-[420px] overflow-auto">
          {isLoadingDb && (
            <div className="absolute inset-0 z-10 grid min-h-[180px] place-items-center bg-white/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbe4ef] bg-white px-4 py-3 text-xs font-black text-[#0b5bbb] shadow-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
                Cargando datos...
              </div>
            </div>
          )}
          <table className="w-full min-w-[800px] text-left text-[10.5px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="px-5 py-2">
                  {historyHeader("client", "Cliente")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("uniqueCode", "Código único")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("clientCode", "Código cliente")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("assignedMonth", "Mes asig.")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("assignedYear", "Año asig.")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("active", "Estado")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4]">
              {historyPageRows.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-2 font-semibold text-[#10233f]">
                    {canonicalClient(m.client)}
                  </td>
                  <td className="px-4 py-2 font-mono text-[#425979]">
                    {m.uniqueCode}
                  </td>
                  <td className="px-4 py-2 font-mono text-[#425979]">
                    {m.clientCode}
                  </td>
                  <td className="px-4 py-2 text-[#425979]">
                    {months[m.assignedMonth - 1] ?? m.assignedMonth}
                  </td>
                  <td className="px-4 py-2 text-[#425979]">
                    {m.assignedYear}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                        m.voidedAt
                          ? "bg-[#fff3cd] text-[#9a5c00]"
                          : m.active
                            ? "bg-[#e6f4ea] text-[#2d7a3a]"
                            : "bg-[#f3f4f6] text-[#9aa3ad]"
                      }`}
                      title={m.voidedAt ? m.voidReason || "Anulada" : undefined}
                    >
                      {m.voidedAt ? "Anulada" : m.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoadingDb && filteredHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-xs font-bold text-[#8a99ad]"
                  >
                    {mappings.length === 0
                      ? "La base está vacía."
                      : "No hay asignaciones para los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e9ece9] bg-[#fafbfa] px-5 py-3 text-[10px] font-semibold text-[#7e8780]">
          <span>
            {filteredHistory.length > 0
              ? `Mostrando ${historyPage * HISTORY_PAGE_SIZE + 1}–${Math.min(
                  (historyPage + 1) * HISTORY_PAGE_SIZE,
                  filteredHistory.length,
                )} de ${filteredHistory.length} filtradas · ${mappings.length} en la base`
              : `${mappings.length} filas en la base`}
          </span>
          {filteredHistory.length > HISTORY_PAGE_SIZE && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-3 text-[10px]"
                disabled={historyPage === 0}
                onClick={() => setHistoryPage((p) => p - 1)}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-3 text-[10px]"
                disabled={
                  (historyPage + 1) * HISTORY_PAGE_SIZE >=
                  filteredHistory.length
                }
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Siguiente →
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* CONFIRMATION MODAL */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPending(null);
          }}
        >
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#dbe4ef] bg-white shadow-2xl">
            <div className="border-b border-[#e1e8f1] bg-[#edf4fc] px-6 py-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#3a6ea8]">
                Confirmar cambios
              </p>
              <h3 className="mt-0.5 text-base font-black text-[#10233f]">
                {canonicalClient(client)} ·{" "}
                {periodLabel(selectedMonth, selectedYear)}
              </h3>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold">
                {(() => {
                  const n = (k: PendingChange["kind"]) =>
                    pending.changes.filter((c) => c.kind === k).length;
                  const nw = n("new"),
                    up = n("updated"),
                    co = n("corrected"),
                    de = n("deactivated"),
                    re = n("reactivated"),
                    vo = n("voided");
                  return (
                    <>
                      {nw > 0 && (
                        <span className="text-[#2d7a3a]">{nw} nueva{nw !== 1 ? "s" : ""}</span>
                      )}
                      {up > 0 && (
                        <span className="text-[#9a5c00]">{up} actualizada{up !== 1 ? "s" : ""}</span>
                      )}
                      {co > 0 && (
                        <span className="text-[#9a5c00]">{co} corregida{co !== 1 ? "s" : ""}</span>
                      )}
                      {de > 0 && (
                        <span className="text-[#a43d39]">{de} desactivada{de !== 1 ? "s" : ""}</span>
                      )}
                      {re > 0 && (
                        <span className="text-[#0b5bbb]">{re} reactivada{re !== 1 ? "s" : ""}</span>
                      )}
                      {vo > 0 && (
                        <span className="text-[#9a5c00]">{vo} anulada{vo !== 1 ? "s" : ""}</span>
                      )}
                      {pending.unchangedCount > 0 && (
                        <span className="text-[#62728a]">
                          {pending.unchangedCount} sin cambios
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#f4f7fb]">
                  <tr className="font-bold text-[#334b6b]">
                    <th className="px-4 py-2 text-left">Código único</th>
                    <th className="px-4 py-2 text-left">Código cliente</th>
                    <th className="w-28 px-4 py-2 text-left">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f4f8]">
                  {pending.changes.map((change) => (
                    <tr key={`${change.kind}-${change.uniqueCode}`}>
                      <td className="px-4 py-2 font-mono text-[#10233f]">
                        {change.uniqueCode}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {change.kind === "updated" || change.kind === "corrected" ? (
                          <span className="text-[#9a5c00]">
                            <span className="line-through opacity-60">
                              {change.previousClientCode}
                            </span>
                            {" → "}
                            {change.clientCode}
                          </span>
                        ) : change.kind === "deactivated" || change.kind === "voided" ? (
                          <span className="text-[#a43d39] line-through opacity-70">
                            {change.clientCode}
                          </span>
                        ) : (
                          <span
                            className={
                              change.kind === "reactivated"
                                ? "text-[#0b5bbb]"
                                : "text-[#2d7a3a]"
                            }
                          >
                            {change.clientCode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {change.kind === "new" && (
                          <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[9px] font-extrabold text-[#2d7a3a]">
                            Nueva
                          </span>
                        )}
                        {change.kind === "updated" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[9px] font-extrabold text-[#9a5c00]">
                            Actualizada
                          </span>
                        )}
                        {change.kind === "corrected" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[9px] font-extrabold text-[#9a5c00]">
                            Corregida
                          </span>
                        )}
                        {change.kind === "deactivated" && (
                          <span className="rounded-full bg-[#fce9e8] px-2 py-0.5 text-[9px] font-extrabold text-[#a43d39]">
                            Desactivada
                          </span>
                        )}
                        {change.kind === "reactivated" && (
                          <span className="rounded-full bg-[#e9f1fb] px-2 py-0.5 text-[9px] font-extrabold text-[#0b5bbb]">
                            Reactivada
                          </span>
                        )}
                        {change.kind === "voided" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[9px] font-extrabold text-[#9a5c00]">
                            Anulada
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e1e8f1] bg-[#fafcff] px-6 py-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPending(null)}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={commitChanges}>
                Confirmar y guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
