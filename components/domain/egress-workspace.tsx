"use client";

import { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

type EgressRow = Record<string, unknown>;

const clients = [
  "Santander",
  "Credicoop",
  "Umiles",
  "Syngenta",
  "Pampa",
  "Producteca",
  "Massalin",
  "Importados",
  "HSBC",
  "Amex",
];

export function EgressWorkspace() {
  const [client, setClient] = useState("Santander");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EgressRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState(
    "Elegí cliente y cargá un Excel con la estructura configurada para ese cliente.",
  );

  async function refreshSummary() {
    const params = new URLSearchParams();
    params.set("client", client);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const response = await fetch(`/api/local-db/egresos?${params}`);
    const data = (await response.json()) as {
      rows: EgressRow[];
    };
    setRows(data.rows);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("client", client);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    async function loadRows() {
      const response = await fetch(`/api/local-db/egresos?${params}`);
      const data = (await response.json()) as {
        rows: EgressRow[];
      };
      setRows(data.rows);
    }

    void loadRows();
  }, [client, from, to]);

  async function upload() {
    if (!file) {
      setStatus("Seleccioná un archivo Excel antes de cargar.");
      return;
    }
    setLoading(true);
    setStatus("Validando estructura y acumulando egresos...");
    try {
      const formData = new FormData();
      formData.append("client", client);
      formData.append("file", file);
      const response = await fetch("/api/local-db/egresos", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "No pude cargar");
      setStatus(data.message || "Egresos cargados.");
      setFile(null);
      await refreshSummary();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No pude cargar.");
    } finally {
      setLoading(false);
    }
  }

  const tableColumns = useMemo(() => {
    const hidden = new Set(["__rowIndex", "__client", "__date"]);
    const ordered = rows.flatMap((row) =>
      Object.keys(row).filter((key) => !hidden.has(key)),
    );
    return Array.from(new Set(ordered)).slice(0, 70);
  }, [rows]);

  function cell(value: unknown) {
    return String(value ?? "").trim() || "-";
  }

  return (
    <>
      <PageHeader
        eyebrow="Egresos"
        title="Egresos por cliente"
        description="Cada cliente conserva su propia base y su propia estructura de columnas. La carga valida el encabezado antes de acumular filas."
      />

      <section className="card mb-4 p-5">
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(280px,1fr)_170px]">
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
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Archivo de egresos
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
              {loading ? "Cargando..." : "Cargar egresos"}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-4 py-3 text-[11px] font-bold text-[#62728a]">
          {status}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[#dbe4ef] px-5 py-4">
          <div className="text-xs font-black text-[#10233f]">
            Consulta de egresos
          </div>
          <div className="mt-1 text-[10px] text-[#62728a]">
            Filtrá por cliente y rango de fechas para revisar la base acumulada.
          </div>
        </div>
        <div className="grid gap-3 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-4 md:grid-cols-3">
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Cliente
            <select
              value={client}
              onChange={(event) => setClient(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            >
              {clients.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Desde
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            />
          </label>
          <label className="text-[10px] font-black uppercase text-[#62728a]">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs normal-case text-[#10233f]"
            />
          </label>
        </div>
        <div className="max-h-[calc(100vh-430px)] min-h-[320px] overflow-auto overscroll-contain bg-white">
          <table className="min-w-[1200px] border-separate border-spacing-0 text-left text-[10px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#eaf1df] text-center font-black text-[#34452f]">
                <th className="w-24 px-3 py-3">Cliente</th>
                <th className="w-24 px-3 py-3">Fecha</th>
                {tableColumns.map((column) => (
                  <th key={column} className="w-32 px-3 py-3">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e8f1]">
              {rows.map((row, index) => (
                <tr key={`${row.__client}-${row.__rowIndex}-${index}`}>
                  <td className="px-3 py-2 font-bold text-[#10233f]">
                    {cell(row.__client)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{cell(row.__date)}</td>
                  {tableColumns.map((column) => (
                    <td
                      key={column}
                      className="max-w-40 truncate px-3 py-2"
                      title={cell(row[column])}
                    >
                      {cell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
          Mostrando {rows.length} egresos de {client}.
        </div>
      </section>
    </>
  );
}
