"use client";

import {
  type MouseEvent,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Layers3,
  PackageCheck,
  Power,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

type Product = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  brand: string;
  supplier: string;
  supplierCode: string;
  category: string;
  unitsPerPackage: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type Supplier = {
  id: string;
  name: string;
  active: boolean;
};

type Category = {
  id: string;
  name: string;
  active: boolean;
};

type SortKey =
  | "updatedAt"
  | "active"
  | "name"
  | "brand"
  | "supplier"
  | "supplierCode"
  | "category"
  | "unitsPerPackage";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

type BulkRow = {
  name: string;
  brand: string;
  code: string;
  supplier: string;
  category: string;
  unitsPerPackage: string;
  supplierCode: string;
};

type BulkPendingState = {
  toImport: Product[];
  skipped: { code: string; name: string }[];
};

const seed: Product[] = [
  {
    id: "example-421000005",
    code: "421000005",
    name: "Freidora Air 5 AF2050 Smart tek (421000005)",
    active: true,
    brand: "Smart Teck",
    supplier: "ACEGAME",
    supplierCode: "421000005",
    category: "ELECTRODOMESTICOS",
    unitsPerPackage: 1,
  },
  {
    id: "example-425000031",
    code: "425000031",
    name: "Plancha a vapor GS1500 Smart Tek (425000031)",
    active: true,
    brand: "Smart Teck",
    supplier: "ACEGAME",
    supplierCode: "425000031",
    category: "ELECTRODOMESTICOS",
    unitsPerPackage: 6,
  },
  {
    id: "example-191210001",
    code: "191210001",
    name: "Auriculares Bluetooth Xpods1 X-View (191210001)",
    active: true,
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "191210001",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-142200007",
    code: "142200007",
    name: "Tablet Titanium Colors Max X-View (142200007)",
    active: true,
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "142200007",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-191220000",
    code: "191220000",
    name: "Parlante Blast x3 X-View (191220000)",
    active: true,
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "191220000",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-142200009",
    code: "142200009",
    name: "Tablet Tungsten Max 10 X-View (142200009)",
    active: true,
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "142200009",
    category: "ELECTRONICA",
    unitsPerPackage: 6,
  },
];

const emptyForm = {
  code: "",
  name: "",
  brand: "",
  supplier: "",
  supplierCode: "",
  category: "",
  unitsPerPackage: "",
};

const visibleBatchSize = 300;

const BULK_COLUMNS: (keyof BulkRow)[] = [
  "name", "brand", "code", "supplier", "category", "unitsPerPackage", "supplierCode",
];

function bulkCellKey(rowIndex: number, col: keyof BulkRow) {
  return `${rowIndex}:${col}`;
}

function bulkCellRectangle(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
) {
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const selected = new Set<string>();
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      selected.add(bulkCellKey(rowIndex, BULK_COLUMNS[colIndex]));
    }
  }
  return selected;
}

function emptyBulkRow(): BulkRow {
  return { name: "", brand: "", code: "", supplier: "", category: "", unitsPerPackage: "", supplierCode: "" };
}

function blankBulkRows(n = 8): BulkRow[] {
  return Array.from({ length: n }, emptyBulkRow);
}

function applyBulkPaste(
  current: BulkRow[],
  text: string,
  startRow: number,
  startCol: number,
): BulkRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const next = [...current];
  lines.forEach((line, lineOffset) => {
    const row = startRow + lineOffset;
    while (next.length <= row) next.push(emptyBulkRow());
    line.split("\t").forEach((value, colOffset) => {
      const col = startCol + colOffset;
      if (col < BULK_COLUMNS.length) {
        next[row] = { ...next[row], [BULK_COLUMNS[col]]: value.trim() };
      }
    });
  });
  return next;
}

function uniqueActiveOptions<T extends { name: string; active: boolean }>(
  options: T[],
) {
  return Array.from(
    options
      .filter((option) => option.active && option.name.trim())
      .reduce((map, option) => {
        const key = normalizeForDuplicateCheck(option.name);
        if (!map.has(key)) map.set(key, { ...option, name: option.name.trim() });
        return map;
      }, new Map<string, T>())
      .values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "es"));
}

type ProductOptionPickerProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  type: "supplier" | "category";
  onChange: (value: string) => void;
};

function ProductOptionPicker({
  label,
  placeholder,
  value,
  options,
  type,
  onChange,
}: ProductOptionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const normalizedValue = normalizeForDuplicateCheck(value);
  const filteredOptions = options.filter((option) =>
    normalizeForDuplicateCheck(option).includes(normalizedValue),
  );
  const LeadingIcon = type === "supplier" ? Truck : Layers3;
  const optionLabel = type === "supplier" ? "proveedores" : "categorías";

  function selectOption(option: string) {
    onChange(option);
    setIsOpen(false);
    setActiveIndex(0);
  }

  return (
    <label className="relative text-[11px] font-extrabold text-[#334b6b]">
      {label}
      <div
        className={`mt-2 flex h-11 items-center rounded-xl border bg-white transition-all ${
          isOpen
            ? "border-[#7da4d3] ring-3 ring-[#e5eef9]"
            : "border-[#dbe4ef] hover:border-[#b8c9dd]"
        }`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
        }}
      >
        <LeadingIcon className="ml-3 shrink-0 text-[#7690ae]" size={15} />
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          value={value}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) =>
                Math.max(0, Math.min(index + 1, filteredOptions.length - 1)),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && isOpen && filteredOptions[activeIndex]) {
              event.preventDefault();
              selectOption(filteredOptions[activeIndex]);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs font-medium text-[#233a58] outline-none placeholder:text-[#9aa8b8]"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Mostrar ${optionLabel}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsOpen((current) => !current)}
          className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#7690ae] transition-colors hover:bg-[#edf3fa] hover:text-[#315d8f]"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-[#d6e0ec] bg-white p-1.5 shadow-[0_16px_40px_rgba(31,55,86,.16)]"
        >
          <div className="flex items-center justify-between px-2.5 py-2 text-[9px] font-black uppercase tracking-[.1em] text-[#8493a6]">
            <span>{type === "supplier" ? "Proveedores disponibles" : "Categorías disponibles"}</span>
            <span className="rounded-full bg-[#edf3fa] px-2 py-0.5 text-[#52769f]">
              {filteredOptions.length}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const selected = normalizeForDuplicateCheck(option) === normalizedValue;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-xs transition-colors ${
                      index === activeIndex
                        ? "bg-[#edf4fc] text-[#214f82]"
                        : "text-[#405570] hover:bg-[#f5f8fc]"
                    }`}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#f0f4f8] text-[#6e87a4]">
                      <LeadingIcon size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold">{option}</span>
                    {selected && <Check size={14} className="shrink-0 text-[#3975b8]" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-[11px] font-medium leading-5 text-[#8493a6]">
                No hay {optionLabel} que coincidan con “{value}”.
              </div>
            )}
          </div>
          <div className="border-t border-[#edf1f5] px-2.5 py-2 text-[9px] font-medium text-[#98a4b2]">
            Escribí para filtrar · ↑↓ para navegar · Enter para elegir
          </div>
        </div>
      )}
    </label>
  );
}

export function ProductWorkspace() {
  const [products, setProducts] = useState<Product[]>(seed);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({
    key: "updatedAt",
    direction: "desc",
  });
  const [dbStatus, setDbStatus] = useState("Leyendo base de datos...");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(visibleBatchSize);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => blankBulkRows());
  const [bulkError, setBulkError] = useState("");
  const [bulkPending, setBulkPending] = useState<BulkPendingState | null>(null);
  const [selectedBulkCells, setSelectedBulkCells] = useState<Set<string>>(
    new Set(),
  );
  const bulkSelectionAnchor = useRef<{
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/local-db/products?includeInactive=true").then(
        (response) => response.json() as Promise<{ products: Product[] }>,
      ),
      fetch("/api/lookups?kind=suppliers").then(
        (response) => response.json() as Promise<{ suppliers: Supplier[] }>,
      ),
      fetch("/api/local-db/categories").then(
        (response) => response.json() as Promise<{ categories: Category[] }>,
      ),
    ])
      .then(([productsData, suppliersData, categoriesData]) => {
        setProducts(productsData.products);
        setSuppliers(suppliersData.suppliers);
        setCategories(categoriesData.categories);
        setDbStatus("PostgreSQL sincronizado");
      })
      .catch(() => {
        setDbStatus("No pude leer la base de datos, usando datos demo");
      });
  }, []);

  useEffect(() => {
    const stopBulkSelection = () => {
      bulkSelectionAnchor.current = null;
    };
    window.addEventListener("mouseup", stopBulkSelection);
    return () => window.removeEventListener("mouseup", stopBulkSelection);
  }, []);

  const activeSuppliers = useMemo(
    () => uniqueActiveOptions(suppliers),
    [suppliers],
  );

  const activeCategories = useMemo(
    () => uniqueActiveOptions(categories),
    [categories],
  );

  async function persist(next: Product[]) {
    setProducts(next);
    setDbStatus("Guardando en PostgreSQL...");
    try {
      const response = await fetch("/api/local-db/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: next }),
      });
      if (!response.ok) throw new Error("database write failed");
      setDbStatus("PostgreSQL sincronizado");
    } catch {
      setDbStatus("No pude guardar en PostgreSQL");
    }
  }

  const filtered = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const result = products.filter((product) =>
      normalizedQuery
        ? Object.values(product)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        : true,
    );
    if (!sort) return result;
    return [...result].sort((left, right) => {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];
      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "es", {
              numeric: true,
              sensitivity: "base",
            });
      return sort.direction === "desc" ? -comparison : comparison;
    });
  }, [products, deferredQuery, sort]);

  const visibleProducts = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

  const hasMoreProducts = filtered.length > visibleProducts.length;

  function sortBy(key: SortKey) {
    setVisibleLimit(visibleBatchSize);
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );
  }

  function sortHeader(key: SortKey, label: string) {
    const active = sort?.key === key;
    return (
      <button
        type="button"
        onClick={() => sortBy(key)}
        className="inline-flex items-center justify-center gap-1 rounded-md px-1 py-0.5 transition hover:bg-white/70 hover:text-[#0b5bbb]"
        title={`Ordenar ${label}`}
      >
        {label}
        {active ? (
          sort.direction === "desc" ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronUp size={13} />
          )
        ) : (
          <ChevronDown size={13} className="opacity-30" />
        )}
      </button>
    );
  }

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    const code = normalizeForDuplicateCheck(form.code);
    const supplier = normalizeForDuplicateCheck(form.supplier);
    const category = normalizeForDuplicateCheck(form.category);
    if (!code || !form.name.trim())
      return setError("Completá el código único y el nombre del producto.");
    if (
      supplier &&
      !activeSuppliers.some(
        (item) => normalizeForDuplicateCheck(item.name) === supplier,
      )
    )
      return setError(
        "Ese proveedor no esta en la base. Agregalo primero desde el modulo Proveedores.",
      );
    if (
      category &&
      !activeCategories.some(
        (item) => normalizeForDuplicateCheck(item.name) === category,
      )
    )
      return setError(
        "Esa categoria no esta en la base. Agregala primero desde el modulo Proveedores.",
      );
    if (
      products.some(
        (product) =>
          product.id !== editingId &&
          normalizeForDuplicateCheck(product.code) === code,
      )
    )
      return setError("Ese código único ya existe.");
    const values = {
      code,
      name: form.name.trim(),
      brand: form.brand.trim() || "Sin marca",
      supplier: supplier || "Sin proveedor",
      supplierCode: form.supplierCode.trim(),
      category: category || "Sin categoria",
      unitsPerPackage: form.unitsPerPackage
        ? Number(form.unitsPerPackage)
        : null,
    };
    const now = new Date().toISOString();
    const nextProducts = editingId
      ? products.map((product) =>
          product.id === editingId
            ? {
                ...product,
                ...values,
                createdAt: product.createdAt || now,
                updatedAt: now,
              }
            : product,
        )
      : [
          ...products,
          {
            id: crypto.randomUUID(),
            ...values,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
        ];

    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setOpen(false);
    await persist(nextProducts);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      code: product.code,
      name: product.name,
      brand: product.brand,
      supplier: product.supplier,
      supplierCode: product.supplierCode ?? "",
      category: product.category,
      unitsPerPackage: product.unitsPerPackage
        ? String(product.unitsPerPackage)
        : "",
    });
    setError("");
    setOpen(true);
  }

  async function toggleProductActive() {
    if (!editingId) return;
    const product = products.find((item) => item.id === editingId);
    if (
      !product ||
      !window.confirm(
        `¿${product.active ? "Desactivar" : "Reactivar"} ${product.code} · ${product.name}?`,
      )
    )
      return;
    setOpen(false);
    await persist(
      products.map((item) =>
        item.id === editingId
          ? { ...item, active: !item.active, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    setEditingId(null);
    setForm(emptyForm);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visibleIds = visibleProducts.map((product) => product.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleLimit(visibleBatchSize);
  }

  async function deactivateSelected() {
    if (
      selected.size === 0 ||
      !window.confirm(`¿Desactivar los ${selected.size} productos seleccionados?`)
    )
      return;
    await persist(
      products.map((product) =>
        selected.has(product.id)
          ? { ...product, active: false, updatedAt: new Date().toISOString() }
          : product,
      ),
    );
    setSelected(new Set());
  }

  function startBulkCellSelection(
    _event: MouseEvent<HTMLElement>,
    rowIndex: number,
    colIndex: number,
  ) {
    bulkSelectionAnchor.current = { rowIndex, colIndex };
    setSelectedBulkCells(
      bulkCellRectangle(rowIndex, colIndex, rowIndex, colIndex),
    );
  }

  function continueBulkCellSelection(rowIndex: number, colIndex: number) {
    const anchor = bulkSelectionAnchor.current;
    if (!anchor) return;
    setSelectedBulkCells(
      bulkCellRectangle(anchor.rowIndex, anchor.colIndex, rowIndex, colIndex),
    );
  }

  function clearSelectedBulkCells() {
    if (selectedBulkCells.size === 0) return;
    setBulkRows((rows) =>
      rows.map((row, rowIndex) => {
        const next = { ...row };
        let changed = false;
        for (const col of BULK_COLUMNS) {
          if (selectedBulkCells.has(bulkCellKey(rowIndex, col))) {
            next[col] = "";
            changed = true;
          }
        }
        return changed ? next : row;
      }),
    );
    setSelectedBulkCells(new Set());
    setBulkError("");
  }

  function reviewBulk() {
    const filled = bulkRows.filter((r) => r.name.trim() || r.code.trim());
    if (filled.length === 0) {
      setBulkError("No hay filas con datos para importar.");
      return;
    }
    const seenInBatch = new Set<string>();
    const dupInBatch: string[] = [];
    for (const row of filled) {
      if (!row.code.trim()) continue;
      const key = normalizeForDuplicateCheck(row.code);
      if (seenInBatch.has(key)) {
        if (!dupInBatch.includes(row.code.trim())) dupInBatch.push(row.code.trim());
      } else {
        seenInBatch.add(key);
      }
    }
    if (dupInBatch.length > 0) {
      setBulkError(
        `Código único repetido en el borrador: ${dupInBatch.join(", ")}. Corregí antes de importar.`,
      );
      return;
    }
    const now = new Date().toISOString();
    const toImport: Product[] = [];
    const skipped: { code: string; name: string }[] = [];
    let missingCount = 0;
    for (const row of filled) {
      if (!row.code.trim() || !row.name.trim()) {
        missingCount++;
        continue;
      }
      const key = normalizeForDuplicateCheck(row.code);
      if (products.some((p) => normalizeForDuplicateCheck(p.code) === key)) {
        skipped.push({ code: row.code.trim(), name: row.name.trim() });
        continue;
      }
      toImport.push({
        id: crypto.randomUUID(),
        code: key,
        name: row.name.trim(),
        active: true,
        brand: row.brand.trim() || "Sin marca",
        supplier: row.supplier.trim() || "Sin proveedor",
        supplierCode: row.supplierCode.trim(),
        category: row.category.trim() || "Sin categoría",
        unitsPerPackage: row.unitsPerPackage ? Number(row.unitsPerPackage) : null,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (missingCount > 0) {
      setBulkError(
        `${missingCount} ${missingCount === 1 ? "fila" : "filas"} sin nombre o código único. Completalas o limpiá esas filas.`,
      );
      return;
    }
    if (toImport.length === 0) {
      setBulkError("Todos los productos ya existen en el catálogo y serán omitidos.");
      return;
    }
    setBulkError("");
    setBulkPending({ toImport, skipped });
  }

  async function commitBulk() {
    if (!bulkPending) return;
    await persist([...products, ...bulkPending.toImport]);
    setBulkPending(null);
    setBulkRows(blankBulkRows());
    setSelectedBulkCells(new Set());
  }

  return (
    <>
      <PageHeader
        eyebrow="Productos"
        title="Catálogo de productos"
        description="Administrá el maestro único, sus datos comerciales y códigos de proveedor. El código único no se repite y permanece trazable."
      />
      <SummaryStrip
        items={[
          {
            label: "Productos cargados",
            value: String(products.filter((product) => product.active).length),
            meta: `${products.filter((product) => !product.active).length} inactivos`,
            icon: PackageCheck,
          },
          {
            label: "Categorías",
            value: String(
              new Set(products.map((product) => product.category)).size,
            ),
            meta: "Agregar o administrar",
            icon: Layers3,
            tone: "blue",
            href: "/proveedores#categorias",
          },
          {
            label: "Marcas",
            value: String(
              new Set(products.map((product) => product.brand)).size,
            ),
            meta: "Marcas registradas",
            icon: Boxes,
            tone: "blue",
          },
          {
            label: "Proveedores",
            value: String(
              new Set(products.map((product) => product.supplier)).size,
            ),
            meta: "Agregar o administrar",
            icon: Truck,
            href: "/proveedores#proveedores",
          },
        ]}
      />

      <section className="card animate-enter overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e1e8f1] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-[360px]">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a99ad]"
            />
            <input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Buscar código, producto o marca..."
              className="h-10 w-full rounded-xl border border-[#dbe4ef] bg-[#f8fafd] pl-10 pr-4 text-xs outline-none focus:border-[#7da4d3]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selected.size > 0 ? "danger" : "secondary"}
              size="sm"
              disabled={selected.size === 0}
              onClick={deactivateSelected}
              className={
                selected.size === 0
                  ? "border-[#e1e5ea] bg-[#f1f3f5] text-[#9aa3ad] opacity-100"
                  : ""
              }
            >
              <Power size={14} /> Desactivar seleccionados ({selected.size})
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={15} /> Nuevo producto
            </Button>
          </div>
        </div>
        <div className="max-h-[470px] overflow-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-[10.5px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="border-b border-[#dbe4ef] bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="w-10 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los productos visibles"
                    checked={
                      filtered.length > 0 &&
                      visibleProducts.every((product) =>
                        selected.has(product.id),
                      )
                    }
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[#0b5bbb]"
                  />
                </th>
                <th className="w-20 px-2 py-2 text-center">Acción</th>
                <th className="w-20 px-2 py-2 text-center">
                  {sortHeader("active", "Estado")}
                </th>
                <th className="w-[27%] px-3 py-2 text-center">
                  {sortHeader("name", "Producto")}
                </th>
                <th className="w-[11%] px-2 py-2 text-center">
                  {sortHeader("brand", "Marca")}
                </th>
                <th className="w-[12%] px-2 py-2 text-center">
                  {sortHeader("supplier", "Proveedor")}
                </th>
                <th className="w-[12%] px-2 py-2 text-center">
                  {sortHeader("supplierCode", "Cód. proveedor")}
                </th>
                <th className="w-[12%] px-2 py-2 text-center">
                  {sortHeader("category", "Categoría")}
                </th>
                <th className="w-16 px-2 py-2 text-center">
                  {sortHeader("unitsPerPackage", "Bulto")}
                </th>
                <th className="w-28 px-2 py-2 text-center">
                  {sortHeader("updatedAt", "Actualizado")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4] bg-white">
              {visibleProducts.map((product) => (
                <tr
                  key={product.id}
                  className={`transition-colors ${
                    selected.has(product.id)
                      ? "bg-[#edf4fc]"
                      : product.active
                        ? "hover:bg-[#f8fafd]"
                        : "bg-[#f7f8fa] text-[#7d8997] hover:bg-[#f1f3f6]"
                  }`}
                >
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${product.name}`}
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      className="h-4 w-4 accent-[#0b5bbb]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(product)}
                      className="h-7 px-3 text-[10px]"
                    >
                      Editar
                    </Button>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${
                        product.active
                          ? "bg-[#e8f6ed] text-[#277345]"
                          : "bg-[#eceff3] text-[#687789]"
                      }`}
                    >
                      {product.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div
                      className="truncate text-[10.5px] font-semibold leading-4 text-[#10233f]"
                      title={product.name}
                    >
                      {product.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[8.5px] leading-3 text-[#8492a5]">
                      {product.code}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-[#425979]">
                    <div className="truncate" title={product.brand}>
                      {product.brand}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-[#425979]">
                    <div className="truncate" title={product.supplier}>
                      {product.supplier}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[9.5px] text-[#425979]">
                    <div className="truncate" title={product.supplierCode}>
                      {product.supplierCode || "-"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-[#425979]">
                    <div className="truncate" title={product.category}>
                      {product.category}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center font-medium text-[#425979]">
                    {product.unitsPerPackage ? product.unitsPerPackage : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center font-medium text-[#425979]">
                    <div className="truncate" title={product.updatedAt || ""}>
                      {formatUpdatedAt(product.updatedAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e9ece9] bg-[#fafbfa] px-5 py-3 text-[10px] font-semibold text-[#7e8780]">
          <span>
            Mostrando {visibleProducts.length} de {filtered.length} filtrados ·{" "}
            {products.filter((product) => product.active).length} activos ·{" "}
            {products.filter((product) => !product.active).length} inactivos
          </span>
          {hasMoreProducts && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setVisibleLimit((current) => current + visibleBatchSize)
              }
              className="h-7 px-3 text-[10px]"
            >
              Mostrar{" "}
              {Math.min(
                visibleBatchSize,
                filtered.length - visibleProducts.length,
              )}{" "}
              más
            </Button>
          )}
          <span>{dbStatus}</span>
        </div>
      </section>

      <section className="card mt-4 animate-enter overflow-hidden">
        <div className="border-b border-[#e1e8f1] bg-white p-4">
          <div className="eyebrow">Importación</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">Carga masiva de productos</h2>
          <p className="mt-1 text-[11px] font-medium text-[#62728a]">
            Completá la tabla o pegá desde Excel. Orden de columnas: Producto · Marca · Código único · Proveedor · Categoría · Bulto · Cód. Único Prov.
          </p>
          <p className="mt-1 text-[10px] font-bold text-[#8a99ad]">
            Tip: mantené click y arrastrá para seleccionar celdas. Un nuevo click inicia una selección nueva.
          </p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[880px] table-fixed text-left text-[10.5px]">
            <thead className="sticky top-0 z-[1]">
              <tr className="border-b border-[#dbe4ef] bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="w-[28%] px-3 py-2">Producto *</th>
                <th className="w-[10%] px-2 py-2">Marca</th>
                <th className="w-[13%] px-2 py-2">Código único *</th>
                <th className="w-[13%] px-2 py-2">Proveedor</th>
                <th className="w-[12%] px-2 py-2">Categoría</th>
                <th className="w-20 px-2 py-2 text-center">Bulto</th>
                <th className="px-2 py-2">Cód. Único Prov.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4] bg-white">
              {bulkRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-[#f8fafd]">
                  {BULK_COLUMNS.map((col, colIndex) => {
                    const selectedCell = selectedBulkCells.has(
                      bulkCellKey(rowIndex, col),
                    );
                    return (
                      <td
                        key={col}
                        onMouseDown={(event) =>
                          startBulkCellSelection(event, rowIndex, colIndex)
                        }
                        onMouseEnter={() =>
                          continueBulkCellSelection(rowIndex, colIndex)
                        }
                        onMouseOver={() =>
                          continueBulkCellSelection(rowIndex, colIndex)
                        }
                        className={`py-1 ${col === "name" ? "px-3" : "px-2"} ${col === "unitsPerPackage" ? "text-center" : ""}`}
                      >
                        <input
                          type={col === "unitsPerPackage" ? "number" : "text"}
                          min="1"
                          value={row[col]}
                          placeholder={
                            col === "name" ? "Nombre del producto" :
                            col === "brand" ? "Marca" :
                            col === "code" ? "421000005" :
                            col === "supplier" ? "Proveedor" :
                            col === "category" ? "Categoría" :
                            col === "unitsPerPackage" ? "–" :
                            "Cód. prov."
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setBulkRows((prev) =>
                              prev.map((r, i) => (i === rowIndex ? { ...r, [col]: value } : r)),
                            );
                            setBulkError("");
                          }}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (!text.includes("\t") && !text.includes("\n")) return;
                            e.preventDefault();
                            setBulkRows((prev) => applyBulkPaste(prev, text, rowIndex, colIndex));
                            setBulkError("");
                          }}
                          className={`h-8 w-full rounded-lg border px-2 text-[10.5px] outline-none hover:border-[#dbe4ef] focus:border-[#7da4d3] focus:bg-white ${col === "unitsPerPackage" ? "text-center" : ""} ${
                            selectedCell
                              ? "border-[#0b5bbb] bg-[#dfeafa] shadow-[inset_0_0_0_1px_#0b5bbb]"
                              : "border-transparent bg-transparent"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bulkError && (
          <div className="mx-4 mt-3 rounded-xl bg-[#fce9e8] px-4 py-2.5 text-[11px] font-bold text-[#a43d39]">
            {bulkError}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e9ece9] bg-[#fafbfa] px-4 py-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setBulkRows((prev) => [...prev, ...Array.from({ length: 5 }, emptyBulkRow)])}
              className="h-7 px-3 text-[10px]"
            >
              <Plus size={12} /> 5 filas más
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={selectedBulkCells.size === 0}
              onClick={clearSelectedBulkCells}
              className={
                selectedBulkCells.size === 0
                  ? "h-7 border-[#e1e5ea] bg-[#f1f3f5] px-3 text-[10px] text-[#9aa3ad] opacity-100"
                  : "h-7 px-3 text-[10px]"
              }
            >
              <Trash2 size={12} /> Borrar celdas ({selectedBulkCells.size})
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setBulkRows(blankBulkRows());
                setSelectedBulkCells(new Set());
                setBulkError("");
              }}
              className="h-7 px-3 text-[10px] text-[#9aa3ad]"
            >
              Limpiar
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={reviewBulk}
          >
            Revisar e importar
          </Button>
        </div>
      </section>

      {bulkPending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            aria-label="Cerrar"
            className="absolute inset-0"
            onClick={() => setBulkPending(null)}
          />
          <div className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setBulkPending(null)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Confirmar importación</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              {bulkPending.toImport.length}{" "}
              {bulkPending.toImport.length === 1 ? "producto nuevo" : "productos nuevos"} a importar
            </h2>
            {bulkPending.skipped.length > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-[#62728a]">
                {bulkPending.skipped.length}{" "}
                {bulkPending.skipped.length === 1 ? "producto ya existe" : "productos ya existen"} y{" "}
                {bulkPending.skipped.length === 1 ? "será omitido" : "serán omitidos"}.
              </p>
            )}
            <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-[#e1e8f1]">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-[#edf4fc] font-bold text-[#334b6b]">
                  <tr>
                    <th className="px-3 py-2 w-[40%]">Producto</th>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Proveedor</th>
                    <th className="px-2 py-2">Categoría</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7edf4] bg-white">
                  {bulkPending.toImport.map((p) => (
                    <tr key={p.id} className="text-[10px] text-[#334b6b]">
                      <td className="px-3 py-1.5">
                        <div className="truncate font-semibold">{p.name}</div>
                        <div className="font-normal text-[#8492a5]">{p.brand}</div>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[9.5px]">{p.code}</td>
                      <td className="px-2 py-1.5 text-[#425979]">{p.supplier}</td>
                      <td className="px-2 py-1.5 text-[#425979]">{p.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bulkPending.skipped.length > 0 && (
              <div className="mt-3 rounded-xl bg-[#fef9ec] px-4 py-2.5 text-[11px] font-semibold text-[#8a6a1a]">
                Omitidos (ya existen):{" "}
                {bulkPending.skipped.map((s) => `${s.name} (${s.code})`).join(" · ")}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setBulkPending(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={commitBulk}>
                Confirmar e importar
              </Button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            aria-label="Cerrar"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <form
            onSubmit={submit}
            className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">
              {editingId
                ? "Editar o borrar producto"
                : "Cargar nuevos productos"}
            </div>
            <h2 className="mt-2 text-xl font-black">
              {editingId ? `Editar ${form.code}` : "Nuevo producto"}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["name", "Nombre del producto *", "Descripción comercial"],
                ["code", "Código único *", "421000005"],
                ["supplier", "Proveedor", "Proveedor principal"],
                ["brand", "Marca", "Marca"],
                ["category", "Categoría", "Categoría"],
                ["unitsPerPackage", "Bulto", "Cantidad por bulto"],
                [
                  "supplierCode",
                  "Código único proveedor",
                  "Código del proveedor",
                ],
              ].map(([key, label, placeholder], index) => {
                if (key === "supplier" || key === "category") {
                  return (
                    <ProductOptionPicker
                      key={key}
                      label={label}
                      placeholder={placeholder}
                      value={form[key]}
                      options={(key === "supplier" ? activeSuppliers : activeCategories).map(
                        (option) => option.name,
                      )}
                      type={key}
                      onChange={(value) => setForm({ ...form, [key]: value })}
                    />
                  );
                }

                return (
                  <label
                    key={key}
                    className={`text-[11px] font-extrabold text-[#334b6b] ${index === 0 ? "sm:col-span-2" : ""}`}
                  >
                    {label}
                    <input
                      type={key === "unitsPerPackage" ? "number" : "text"}
                      min="1"
                      readOnly={key === "code" && Boolean(editingId)}
                      value={form[key as keyof typeof form]}
                      onChange={(event) =>
                        setForm({ ...form, [key]: event.target.value })
                      }
                      placeholder={placeholder}
                      className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3] read-only:bg-[#f2f5f9] read-only:text-[#74849a]"
                    />
                  </label>
                );
              })}
            </div>
            {error && (
              <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">
                {error}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <div>
                {editingId && (
                  <Button
                    type="button"
                    variant={
                      products.find((product) => product.id === editingId)?.active
                        ? "danger"
                        : "secondary"
                    }
                    onClick={toggleProductActive}
                  >
                    {products.find((product) => product.id === editingId)?.active
                      ? "Desactivar producto"
                      : "Reactivar producto"}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingId ? "Guardar cambios" : "Cargar producto"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function formatUpdatedAt(value?: string) {
  if (!value) return "Sin dato";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
