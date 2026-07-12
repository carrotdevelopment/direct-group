"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  Mail,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type SupplierMailConfig = {
  id: string;
  supplier: string;
  contactName: string;
  email: string;
  active: boolean;
  lastSent: string | null;
};

type PriceRecord = {
  id: string;
  supplier: string;
  uniqueCode: string;
  informedAt: string;
  costDg: number;
  vatRate: number;
  publicPrice: number;
  markup: number;
};

type SendMailResponse = {
  ok: boolean;
  from?: string | null;
  message: string;
};

type PriceOptions = {
  suppliers: string[];
  months: string[];
  years: string[];
};

type ProductRecord = {
  supplier: string;
};

const supplierSeed: SupplierMailConfig[] = [
  {
    id: "supplier-acegame",
    supplier: "ACEGAME",
    contactName: "Contacto comercial",
    email: "precios@acegame.com",
    active: true,
    lastSent: "2026-06-01",
  },
];

const emptySupplierForm = { supplier: "", contactName: "", email: "" };
const emptyPriceForm: Omit<PriceRecord, "id"> = {
  supplier: "",
  uniqueCode: "",
  informedAt: new Date().toISOString().slice(0, 10),
  costDg: 0,
  vatRate: 21,
  publicPrice: 0,
  markup: 0,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function calculateMarkup(costDg: number, vatRate: number, publicPrice: number) {
  if (!costDg || !publicPrice) return 0;
  const netPublicPrice = publicPrice / (1 + vatRate / 100);
  return (
    Math.round(
      (((netPublicPrice - costDg) / costDg) * 100 + Number.EPSILON) * 100,
    ) / 100
  );
}

function withCalculatedMarkup(record: PriceRecord): PriceRecord {
  return {
    ...record,
    markup: calculateMarkup(record.costDg, record.vatRate, record.publicPrice),
  };
}

export function PriceRequestWorkspace() {
  const [suppliers, setSuppliers] =
    useState<SupplierMailConfig[]>(supplierSeed);
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesFetching, setPricesFetching] = useState(false);
  const [priceOptions, setPriceOptions] = useState<PriceOptions>({
    suppliers: [],
    months: [],
    years: [],
  });
  const [productSuppliers, setProductSuppliers] = useState<string[]>([]);
  const [priceResultTotal, setPriceResultTotal] = useState(0);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [supplierError, setSupplierError] = useState("");
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [newPrice, setNewPrice] = useState(emptyPriceForm);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<PriceRecord | null>(null);
  const [query, setQuery] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [uniqueCodeSearch, setUniqueCodeSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [mailStatus, setMailStatus] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [importSupplier, setImportSupplier] = useState("SILVESTRIN");
  const [importMonth, setImportMonth] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [importYear, setImportYear] = useState(
    String(new Date().getFullYear()),
  );
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<PriceRecord[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [importProcessing, setImportProcessing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  useEffect(() => {
    const storedSuppliers = localStorage.getItem("dg-supplier-mail-configs-v2");
    if (storedSuppliers) {
      queueMicrotask(() =>
        setSuppliers(JSON.parse(storedSuppliers) as SupplierMailConfig[]),
      );
    }

    let active = true;
    fetch("/api/local-db/prices?meta=1")
      .then((response) => response.json())
      .then((data: { options?: PriceOptions }) => {
        if (active) {
          setPriceOptions(
            data.options ?? { suppliers: [], months: [], years: [] },
          );
        }
      })
      .catch(() => {
        if (active) setPriceOptions({ suppliers: [], months: [], years: [] });
      })
      .finally(() => {
        if (active) setPricesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/local-db/products")
      .then((response) => response.json())
      .then((data: { products?: ProductRecord[] }) => {
        if (!active) return;
        setProductSuppliers(
          Array.from(
            new Set(
              (data.products ?? [])
                .map((product) => product.supplier?.trim())
                .filter(Boolean),
            ),
          ).sort((left, right) => left.localeCompare(right, "es")),
        );
      })
      .catch(() => {
        if (active) setProductSuppliers([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const allSupplierOptions = useMemo(
    () =>
      Array.from(
        new Set([
          "SILVESTRIN",
          ...productSuppliers,
          ...priceOptions.suppliers,
          ...suppliers.map((supplier) => supplier.supplier),
        ]),
      )
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "es")),
    [priceOptions.suppliers, productSuppliers, suppliers],
  );

  const importSupplierOptions = useMemo(() => {
    const search = importSupplier.trim().toLowerCase();
    if (!search) return allSupplierOptions;
    return allSupplierOptions.filter((supplier) =>
      supplier.toLowerCase().includes(search),
    );
  }, [allSupplierOptions, importSupplier]);

  const filteredPrices = useMemo(() => {
    if (!pricesLoaded) return [];

    return prices
      .filter((record) =>
        record.supplier.toLowerCase().includes(supplierSearch.toLowerCase()),
      )
      .filter((record) =>
        record.uniqueCode
          .toLowerCase()
          .includes(uniqueCodeSearch.toLowerCase()),
      )
      .filter((record) =>
        `${record.supplier} ${record.uniqueCode} ${record.informedAt}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .sort((left, right) => right.informedAt.localeCompare(left.informedAt));
  }, [prices, pricesLoaded, query, supplierSearch, uniqueCodeSearch]);

  const visiblePrices = filteredPrices.slice(0, 1000);

  const canLoadPrices = !pricesLoading && !pricesFetching;

  function persistSuppliers(next: SupplierMailConfig[]) {
    setSuppliers(next);
    localStorage.setItem("dg-supplier-mail-configs-v2", JSON.stringify(next));
  }

  async function persistPrices(next: PriceRecord[]) {
    setPrices(next);
    await fetch("/api/local-db/prices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: next }),
    });
  }

  async function loadPrices() {
    setPricesFetching(true);
    setPricesLoaded(false);
    try {
      const params = new URLSearchParams({
        supplier: selectedSupplier,
        month: selectedMonth,
        year: selectedYear,
      });
      const response = await fetch(`/api/local-db/prices?${params}`);
      const data = (await response.json()) as {
        prices?: PriceRecord[];
        total?: number;
      };
      setPrices(data.prices ?? []);
      setPriceResultTotal(data.total ?? data.prices?.length ?? 0);
      setPricesLoaded(true);
    } finally {
      setPricesFetching(false);
    }
  }

  async function processImportFile() {
    if (!importSupplier.trim() || !importMonth || !importYear || !importFile) {
      setImportStatus("Elegí proveedor, mes, año y archivo.");
      return;
    }

    setImportProcessing(true);
    setImportPreview([]);
    setImportWarnings([]);
    setImportStatus("Procesando archivo...");
    try {
      const formData = new FormData();
      formData.append("supplier", importSupplier.trim());
      formData.append("month", importMonth);
      formData.append("year", importYear);
      formData.append("file", importFile);
      const response = await fetch("/api/local-db/prices/preview", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        prices?: PriceRecord[];
        message?: string;
        warnings?: string[];
      };
      if (!response.ok) {
        throw new Error(data.message || "No pude procesar el archivo.");
      }
      const previewRows = data.prices ?? [];
      setImportPreview(previewRows);
      setImportWarnings(data.warnings ?? []);
      setImportStatus(
        previewRows.length
          ? data.message || "Preview listo."
          : data.message ||
              "No pude armar una tabla para cargar: el formato no está preparado para este proveedor o ningún código existe en Productos DG.",
      );
    } catch (error) {
      setImportStatus(
        error instanceof Error ? error.message : "No pude procesar el archivo.",
      );
    } finally {
      setImportProcessing(false);
    }
  }

  function updateImportPreview(
    id: string,
    field: keyof PriceRecord,
    value: string,
  ) {
    const numericFields: Array<keyof PriceRecord> = [
      "costDg",
      "vatRate",
      "publicPrice",
    ];
    setImportPreview((current) =>
      current.map((record) =>
        record.id === id
          ? withCalculatedMarkup({
              ...record,
              [field]: numericFields.includes(field) ? Number(value) : value,
            })
          : record,
      ),
    );
  }

  async function confirmImportPreview() {
    const validRows = importPreview
      .filter(
        (record) => record.supplier && record.uniqueCode && record.informedAt,
      )
      .map(withCalculatedMarkup);
    if (!validRows.length) {
      setImportStatus("No hay filas válidas para cargar.");
      return;
    }

    setImportSaving(true);
    setImportStatus("Guardando precios...");
    try {
      await fetch("/api/local-db/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: validRows }),
      });
      if (pricesLoaded) {
        setPrices((current) => {
          const merged = new Map(current.map((record) => [record.id, record]));
          for (const record of validRows) merged.set(record.id, record);
          return Array.from(merged.values());
        });
      }
      setPriceOptions((current) => ({
        suppliers: Array.from(
          new Set(
            [...current.suppliers, importSupplier.trim()].filter(Boolean),
          ),
        ).sort((left, right) => left.localeCompare(right, "es")),
        months: Array.from(new Set([...current.months, importMonth])).sort(
          (left, right) => Number(left) - Number(right),
        ),
        years: Array.from(new Set([...current.years, importYear])).sort(
          (left, right) => Number(right) - Number(left),
        ),
      }));
      setImportStatus(`${validRows.length} precios cargados.`);
      setImportPreview([]);
      setImportFile(null);
    } finally {
      setImportSaving(false);
    }
  }

  function openNewSupplier() {
    setEditingSupplierId(null);
    setSupplierForm(emptySupplierForm);
    setSupplierError("");
    setSupplierModalOpen(true);
  }

  function openSupplierEdit(config: SupplierMailConfig) {
    setEditingSupplierId(config.id);
    setSupplierForm({
      supplier: config.supplier,
      contactName: config.contactName,
      email: config.email,
    });
    setSupplierError("");
    setSupplierModalOpen(true);
  }

  function saveSupplier(event: FormEvent) {
    event.preventDefault();
    if (
      !supplierForm.supplier.trim() ||
      !supplierForm.contactName.trim() ||
      !/^\S+@\S+\.\S+$/.test(supplierForm.email)
    ) {
      setSupplierError(
        "Completá proveedor, persona de contacto y un correo válido.",
      );
      return;
    }

    if (editingSupplierId) {
      persistSuppliers(
        suppliers.map((config) =>
          config.id === editingSupplierId
            ? {
                ...config,
                supplier: supplierForm.supplier.trim(),
                contactName: supplierForm.contactName.trim(),
                email: supplierForm.email.trim(),
              }
            : config,
        ),
      );
    } else {
      persistSuppliers([
        ...suppliers,
        {
          id: crypto.randomUUID(),
          supplier: supplierForm.supplier.trim(),
          contactName: supplierForm.contactName.trim(),
          email: supplierForm.email.trim(),
          active: true,
          lastSent: null,
        },
      ]);
    }

    setSupplierModalOpen(false);
  }

  function toggleSupplier(id: string) {
    persistSuppliers(
      suppliers.map((config) =>
        config.id === id ? { ...config, active: !config.active } : config,
      ),
    );
  }

  async function sendTestRequest(config: SupplierMailConfig) {
    setSendingId(config.id);
    setMailStatus(null);

    try {
      const response = await fetch("/api/price-requests/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: config.supplier,
          contactName: config.contactName,
          email: config.email,
        }),
      });
      const data = (await response.json()) as SendMailResponse;
      if (!response.ok || !data.ok) {
        setMailStatus({
          tone: "error",
          text: data.message,
        });
        return;
      }

      persistSuppliers(
        suppliers.map((item) =>
          item.id === config.id ? { ...item, lastSent: todayIso() } : item,
        ),
      );
      setMailStatus({
        tone: "success",
        text: `${data.message} Salió desde ${data.from || "la casilla SMTP configurada"}.`,
      });
    } catch (error) {
      setMailStatus({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el mail de prueba.",
      });
    } finally {
      setSendingId(null);
    }
  }

  function startPriceEdit(record: PriceRecord) {
    setEditingPriceId(record.id);
    setPriceDraft({ ...record });
    setSavedId(null);
  }

  function updatePriceDraft(field: keyof PriceRecord, value: string) {
    if (!priceDraft) return;
    const numericFields: Array<keyof PriceRecord> = [
      "costDg",
      "vatRate",
      "publicPrice",
    ];
    setPriceDraft(
      withCalculatedMarkup({
        ...priceDraft,
        [field]: numericFields.includes(field) ? Number(value) : value,
      }),
    );
  }

  function updatePriceDatePart(part: "day" | "month" | "year", value: string) {
    if (!priceDraft) return;
    const [currentYear, currentMonth, currentDay] =
      priceDraft.informedAt.split("-");
    const nextYear = part === "year" ? value.padStart(4, "0") : currentYear;
    const nextMonth = part === "month" ? value.padStart(2, "0") : currentMonth;
    const nextDay = part === "day" ? value.padStart(2, "0") : currentDay;
    setPriceDraft({
      ...priceDraft,
      informedAt: `${nextYear}-${nextMonth}-${nextDay}`,
    });
  }

  function savePriceEdit() {
    if (!priceDraft) return;
    const nextDraft = withCalculatedMarkup(priceDraft);
    persistPrices(
      prices.map((record) => (record.id === nextDraft.id ? nextDraft : record)),
    );
    setEditingPriceId(null);
    setSavedId(nextDraft.id);
    setPriceDraft(null);
  }

  function addPrice(event: FormEvent) {
    event.preventDefault();
    if (!newPrice.supplier || !newPrice.uniqueCode || !newPrice.informedAt)
      return;
    persistPrices([
      ...prices,
      withCalculatedMarkup({ id: crypto.randomUUID(), ...newPrice }),
    ]);
    setNewPrice(emptyPriceForm);
    setPriceModalOpen(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Precios"
        title="Solicitudes y base de precios"
        description="Configurá a quién se solicita la lista cada día 1 y consultá el historial de precios recibidos y estructurados."
      />

      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#dbe4ef] bg-[#edf4fc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Envío mensual</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">
              Proveedores y destinatarios
            </h2>
            <p className="mt-1 text-[11px] text-[#62728a]">
              El correo mensual se programa para el día 1. El botón de prueba
              envía ahora mismo a la casilla cargada.
            </p>
          </div>
          <Button size="sm" onClick={openNewSupplier}>
            <Plus size={15} /> Nuevo proveedor
          </Button>
        </div>

        <div className="border-b border-[#dbe4ef] bg-white px-3 py-2 text-[11px] font-semibold text-[#62728a]">
          Casilla de salida: se toma del servidor con{" "}
          <span className="font-mono text-[#10233f]">SMTP_FROM</span>. Si no
          está definido, usa{" "}
          <span className="font-mono text-[#10233f]">SMTP_USER</span>.
        </div>

        {mailStatus && (
          <div
            className={`mx-5 mt-4 rounded-xl px-2 py-2 text-xs font-bold ${
              mailStatus.tone === "success"
                ? "bg-[#e7f6ec] text-[#297a45]"
                : "bg-[#fce9e8] text-[#a43d39]"
            }`}
          >
            {mailStatus.text}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-[#dbe4ef] bg-[#f8fafd] font-bold text-[#334b6b]">
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-2 py-2">Persona de contacto</th>
                <th className="px-2 py-2">Correo</th>
                <th className="px-2 py-2 text-center">Frecuencia</th>
                <th className="px-2 py-2 text-center">Último envío</th>
                <th className="px-2 py-2 text-center">Estado</th>
                <th className="px-2 py-2 text-center">Prueba</th>
                <th className="px-2 py-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4]">
              {suppliers.map((config) => (
                <tr key={config.id} className="hover:bg-[#f8fafd]">
                  <td className="px-3 py-2 font-bold text-[#10233f]">
                    {config.supplier}
                  </td>
                  <td className="px-2 py-2 text-[#425979]">
                    {config.contactName}
                  </td>
                  <td className="px-2 py-2 text-[#425979]">
                    <span className="inline-flex items-center gap-2">
                      <Mail size={13} className="text-[#0b5bbb]" />
                      {config.email}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center text-[#425979]">
                    Día 1 mensual
                  </td>
                  <td className="px-2 py-2 text-center text-[#425979]">
                    {formatDate(config.lastSent)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleSupplier(config.id)}
                    >
                      <Badge tone={config.active ? "success" : "neutral"} dot>
                        {config.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Button
                      size="sm"
                      onClick={() => sendTestRequest(config)}
                      disabled={sendingId === config.id}
                      className="h-8 px-3 text-[10px]"
                    >
                      {sendingId === config.id ? (
                        <LoaderCircle size={13} className="animate-spin" />
                      ) : (
                        <Send size={13} />
                      )}
                      Enviar prueba
                    </Button>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openSupplierEdit(config)}
                      className="h-8 px-3 text-[10px]"
                    >
                      <Pencil size={13} /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {suppliers.length === 0 && (
          <div className="px-5 py-12 text-center text-xs text-[#74849a]">
            Todavía no hay proveedores configurados.
          </div>
        )}
      </section>

      <section className="card relative z-10 mb-5 overflow-visible">
        <div className="flex flex-col gap-3 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Importación asistida</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">
              Cargar lista de precios por archivo
            </h2>
            <p className="mt-1 text-[11px] text-[#62728a]">
              Procesá PDF o Excel, revisá la tabla resultante y confirmá recién
              cuando esté todo correcto.
            </p>
          </div>
          <Badge tone={importPreview.length ? "success" : "neutral"} dot>
            {importPreview.length
              ? `${importPreview.length} filas`
              : "Sin preview"}
          </Badge>
        </div>

        <div className="grid gap-3 border-b border-[#e7edf4] p-4 lg:grid-cols-[1fr_120px_120px_minmax(240px,1fr)_auto]">
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
            Proveedor
            <div
              className="relative mt-2"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setSupplierPickerOpen(false);
                }
              }}
            >
              <input
                value={importSupplier}
                onChange={(event) => setImportSupplier(event.target.value)}
                placeholder="Buscar proveedor"
                className="h-10 w-full rounded-xl border border-[#dbe4ef] bg-white py-0 pl-3 pr-10 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
              />
              <button
                type="button"
                onClick={() => setSupplierPickerOpen((open) => !open)}
                className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#62728a] hover:bg-[#edf4fc] hover:text-[#0b5bbb]"
                aria-label="Abrir proveedores"
              >
                <ChevronDown
                  size={16}
                  className={supplierPickerOpen ? "rotate-180" : ""}
                />
              </button>
              {supplierPickerOpen && (
                <div className="absolute left-0 right-0 top-11 z-50 max-h-52 overflow-auto rounded-xl border border-[#dbe4ef] bg-white p-1 shadow-xl">
                  {importSupplierOptions.length > 0 ? (
                    importSupplierOptions.map((supplier) => (
                      <button
                        key={supplier}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setImportSupplier(supplier);
                          setSupplierPickerOpen(false);
                        }}
                        className="block h-8 w-full rounded-lg px-3 text-left text-xs font-bold normal-case tracking-normal text-[#10233f] hover:bg-[#edf4fc]"
                      >
                        {supplier}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11px] font-semibold normal-case tracking-normal text-[#74849a]">
                      Sin coincidencias. Podés escribirlo igual.
                    </div>
                  )}
                </div>
              )}
            </div>
          </label>
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
            Mes
            <select
              value={importMonth}
              onChange={(event) => setImportMonth(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
            >
              {Array.from({ length: 12 }, (_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {index + 1}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
            Año
            <input
              type="number"
              value={importYear}
              onChange={(event) => setImportYear(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
            />
          </label>
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
            Archivo
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.xlsm,.csv"
              onChange={(event) =>
                setImportFile(event.target.files?.[0] ?? null)
              }
              className="mt-2 block h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#e9f1fb] file:px-3 file:py-1 file:text-[10px] file:font-black file:text-[#0b5bbb]"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={processImportFile}
              disabled={importProcessing}
              className="h-10 w-full"
            >
              {importProcessing ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              Procesar
            </Button>
          </div>
        </div>

        {(importStatus || importWarnings.length > 0) && (
          <div className="space-y-2 border-b border-[#e7edf4] px-5 py-3 text-[11px] font-semibold text-[#62728a]">
            {importStatus && <div>{importStatus}</div>}
            {importWarnings.map((warning) => (
              <div
                key={warning}
                className="rounded-xl bg-[#fff7e2] px-3 py-2 text-[#8a6417]"
              >
                {warning}
              </div>
            ))}
          </div>
        )}

        {importPreview.length > 0 && (
          <>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[980px] text-left text-[11px]">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-[#dbe4ef] bg-[#edf4fc] font-bold text-[#334b6b]">
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-2 py-2">Código único</th>
                    <th className="px-2 py-2 text-center">Fecha</th>
                    <th className="px-2 py-2 text-right">Costo DG</th>
                    <th className="px-2 py-2 text-right">IVA %</th>
                    <th className="px-2 py-2 text-right">Precio público</th>
                    <th className="px-2 py-2 text-right">Markup %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7edf4]">
                  {importPreview.map((record) => {
                    const inputClass =
                      "h-7 w-full rounded-md border border-[#b9cce3] bg-white px-2 text-right text-[10px] outline-none focus:border-[#0b5bbb]";
                    return (
                      <tr key={record.id} className="hover:bg-[#f8fafd]">
                        <td className="px-3 py-2">
                          <input
                            value={record.supplier}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "supplier",
                                event.target.value,
                              )
                            }
                            className={`${inputClass} text-left`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={record.uniqueCode}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "uniqueCode",
                                event.target.value,
                              )
                            }
                            className={`${inputClass} text-left font-mono`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={record.informedAt}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "informedAt",
                                event.target.value,
                              )
                            }
                            className="h-7 w-32 rounded-md border border-[#b9cce3] bg-white px-2 text-center text-[10px] outline-none focus:border-[#0b5bbb]"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={record.costDg}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "costDg",
                                event.target.value,
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={record.vatRate}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "vatRate",
                                event.target.value,
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            value={record.publicPrice}
                            onChange={(event) =>
                              updateImportPreview(
                                record.id,
                                "publicPrice",
                                event.target.value,
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="h-7 rounded-md border border-[#dbe4ef] bg-[#f8fafd] px-2 py-1 text-right text-[10px] font-bold text-[#425979]">
                            {formatNumber(record.markup)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#e7edf4] bg-[#f8fafd] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[10px] font-semibold text-[#74849a]">
                Revisá y editá antes de confirmar. La carga se agrega a la base
                histórica de precios.
              </div>
              <Button
                type="button"
                onClick={confirmImportPreview}
                disabled={importSaving}
              >
                {importSaving ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                Confirmar carga
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#dbe4ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Modo consulta</div>
            <h2 className="mt-1 text-base font-black text-[#10233f]">
              Base histórica de precios
            </h2>
            <p className="mt-1 text-[11px] text-[#62728a]">
              Información recibida, estructurada y editable.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPriceModalOpen(true)}
          >
            <Plus size={15} /> Agregar precio manual
          </Button>
        </div>

        <div className="border-b border-[#e7edf4] p-4">
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
              Proveedor
              <select
                value={selectedSupplier}
                onChange={(event) => {
                  setSelectedSupplier(event.target.value);
                  setPricesLoaded(false);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-3 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
              >
                <option value="all">Todos</option>
                {priceOptions.suppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
              Mes
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPricesLoaded(false);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-3 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
              >
                <option value="all">Todos</option>
                {priceOptions.months.map((month) => (
                  <option key={month} value={month}>
                    {Number(month)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-[#62728a]">
              Año
              <select
                value={selectedYear}
                onChange={(event) => {
                  setSelectedYear(event.target.value);
                  setPricesLoaded(false);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-3 text-xs font-semibold normal-case tracking-normal text-[#10233f] outline-none focus:border-[#7da4d3]"
              >
                <option value="all">Todos</option>
                {priceOptions.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              onClick={loadPrices}
              disabled={!canLoadPrices}
              className="mt-5 h-10"
            >
              {pricesFetching ? "Cargando..." : "Cargar precios"}
            </Button>
          </div>
          <div className="relative mt-3 max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a99ad]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proveedor o código único..."
              className="h-10 w-full rounded-xl border border-[#dbe4ef] bg-[#f8fafd] pl-9 pr-3 text-xs outline-none focus:border-[#7da4d3]"
            />
          </div>
        </div>

        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[860px] text-left text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[#dbe4ef] bg-[#edf4fc] font-bold text-[#334b6b]">
                <th className="px-3 py-2">
                  <div>Proveedor</div>
                  <div className="relative mt-1">
                    <Search
                      size={10}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#8a99ad]"
                    />
                    <input
                      value={supplierSearch}
                      onChange={(event) =>
                        setSupplierSearch(event.target.value)
                      }
                      aria-label="Buscar proveedor"
                      className="h-5 w-full rounded border border-[#b8c8d8] bg-white py-0 pl-5 pr-1 text-[10px] font-semibold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th className="px-3 py-2">
                  <div>Código único</div>
                  <div className="relative mt-1">
                    <Search
                      size={10}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#8a99ad]"
                    />
                    <input
                      value={uniqueCodeSearch}
                      onChange={(event) =>
                        setUniqueCodeSearch(event.target.value)
                      }
                      aria-label="Buscar código único"
                      className="h-5 w-full rounded border border-[#b8c8d8] bg-white py-0 pl-5 pr-1 text-[10px] font-semibold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th className="px-2 py-2 text-center">Día</th>
                <th className="px-2 py-2 text-center">Mes</th>
                <th className="px-2 py-2 text-center">Año</th>
                <th className="px-2 py-2 text-right">Costo DG</th>
                <th className="px-2 py-2 text-right">IVA %</th>
                <th className="px-2 py-2 text-right">Precio público</th>
                <th className="px-2 py-2 text-right">Markup %</th>
                <th className="px-2 py-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7edf4]">
              {visiblePrices.map((record, index) => {
                const editing = editingPriceId === record.id && priceDraft;
                const date = (
                  editing ? priceDraft.informedAt : record.informedAt
                ).split("-");
                const inputClass =
                  "h-6 w-full min-w-16 rounded-md border border-[#b9cce3] bg-white px-1.5 text-right text-[10px] outline-none focus:border-[#0b5bbb]";
                const dateInputClass =
                  "h-6 w-11 rounded-md border border-[#b9cce3] bg-white px-1 text-center text-[10px] outline-none focus:border-[#0b5bbb]";

                return (
                  <tr
                    key={`${record.id}-${index}`}
                    className={editing ? "bg-[#edf4fc]" : "hover:bg-[#f8fafd]"}
                  >
                    <td className="px-3 py-2">
                      {editing ? (
                        <input
                          value={priceDraft.supplier}
                          onChange={(event) =>
                            updatePriceDraft("supplier", event.target.value)
                          }
                          className={`${inputClass} text-left`}
                        />
                      ) : (
                        <span className="font-bold text-[#10233f]">
                          {record.supplier}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editing ? (
                        <input
                          value={priceDraft.uniqueCode}
                          onChange={(event) =>
                            updatePriceDraft("uniqueCode", event.target.value)
                          }
                          className={`${inputClass} text-left font-mono`}
                        />
                      ) : (
                        <span className="font-mono text-[#425979]">
                          {record.uniqueCode}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editing ? (
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={Number(date[2])}
                          onChange={(event) =>
                            updatePriceDatePart("day", event.target.value)
                          }
                          className={dateInputClass}
                        />
                      ) : (
                        date[2]
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editing ? (
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={Number(date[1])}
                          onChange={(event) =>
                            updatePriceDatePart("month", event.target.value)
                          }
                          className={dateInputClass}
                        />
                      ) : (
                        date[1]
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editing ? (
                        <input
                          type="number"
                          min="2000"
                          value={Number(date[0])}
                          onChange={(event) =>
                            updatePriceDatePart("year", event.target.value)
                          }
                          className="h-6 w-14 rounded-md border border-[#b9cce3] bg-white px-1 text-center text-[10px] outline-none focus:border-[#0b5bbb]"
                        />
                      ) : (
                        date[0]
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          value={priceDraft.costDg}
                          onChange={(event) =>
                            updatePriceDraft("costDg", event.target.value)
                          }
                          className={inputClass}
                        />
                      ) : (
                        formatNumber(record.costDg)
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={priceDraft.vatRate}
                          onChange={(event) =>
                            updatePriceDraft("vatRate", event.target.value)
                          }
                          className={inputClass}
                        />
                      ) : (
                        formatNumber(record.vatRate)
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <input
                          type="number"
                          value={priceDraft.publicPrice}
                          onChange={(event) =>
                            updatePriceDraft("publicPrice", event.target.value)
                          }
                          className={inputClass}
                        />
                      ) : (
                        formatNumber(record.publicPrice)
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <div className="h-6 rounded-md border border-[#dbe4ef] bg-[#f8fafd] px-1.5 py-1 text-right text-[10px] font-bold text-[#425979]">
                          {formatNumber(priceDraft.markup)}
                        </div>
                      ) : (
                        formatNumber(record.markup)
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {editing ? (
                        <div className="flex justify-center gap-1">
                          <Button size="sm" onClick={savePriceEdit}>
                            <Save size={13} /> Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingPriceId(null);
                              setPriceDraft(null);
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startPriceEdit(record)}
                        >
                          {savedId === record.id ? (
                            <Check size={13} />
                          ) : (
                            <Pencil size={13} />
                          )}
                          {savedId === record.id ? "Guardado" : "Editar"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredPrices.length === 0 && (
          <div className="px-5 py-12 text-center text-xs text-[#74849a]">
            {pricesLoading
              ? "Cargando base de precios..."
              : !pricesLoaded
                ? "Tocá Cargar precios para consultar la base."
                : "No hay precios para mostrar."}
          </div>
        )}
        <div className="border-t border-[#e7edf4] bg-[#f8fafd] px-3 py-2 text-[10px] font-semibold text-[#74849a]">
          {priceResultTotal > visiblePrices.length
            ? `${visiblePrices.length} de ${priceResultTotal} registros de precio`
            : `${visiblePrices.length} registros de precio`}
        </div>
      </section>

      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            className="absolute inset-0"
            aria-label="Cerrar"
            onClick={() => setSupplierModalOpen(false)}
          />
          <form
            onSubmit={saveSupplier}
            className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setSupplierModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Envío mensual</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              {editingSupplierId ? "Editar proveedor" : "Configurar proveedor"}
            </h2>
            <div className="mt-6 grid gap-4">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Proveedor *
                <input
                  value={supplierForm.supplier}
                  onChange={(event) =>
                    setSupplierForm({
                      ...supplierForm,
                      supplier: event.target.value,
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Persona que recibe el correo *
                <input
                  value={supplierForm.contactName}
                  onChange={(event) =>
                    setSupplierForm({
                      ...supplierForm,
                      contactName: event.target.value,
                    })
                  }
                  placeholder="Nombre y apellido"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Correo electrónico *
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(event) =>
                    setSupplierForm({
                      ...supplierForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="persona@proveedor.com"
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#7da4d3]"
                />
              </label>
              <div className="rounded-xl bg-[#edf4fc] px-2 py-2 text-[11px] text-[#425979]">
                Programación fija: día 1 de cada mes. Para probar ahora, usá
                "Enviar prueba" en la tabla.
              </div>
            </div>
            {supplierError && (
              <div className="mt-4 rounded-xl bg-[#fce9e8] px-2 py-2 text-xs font-bold text-[#a43d39]">
                {supplierError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSupplierModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar proveedor</Button>
            </div>
          </form>
        </div>
      )}

      {priceModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <button
            className="absolute inset-0"
            aria-label="Cerrar"
            onClick={() => setPriceModalOpen(false)}
          />
          <form
            onSubmit={addPrice}
            className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setPriceModalOpen(false)}
              className="absolute right-5 top-5 rounded-lg p-2 text-[#74849a] hover:bg-[#edf4fc]"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">Base de precios</div>
            <h2 className="mt-2 text-xl font-black text-[#10233f]">
              Agregar precio manual
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Proveedor *
                <select
                  value={newPrice.supplier}
                  onChange={(event) =>
                    setNewPrice({ ...newPrice, supplier: event.target.value })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
                >
                  <option value="">Seleccionar</option>
                  {allSupplierOptions.map((supplier) => (
                    <option key={supplier}>{supplier}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Código único *
                <input
                  value={newPrice.uniqueCode}
                  onChange={(event) =>
                    setNewPrice({
                      ...newPrice,
                      uniqueCode: event.target.value,
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 font-mono text-xs"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Fecha informada *
                <input
                  type="date"
                  value={newPrice.informedAt}
                  onChange={(event) =>
                    setNewPrice({
                      ...newPrice,
                      informedAt: event.target.value,
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Costo DG
                <input
                  type="number"
                  value={newPrice.costDg}
                  onChange={(event) =>
                    setNewPrice({
                      ...newPrice,
                      costDg: Number(event.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                IVA %
                <input
                  type="number"
                  step="0.01"
                  value={newPrice.vatRate}
                  onChange={(event) =>
                    setNewPrice({
                      ...newPrice,
                      vatRate: Number(event.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Precio público
                <input
                  type="number"
                  value={newPrice.publicPrice}
                  onChange={(event) =>
                    setNewPrice({
                      ...newPrice,
                      publicPrice: Number(event.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] px-3 text-xs"
                />
              </label>
              <label className="text-[11px] font-extrabold text-[#334b6b]">
                Markup %
                <div className="mt-2 flex h-11 w-full items-center justify-end rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-3 text-xs font-bold text-[#425979]">
                  {formatNumber(
                    calculateMarkup(
                      newPrice.costDg,
                      newPrice.vatRate,
                      newPrice.publicPrice,
                    ),
                  )}
                </div>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPriceModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Guardar precio</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
