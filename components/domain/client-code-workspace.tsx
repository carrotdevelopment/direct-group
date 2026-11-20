"use client";

import {
  type ClipboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { inClientScope, useClientScope } from "@/lib/use-client-scope";

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
  name: string;
  active: boolean;
  code: string;
};

type DraftRow = {
  uniqueCode: string;
  clientCode: string;
  isNew: boolean;
  // Qué hacer si el producto ya tiene códigos vigentes: "" se suma; un código cliente, lo reemplaza.
  // Sin definir: lo que corresponde al cliente (ver addsByDefault).
  replace?: string;
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
  // Reemplazos: el stock del código viejo pasa al nuevo después de guardar.
  transfers?: { oldCode: string; newCode: string }[];
  unchangedCount: number;
  finalMappings: Mapping[];
  client: string;
  assignedMonth: number;
  assignedYear: number;
  source: "assignment" | "history";
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

function codeKey(value: string) {
  return value.trim().toUpperCase();
}

// Clientes que usan más de un código vigente para el mismo producto (Amex con DG99 y OFED, Credicoop): un
// código nuevo para un producto que ya tiene código se suma por defecto. En el resto lo reemplaza.
const MULTI_CODE_CLIENTS = new Set(["amex", "credicoop"]);
function addsByDefault(client: string) {
  return MULTI_CODE_CLIENTS.has(normalizeClient(client).toLowerCase());
}

// Código vigente que reemplaza la fila ("" si se suma o si el producto no tiene otro código vigente).
function replaceChoice(row: Pick<DraftRow, "clientCode" | "replace">, actives: Mapping[], client: string) {
  const others = actives.filter((m) => codeKey(m.clientCode) !== codeKey(row.clientCode));
  if (others.length === 0 || !row.clientCode.trim()) return "";
  if (row.replace !== undefined) {
    return others.find((m) => codeKey(m.clientCode) === codeKey(row.replace ?? ""))?.clientCode ?? "";
  }
  return addsByDefault(client) ? "" : others[0].clientCode;
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
  const [productNames, setProductNames] = useState<Map<string, string>>(() => new Map());
  const [productCatalogLoaded, setProductCatalogLoaded] = useState(false);
  const [client, setClient] = useState("");
  const [month, setMonth] = useState(String(currentMonth));
  const [year, setYear] = useState(String(currentYear));
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => blankRows());
  const [selectedNewRows, setSelectedNewRows] = useState<Set<number>>(
    new Set(),
  );
  const dragMode = useRef<"select" | "deselect" | null>(null);
  const [message, setMessage] = useState("");
  const [draftError, setDraftError] = useState("");
  const [highlightedDuplicates, setHighlightedDuplicates] = useState<{
    uniqueCodes: Set<string>;
    clientCodes: Set<string>;
  }>(() => ({ uniqueCodes: new Set(), clientCodes: new Set() }));
  const [dbStatus, setDbStatus] = useState("Cargando...");
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [historyClient, setHistoryClient] = useState("");
  const [historyMonth, setHistoryMonth] = useState("");
  const [historyYear, setHistoryYear] = useState("");
  const [historyUniqueCode, setHistoryUniqueCode] = useState("");
  const [historyProductName, setHistoryProductName] = useState("");
  const [historyClientCode, setHistoryClientCode] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyActiveOnly, setHistoryActiveOnly] = useState(true);
  const [historyActionMessage, setHistoryActionMessage] = useState("");
  const [historyActionError, setHistoryActionError] = useState("");
  const [draftSort, setDraftSort] = useState<DraftSort | null>(null);
  const [historySort, setHistorySort] = useState<HistorySort>({
    key: "assignedYear",
    direction: "desc",
  });
  const [pending, setPending] = useState<PendingState | null>(null);
  const draftTableScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stopDragging = () => {
      dragMode.current = null;
    };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  const selectedMonth = Number(month);
  const selectedYear = Number(year);

  const clientScope = useClientScope();
  const clients = useMemo(
    () =>
      Array.from(
        new Set([
          ...baseClients,
          ...mappings.map((m) => canonicalClient(m.client)),
        ]),
      )
        .filter(Boolean)
        // Quien ve solo algunos clientes elige entre los suyos.
        .filter((name) => !clientScope.loaded || inClientScope(clientScope.scope, name))
        .sort((a, b) => a.localeCompare(b, "es")),
    [mappings, clientScope.loaded, clientScope.scope],
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
    const productQuery = historyProductName.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
        if (productQuery && !(productNames.get(codeKey(m.uniqueCode)) ?? "")
          .toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(productQuery)) return false;
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
    productNames,
    historyProductName,
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

  // Códigos vigentes de cada producto para el cliente elegido (puede haber más de uno).
  const activeAssignmentByCode = useMemo(() => {
    const index = new Map<string, Mapping[]>();
    if (!client) return index;
    const canonicalized = canonicalClient(client);
    for (const m of mappings) {
      if (!m.active || m.voidedAt || canonicalClient(m.client) !== canonicalized) continue;
      const key = codeKey(m.uniqueCode);
      index.set(key, [...(index.get(key) ?? []), m]);
    }
    return index;
  }, [client, mappings]);

  const filteredDraftEntries = useMemo(() => {
    return draftRows.map((row, originalIndex) => ({ row, originalIndex }));
  }, [draftRows]);

  const preview = useMemo(
    () =>
      draftRows
        .filter(
          (r) =>
            r.uniqueCode.trim() &&
            r.clientCode.trim(),
        )
        .map((r) => ({
          uniqueCode: r.uniqueCode.trim(),
          clientCode: r.clientCode.trim(),
          replace: replaceChoice(r, activeAssignmentByCode.get(codeKey(r.uniqueCode)) ?? [], client),
        })),
    [activeAssignmentByCode, client, draftRows],
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
              row.clientCode.trim(),
          )
          .map((row) => row.uniqueCode)
          .filter((uniqueCode) => !productCodes.has(codeKey(uniqueCode))),
      ),
    );
  }, [draftRows, productCatalogLoaded, productCodes]);

  const hasNewPreviewRows = useMemo(
    () =>
      draftRows.some(
        (row) =>
          row.isNew &&
          row.uniqueCode.trim() &&
          row.clientCode.trim(),
      ),
    [draftRows],
  );

  // Filas de productos que ya tienen código vigente: las que reemplazan uno y las que se suman.
  const draftUpdates = useMemo(
    () =>
      draftRows.flatMap((row) => {
        if (!row.uniqueCode.trim() || !row.clientCode.trim()) return [];
        const actives = activeAssignmentByCode.get(codeKey(row.uniqueCode)) ?? [];
        if (actives.length === 0 || actives.some((m) => codeKey(m.clientCode) === codeKey(row.clientCode))) return [];
        return [{ row, actives, replaces: replaceChoice(row, actives, client) }];
      }),
    [activeAssignmentByCode, client, draftRows],
  );

  const saveDisabledReason = useMemo(() => {
    if (!client) return "Seleccioná un cliente para poder guardar asignaciones.";
    if (isLoadingDb) return "Esperá a que termine de cargar la base local.";
    if (preview.length === 0) {
      return "Cargá al menos una asignación nueva o una actualización.";
    }
    if (hasNewPreviewRows && !productCatalogLoaded) {
      return "Todavía no se pudo validar contra Productos.";
    }
    if (invalidPreviewUniqueCodes.length > 0) {
      return "Hay códigos de producto que no existen en Productos.";
    }
    return "";
  }, [
    client,
    hasNewPreviewRows,
    invalidPreviewUniqueCodes.length,
    isLoadingDb,
    preview.length,
    productCatalogLoaded,
  ]);

  function sortDraftBy(key: DraftSortKey) {
    const nextSort: DraftSort =
      draftSort?.key === key
        ? { key, direction: draftSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    setDraftSort(nextSort);
    setDraftRows((rows) => {
      return [...rows].sort((a, b) => {
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
        <span className={active ? "text-[#0b5bbb]" : "text-[#5a6a82]"}>
          {active ? (historySort.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    );
  }

  function activeAssigned(uniqueCode: string) {
    return activeAssignmentByCode.get(codeKey(uniqueCode)) ?? [];
  }

  function setDraftReplace(index: number, replace: string) {
    setDraftRows((rows) => rows.map((row, i) => (i === index ? { ...row, replace } : row)));
  }

  async function persist(next: Mapping[]) {
    setMappings(next);
    setDbStatus("Guardando...");
    try {
      const response = await fetch("/api/local-db/client-codes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: next }),
      });
      if (!response.ok) throw new Error("write failed");
      setDbStatus("");
      return true;
    } catch {
      setDbStatus("No se pudo guardar.");
      return false;
    }
  }

  async function loadMappingsFromExcel() {
    setIsLoadingDb(true);
    setDbStatus("Cargando...");
    try {
      const response = await fetch("/api/local-db/client-codes");
      if (!response.ok) throw new Error("read failed");
      const data = (await response.json()) as { mappings: Mapping[] };
      setMappings(data.mappings);
      setDbStatus("");
      return data.mappings;
    } catch {
      setDbStatus("No se pudo cargar.");
      return mappings;
    } finally {
      setIsLoadingDb(false);
    }
  }

  async function loadProductCodesFromExcel() {
    try {
      const response = await fetch("/api/lookups?kind=products&includeInactive=true");
      if (!response.ok) throw new Error("read products failed");
      const data = (await response.json()) as { products: ProductReference[] };
      setProductNames(new Map(data.products.map((product) => [codeKey(product.code), product.name])));
      setProductCodes(
        new Set(
          data.products
            .filter((product) => product.active)
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
          return { ...row, uniqueCode: value };
        }
        return { ...row, clientCode: value };
      }),
    );
    setMessage("");
    setDraftError("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
  }

  function resetDraft() {
    setDraftRows(blankRows());
  }

  function changeClient(nextClient: string) {
    setClient(nextClient);
    setMessage("");
    setDraftError("");
    setSelectedNewRows(new Set());
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
    setDraftSort(null);
    resetDraft();
  }

  function changeAssignmentYear(nextYear: string) {
    setYear(nextYear);
    const maxMonth = Number(nextYear) === currentYear ? currentMonth : 12;
    if (Number(month) > maxMonth) {
      setMonth(String(maxMonth));
    }
  }

  function changeHistoryYear(nextYear: string) {
    setHistoryYear(nextYear);
    const maxMonth = Number(nextYear) === currentYear ? currentMonth : 12;
    if (historyMonth && Number(historyMonth) > maxMonth) {
      setHistoryMonth("");
    }
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
    historyProductName,
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
        return {
          uniqueCode,
          clientCode,
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

  function reviewActiveChanges() {
    if (!client || preview.length === 0) return;

    if (hasNewPreviewRows && !productCatalogLoaded) {
      setDraftError(
        "No pude validar contra Productos. Revisá que Base Productos DG.xlsx esté disponible antes de guardar asignaciones.",
      );
      return;
    }

    if (invalidPreviewUniqueCodes.length > 0) {
      setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
      setDraftError(
        `Código de producto inexistente en Productos: ${invalidPreviewUniqueCodes.join(", ")}. Primero cargalo en el maestro de Productos.`,
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

    // Un producto puede venir en varias filas con códigos cliente distintos (se suman); el mismo código
    // cliente repetido ya se frena arriba.

    setDraftError("");
    setHighlightedDuplicates({ uniqueCodes: new Set(), clientCodes: new Set() });
    const canonicalized = canonicalClient(client);
    const nextMappings = [...mappings];
    const changes: PendingChange[] = [];
    const transfers: { oldCode: string; newCode: string }[] = [];
    let unchangedCount = 0;

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
          `El código cliente ${row.clientCode} ya está activo para el código de producto ${nextMappings[activeByClientCodeIdx].uniqueCode}.`,
        );
        return;
      }

      const activeForProduct = (code?: string) =>
        nextMappings.findIndex(
          (m) =>
            m.active &&
            !m.voidedAt &&
            canonicalClient(m.client) === canonicalized &&
            codeKey(m.uniqueCode) === codeKey(row.uniqueCode) &&
            (code === undefined || codeKey(m.clientCode) === codeKey(code)),
        );
      if (activeForProduct(row.clientCode) !== -1) {
        unchangedCount++;
        continue;
      }
      // Solo se da de baja el código que eligieron reemplazar; si se suma, los vigentes quedan como están.
      const idx = row.replace ? activeForProduct(row.replace) : -1;
      if (idx !== -1) {
        const existing = nextMappings[idx];
        nextMappings[idx] = { ...existing, active: false };
        changes.push({
          kind: "updated",
          uniqueCode: row.uniqueCode,
          clientCode: row.clientCode,
          previousClientCode: existing.clientCode.trim(),
        });
        transfers.push({ oldCode: existing.clientCode.trim(), newCode: row.clientCode });
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
    setPending({
      changes,
      transfers,
      unchangedCount,
      finalMappings: nextMappings,
      client: canonicalized,
      assignedMonth: selectedMonth,
      assignedYear: selectedYear,
      source: "assignment",
    });
  }

  async function commitChanges() {
    if (!pending) return;
    const {
      finalMappings,
      changes,
      client: pendingClient,
      assignedMonth: pendingMonth,
      assignedYear: pendingYear,
      source,
      transfers = [],
    } = pending;
    setPending(null);
    if (!(await persist(finalMappings))) return;
    // Reemplazos: el stock del código viejo pasa al nuevo (egreso en el viejo, ingreso en el nuevo).
    const moved: string[] = [];
    const transferErrors: string[] = [];
    for (const transfer of transfers) {
      try {
        const response = await fetch("/api/local-db/client-codes/migracion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: pendingClient, ...transfer, onlyStock: true }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "No se pudo pasar el stock.");
        if (data.quantity > 0) moved.push(`${transfer.oldCode} → ${transfer.newCode}: ${data.quantity} u.`);
      } catch (error) {
        transferErrors.push(`${transfer.oldCode} → ${transfer.newCode}: ${error instanceof Error ? error.message : "no se pudo pasar el stock"}`);
      }
    }

    if (source === "assignment") {
      resetDraft();
      setSelectedNewRows(new Set());
    }

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
    const resultMessage = `${parts.join(" · ")} para ${pendingClient} · ${periodLabel(pendingMonth, pendingYear)}`
      + (moved.length ? `. Stock pasado al código nuevo: ${moved.join("; ")}` : "")
      + (transferErrors.length ? `. No se pudo pasar el stock de ${transferErrors.join("; ")}: revisalo en Stock.` : "");
    if (source === "history") {
      setHistoryActionMessage(resultMessage);
      setHistoryActionError("");
    } else {
      setMessage(resultMessage);
    }
  }

  function reviewHistoryDeactivation(mapping: Mapping) {
    if (!mapping.active || mapping.voidedAt) return;
    setHistoryActionMessage("");
    setHistoryActionError("");
    setPending({
      changes: [
        {
          kind: "deactivated",
          uniqueCode: mapping.uniqueCode,
          clientCode: mapping.clientCode,
        },
      ],
      unchangedCount: 0,
      finalMappings: mappings.map((row) =>
        row.id === mapping.id ? { ...row, active: false } : row,
      ),
      client: canonicalClient(mapping.client),
      assignedMonth: currentMonth,
      assignedYear: currentYear,
      source: "history",
    });
  }

  function hasActiveEquivalent(mapping: Mapping) {
    const canonicalized = canonicalClient(mapping.client);
    return mappings.some(
      (row) =>
        row.active &&
        !row.voidedAt &&
        canonicalClient(row.client) === canonicalized &&
        codeKey(row.uniqueCode) === codeKey(mapping.uniqueCode) &&
        codeKey(row.clientCode) === codeKey(mapping.clientCode),
    );
  }

  function reviewHistoryReactivation(mapping: Mapping) {
    if (mapping.active || mapping.voidedAt) return;
    const canonicalized = canonicalClient(mapping.client);
    const clientCodeConflict = mappings.find(
      (row) =>
        row.active &&
        !row.voidedAt &&
        canonicalClient(row.client) === canonicalized &&
        codeKey(row.clientCode) === codeKey(mapping.clientCode) &&
        codeKey(row.uniqueCode) !== codeKey(mapping.uniqueCode),
    );
    if (clientCodeConflict) {
      setHistoryActionMessage("");
      setHistoryActionError(
        `No se puede reactivar: el código cliente ${mapping.clientCode} está activo para ${clientCodeConflict.uniqueCode}.`,
      );
      return;
    }

    const now = new Date().toISOString();
    const finalMappings = mappings.map((row) => {
      if (row.id === mapping.id) {
        return { ...row, active: false, reactivatedAt: now };
      }
      if (
        !addsByDefault(canonicalized) &&
        row.active &&
        !row.voidedAt &&
        canonicalClient(row.client) === canonicalized &&
        codeKey(row.uniqueCode) === codeKey(mapping.uniqueCode)
      ) {
        return { ...row, active: false };
      }
      return row;
    });
    finalMappings.push({
      id: crypto.randomUUID(),
      client: canonicalized,
      uniqueCode: mapping.uniqueCode,
      clientCode: mapping.clientCode,
      assignedMonth: currentMonth,
      assignedYear: currentYear,
      active: true,
    });

    setHistoryActionMessage("");
    setHistoryActionError("");
    setPending({
      changes: [
        {
          kind: "reactivated",
          uniqueCode: mapping.uniqueCode,
          clientCode: mapping.clientCode,
        },
      ],
      unchangedCount: 0,
      finalMappings,
      client: canonicalized,
      assignedMonth: currentMonth,
      assignedYear: currentYear,
      source: "history",
    });
  }

  function scrollDraftTableToEnd() {
    const container = draftTableScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <>
      {/* Solo aparece mientras carga, guarda o si hubo un error; si no, quedaba una barra blanca vacía. */}
      {(isLoadingDb || dbStatus) && (
        <div className="mb-3 rounded-xl border border-[#dbe4ef] bg-white px-4 py-2 text-[11px] font-bold text-[#5a6a82]">
          <span className="inline-flex items-center gap-2">
            {isLoadingDb && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
            )}
            {isLoadingDb ? "Cargando datos..." : dbStatus}
          </span>
        </div>
      )}

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

        {/* Client selector */}
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
        </div>

        {/* Assignment table */}
        {
          <div className="p-5">
            <div
              ref={draftTableScrollRef}
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
                      Fila
                    </th>
                    <th className="border-r border-[#dbe4ef] px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => sortDraftBy("uniqueCode")}
                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/80 hover:text-[#0b5bbb]"
                      >
                        Código de producto{" "}
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
                    <th className="w-40 px-2 py-2 text-center text-[11px]">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDraftEntries.map(({ row, originalIndex }) => {
                    const isBlank =
                      !row.uniqueCode.trim() && !row.clientCode.trim();
                    const actives = activeAssigned(row.uniqueCode);
                    const isUnchanged =
                      Boolean(row.clientCode.trim()) &&
                      actives.some((m) => codeKey(m.clientCode) === codeKey(row.clientCode));
                    const isUpdate =
                      actives.length > 0 && Boolean(row.clientCode.trim()) && !isUnchanged;
                    const replaces = replaceChoice(row, actives, client);
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
                          isUpdate
                            ? "bg-[#fffaf0]"
                            : selectedNewRows.has(originalIndex)
                              ? "bg-[#dfeafa]"
                              : ""
                        }`}
                      >
                        {/* Selection cell */}
                        <td
                          onMouseDown={(e) => startDraftDrag(e, originalIndex)}
                          className={`cursor-ns-resize border-r border-[#e7edf4] px-2 py-1 text-center ${
                            selectedNewRows.has(originalIndex)
                              ? "bg-[#d3e3f7]"
                              : "bg-[#f8fafd]"
                          }`}
                        >
                          <span className="pointer-events-none inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar fila ${originalIndex + 1}`}
                              checked={selectedNewRows.has(originalIndex)}
                              readOnly
                              className="h-3.5 w-3.5 accent-[#0b5bbb]"
                            />
                            <span className="text-[11px] font-bold text-[#5a6a82]">
                              #{originalIndex + 1}
                            </span>
                          </span>
                        </td>

                        {/* Unique code */}
                        <td
                          className={`border-r border-[#e7edf4] p-0 ${
                            unknownUniqueCode || duplicateUniqueCode ? "bg-[#fff1f0]" : ""
                          }`}
                          title={
                            duplicateUniqueCode
                              ? "Código de producto repetido"
                              : unknownUniqueCode
                              ? "Este código de producto no existe en Productos"
                              : undefined
                          }
                        >
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
                                aria-label={`Fila ${originalIndex + 1}: código único`}
                                placeholder={isBlank ? "Pegá códigos de producto acá" : ""}
                                className={`h-8 w-full select-text border-0 bg-transparent px-3 pr-24 font-mono text-[11px] outline-none focus:bg-[#edf4fc] ${
                                  unknownUniqueCode || duplicateUniqueCode
                                    ? "font-bold text-[#b42318] focus:bg-[#fff1f0]"
                                    : ""
                                }`}
                              />
                              {duplicateUniqueCode ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#b42318]">
                                  Repetido
                                </span>
                              ) : unknownUniqueCode ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#b42318]">
                                  No existe
                                </span>
                              ) : actives.length > 0 ? (
                                <span
                                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fff3cd] px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#9a5c00]"
                                  title={`Códigos vigentes: ${actives.map((m) => m.clientCode).join(", ")}`}
                                >
                                  Ya asignado
                                </span>
                              ) : null}
                          </div>
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
                              aria-label={`Fila ${originalIndex + 1}: código cliente`}
                              placeholder={
                                row.uniqueCode && !row.clientCode
                                  ? "Ingresá el código cliente"
                                  : ""
                              }
                              className={`h-8 w-full select-text border-0 bg-transparent px-3 pr-24 font-mono text-[11px] outline-none focus:bg-[#edf4fc] ${
                                duplicateClientCode
                                  ? "font-bold text-[#b42318] focus:bg-[#fff1f0]"
                                  : ""
                              }`}
                            />
                            {duplicateClientCode && (
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#fce9e8] px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#b42318]">
                                Repetido
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assigned period */}
                        <td className="border-r border-[#e7edf4] px-3 py-1 font-medium text-[#5a6a82]">
                          {periodLabel(selectedMonth, selectedYear)}
                        </td>

                        {/* Action */}
                        <td className="px-2 py-1 text-center">
                          {isUpdate ? (
                            <select
                              value={replaces}
                              onChange={(e) => setDraftReplace(originalIndex, e.target.value)}
                              aria-label={`Qué hacer con el código vigente de ${row.uniqueCode}`}
                              title={`Códigos vigentes: ${actives.map((m) => m.clientCode).join(", ")}`}
                              className={`h-7 max-w-[11rem] rounded-md border px-1.5 text-[11px] font-extrabold outline-none ${replaces ? "border-[#f2d58b] bg-[#fff3cd] text-[#9a5c00]" : "border-[#bcd3f0] bg-[#e5effb] text-[#0b5bbb]"}`}
                            >
                              <option value="">Se suma</option>
                              {actives.map((m) => (
                                <option key={m.id} value={m.clientCode}>Reemplaza a {m.clientCode}</option>
                              ))}
                            </select>
                          ) : isUnchanged ? (
                            <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-extrabold text-[#5a6a82]">
                              Sin cambios
                            </span>
                          ) : row.uniqueCode.trim() ? (
                            <span className="rounded-full bg-[#e6f4ea] px-2 py-1 text-[11px] font-extrabold text-[#2d7a3a]">
                              Nueva
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {draftUpdates.length > 0 && (
              <div className="mt-3 rounded-xl border border-[#f2d58b] bg-[#fffaf0] px-4 py-3 text-[11px] text-[#7a5200]">
                <p className="font-black">
                  {draftUpdates.length === 1
                    ? "Un producto de la carga ya tiene código vigente."
                    : `${draftUpdates.length} productos de la carga ya tienen código vigente.`}{" "}
                  Elegí en cada fila si el código nuevo se suma o reemplaza a uno vigente.
                </p>
                <ul className="mt-1 space-y-0.5 font-semibold">
                  {draftUpdates.map(({ row, actives, replaces }) => (
                    <li key={`${codeKey(row.uniqueCode)}-${codeKey(row.clientCode)}`}>
                      {row.uniqueCode}:{" "}
                      {replaces
                        ? `${replaces} → ${row.clientCode} (${replaces} queda inactivo y su stock pasa a ${row.clientCode})`
                        : `se suma ${row.clientCode} (quedan vigentes ${[...actives.map((m) => m.clientCode), row.clientCode].join(", ")})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Assignment controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-semibold text-[#5a6a82]">
                {selectedNewRows.size} fila{selectedNewRows.size !== 1 ? "s" : ""} seleccionada{selectedNewRows.size !== 1 ? "s" : ""}
                <span className="ml-2 text-[#5a6a82]">
                  Las asignaciones existentes se identifican antes de guardar.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={scrollDraftTableToEnd}
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
        }

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
            <Button
              size="sm"
              disabled={Boolean(saveDisabledReason)}
              title={saveDisabledReason || undefined}
              onClick={reviewActiveChanges}
            >
              <ClipboardPaste size={14} />
              Guardar asignaciones
            </Button>
            {saveDisabledReason && (
              <p className="max-w-sm text-right text-[11px] font-bold text-[#5a6a82]">
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
        <div className="grid gap-3 border-b border-[#e1e8f1] bg-[#fafcff] p-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Nombre del producto
            <input
              type="search"
              value={historyProductName}
              onChange={(e) => setHistoryProductName(e.target.value)}
              placeholder="Ej.: cafetera, auriculares..."
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </label>
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
            Código de producto
            <input
              value={historyUniqueCode}
              onChange={(e) => setHistoryUniqueCode(e.target.value)}
              placeholder="Buscar por código..."
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
        {historyActionError && (
          <div className="border-b border-[#f2c9c7] bg-[#fce9e8] px-5 py-3 text-xs font-bold text-[#a43d39]">
            {historyActionError}
          </div>
        )}
        {historyActionMessage && (
          <div className="border-b border-[#cbdcf0] bg-[#e9f1fb] px-5 py-3 text-xs font-bold text-[#0b5bbb]">
            {historyActionMessage}
          </div>
        )}
        <div className="relative max-h-[420px] overflow-auto">
          {isLoadingDb && (
            <div className="absolute inset-0 z-10 grid min-h-[180px] place-items-center bg-white/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-3 rounded-2xl border border-[#dbe4ef] bg-white px-4 py-3 text-xs font-black text-[#0b5bbb] shadow-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9df] border-t-[#0b5bbb]" />
                Cargando datos...
              </div>
            </div>
          )}
          <table className="w-full min-w-[920px] text-left text-[11px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="px-5 py-2">
                  {historyHeader("client", "Cliente")}
                </th>
                <th className="px-4 py-2">
                  {historyHeader("uniqueCode", "Código de producto")}
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
                <th className="w-32 px-4 py-2 text-center">Acción</th>
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
                    <div className="mt-1 max-w-64 font-sans text-[11px] text-[#5a6a82]">
                      {productNames.get(codeKey(m.uniqueCode))}
                    </div>
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
                      className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                        m.voidedAt
                          ? "bg-[#fff3cd] text-[#9a5c00]"
                          : m.active
                            ? "bg-[#e6f4ea] text-[#2d7a3a]"
                            : "bg-[#f3f4f6] text-[#5a6a82]"
                      }`}
                      title={m.voidedAt ? m.voidReason || "Anulada" : undefined}
                    >
                      {m.voidedAt ? "Anulada" : m.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {m.voidedAt ? (
                      <span className="text-[11px] font-bold text-[#5a6a82]">Sin acciones</span>
                    ) : m.active ? (
                      <button
                        type="button"
                        onClick={() => reviewHistoryDeactivation(m)}
                        className="rounded-lg bg-[#fce9e8] px-2.5 py-1 text-[11px] font-extrabold text-[#a43d39] transition hover:bg-[#f5c2c1]"
                      >
                        Desactivar
                      </button>
                    ) : hasActiveEquivalent(m) ? (
                      <span className="text-[11px] font-bold text-[#5a6a82]">Ya reactivada</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reviewHistoryReactivation(m)}
                        className="rounded-lg bg-[#e9f1fb] px-2.5 py-1 text-[11px] font-extrabold text-[#0b5bbb] transition hover:bg-[#d3e3f7]"
                        title={`Se reactivará para ${periodLabel(currentMonth, currentYear)}`}
                      >
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoadingDb && filteredHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-xs font-bold text-[#5a6a82]"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4eaf2] bg-[#f8fafd] px-5 py-3 text-[11px] font-semibold text-[#5a6a82]">
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
                className="h-7 px-3 text-[11px]"
                disabled={historyPage === 0}
                onClick={() => setHistoryPage((p) => p - 1)}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-3 text-[11px]"
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
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#3a6ea8]">
                Confirmar cambios
              </p>
              <h3 className="mt-0.5 text-base font-black text-[#10233f]">
                {pending.client} ·{" "}
                {periodLabel(pending.assignedMonth, pending.assignedYear)}
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
                        <span className="text-[#5a6a82]">
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
                    <th className="px-4 py-2 text-left">Código de producto</th>
                    <th className="px-4 py-2 text-left">Código cliente</th>
                    <th className="w-28 px-4 py-2 text-left">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f4f8]">
                  {pending.changes.map((change) => (
                    <tr key={`${change.kind}-${change.uniqueCode}-${change.clientCode}`}>
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
                          <span className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-extrabold text-[#2d7a3a]">
                            Nueva
                          </span>
                        )}
                        {change.kind === "updated" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[11px] font-extrabold text-[#9a5c00]">
                            Actualizada
                          </span>
                        )}
                        {change.kind === "corrected" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[11px] font-extrabold text-[#9a5c00]">
                            Corregida
                          </span>
                        )}
                        {change.kind === "deactivated" && (
                          <span className="rounded-full bg-[#fce9e8] px-2 py-0.5 text-[11px] font-extrabold text-[#a43d39]">
                            Desactivada
                          </span>
                        )}
                        {change.kind === "reactivated" && (
                          <span className="rounded-full bg-[#e9f1fb] px-2 py-0.5 text-[11px] font-extrabold text-[#0b5bbb]">
                            Reactivada
                          </span>
                        )}
                        {change.kind === "voided" && (
                          <span className="rounded-full bg-[#fff3cd] px-2 py-0.5 text-[11px] font-extrabold text-[#9a5c00]">
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
