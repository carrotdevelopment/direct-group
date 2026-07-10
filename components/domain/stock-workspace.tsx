"use client";

import { useMemo, useState } from "react";
import { Download, Search, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type StockRow = {
  id: string;
  clientCode: string;
  uniqueCode: string;
  product: string;
  supplier: string;
  category: string;
  group: string;
  comments: string;
  totalOrder: number;
  physicalIncome: number | null;
  egress: number | null;
  theoreticalStock: number | null;
  realStock: number;
  pendingDeliveries: number | null;
  totalTransactions: number | null;
  firstIncomeDate: string;
  reportedStock: number;
  webAvailable: number;
  adjustment: number;
  validity: number;
  transactionsPerDay: number | null;
  stockDays: number | null;
  requiredStock: number | null;
  surplusShortage: number | null;
  surplusShortageByPackage: number | null;
  finalPurchase: number | null;
  packageSize: number;
  costDgNoVat: number;
  totalCost: number;
  stockValue: number;
  unitProfit: number;
  salePrice: number;
  hasStockData: boolean;
};

const clients = ["Santander"];
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
const today = new Date();
const currentMonthLabel = months[today.getMonth()];
const currentYear = today.getFullYear();

function number(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function optionalNumber(value: number | null) {
  return value === null ? "-" : number(value);
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function packageRound(value: number, packageSize: number) {
  if (!Number.isFinite(value)) return 0;
  if (!packageSize || packageSize <= 1) return Math.ceil(value);
  const rounded = Math.ceil(Math.abs(value) / packageSize) * packageSize;
  return value < 0 ? -rounded : rounded;
}

export function StockWorkspace() {
  const [client, setClient] = useState("Santander");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [status, setStatus] = useState(
    "Elegí cliente y cargá el stock actual.",
  );
  const [loading, setLoading] = useState(false);
  const [clientCodeSearch, setClientCodeSearch] = useState("");
  const [uniqueCodeSearch, setUniqueCodeSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [planningMonths, setPlanningMonths] = useState("2");

  const filteredRows = useMemo(() => {
    const clientCode = clientCodeSearch.trim().toLowerCase();
    const uniqueCode = uniqueCodeSearch.trim().toLowerCase();
    const product = productSearch.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!clientCode || row.clientCode.toLowerCase().includes(clientCode)) &&
        (!uniqueCode || row.uniqueCode.toLowerCase().includes(uniqueCode)) &&
        (!product || row.product.toLowerCase().includes(product)),
    );
  }, [clientCodeSearch, productSearch, rows, uniqueCodeSearch]);

  const totals = useMemo(
    () => ({
      realStock: rows.reduce((sum, row) => sum + row.realStock, 0),
      theoreticalStock: rows.reduce(
        (sum, row) => sum + (row.theoreticalStock ?? 0),
        0,
      ),
      stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      missingData: rows.filter((row) => !row.hasStockData).length,
    }),
    [rows],
  );

  async function loadStock() {
    setLoading(true);
    setStatus("Cargando stock...");
    try {
      const response = await fetch(
        `/api/local-db/stock?client=${encodeURIComponent(
          client,
        )}`,
      );
      const data = (await response.json()) as {
        rows: StockRow[];
        message?: string;
      };
      if (!response.ok) throw new Error(data.message || "No pude cargar");
      setRows(data.rows);
      setStatus(data.message || "Stock cargado.");
    } catch (error) {
      setRows([]);
      setStatus(
        error instanceof Error ? error.message : "No pude cargar el stock.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateReportedStock(id: string, value: string) {
    const nextValue = Number(value);
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              reportedStock: Number.isFinite(nextValue) ? nextValue : 0,
            }
          : row,
      ),
    );
  }

  const sourceCell = "bg-[#f8fafd] px-1.5 py-1 text-[#425979]";
  const numberCell = "px-1.5 py-1 text-right tabular-nums";
  const stickyHeaderCell =
    "sticky top-0 z-40 border-r border-[#c3d0df] bg-[#eaf1df] bg-clip-padding px-1 py-2 text-center";

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Stock actual por cliente"
        description="Vista de stock a hoy, cruzada con ingresos, egresos y costos del mes en curso."
      />

      <section className="card mb-4 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(320px,1fr)_180px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cliente
            <select
              value={client}
              onChange={(event) => setClient(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs"
            >
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={loadStock}
              disabled={loading}
              className="h-11 w-full"
            >
              <Download size={15} />
              {loading ? "Cargando..." : "Cargar stock"}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3 text-[11px] font-bold text-[#62728a]">
          {status}
        </div>
      </section>
      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-[10px] font-black uppercase text-[#62728a]">
            Productos
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {number(rows.length)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-black uppercase text-[#62728a]">
            Stock real
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {number(totals.realStock)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-black uppercase text-[#62728a]">
            Stock teórico
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {number(totals.theoreticalStock)}
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#62728a]">
            <Warehouse size={13} /> Valorizado
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            ${money(totals.stockValue)}
          </div>
        </div>
      </section>

      <section className="card w-full overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-3">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              {client} · Stock actual · {currentMonthLabel} {currentYear}
            </div>
            <div className="mt-1 text-[10px] text-[#62728a]">
              Fórmulas calculadas desde ingresos, egresos y última estructura
              de costos cargada.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase text-[#62728a]">
              Meses stock
              <input
                type="number"
                min="0"
                step="0.5"
                value={planningMonths}
                onChange={(event) => setPlanningMonths(event.target.value)}
                className="h-8 w-20 rounded-lg border border-[#dbe4ef] bg-white px-2 text-right text-xs text-[#10233f] outline-none focus:border-[#0b5bbb]"
              />
            </label>
            <Badge tone="success">Con stock</Badge>
            <Badge tone="warning">{totals.missingData} sin cruce</Badge>
          </div>
        </div>
        <div className="max-h-[calc(100vh-360px)] min-h-[340px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1900px] table-fixed border-separate border-spacing-0 text-left text-[8px]">
            <thead>
              <tr className="border-b border-[#ccd9e8] bg-[#eaf1df] text-center font-black text-[#34452f]">
                <th
                  className={`${stickyHeaderCell} left-0 w-[70px] min-w-[70px] max-w-[70px]`}
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
                  className={`${stickyHeaderCell} left-[70px] w-[90px] min-w-[90px] max-w-[90px]`}
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
                      aria-label="Buscar código Ãºnico"
                      className="h-5 w-full rounded-md border border-[#b8c8d8] bg-white py-0.5 pl-4 pr-1 text-[7px] font-bold text-[#10233f] outline-none focus:border-[#0b5bbb]"
                    />
                  </div>
                </th>
                <th
                  className={`${stickyHeaderCell} left-[160px] w-[180px] min-w-[180px] max-w-[180px] shadow-[8px_0_10px_-7px_rgba(16,35,63,.75)]`}
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
                {[
                  "Proveedor",
                  "Categoría",
                  "Pedido total",
                  "Ingreso físico",
                  "Egreso",
                  "Stock teórico",
                  "Stock real",
                  "Entregas pendientes",
                  "Transacciones tot",
                  "Fecha 1° ingreso",
                  "Stock informado",
                  "Dispone WEB",
                  "Ajuste",
                  "Vigencia",
                  "Trans. por día",
                  "Días stock",
                  "Stock necesario",
                  "Sobra/Falta",
                  "S/F bulto",
                  "Bulto",
                  "Compra final",
                  "Costo DG s/IVA",
                  "Total costo",
                  "Stock valorizado",
                  "Utilidad unitaria",
                  "PV",
                ].map((header, index) => {
                  const manualStockGroup = index >= 10 && index <= 12;
                  const costGroup = index >= 21;
                  const headerTone = manualStockGroup
                    ? "bg-[#fff4d8] text-[#6f5415]"
                    : costGroup
                      ? "bg-[#e6f4eb] text-[#24583a]"
                      : "bg-[#eaf1df]";
                  return (
                  <th
                    key={header}
                    className={`sticky top-0 z-10 w-[74px] px-1 py-2 text-center ${headerTone}`}
                  >
                    {header}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e8f1]">
              {filteredRows.map((row) => {
                const webAvailable =
                  row.reportedStock - (row.totalTransactions ?? 0);
                const adjustment = row.realStock - webAvailable;
                const requiredStock =
                  (row.transactionsPerDay ?? 0) *
                  Number(planningMonths || "0") *
                  30;
                const surplusShortage =
                  (row.theoreticalStock ?? 0) - requiredStock;
                const surplusShortageByPackage = packageRound(
                  surplusShortage,
                  row.packageSize,
                );
                const finalPurchase =
                  surplusShortageByPackage < 0
                    ? Math.abs(surplusShortageByPackage)
                    : 0;
                const rowTone = row.hasStockData
                  ? "bg-white"
                  : "bg-[#fff8df] text-[#7a5b15]";
                const stickyTone = row.hasStockData
                  ? "bg-[#f8fafd] bg-clip-padding"
                  : "bg-[#fff8df] bg-clip-padding";
                return (
                  <tr key={row.id} className={rowTone}>
                    <td
                      className={`sticky left-0 z-30 w-[70px] min-w-[70px] max-w-[70px] truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickyTone}`}
                      title={row.clientCode}
                    >
                      {row.clientCode}
                    </td>
                    <td
                      className={`sticky left-[70px] z-30 w-[90px] min-w-[90px] max-w-[90px] truncate border-r border-[#d6e0ec] px-1.5 py-1 font-mono ${stickyTone}`}
                      title={row.uniqueCode}
                    >
                      {row.uniqueCode}
                    </td>
                    <td
                      className={`sticky left-[160px] z-30 w-[180px] min-w-[180px] max-w-[180px] truncate border-r border-[#c3d0df] px-1.5 py-1 font-medium text-[#334b6b] shadow-[8px_0_10px_-7px_rgba(16,35,63,.75)] ${stickyTone}`}
                      title={row.product}
                    >
                      {row.product}
                    </td>
                    <td className={sourceCell}>{row.supplier}</td>
                    <td className={sourceCell}>{row.category}</td>
                    <td className={numberCell}>{number(row.totalOrder)}</td>
                    <td className={numberCell}>
                      {optionalNumber(row.physicalIncome)}
                    </td>
                    <td className={numberCell}>{optionalNumber(row.egress)}</td>
                    <td className={`${numberCell} font-bold`}>
                      {optionalNumber(row.theoreticalStock)}
                    </td>
                    <td className={`${numberCell} font-bold`}>
                      {number(row.realStock)}
                    </td>
                    <td className={numberCell}>
                      {optionalNumber(row.pendingDeliveries)}
                    </td>
                    <td className={numberCell}>
                      {optionalNumber(row.totalTransactions)}
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      {row.firstIncomeDate || "-"}
                    </td>
                    <td className="bg-[#fff9e8] px-1.5 py-1">
                      <input
                        type="number"
                        value={row.reportedStock}
                        onChange={(event) =>
                          updateReportedStock(row.id, event.target.value)
                        }
                        className="h-6 w-full rounded border border-[#e4c878] bg-white px-1 text-right text-[7.5px] tabular-nums outline-none focus:border-[#b88a00]"
                      />
                    </td>
                    <td className={`${numberCell} bg-[#fff9e8]`}>
                      {number(webAvailable)}
                    </td>
                    <td className={`${numberCell} bg-[#fff9e8]`}>
                      {number(adjustment)}
                    </td>
                    <td className={numberCell}>{number(row.validity)}</td>
                    <td className={numberCell}>
                      {optionalNumber(row.transactionsPerDay)}
                    </td>
                    <td className={numberCell}>
                      {optionalNumber(row.stockDays)}
                    </td>
                    <td className={numberCell}>
                      {number(requiredStock)}
                    </td>
                    <td
                      className={`${numberCell} font-bold ${surplusShortage < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                    >
                      {number(surplusShortage)}
                    </td>
                    <td
                      className={`${numberCell} font-bold ${surplusShortageByPackage < 0 ? "text-[#b7433f]" : "text-[#0b5bbb]"}`}
                    >
                      {number(surplusShortageByPackage)}
                    </td>
                    <td className={numberCell}>{number(row.packageSize)}</td>
                    <td className={numberCell}>
                      {number(finalPurchase)}
                    </td>
                    <td className={`${numberCell} bg-[#eef8f1]`}>
                      {money(row.costDgNoVat)}
                    </td>
                    <td className={`${numberCell} bg-[#eef8f1]`}>
                      {money(row.totalCost)}
                    </td>
                    <td className={`${numberCell} bg-[#eef8f1]`}>
                      {money(row.stockValue)}
                    </td>
                    <td className={`${numberCell} bg-[#eef8f1]`}>
                      {money(row.unitProfit)}
                    </td>
                    <td className={`${numberCell} bg-[#eef8f1]`}>
                      {money(row.salePrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
          Mostrando {filteredRows.length} de {rows.length} productos · Amarillo:
          asignado al mes pero sin cruce en el Excel de stock.
        </div>
      </section>
    </>
  );
}

