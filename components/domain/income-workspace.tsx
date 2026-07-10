"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Download, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type IncomeSummary = {
  columns: number;
  rows: number;
  exists: boolean;
};

type IncomeRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numeric(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowKey(row: IncomeRow) {
  return String(row.__rowIndex ?? row.id ?? "");
}

const clients = [
  "Seleccionar",
  "Todos",
  "santander",
  "credicoop",
  "umiles",
  "syngenta",
  "pampa",
  "producteca",
  "massalin",
  "importados",
  "hsbc",
  "amex",
];
const months = [
  "Seleccionar",
  "Todos",
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

export function IncomeWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<IncomeSummary>({
    columns: 0,
    rows: 0,
    exists: false,
  });
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [search, setSearch] = useState("");
  const [clientCodeSearch, setClientCodeSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("Seleccionar");
  const [monthFilter, setMonthFilter] = useState("Seleccionar");
  const [yearFilter, setYearFilter] = useState("Seleccionar");
  const [deliveryFilter, setDeliveryFilter] = useState("Todos");
  const [pedidoSort, setPedidoSort] = useState<"asc" | "desc">("desc");
  const [lockedOrder, setLockedOrder] = useState<string[] | null>(null);
  const [status, setStatus] = useState(
    "Cargá la base unificada de ingresos. Cada fila ya identifica cliente y código cliente.",
  );

  async function refreshSummary(loadRows = false) {
    const params = new URLSearchParams();
    if (loadRows) {
      if (clientFilter !== "Seleccionar" && clientFilter !== "Todos") {
        params.set("client", clientFilter);
      }
      if (monthFilter !== "Seleccionar" && monthFilter !== "Todos") {
        params.set("month", monthFilter);
      }
      if (yearFilter !== "Seleccionar" && yearFilter !== "Todos") {
        params.set("year", yearFilter);
      }
    } else {
      params.set("summaryOnly", "1");
    }
    const response = await fetch(`/api/local-db/ingresos?${params}`);
    const data = (await response.json()) as {
      summary: IncomeSummary;
      rows: IncomeRow[];
    };
    setSummary(data.summary);
    setRows(loadRows ? data.rows : []);
  }

  useEffect(() => {
    async function loadSummary() {
      const params = new URLSearchParams();
      params.set("summaryOnly", "1");
      const response = await fetch(`/api/local-db/ingresos?${params}`);
      const data = (await response.json()) as {
        summary: IncomeSummary;
        rows: IncomeRow[];
      };
      setSummary(data.summary);
      setRows([]);
    }

    void loadSummary();
  }, []);

  async function upload() {
    if (!file) {
      setStatus("Seleccioná un archivo Excel antes de cargar.");
      return;
    }
    setLoading(true);
    setStatus("Validando estructura y acumulando ingresos...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/local-db/ingresos", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "No pude cargar");
      setStatus(data.message || "Ingresos cargados.");
      setFile(null);
      setLockedOrder(null);
      await refreshSummary(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No pude cargar.");
    } finally {
      setLoading(false);
    }
  }

  async function updateRow(row: IncomeRow) {
    const response = await fetch("/api/local-db/ingresos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rowIndex: Number(row.__rowIndex),
        quantity: text(row["Cantidad"]),
        delivered: text(row["Entregado"]),
      }),
    });
    const data = (await response.json()) as { message?: string };
    setStatus(data.message || "Ingreso actualizado.");
    if (!response.ok) return;
    setLockedOrder(null);
    await refreshSummary(true);
  }

  async function deleteRow(row: IncomeRow) {
    const response = await fetch(
      `/api/local-db/ingresos?rowIndex=${Number(row.__rowIndex)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { message?: string };
    setStatus(data.message || "Ingreso eliminado.");
    if (!response.ok) return;
    setLockedOrder(null);
    await refreshSummary(true);
  }

  function editCell(
    row: IncomeRow,
    field: "Cantidad" | "Entregado",
    value: string,
  ) {
    setRows((current) =>
      current.map((item) =>
        item.__rowIndex === row.__rowIndex ? { ...item, [field]: value } : item,
      ),
    );
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const clientCodeQuery = clientCodeSearch.trim().toLowerCase();
    return rows
      .filter((row) => {
        const pending = numeric(row["Entregado"]) < numeric(row["Cantidad"]);
        if (deliveryFilter === "Con pendiente" && !pending) return false;
        if (deliveryFilter === "Sin pendiente" && pending) return false;
        if (
          clientCodeQuery &&
          !text(row["CÃ³digo Cliente"]).toLowerCase().includes(clientCodeQuery)
        ) {
          return false;
        }
        if (!query) return true;
        return [
          row["Cliente"],
          row["Código Cliente"],
          row["Codigo Cliente"],
          row["Orden de compra"],
          row["Operación"],
          row["Comentarios"],
        ]
          .map((value) => text(value).toLowerCase())
          .some((value) => value.includes(query));
      })
      .sort((left, right) => {
        if (lockedOrder) {
          const order = new Map(lockedOrder.map((key, index) => [key, index]));
          const leftOrder = order.get(rowKey(left)) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder =
            order.get(rowKey(right)) ?? Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        }

        const leftPending =
          numeric(left["Entregado"]) < numeric(left["Cantidad"]);
        const rightPending =
          numeric(right["Entregado"]) < numeric(right["Cantidad"]);
        const pendingOrder = Number(rightPending) - Number(leftPending);
        if (pendingOrder !== 0) return pendingOrder;
        const leftDate =
          numeric(left["AÃ±o pedido"]) * 10000 +
          numeric(left["Mes pedido"]) * 100 +
          numeric(left["DÃ­a pedido"]);
        const rightDate =
          numeric(right["AÃ±o pedido"]) * 10000 +
          numeric(right["Mes pedido"]) * 100 +
          numeric(right["DÃ­a pedido"]);
        return pedidoSort === "asc"
          ? leftDate - rightDate
          : rightDate - leftDate;
      });
  }, [rows, search, clientCodeSearch, deliveryFilter, pedidoSort, lockedOrder]);

  function lockCurrentOrder() {
    setLockedOrder((current) => current ?? filteredRows.map(rowKey));
  }

  async function loadRows() {
    if (
      clientFilter === "Seleccionar" ||
      monthFilter === "Seleccionar" ||
      yearFilter === "Seleccionar"
    ) {
      setStatus(
        "Seleccioná cliente, mes y año. Podés elegir Todos en cualquiera.",
      );
      return;
    }
    setStatus("Cargando ingresos...");
    setLockedOrder(null);
    await refreshSummary(true);
    setStatus("Ingresos cargados.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Ingresos"
        title="Ingresos unificados"
        description="Una única base para todos los clientes. La columna Cliente y Código Cliente queda disponible para impactar stock más adelante."
      />

      <section className="card mb-4 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_170px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Archivo de ingresos
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#e9f1fb] file:px-3 file:py-1.5 file:text-[11px] file:font-black file:text-[#0b5bbb]"
            />
          </label>
          <div className="flex items-end">
            <Button onClick={upload} disabled={loading} className="h-11 w-full">
              <Upload size={15} />
              {loading ? "Cargando..." : "Cargar ingresos"}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3 text-[11px] font-bold text-[#62728a]">
          {status}
        </div>
      </section>

      <section className="card mb-4 grid gap-4 p-5 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-[#62728a]">
            <Database size={13} /> Base unificada
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {summary.exists ? "Creada" : "Pendiente"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase text-[#62728a]">
            Columnas validadas
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {summary.columns}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase text-[#62728a]">
            Filas acumuladas
          </div>
          <div className="mt-2 text-2xl font-black text-[#10233f]">
            {summary.rows}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dbe4ef] px-5 py-4">
          <div>
            <div className="text-xs font-black text-[#10233f]">
              Base unificada de ingresos
            </div>
            <div className="mt-1 text-[10px] text-[#62728a]">
              Mostrando las últimas {rows.length} filas acumuladas. Después esta
              base alimenta stock por cliente y código cliente.
            </div>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente, código u orden..."
            className="h-9 w-full max-w-[280px] rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#0b5bbb]"
          />
        </div>
        <div className="grid gap-3 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-4 md:grid-cols-5">
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Cliente
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            >
              {clients.map((client) => (
                <option
                  key={client}
                  value={client === "Todos" ? "Todos" : client}
                >
                  {client}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Mes pedido
            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            >
              {months.map((month, index) => (
                <option
                  key={month}
                  value={
                    month === "Seleccionar"
                      ? "Seleccionar"
                      : month === "Todos"
                        ? "Todos"
                        : index - 1
                  }
                >
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Año pedido
            <select
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            >
              <option value="Seleccionar">Seleccionar</option>
              <option value="Todos">Todos</option>
              {Array.from(
                { length: 8 },
                (_, index) => currentYear - 5 + index,
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => void loadRows()}
              className="h-9 w-full"
            >
              <Download size={15} /> Cargar ingresos
            </Button>
          </div>
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Entrega
            <select
              value={deliveryFilter}
              onChange={(event) => setDeliveryFilter(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            >
              <option>Todos</option>
              <option>Con pendiente</option>
              <option>Sin pendiente</option>
            </select>
          </label>
        </div>
        <div className="max-h-[calc(100vh-430px)] min-h-[300px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1240px] table-fixed border-separate border-spacing-0 text-left text-[11px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#eaf1df] text-center text-[10px] font-black uppercase text-[#34452f]">
                <th className="w-24 px-3 py-3 text-center">Acciones</th>
                <th className="w-28 px-3 py-3">Cliente</th>
                <th className="w-32 px-3 py-3">Operación</th>
                <th className="w-24 px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      setPedidoSort((current) =>
                        current === "asc" ? "desc" : "asc",
                      )
                    }
                    className="ml-auto block font-black uppercase hover:text-[#0b5bbb]"
                    title="Ordenar por pedido"
                  >
                    Pedido {pedidoSort === "asc" ? "↑" : "↓"}
                  </button>
                </th>
                <th className="w-36 px-3 py-3">Orden compra</th>
                <th className="w-32 px-3 py-2">
                  <div>Código cliente</div>
                  <input
                    value={clientCodeSearch}
                    onChange={(event) =>
                      setClientCodeSearch(event.target.value)
                    }
                    placeholder="Buscar..."
                    className="mt-1 h-6 w-full rounded-md border border-[#b8c8d8] bg-white px-2 text-[9px] font-bold normal-case text-[#10233f] outline-none focus:border-[#0b5bbb]"
                  />
                </th>
                <th className="w-24 px-3 py-3 text-center">Cantidad</th>
                <th className="w-24 px-3 py-3 text-center">Entregado</th>
                <th className="w-36 px-3 py-3">Origen pasaje</th>
                <th className="w-24 px-3 py-3 text-center">Entrega</th>
                <th className="w-52 px-3 py-3">Comentarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e8f1]">
              {filteredRows.map((row, index) => {
                const isPartiallyDelivered =
                  numeric(row["Entregado"]) < numeric(row["Cantidad"]);
                return (
                  <tr
                    key={rowKey(row) || index}
                    className={
                      isPartiallyDelivered
                        ? "bg-[#fff0ef] text-[#7f302d]"
                        : undefined
                    }
                  >
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void updateRow(row)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] text-[#0b5bbb] hover:bg-[#edf4fc]"
                          title="Guardar"
                        >
                          <Save size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRow(row)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-[#f0cfcc] text-[#b7433f] hover:bg-[#fff0ef]"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-bold text-[#10233f]">
                      {text(row["Cliente"])}
                    </td>
                    <td className="px-3 py-2">{text(row["Operación"])}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {text(row["Día pedido"])}/{text(row["Mes pedido"])}/
                      {text(row["Año pedido"])}
                    </td>
                    <td
                      className="truncate px-3 py-2"
                      title={text(row["Orden de compra"])}
                    >
                      {text(row["Orden de compra"]) || "-"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {text(row["Código Cliente"])}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <input
                        value={text(row["Cantidad"])}
                        onFocus={lockCurrentOrder}
                        onChange={(event) =>
                          editCell(row, "Cantidad", event.target.value)
                        }
                        className="h-7 w-full rounded border border-[#cbd9e8] px-2 text-right tabular-nums outline-none focus:border-[#0b5bbb]"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <input
                        value={text(row["Entregado"])}
                        onFocus={lockCurrentOrder}
                        onChange={(event) =>
                          editCell(row, "Entregado", event.target.value)
                        }
                        className="h-7 w-full rounded border border-[#cbd9e8] px-2 text-right tabular-nums outline-none focus:border-[#0b5bbb]"
                      />
                    </td>
                    <td
                      className="truncate px-3 py-2"
                      title={text(row["Origen del pasaje"])}
                    >
                      {text(row["Origen del pasaje"]) || "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {text(row["Día entrega"]) || "-"}/
                      {text(row["Mes entrega"]) || "-"}/
                      {text(row["Año entrega"]) || "-"}
                    </td>
                    <td
                      className="truncate px-3 py-2"
                      title={text(row["Comentarios"])}
                    >
                      {text(row["Comentarios"]) || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
          Mostrando {filteredRows.length} de {rows.length} filas cargadas en la
          vista.
        </div>
      </section>
    </>
  );
}
