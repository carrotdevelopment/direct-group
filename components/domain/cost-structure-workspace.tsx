"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, Save, Search, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type CostRow = {
  id: string;
  active: boolean;
  stock: number;
  date: string;
  clientCode: string;
  uniqueCode: string;
  costDgUpdatedAt: string | null;
  publicPriceUpdatedAt: string | null;
  product: string;
  supplier: string;
  category: string;
  publicPrice: number;
  vatRate: number;
  markup: number;
  costDgNoVat: number;
  freightNoVat: number;
  pvcNoVat: number;
  pvcWithVat: number;
};

type Rates = {
  insurance: number;
  grossIncome: number;
  debitTax: number;
  creditTax: number;
  missionsTax: number;
};

const clients = [
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
const defaultRates: Rates = {
  insurance: 1.2,
  grossIncome: 5,
  debitTax: 0.6,
  creditTax: 0.6,
  missionsTax: 1.25,
};

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function parseMoneyInput(value: string) {
  const normalized = value
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isCostUpdated(row: CostRow, year: string, month: string) {
  const period = `${year}-${month.padStart(2, "0")}`;
  const hasDatedValues =
    row.costDgUpdatedAt?.startsWith(period) === true &&
    row.publicPriceUpdatedAt?.startsWith(period) === true;
  const legacyRow = row as CostRow & { costUpdated?: boolean };
  return (
    hasDatedValues ||
    (legacyRow.costUpdated === true && row.date.startsWith(period))
  );
}

function calculate(row: CostRow, rates: Rates) {
  const ppNoVat = row.publicPrice / (1 + row.vatRate / 100);
  const insurance = (row.costDgNoVat * rates.insurance) / 100;
  const grossIncome = (row.pvcNoVat * rates.grossIncome) / 100;
  const debitTax = (row.pvcNoVat * rates.debitTax) / 100;
  const creditTax = (row.pvcNoVat * rates.creditTax) / 100;
  const missionsTax = (row.pvcNoVat * rates.missionsTax) / 100;
  const totalCost =
    row.costDgNoVat +
    insurance +
    grossIncome +
    debitTax +
    creditTax +
    row.freightNoVat +
    missionsTax;
  const profit = row.pvcNoVat - totalCost;
  const profitPercentage = totalCost === 0 ? 0 : (profit / totalCost) * 100;
  return {
    ppNoVat,
    insurance,
    grossIncome,
    debitTax,
    creditTax,
    missionsTax,
    totalCost,
    profit,
    profitPercentage,
  };
}

export function CostStructureWorkspace() {
  const [client, setClient] = useState("Santander");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));
  const [structures, setStructures] = useState<Record<string, CostRow[]>>({});
  const [ratesByPeriod, setRatesByPeriod] = useState<Record<string, Rates>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientCodeSearch, setClientCodeSearch] = useState("");
  const [uniqueCodeSearch, setUniqueCodeSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [status, setStatus] = useState(
    "Elegí cliente, mes y año y cargá la estructura.",
  );

  useEffect(() => {
    const storedStructures = localStorage.getItem("dg-cost-structures-v1");
    const storedRates = localStorage.getItem("dg-cost-rates-v1");
    if (storedStructures)
      queueMicrotask(() =>
        setStructures(
          JSON.parse(storedStructures) as Record<string, CostRow[]>,
        ),
      );
    if (storedRates)
      queueMicrotask(() =>
        setRatesByPeriod(JSON.parse(storedRates) as Record<string, Rates>),
      );
  }, []);

  const periodKey = `${client}|${year}-${month.padStart(2, "0")}`;
  const rows = useMemo(
    () => structures[periodKey] ?? [],
    [periodKey, structures],
  );
  const rates = ratesByPeriod[periodKey] ?? defaultRates;
  const activeProductsCount = rows.filter((row) => row.active).length;
  const filteredRows = useMemo(() => {
    const clientCode = clientCodeSearch.trim().toLowerCase();
    const uniqueCode = uniqueCodeSearch.trim().toLowerCase();
    const product = productSearch.trim().toLowerCase();
    if (!clientCode && !uniqueCode && !product) return rows;
    return rows.filter(
      (row) =>
        (!clientCode || row.clientCode.toLowerCase().includes(clientCode)) &&
        (!uniqueCode || row.uniqueCode.toLowerCase().includes(uniqueCode)) &&
        (!product || row.product.toLowerCase().includes(product)),
    );
  }, [clientCodeSearch, productSearch, rows, uniqueCodeSearch]);

  async function loadStructure() {
    setLoading(true);
    setSaved(false);
    setStatus("Cargando estructura...");
    try {
      const response = await fetch(
        `/api/local-db/cost-structures?client=${encodeURIComponent(
          client,
        )}&month=${month}&year=${year}`,
      );
      const data = (await response.json()) as {
        rows: CostRow[];
        message?: string;
      };
      if (!response.ok) throw new Error(data.message || "No pude cargar");
      setStructures((current) => ({ ...current, [periodKey]: data.rows }));
      setStatus(data.message || "Estructura cargada.");
    } catch (error) {
      setStructures((current) => ({ ...current, [periodKey]: [] }));
      setStatus(
        error instanceof Error
          ? error.message
          : "No pude cargar la estructura.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateRow(
    id: string,
    field: "freightNoVat" | "pvcNoVat" | "pvcWithVat",
    value: string,
  ) {
    const nextValue =
      field === "freightNoVat" ? Number(value) : parseMoneyInput(value);
    const nextRows = rows.map((row) =>
      row.id === id ? { ...row, [field]: nextValue } : row,
    );
    setStructures((current) => ({ ...current, [periodKey]: nextRows }));
    setSaved(false);
  }

  function updateRate(field: keyof Rates, value: string) {
    setRatesByPeriod((current) => ({
      ...current,
      [periodKey]: { ...rates, [field]: Number(value) },
    }));
    setSaved(false);
  }

  async function saveStructure() {
    const finalStructures = { ...structures, [periodKey]: rows };
    const finalRates = { ...ratesByPeriod, [periodKey]: rates };
    setStructures(finalStructures);
    setRatesByPeriod(finalRates);
    localStorage.setItem(
      "dg-cost-structures-v1",
      JSON.stringify(finalStructures),
    );
    localStorage.setItem("dg-cost-rates-v1", JSON.stringify(finalRates));
    try {
      const response = await fetch("/api/local-db/cost-structures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client,
          month: Number(month),
          year: Number(year),
          rates,
          rows,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "No pude guardar");
      setStatus(data.message || "Versión final guardada.");
      setSaved(true);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "No pude guardar la versión final.",
      );
      setSaved(false);
    }
  }

  const numberInput =
    "h-6 w-full min-w-10 rounded border border-[#b9cce3] bg-white px-1 text-right text-[7.5px] tabular-nums outline-none focus:border-[#0b5bbb] focus:ring-2 focus:ring-[#dce9f8]";
  const formulaCell =
    "whitespace-nowrap bg-[#f3f7fc] px-1.5 py-1 text-right tabular-nums text-[#334b6b]";
  const sourceCell = "bg-[#f8fafd] px-1.5 py-1 text-[#425979]";
  const stickyHeaderCell =
    "sticky top-0 z-40 border-r border-[#c3d0df] bg-[#eaf1df] bg-clip-padding px-1 py-2 text-center";

  return (
    <>
      <PageHeader
        eyebrow="Estructura de costos"
        title="Estructura mensual por cliente"
        description="Generá la versión final de costos y precios por período. Los porcentajes y valores manuales quedan guardados para cada cliente y mes."
      />

      <section className="card mb-4 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(320px,1fr)_150px_120px_170px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(event) => {
                setClient(event.target.value);
                setSaved(false);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Mes
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setSaved(false);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
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
              onChange={(event) => {
                setYear(event.target.value);
                setSaved(false);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
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
              variant="secondary"
              onClick={loadStructure}
              disabled={loading}
              className="h-11 w-full"
            >
              {loading ? "Cargando..." : "Cargar estructura"}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3 text-[11px] font-bold text-[#62728a]">
          {status} · Productos vigentes:{" "}
          <span className="text-[#10233f]">{activeProductsCount}</span>
        </div>
      </section>

      <section className="card w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dbe4ef] px-5 py-3">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              {client} · {months[Number(month) - 1]} {year}
            </div>
            <div className="mt-1 text-[10px] text-[#62728a]">
              Vigentes primero; no vigentes con stock resaltados al final.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="success">Vigente</Badge>
            <Badge tone="danger">No vigente con stock</Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="h-9"
            >
              <Settings2 size={15} /> Porcentajes{" "}
              <ChevronDown
                size={14}
                className={settingsOpen ? "rotate-180" : ""}
              />
            </Button>
            <Button
              onClick={saveStructure}
              disabled={rows.length === 0 || loading}
              size="sm"
              className="h-9"
            >
              <Save size={15} /> {saved ? "Guardado" : "Guardar versión final"}
            </Button>
          </div>
        </div>
        {settingsOpen && (
          <div className="border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-black text-[#10233f]">
              <Calculator size={15} className="text-[#0b5bbb]" /> Porcentajes
              guardados para {client} · {months[Number(month) - 1]} {year}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  { key: "insurance", label: "Seguro %" },
                  { key: "grossIncome", label: "Ing. Brutos %" },
                  { key: "debitTax", label: "Imp. Débito %" },
                  { key: "creditTax", label: "Imp. Crédito %" },
                  { key: "missionsTax", label: "Imp. Misiones %" },
                ] as Array<{ key: keyof Rates; label: string }>
              ).map((item) => (
                <label
                  key={item.key}
                  className="text-[10px] font-bold text-[#425979]"
                >
                  {item.label}
                  <input
                    type="number"
                    step="0.01"
                    value={rates[item.key]}
                    onChange={(event) =>
                      updateRate(item.key, event.target.value)
                    }
                    className="mt-1 h-8 w-full rounded-lg border border-[#cbd9e8] bg-white px-3 text-right text-xs outline-none focus:border-[#0b5bbb]"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="max-h-[calc(100vh-330px)] min-h-[340px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1720px] table-fixed border-separate border-spacing-0 text-left text-[8px]">
            <thead>
              <tr className="border-b border-[#ccd9e8] bg-[#eaf1df] text-center font-black text-[#34452f]">
                <th
                  className={`${stickyHeaderCell} left-0 w-[58px] min-w-[58px] max-w-[58px]`}
                >
                  Fecha
                </th>
                <th
                  className={`${stickyHeaderCell} left-[58px] w-[64px] min-w-[64px] max-w-[64px]`}
                >
                  <div>Código</div>
                  <div className="relative mt-1">
                    <Search
                      size={9}
                      className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]"
                    />
                    <input
                      value={clientCodeSearch}
                      onChange={(event) =>
                        setClientCodeSearch(event.target.value)
                      }
                      aria-label="Buscar código cliente"
                      className="h-5 w-full rounded-md border border-[#b8c8d8] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th
                  className={`${stickyHeaderCell} left-[122px] w-[72px] min-w-[72px] max-w-[72px]`}
                >
                  <div>Código único</div>
                  <div className="relative mt-1">
                    <Search
                      size={9}
                      className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#7b8da6]"
                    />
                    <input
                      value={uniqueCodeSearch}
                      onChange={(event) =>
                        setUniqueCodeSearch(event.target.value)
                      }
                      aria-label="Buscar código único"
                      className="h-5 w-full rounded-md border border-[#b8c8d8] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th
                  className={`${stickyHeaderCell} left-[194px] w-[140px] min-w-[140px] max-w-[140px] shadow-[8px_0_10px_-7px_rgba(16,35,63,.75)]`}
                >
                  <div>Producto</div>
                  <div className="relative mt-1">
                    <Search
                      size={10}
                      className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[#7b8da6]"
                    />
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      aria-label="Buscar producto"
                      className="h-5 w-full rounded-md border border-[#b8c8d8] bg-white py-0.5 pl-5 pr-1 text-[7.5px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th className="sticky top-0 z-10 w-20 bg-[#eaf1df] px-1 py-2">
                  Proveedor
                </th>
                <th className="sticky top-0 z-10 w-20 bg-[#eaf1df] px-1 py-2">
                  Categoría
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Precio público
                </th>
                <th className="sticky top-0 z-10 w-10 bg-[#eaf1df] px-1 py-2 text-center">
                  IVA %
                </th>
                <th className="sticky top-0 z-10 w-14 bg-[#eaf1df] px-1 py-2 text-center">
                  Mark Up %
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  PP s/IVA
                </th>
                <th className="sticky top-0 z-10 w-20 bg-[#eaf1df] px-1 py-2 text-center">
                  Costo DG sin IVA
                </th>
                <th className="sticky top-0 z-10 w-14 bg-[#eaf1df] px-1 py-2 text-center">
                  Actualizado
                </th>
                <th className="sticky top-0 z-10 w-14 bg-[#eaf1df] px-1 py-2 text-center">
                  Seguro
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Ing. Brutos
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Imp. Débito
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Imp. Crédito
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Flete s/IVA
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Costo total
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#f7e1df] px-1 py-2 text-center">
                  PVC sin IVA
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#f7e1df] px-1 py-2 text-center">
                  PVC con IVA
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Utilidad
                </th>
                <th className="sticky top-0 z-10 w-10 bg-[#eaf1df] px-1 py-2 text-center">
                  %
                </th>
                <th className="sticky top-0 z-10 w-[72px] bg-[#eaf1df] px-1 py-2 text-center">
                  Imp. Misiones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e8f1]">
              {filteredRows.map((row) => {
                const calc = calculate(row, rates);
                const rowTone = row.active
                  ? "bg-white"
                  : "bg-[#fff0ef] text-[#8d302d]";
                const stickySourceTone = row.active
                  ? "bg-[#f8fafd] bg-clip-padding"
                  : "bg-[#fff0ef] bg-clip-padding";
                const updatedForPeriod = isCostUpdated(row, year, month);
                return (
                  <tr key={row.id} className={rowTone}>
                    <td
                      className={`sticky left-0 z-30 w-[58px] min-w-[58px] max-w-[58px] border-r border-[#d6e0ec] px-1.5 py-1 font-medium tabular-nums ${stickySourceTone}`}
                    >
                      {displayDate(row.date)}
                    </td>
                    <td
                      className={`sticky left-[58px] z-30 w-[64px] min-w-[64px] max-w-[64px] truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickySourceTone}`}
                      title={row.clientCode}
                    >
                      {row.clientCode || "—"}
                    </td>
                    <td
                      className={`sticky left-[122px] z-30 w-[72px] min-w-[72px] max-w-[72px] truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickySourceTone}`}
                      title={row.uniqueCode}
                    >
                      {row.uniqueCode}
                    </td>
                    <td
                      className={`sticky left-[194px] z-30 w-[140px] min-w-[140px] max-w-[140px] truncate border-r border-[#c3d0df] px-1.5 py-1 font-medium text-[#334b6b] shadow-[8px_0_10px_-7px_rgba(16,35,63,.75)] ${stickySourceTone}`}
                      title={row.product}
                    >
                      {row.product}
                    </td>
                    <td className={sourceCell}>{row.supplier}</td>
                    <td className={sourceCell}>{row.category}</td>
                    <td className={`${sourceCell} text-right tabular-nums`}>
                      {money(row.publicPrice)}
                    </td>
                    <td className={`${sourceCell} text-right tabular-nums`}>
                      {money(row.vatRate)}%
                    </td>
                    <td className={`${sourceCell} text-right tabular-nums`}>
                      {money(row.markup)}%
                    </td>
                    <td className={formulaCell}>{money(calc.ppNoVat)}</td>
                    <td className={`${sourceCell} text-right tabular-nums`}>
                      {money(row.costDgNoVat)}
                    </td>
                    <td className={`${sourceCell} text-center`}>
                      <Badge tone={updatedForPeriod ? "success" : "warning"}>
                        {updatedForPeriod ? "Sí" : "No"}
                      </Badge>
                    </td>
                    <td className={formulaCell}>{money(calc.insurance)}</td>
                    <td className={formulaCell}>{money(calc.grossIncome)}</td>
                    <td className={formulaCell}>{money(calc.debitTax)}</td>
                    <td className={formulaCell}>{money(calc.creditTax)}</td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        value={row.freightNoVat}
                        onChange={(event) =>
                          updateRow(row.id, "freightNoVat", event.target.value)
                        }
                        className={numberInput}
                      />
                    </td>
                    <td className={`${formulaCell} font-bold`}>
                      {money(calc.totalCost)}
                    </td>
                    <td className="bg-[#fff2f0] px-1.5 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={money(row.pvcNoVat)}
                        onChange={(event) =>
                          updateRow(row.id, "pvcNoVat", event.target.value)
                        }
                        className={numberInput}
                      />
                    </td>
                    <td className="bg-[#fff2f0] px-1.5 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={money(row.pvcWithVat)}
                        onChange={(event) =>
                          updateRow(row.id, "pvcWithVat", event.target.value)
                        }
                        className={numberInput}
                      />
                    </td>
                    <td
                      className={`${formulaCell} font-bold ${calc.profit < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                    >
                      {money(calc.profit)}
                    </td>
                    <td
                      className={`${formulaCell} font-bold ${calc.profitPercentage < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                    >
                      {money(calc.profitPercentage)}%
                    </td>
                    <td className={formulaCell}>{money(calc.missionsTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
          Mostrando {filteredRows.length} de {rows.length} productos · Datos
          grises: información de origen, no editable · Campos blancos y rosados:
          Flete y PVC editables · Campos celestes: fórmulas automáticas.
        </div>
      </section>
    </>
  );
}


