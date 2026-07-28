"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Columns3, Layers, Pencil, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import rawSantanderLotes from "@/lib/santander-lotes.json";

// ── Types ────────────────────────────────────────────────────────────────────

type TipoEgreso = "PASAJE" | "ROBO_AJUSTE" | "CAMBIO" | "REENVIO" | "CANJE";
type Fila = Record<string, string>;
type Lote = { id: string; tipo: TipoEgreso; cliente: string; fecha: string; filas: Fila[] };
type SortDir = "asc" | "desc";
type ColDef = { key: string; label: string; required?: boolean; type?: "date" | "number" };
type FieldMapping = { fechaDia: string; fechaMes: string; fechaAno: string; codigo: string; desc: string; cant: string };
type ColConfig = { columnas: string[]; filaInicio: number; mapping: FieldMapping };
type ClienteConfig = { nombre: string; configurado: boolean; canje: ColConfig };
type GridRow = { _id: string } & Record<string, string>;

// ── Standard op columns ───────────────────────────────────────────────────────

const BASE_COLS: ColDef[] = [
  { key: "fecha",          label: "Fecha",          required: true, type: "date"   },
  { key: "codigo_cliente", label: "Código Cliente",  required: true                },
  { key: "producto",       label: "Producto",        required: true                },
  { key: "cantidad",       label: "Cantidad",        required: true, type: "number" },
  { key: "comentarios",    label: "Comentarios",     required: true                },
];
const PASAJE_COLS: ColDef[] = [
  { key: "fecha",          label: "Fecha",          required: true, type: "date"   },
  { key: "codigo_cliente", label: "Código Cliente",  required: true                },
  { key: "producto",       label: "Producto",        required: true                },
  { key: "cantidad",       label: "Cantidad",        required: true, type: "number" },
  { key: "destino",        label: "Destino",         required: true                },
  { key: "comentarios",    label: "Comentarios",     required: true                },
];
const STD_COLS: Record<Exclude<TipoEgreso, "CANJE">, ColDef[]> = {
  PASAJE: PASAJE_COLS, ROBO_AJUSTE: BASE_COLS, CAMBIO: BASE_COLS, REENVIO: BASE_COLS,
};

// ── Configs ───────────────────────────────────────────────────────────────────

const DEFAULT_MAPPING: FieldMapping = { fechaDia: "", fechaMes: "", fechaAno: "", codigo: "", desc: "", cant: "" };

const INITIAL_CONFIGS: ClienteConfig[] = [
  { nombre: "Santander", configurado: true, canje: {
      filaInicio: 2,
      columnas: ["Dia","Mes","Año","Nro guia","Fecha","ID","SKU","Localidad","Provincia","CP","Cantidad","Destino","Comentario"],
      mapping: { fechaDia: "Dia", fechaMes: "Mes", fechaAno: "Año", codigo: "SKU", desc: "ID", cant: "Cantidad" },
  }},
  { nombre: "Credicoop", configurado: true, canje: {
      filaInicio: 2,
      columnas: ["Día","Mes","Año","IdRedencion","Apellido_nombre","Domicilio","Codigo_postal","Localidad","Provincia","IdRecompensa","Estado","Puntos","Fecha","Descripcion","Telefono1","Telefono2","Cantidad"],
      mapping: { fechaDia: "Día", fechaMes: "Mes", fechaAno: "Año", codigo: "IdRedencion", desc: "Apellido_nombre", cant: "Cantidad" },
  }},
  { nombre: "Producteca", configurado: true, canje: {
      filaInicio: 2,
      columnas: ["Dia","Mes","Año","Nro Pedido","Id Venta del Canal","Cliente","Estado del Pedido","Estado de Pago","Estado de Entrega","Nro de Guía","Notas Pedido","Artículo","Código","SKU","Marca","Color","Talle","Cantidad","Moneda","Precio","Monto","Costo de Envío Discriminado","Canal","Depósito","Medio de Pago","Metodo de Pago","Id Pago MercadoPago","Persona de Contacto","Email","Teléfono","CUIT/DNI","Lista de Precios","Dirección","Provincia","Localidad","Código Postal","Barrio","Notas Contacto","Tipo de documento","Nº de documento","Dirección de facturación","Comentarios","Código Postal","Localidad","Provincia","Razón social","Registro estatal","Condición ante el IVA","Nombre del comprador","Apellido del comprador","Tags","Id factura","Recibe","Medio de envío","Nro de Envío","Id alternativo","Nº de carrito","Notas de envío","Modalidad de envío"],
      mapping: { fechaDia: "Dia", fechaMes: "Mes", fechaAno: "Año", codigo: "SKU", desc: "Artículo", cant: "Cantidad" },
  }},
  ...["Umiles","Syngenta","Pampa","Massalin","HSBC","Amex"].map((n): ClienteConfig => ({
    nombre: n, configurado: false, canje: { columnas: [], filaInicio: 2, mapping: { ...DEFAULT_MAPPING } },
  })),
];

const TIPO_LABELS: Record<TipoEgreso, string> = {
  PASAJE: "Pasaje", ROBO_AJUSTE: "Robo / Ajuste", CAMBIO: "Cambio", REENVIO: "Reenvío", CANJE: "Canje",
};
const TIPO_COLORS: Record<TipoEgreso, string> = {
  PASAJE:      "bg-[#e8f0fd] text-[#2557d4]",
  ROBO_AJUSTE: "bg-[#fdf0e8] text-[#c0520e]",
  CAMBIO:      "bg-[#f0e8fd] text-[#7c2dd4]",
  REENVIO:     "bg-[#e8fdf0] text-[#1a8a4a]",
  CANJE:       "bg-[#fde8f0] text-[#d42579]",
};
const ALL_TIPOS = ["CANJE","PASAJE","ROBO_AJUSTE","CAMBIO","REENVIO"] as TipoEgreso[];
const TIPOS_STD  = ["PASAJE","ROBO_AJUSTE","CAMBIO","REENVIO"] as const;
const TODAY      = new Date().toISOString().slice(0, 10);
const THIS_MONTH_START = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; })();

const MOCK_VALID_CODES = new Set([
  "DIR116","DIR174","DIR023","DIR027","DIR154","DIR181","DIR156","DIR201",
  "DG-4421","DG-4422","DG-4423","DG-3310","DIR183","DIR310","DIR007","DIR008",
  "DIR013","DIR014","DIR040","DIR233",
]);

// ── Real Santander data ───────────────────────────────────────────────────────

const SANTANDER_LOTES: Lote[] = (
  rawSantanderLotes as Array<{ id: string; tipo: string; cliente: string; fecha: string; filas: Record<string, string>[] }>
).map((l) => ({ ...l, tipo: l.tipo as TipoEgreso }));

// ── Utils ─────────────────────────────────────────────────────────────────────

function parseTSV(text: string, cols: string[]): Fila[] {
  return text.trim().split("\n").filter((l) => l.trim()).map((line) => {
    const row: Fila = {};
    line.split("\t").forEach((cell, i) => { if (cols[i]) row[cols[i]] = cell.trim(); });
    return row;
  });
}

async function readExcel(file: File, sheetIdx: number, startRow: number, cols: string[]) {
  const XLSX = await import("xlsx");
  const wb   = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[sheetIdx] ?? wb.SheetNames[0]];
  const all  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as string[][];
  const filas = all.slice(startRow).filter((r) => r.some((c) => String(c).trim())).map((cells) => {
    const row: Fila = {};
    cols.forEach((c, i) => { row[c] = String(cells[i] ?? "").trim(); });
    return row;
  });
  return { filas, sheets: wb.SheetNames };
}

function deriveDisplay(fila: Fila, cfg: ClienteConfig) {
  const m = cfg.canje.mapping;

  // Date from mapped day/month/year columns, then fallback to generic keys
  const dia = (m.fechaDia ? fila[m.fechaDia] : null) ?? fila["Día"] ?? fila["Dia"] ?? "";
  const mes = (m.fechaMes ? fila[m.fechaMes] : null) ?? fila["Mes"] ?? "";
  const ano = (m.fechaAno ? fila[m.fechaAno] : null) ?? fila["Año"] ?? "";
  const fechaFromParts = (dia && mes && ano)
    ? `${ano.length === 2 ? "20" + ano : ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`
    : "";
  const fecha = fechaFromParts || fila["Fecha"] || fila.fecha || "";

  // Fallbacks handle both mapped imports and manually-entered "otras operaciones" rows
  const codigo = (m.codigo ? fila[m.codigo] : null) ?? fila.codigo_cliente ?? fila["SKU"] ?? "";
  const desc   = (m.desc   ? fila[m.desc]   : null) ?? fila.producto ?? fila["Artículo"] ?? fila["Descripcion"] ?? fila["Apellido_nombre"] ?? "";
  const cant   = (m.cant   ? fila[m.cant]   : null) ?? fila.cantidad ?? fila["Cantidad"] ?? "";

  return { fecha, codigo, desc, cant };
}

// Converts a generic GridRow (from CargaOtrasOp) to the client's native field names
function toFila(row: GridRow, mapping: FieldMapping): Fila {
  const fila: Fila = {};
  const { _id, fecha, codigo_cliente, producto, cantidad, destino, comentarios } = row;

  // Date: split into day/month/year using mapped column names
  if (fecha) {
    const [ano, mes, dia] = fecha.split("-");
    fila[mapping.fechaDia || "Dia"] = String(parseInt(dia, 10));
    fila[mapping.fechaMes || "Mes"] = String(parseInt(mes, 10));
    fila[mapping.fechaAno || "Año"] = ano;
  }

  if (codigo_cliente) fila[mapping.codigo || "codigo_cliente"] = codigo_cliente;
  if (producto)       fila[mapping.desc   || "producto"]       = producto;
  if (cantidad)       fila[mapping.cant   || "cantidad"]       = cantidad;
  if (destino)        fila.destino                             = destino;
  if (comentarios)    fila.comentarios                         = comentarios;

  return fila;
}

function emptyGridRow(cols: ColDef[], id: string, fillFecha = false): GridRow {
  return { _id: id, ...Object.fromEntries(cols.map((c) => [c.key, c.key === "fecha" && fillFecha ? TODAY : ""])) };
}

function validateRow(row: GridRow, cols: ColDef[]): { missing: boolean; invalidCode: boolean } {
  const missing     = cols.filter((c) => c.required && c.key !== "fecha").some((c) => !row[c.key]?.trim());
  const code        = row.codigo_cliente?.trim();
  const invalidCode = !!code && !MOCK_VALID_CODES.has(code);
  return { missing, invalidCode };
}

// ── Other client mock lotes ───────────────────────────────────────────────────

const OTHER_MOCK_LOTES: Lote[] = [
  { id: "m1", tipo: "CANJE", cliente: "Credicoop", fecha: "2026-07-10",
    filas: Array.from({ length: 38 }, (_, i) => ({ "Día":"10","Mes":"7","Año":"2026","IdRedencion":`R${3000+i}`,"Apellido_nombre":`Cliente ${i}`,"Domicilio":"Av. Siempreviva 742","Cantidad":"1","Localidad":"CABA" })) },
  { id: "m2", tipo: "PASAJE", cliente: "Producteca", fecha: "2026-07-08",
    filas: [
      { fecha:"2026-07-08", codigo_cliente:"DG-4421", producto:"Arrocera Hudson", cantidad:"1", destino:"Corrientes", comentarios:"" },
      { fecha:"2026-07-08", codigo_cliente:"DG-4422", producto:"Waflera B&D",     cantidad:"2", destino:"Corrientes", comentarios:"" },
    ] },
  { id: "m3", tipo: "CANJE", cliente: "Producteca", fecha: "2026-06-28",
    filas: Array.from({ length: 61 }, (_, i) => ({ "Dia":"28","Mes":"6","Año":"2026","Nro Pedido":`PD${4000+i}`,"SKU":`DIR${200+i}`,"Cantidad":"1","Estado del Pedido":"Procesado" })) },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const L = "text-[10px] font-black uppercase tracking-wide text-[#62728a]";
const I = "h-8 w-full rounded-md border border-[#dbe4ef] bg-white px-2 text-xs outline-none focus:border-[#0b5bbb] focus:ring-1 focus:ring-[#e5eef9]";
const STORAGE_KEY = (c: string) => `egress-col-config-v4-${c}`;

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose, maxW = "max-w-lg" }: {
  title: string; children: React.ReactNode; onClose: () => void; maxW?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className={`card relative w-full ${maxW} animate-enter p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-black text-[#10233f]">{title}</div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] text-[#60738d] hover:bg-[#f4f7fb]"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── PreviewTable ──────────────────────────────────────────────────────────────

function PreviewTable({ cols, rows }: { cols: string[]; rows: Fila[] }) {
  const maxCols = cols.slice(0, 8);
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-3">
        <span className={L}>Preview</span>
        <span className="rounded-full bg-[#0b5bbb] px-2 py-0.5 text-[9px] font-black text-white">{rows.length} filas</span>
        {cols.length > 8 && <span className="text-[9px] text-[#9aabb8]">{maxCols.length} de {cols.length} cols</span>}
      </div>
      <div className="overflow-auto rounded-xl border border-[#dbe4ef]">
        <table className="w-full text-left text-[10px]" style={{ borderSpacing: 0 }}>
          <thead><tr className="bg-[#edf4fc]">{maxCols.map((c) => <th key={c} className="whitespace-nowrap border-b border-[#dbe4ef] px-3 py-2 text-[9px] font-black uppercase text-[#2557d4]">{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 5).map((row, i) => (
              <tr key={i} className={i % 2 ? "bg-[#f8fafd]" : "bg-white"}>
                {maxCols.map((c) => <td key={c} className="max-w-[140px] truncate border-b border-[#e1e8f1] px-3 py-1.5" title={row[c]}>{row[c] || "—"}</td>)}
              </tr>
            ))}
            {rows.length > 5 && <tr><td colSpan={maxCols.length} className="px-3 py-2 text-[9px] italic text-[#9aabb8]">…y {rows.length - 5} filas más</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ConfigPanel ───────────────────────────────────────────────────────────────

function ConfigPanel({ config, onChange, onClose }: {
  config: ClienteConfig; onChange: (c: ClienteConfig) => void; onClose: () => void;
}) {
  const [colsText,   setColsText]   = useState(config.canje.columnas.join("\n"));
  const [filaInicio, setFilaInicio] = useState(String(config.canje.filaInicio));
  const [mapping, setMapping] = useState<FieldMapping>(config.canje.mapping ?? { ...DEFAULT_MAPPING });

  const parsedCols = colsText.split("\n").map((l) => l.trim()).filter(Boolean);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    if (text.includes("\t") && !text.includes("\n")) {
      e.preventDefault();
      setColsText(text.split("\t").map((c) => c.trim()).filter(Boolean).join("\n"));
    }
  }

  function setMap(key: keyof FieldMapping, val: string) {
    setMapping((m) => ({ ...m, [key]: val }));
  }

  function save() {
    onChange({ ...config, configurado: true, canje: {
      columnas: parsedCols,
      filaInicio: Number(filaInicio) || 7,
      mapping,
    }});
    onClose();
  }

  const selCls = "mt-1 h-9 w-full appearance-none rounded-lg border border-[#dbe4ef] bg-white pl-3 pr-8 text-xs normal-case font-medium text-[#10233f] outline-none focus:border-[#7c2dd4]";

  return (
    <div className="card mb-5 animate-enter border-[#d8c4f8] bg-[#faf6ff] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-black text-[#10233f]">Configurar importación CANJE — {config.nombre}</div>
          <div className="mt-0.5 text-[10px] text-[#62728a]">Definí las columnas del archivo y cuál corresponde a cada campo canónico.</div>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] text-[#60738d] hover:bg-[#f4f7fb]"><X size={14} /></button>
      </div>

      {/* Part 1: columns */}
      <div className="grid gap-5 lg:grid-cols-[1fr_200px]">
        <div>
          <div className={`${L} mb-2`}>Columnas del archivo (una por línea, o pegá el encabezado del Excel)</div>
          <textarea value={colsText} onChange={(e) => setColsText(e.target.value)} onPaste={handlePaste} rows={8}
            className="w-full resize-none rounded-lg border border-[#dbe4ef] bg-white px-3 py-2 font-mono text-[10px] outline-none focus:border-[#7c2dd4] focus:ring-2 focus:ring-[#e5d8fd]" />
          <div className="mt-1 text-[9px] text-[#9aabb8]">{parsedCols.length} columnas</div>
        </div>
        <div>
          <label className={L}>Fila de inicio (0-indexed)
            <input type="number" value={filaInicio} onChange={(e) => setFilaInicio(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-[#dbe4ef] bg-white px-3 text-center text-xs normal-case outline-none" />
          </label>
          <p className="mt-2 text-[9px] text-[#9aabb8]">Fila donde empiezan los datos (0-indexed). Por defecto 2 si el encabezado está en la fila 1.</p>
        </div>
      </div>

      {/* Part 2: field mapping */}
      <div className="mt-5 rounded-xl border border-[#d8c4f8] bg-white p-4">
        <div className={`${L} mb-3`}>Mapeo de columnas canónicas</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Fecha — three separate dropdowns */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className={`${L} mb-2`}>Fecha</div>
            <div className="grid grid-cols-3 gap-2">
              {([ ["Día", "fechaDia"], ["Mes", "fechaMes"], ["Año", "fechaAno"] ] as [string, keyof FieldMapping][]).map(([label, key]) => (
                <label key={key} className={L}>{label}
                  <div className="relative">
                    <select value={mapping[key]} onChange={(e) => setMap(key, e.target.value)} className={selCls}>
                      <option value="">—</option>
                      {parsedCols.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#62728a]" />
                  </div>
                </label>
              ))}
            </div>
          </div>
          {/* Código */}
          <div>
            <label className={L}>Código cliente / SKU
              <div className="relative">
                <select value={mapping.codigo} onChange={(e) => setMap("codigo", e.target.value)} className={selCls}>
                  <option value="">— sin mapear —</option>
                  {parsedCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#62728a]" />
              </div>
            </label>
          </div>
          {/* Descripción */}
          <div>
            <label className={L}>Descripción
              <div className="relative">
                <select value={mapping.desc} onChange={(e) => setMap("desc", e.target.value)} className={selCls}>
                  <option value="">— sin mapear —</option>
                  {parsedCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#62728a]" />
              </div>
            </label>
          </div>
          {/* Cantidad */}
          <div>
            <label className={L}>Cantidad
              <div className="relative">
                <select value={mapping.cant} onChange={(e) => setMap("cant", e.target.value)} className={selCls}>
                  <option value="">— sin mapear —</option>
                  {parsedCols.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#62728a]" />
              </div>
            </label>
          </div>
        </div>
        {/* Preview of current mapping */}
        {parsedCols.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[#62728a]">
            <span className="rounded bg-[#f0e8fd] px-2 py-0.5 text-[#7c2dd4]">Día → {mapping.fechaDia || "—"} · Mes → {mapping.fechaMes || "—"} · Año → {mapping.fechaAno || "—"}</span>
            <span className="rounded bg-[#f0e8fd] px-2 py-0.5 text-[#7c2dd4]">Código → {mapping.codigo || "—"}</span>
            <span className="rounded bg-[#f0e8fd] px-2 py-0.5 text-[#7c2dd4]">Desc → {mapping.desc || "—"}</span>
            <span className="rounded bg-[#f0e8fd] px-2 py-0.5 text-[#7c2dd4]">Cant → {mapping.cant || "—"}</span>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save}><Check size={15} /> Guardar</Button>
      </div>
    </div>
  );
}

// ── CargaOtrasOp ─────────────────────────────────────────────────────────────

const INITIAL_ROWS = 5;

function CargaOtrasOp({ cliente, cfg, onSave, onCancel }: {
  cliente: string; cfg: ClienteConfig; onSave: (l: Omit<Lote, "id">) => void; onCancel: () => void;
}) {
  const [tipo,       setTipo]       = useState<Exclude<TipoEgreso, "CANJE"> | null>(null);
  const [rows,       setRows]       = useState<GridRow[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);

  const cols = tipo ? STD_COLS[tipo] : [];

  function initRows(t: Exclude<TipoEgreso, "CANJE">) {
    setRows(Array.from({ length: INITIAL_ROWS }, (_, i) => emptyGridRow(STD_COLS[t], String(i + 1), i === 0)));
    setSelected(new Set());
    setShowErrors(false);
  }

  function handleTipo(t: Exclude<TipoEgreso, "CANJE">) { setTipo(t); initRows(t); }

  function updCell(id: string, key: string, val: string) {
    setRows((prev) => {
      const isFirstRow = prev[0]?._id === id;

      // Step 1: apply the direct edit
      const next = prev.map((r, i) => {
        if (r._id !== id) return r;
        const updated = { ...r, [key]: val };
        // Auto-fill fecha for non-first rows that get their first content
        if (key !== "fecha" && i > 0 && !updated.fecha && val.trim()) {
          updated.fecha = prev[0]?.fecha ?? TODAY;
        }
        return updated;
      });

      // Step 2: if first row's fecha changed, propagate to all rows that have data
      if (key === "fecha" && isFirstRow) {
        return next.map((r, i) => {
          if (i === 0) return r;
          const hasData = cols.some((c) => c.key !== "fecha" && r[c.key]?.trim());
          return hasData ? { ...r, fecha: val } : r;
        });
      }

      return next;
    });
  }

  function handleCellPaste(e: React.ClipboardEvent<HTMLInputElement>, rowId: string, colIdx: number) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const grid = text.trim().split("\n").map((l) => l.split("\t").map((c) => c.trim()));
    setRows((prev) => {
      const firstFecha = prev[0]?.fecha ?? TODAY;
      const updated    = [...prev.map((r) => ({ ...r }))];
      const startIdx   = updated.findIndex((r) => r._id === rowId);
      if (startIdx === -1) return prev;
      grid.forEach((pastedRow, ri) => {
        const ti = startIdx + ri;
        if (ti >= updated.length) updated.push(emptyGridRow(cols, `paste-${Date.now()}-${ri}`));
        pastedRow.forEach((cell, ci) => {
          if (colIdx + ci < cols.length) updated[ti][cols[colIdx + ci].key] = cell;
        });
        if (ti > 0 && !updated[ti].fecha && pastedRow.some((c) => c.trim())) {
          updated[ti].fecha = firstFecha;
        }
      });
      return updated;
    });
  }

  function addRow()   { setRows((p) => [...p, emptyGridRow(cols, String(Date.now()))]); }
  function toggleRow(id: string) { setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r._id))); }
  function delSelected() { setRows((p) => p.filter((r) => !selected.has(r._id))); setSelected(new Set()); }

  const validations = rows.map((r) => validateRow(r, cols));
  const hasErrors   = validations.some((v) => v.missing || v.invalidCode);
  const filledRows  = rows.filter((r) => cols.some((c) => c.key !== "fecha" && r[c.key]?.trim()));

  function confirm() {
    setShowErrors(true);
    if (hasErrors) return;
    const filas = filledRows.map((row) => toFila(row, cfg.canje.mapping));
    if (!tipo || !filas.length) return;
    onSave({ tipo, cliente, fecha: TODAY, filas });
  }

  const thCls = "border-b border-[#dbe4ef] bg-[#f8fafd] px-2 py-2 text-[9px] font-black uppercase whitespace-nowrap text-[#62728a]";

  return (
    <div className="card mb-5 animate-enter p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-black text-[#10233f]">Cargar otras operaciones — {cliente}</div>
          <div className="mt-0.5 text-[10px] text-[#62728a]">Podés escribir o pegar celdas del Excel. La fecha de filas vacías se copia de la primera fila, y si cambiás la fecha en la primera fila se actualiza en todas.</div>
        </div>
        <button type="button" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] text-[#60738d] hover:bg-[#f4f7fb]"><X size={14} /></button>
      </div>

      <div className="mb-5">
        <label className={`${L} flex items-center gap-3`}>
          Tipo de operación
          <div className="relative">
            <select value={tipo ?? ""} onChange={(e) => e.target.value && handleTipo(e.target.value as Exclude<TipoEgreso, "CANJE">)}
              className="h-9 appearance-none rounded-lg border border-[#dbe4ef] bg-white pl-3 pr-9 text-xs normal-case font-semibold text-[#10233f] outline-none focus:border-[#0b5bbb]">
              <option value="">— Seleccioná un tipo —</option>
              {TIPOS_STD.map((t) => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#62728a]" />
          </div>
        </label>
      </div>

      {tipo && (
        <>
          {selected.size > 0 && (
            <div className="mb-2">
              <button type="button" onClick={delSelected}
                className="flex items-center gap-1.5 rounded-md border border-[#f0cfcc] bg-white px-2.5 py-1 text-[10px] font-black text-[#b7433f] hover:bg-[#fff0ef]">
                <Trash2 size={11} /> Eliminar {selected.size} {selected.size === 1 ? "fila" : "filas"}
              </button>
            </div>
          )}
          <div className="overflow-auto rounded-xl border border-[#dbe4ef]">
            <table className="text-left text-[11px]" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className={`${thCls} w-8`}>
                    <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="accent-[#0b5bbb]" />
                  </th>
                  <th className={`${thCls} w-7 text-center`}>#</th>
                  {cols.map((c) => (
                    <th key={c.key} className={thCls}>{c.label}{c.required && c.key !== "fecha" && <span className="ml-0.5 text-[#b7433f]">*</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => {
                  const { missing, invalidCode } = showErrors ? validations[ri] : { missing: false, invalidCode: false };
                  const rowBg = selected.has(row._id) ? "bg-[#edf4fc]" : missing ? "bg-[#fff8f5]" : invalidCode ? "bg-[#fffbf0]" : ri % 2 ? "bg-[#f8fafd]" : "bg-white";
                  return (
                    <tr key={row._id} className={rowBg}>
                      <td className="border-b border-[#e1e8f1] px-2 py-1">
                        <input type="checkbox" checked={selected.has(row._id)} onChange={() => toggleRow(row._id)} className="accent-[#0b5bbb]" />
                      </td>
                      <td className="border-b border-[#e1e8f1] px-2 py-1 text-center text-[9px] text-[#9aabb8]">{ri + 1}</td>
                      {cols.map((col, ci) => {
                        const isInvalidCode = showErrors && col.key === "codigo_cliente" && invalidCode;
                        const isMissing     = showErrors && missing && col.required && col.key !== "fecha" && !row[col.key]?.trim();
                        return (
                          <td key={col.key} className="border-b border-[#e1e8f1] px-1 py-1">
                            <input
                              type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"}
                              value={row[col.key] ?? ""}
                              onChange={(e) => updCell(row._id, col.key, e.target.value)}
                              onPaste={(e) => handleCellPaste(e, row._id, ci)}
                              min={col.type === "number" ? "1" : undefined}
                              title={isInvalidCode ? "Código no encontrado" : isMissing ? "Campo requerido" : undefined}
                              className={[
                                I,
                                col.type === "number" ? "w-20 text-right" : col.type === "date" ? "w-34" : col.key === "producto" || col.key === "comentarios" ? "min-w-[160px]" : "w-28",
                                isMissing ? "border-[#f5b4b4] bg-[#fff5f5]" : isInvalidCode ? "border-[#f5dfa4] bg-[#fffbe8]" : "",
                              ].join(" ")}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addRow}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-[#b8ceea] px-3 py-2 text-[11px] font-bold text-[#0b5bbb] hover:border-[#0b5bbb] hover:bg-[#edf4fc]">
            <Plus size={13} /> Agregar fila
          </button>
          {showErrors && hasErrors && (
            <div className="mt-3 space-y-1 rounded-xl border border-[#f5d4d4] bg-[#fff5f5] px-4 py-3 text-[11px] text-[#b7433f]">
              {validations.some((v) => v.missing)     && <div>• Hay celdas requeridas vacías (rojo).</div>}
              {validations.some((v) => v.invalidCode) && <div>• Algunos códigos cliente no existen en la base (amarillo).</div>}
            </div>
          )}
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={confirm} disabled={!tipo || filledRows.length === 0}>
          <Check size={15} /> {filledRows.length > 0 ? `Confirmar ${filledRows.length} filas` : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

// ── CargaCanjeForm ────────────────────────────────────────────────────────────

function CargaCanjeForm({ config, onSave, onCancel }: {
  config: ClienteConfig; onSave: (l: Omit<Lote, "id">) => void; onCancel: () => void;
}) {
  const [fecha,      setFecha]      = useState(TODAY);
  const [mode,       setMode]       = useState<"paste" | "excel">("paste");
  const [raw,        setRaw]        = useState("");
  const [xlFile,     setXlFile]     = useState<File | null>(null);
  const [xlSheets,   setXlSheets]   = useState<string[]>([]);
  const [xlSheetIdx, setXlSheetIdx] = useState(0);
  const [xlFilas,    setXlFilas]    = useState<Fila[]>([]);
  const [xlLoading,  setXlLoading]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cols    = config.canje.columnas;

  const pastedFilas = useMemo(() => (raw.trim() && cols.length ? parseTSV(raw, cols) : []), [raw, cols]);
  const active      = mode === "paste" ? pastedFilas : xlFilas;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setXlFile(file); setXlLoading(true);
    try   { const r = await readExcel(file, xlSheetIdx, config.canje.filaInicio, cols); setXlSheets(r.sheets); setXlFilas(r.filas); }
    catch { setXlFilas([]); }
    finally { setXlLoading(false); }
  }
  async function onSheetChange(idx: number) {
    setXlSheetIdx(idx); if (!xlFile || !cols.length) return;
    setXlLoading(true);
    try   { const r = await readExcel(xlFile, idx, config.canje.filaInicio, cols); setXlFilas(r.filas); }
    catch { setXlFilas([]); }
    finally { setXlLoading(false); }
  }

  return (
    <div className="card mb-5 animate-enter p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-black text-[#10233f]">Cargar CANJE — {config.nombre}</div>
          <div className="mt-0.5 text-[10px] text-[#62728a]">Pegá las filas del Excel o subí el archivo directamente.</div>
        </div>
        <button type="button" onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-lg border border-[#dbe4ef] text-[#60738d] hover:bg-[#f4f7fb]"><X size={14} /></button>
      </div>
      {!cols.length ? (
        <div className="rounded-xl border border-[#f5d4d4] bg-[#fff5f5] px-4 py-4 text-[11px] text-[#b7433f]">
          Este cliente no tiene columnas configuradas. Usá "Configurar columnas CANJE" primero.
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-[180px_1fr]">
            <label className={L}>Fecha <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`mt-1 ${I}`} /></label>
            <div className={L}>Columnas ({cols.length})
              <div className="mt-1 overflow-hidden rounded-lg border border-[#dbe4ef] bg-[#f8fafd] px-3 py-2 text-[9px] font-normal normal-case leading-5 text-[#425979]">
                {cols.slice(0, 14).join(" · ")}{cols.length > 14 ? ` · +${cols.length - 14} más` : ""}
              </div>
            </div>
          </div>
          <div className="mb-3 flex w-fit gap-1 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] p-1">
            {(["paste","excel"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`rounded-lg px-4 py-1.5 text-xs font-black transition ${mode === m ? "border border-[#dbe4ef] bg-white text-[#0b5bbb] shadow-sm" : "text-[#62728a] hover:text-[#10233f]"}`}>
                {m === "paste" ? "Pegar texto" : "Subir Excel"}
              </button>
            ))}
          </div>
          {mode === "paste" ? (
            <label className={L}>Filas (Ctrl+V)
              <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Copiá las filas de datos (sin encabezado)…"
                className="mt-1 w-full resize-none rounded-lg border border-[#dbe4ef] bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#0b5bbb] focus:ring-2 focus:ring-[#e5eef9]" />
            </label>
          ) : (
            <div className="flex flex-wrap items-end gap-4">
              <label className={L}>Archivo Excel
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs font-bold text-[#425979] hover:border-[#0b5bbb] hover:text-[#0b5bbb]">
                  <Plus size={13} /> {xlFile ? xlFile.name : "Elegir archivo…"}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={(e) => void onFileChange(e)} />
              </label>
              {xlSheets.length > 1 && (
                <label className={L}>Pestaña
                  <select value={xlSheetIdx} onChange={(e) => void onSheetChange(Number(e.target.value))}
                    className="mt-1 h-9 rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs outline-none">
                    {xlSheets.map((s, i) => <option key={i} value={i}>{s}</option>)}
                  </select>
                </label>
              )}
              {xlLoading && <span className="text-[11px] text-[#62728a]">Leyendo…</span>}
            </div>
          )}
          <PreviewTable cols={cols} rows={active} />
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => active.length && onSave({ tipo: "CANJE", cliente: config.nombre, fecha, filas: active })} disabled={!active.length}>
          <Check size={15} /> {active.length > 0 ? `Confirmar ${active.length} filas` : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

// ── TipoFilterDropdown ────────────────────────────────────────────────────────

function TipoFilterDropdown({ selected, onChange }: {
  selected: Set<TipoEgreso>; onChange: (s: Set<TipoEgreso>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function toggle(t: TipoEgreso) {
    const n = new Set(selected);
    n.has(t) ? n.delete(t) : n.add(t);
    onChange(n);
  }

  const label =
    selected.size === 0       ? "Tipo de operación" :
    selected.size === ALL_TIPOS.length ? "Todos los tipos" :
    selected.size === 1       ? TIPO_LABELS[[...selected][0]] :
    `${selected.size} tipos`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex h-9 w-full min-w-[170px] items-center justify-between gap-2 rounded-lg border bg-white px-3 text-xs outline-none transition
          ${selected.size > 0 ? "border-[#0b5bbb] text-[#0b5bbb] font-medium" : "border-[#dbe4ef] text-[#62728a]"}`}>
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute top-10 z-30 w-52 rounded-xl border border-[#dbe4ef] bg-white p-2 shadow-lg">
          {ALL_TIPOS.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[#f4f7fb]">
              <input type="checkbox" checked={selected.has(t)} onChange={() => toggle(t)} className="accent-[#0b5bbb]" />
              <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${TIPO_COLORS[t]}`}>{TIPO_LABELS[t]}</span>
            </label>
          ))}
          {selected.size > 0 && (
            <button type="button" onClick={() => onChange(new Set())}
              className="mt-1 w-full rounded px-2 py-1 text-center text-[10px] text-[#62728a] hover:bg-[#f4f7fb]">
              Mostrar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ColPicker ─────────────────────────────────────────────────────────────────

function ColPicker({ visibleCols, allKeys, onAdd, onRemove, onMove, onClose }: {
  visibleCols: string[]; allKeys: string[];
  onAdd: (k: string) => void; onRemove: (k: string) => void;
  onMove: (k: string, dir: -1 | 1) => void; onClose: () => void;
}) {
  const hidden = allKeys.filter((k) => !visibleCols.includes(k));
  return (
    <div className="absolute right-0 top-9 z-30 w-64 overflow-hidden rounded-xl border border-[#dbe4ef] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[#dbe4ef] px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-wide text-[#62728a]">Columnas</span>
        <button onClick={onClose} className="grid h-5 w-5 place-items-center rounded text-[#9aabb8] hover:text-[#10233f]"><X size={11} /></button>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {visibleCols.length > 0 && (
          <div className="mb-1">
            <div className="mb-1 px-1 text-[9px] font-bold uppercase text-[#9aabb8]">Visibles ({visibleCols.length})</div>
            {visibleCols.map((k, i) => (
              <div key={k} className="flex items-center gap-1 rounded px-1 py-0.5 bg-[#edf4fc] mb-0.5">
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => onMove(k, -1)}
                    className="text-[8px] leading-tight text-[#62728a] disabled:opacity-20 hover:text-[#0b5bbb]">▲</button>
                  <button type="button" disabled={i === visibleCols.length - 1} onClick={() => onMove(k, 1)}
                    className="text-[8px] leading-tight text-[#62728a] disabled:opacity-20 hover:text-[#0b5bbb]">▼</button>
                </div>
                <span className="flex-1 truncate text-[10px] text-[#10233f]">{k}</span>
                <button type="button" onClick={() => onRemove(k)}
                  className="rounded px-1 text-[11px] text-[#b7433f] hover:bg-[#fff0ef]" title="Ocultar">×</button>
              </div>
            ))}
          </div>
        )}
        {hidden.length > 0 && (
          <div>
            <div className="mb-1 px-1 text-[9px] font-bold uppercase text-[#9aabb8]">Ocultas ({hidden.length})</div>
            {hidden.map((k) => (
              <button key={k} type="button" onClick={() => onAdd(k)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[10px] text-[#62728a] hover:bg-[#f4f7fb]">
                <Plus size={10} className="shrink-0 text-[#0b5bbb]" /> {k}
              </button>
            ))}
          </div>
        )}
        {visibleCols.length === 0 && hidden.length === 0 && (
          <div className="py-4 text-center text-[10px] text-[#9aabb8]">Sin columnas disponibles.</div>
        )}
      </div>
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

const CANONICAL_COLS = [
  { key: "tipo",   label: "Tipo"                 },
  { key: "codigo", label: "Código cliente / SKU" },
  { key: "desc",   label: "Descripción"          },
  { key: "cant",   label: "Cant."                },
] as const;

const CANONICAL_KEY_SET = new Set(CANONICAL_COLS.map((c) => c.key));

function colLabel(k: string): string {
  return CANONICAL_COLS.find((c) => c.key === k)?.label ?? k;
}

// ── FlatHistoryTable ──────────────────────────────────────────────────────────

type FlatRow = {
  key: string; loteId: string; rowIdx: number; tipo: TipoEgreso;
  fecha: string; codigo: string; desc: string; cant: string; raw: Fila;
};

function FlatHistoryTable({ lotes, configs, cliente, onDeleteRows, onUpdateRow }: {
  lotes: Lote[]; configs: ClienteConfig[]; cliente: string;
  onDeleteRows: (targets: { loteId: string; rowIdx: number }[]) => void;
  onUpdateRow: (loteId: string, rowIdx: number, fila: Fila) => void;
}) {
  const [desde,        setDesde]        = useState(THIS_MONTH_START);
  const [hasta,        setHasta]        = useState(TODAY);
  const [tipoFilter,   setTipoFilter]   = useState<Set<TipoEgreso>>(new Set());
  const [search,       setSearch]       = useState("");
  const [sortCol,      setSortCol]      = useState<string>("fecha");
  const [sortDir,      setSortDir]      = useState<SortDir>("desc");
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [visibleCols,  setVisibleCols]  = useState<string[]>([]);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<FlatRow[] | null>(null);
  const [editTarget,    setEditTarget]    = useState<FlatRow | null>(null);

  // Flatten lotes
  const allFlat = useMemo<FlatRow[]>(() => {
    return lotes.flatMap((lote) => {
      const cfg = configs.find((c) => c.nombre === lote.cliente) ?? configs[0];
      return lote.filas.map((fila, ri) => {
        const d = deriveDisplay(fila, cfg);
        return { key: `${lote.id}-${ri}`, loteId: lote.id, rowIdx: ri, tipo: lote.tipo, ...d, raw: fila };
      });
    });
  }, [lotes, configs]);

  // Keys already shown in canonical columns — exclude to avoid duplicate raw columns.
  // Date parts (Dia/Mes/Año/Fecha) are intentionally NOT excluded: users want them visible.
  const canonicalKeys = useMemo(() => {
    const cfg = configs.find((c) => c.nombre === cliente);
    const m   = cfg?.canje.mapping ?? DEFAULT_MAPPING;
    // Internal std-op field names never appear in raw data (they're CargaOtrasOp keys)
    const keys = new Set<string>(["fecha", "codigo_cliente", "producto", "cantidad", "destino", "comentarios"]);
    if (m.codigo) keys.add(m.codigo);
    if (m.desc)   keys.add(m.desc);
    if (m.cant)   keys.add(m.cant);
    return keys;
  }, [configs, cliente]);

  // Extra raw keys (non-canonical), ordered by the client's configured columnas
  const allRawKeys = useMemo(() => {
    const keys = new Set<string>();
    allFlat.forEach((r) => Object.keys(r.raw).forEach((k) => keys.add(k)));
    const filtered = [...keys].filter((k) => !canonicalKeys.has(k));
    const cfg      = configs.find((c) => c.nombre === cliente);
    const colOrder = new Map((cfg?.canje.columnas ?? []).map((c, i) => [c, i]));
    return filtered.sort((a, b) => (colOrder.get(a) ?? Infinity) - (colOrder.get(b) ?? Infinity));
  }, [allFlat, canonicalKeys, configs, cliente]);

  // Date-part column keys for this client (clicking any of them sorts by full ISO date)
  const dateParts = useMemo(() => {
    const cfg = configs.find((c) => c.nombre === cliente);
    const m   = cfg?.canje.mapping ?? DEFAULT_MAPPING;
    return new Set([m.fechaDia, m.fechaMes, m.fechaAno].filter(Boolean));
  }, [configs, cliente]);

  // Full ordered list: tipo → date parts → rest of canonical → remaining raw
  const allDisplayKeys = useMemo(() => {
    const cfg          = configs.find((c) => c.nombre === cliente);
    const m            = cfg?.canje.mapping ?? DEFAULT_MAPPING;
    const datePartKeys = [m.fechaDia, m.fechaMes, m.fechaAno].filter(Boolean);
    const datePartSet  = new Set(datePartKeys);
    const otherRaw     = allRawKeys.filter((k) => !datePartSet.has(k));
    return ["tipo", ...datePartKeys, "codigo", "desc", "cant", ...otherRaw];
  }, [allRawKeys, configs, cliente]);

  // Per-client persistence — reconcile saved list against current available keys
  const colsInitRef = useRef<string | null>(null);
  const clienteRef  = useRef(cliente);
  useEffect(() => { clienteRef.current = cliente; });

  useEffect(() => {
    if (allDisplayKeys.length === 0) return;
    if (colsInitRef.current === cliente) return;
    colsInitRef.current = cliente;
    try {
      const saved = localStorage.getItem(STORAGE_KEY(cliente));
      if (saved) {
        const savedList = JSON.parse(saved) as string[];
        const available = new Set(allDisplayKeys);
        const filtered  = savedList.filter((k) => available.has(k));
        const missing   = allDisplayKeys.filter((k) => !savedList.includes(k));
        setVisibleCols([...filtered, ...missing]);
      } else {
        setVisibleCols([...allDisplayKeys]);
      }
    } catch {
      setVisibleCols([...allDisplayKeys]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, allDisplayKeys]);

  useEffect(() => {
    if (visibleCols.length === 0) return;
    localStorage.setItem(STORAGE_KEY(clienteRef.current), JSON.stringify(visibleCols));
  }, [visibleCols]);

  const hasFilter = !!(desde || hasta || tipoFilter.size > 0 || search.trim());

  const filtered = useMemo(() => {
    if (!hasFilter) return [];
    const q = search.trim().toLowerCase();
    return allFlat
      .filter((r) => {
        if (tipoFilter.size > 0 && !tipoFilter.has(r.tipo)) return false;
        if (desde && r.fecha && r.fecha < desde) return false;
        if (hasta && r.fecha && r.fecha > hasta) return false;
        if (q && ![r.fecha, r.codigo, r.desc, r.cant, ...Object.values(r.raw)].some((v) => v.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if      (sortCol === "fecha" || dateParts.has(sortCol)) cmp = a.fecha.localeCompare(b.fecha);
        else if (sortCol === "tipo")   cmp = a.tipo.localeCompare(b.tipo);
        else if (sortCol === "codigo") cmp = a.codigo.localeCompare(b.codigo);
        else if (sortCol === "desc")   cmp = a.desc.localeCompare(b.desc);
        else if (sortCol === "cant")   cmp = (Number(a.cant) || 0) - (Number(b.cant) || 0);
        else {
          const av = a.raw[sortCol] ?? "";
          const bv = b.raw[sortCol] ?? "";
          const an = Number(av); const bn = Number(bv);
          cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [allFlat, hasFilter, tipoFilter, desde, hasta, search, sortCol, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.key));
  function toggleAll() {
    if (allSelected) setSelected((s) => { const n = new Set(s); filtered.forEach((r) => n.delete(r.key)); return n; });
    else             setSelected((s) => { const n = new Set(s); filtered.forEach((r) => n.add(r.key)); return n; });
  }
  function toggleRow(key: string) { setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  function addCol(k: string)    { setVisibleCols((p) => [...p, k]); }
  function removeCol(k: string) { setVisibleCols((p) => p.filter((c) => c !== k)); }
  function moveCol(k: string, dir: -1 | 1) {
    setVisibleCols((p) => {
      const i = p.indexOf(k);
      if (i < 0) return p;
      const n = [...p];
      n.splice(i, 1);
      n.splice(Math.max(0, Math.min(p.length - 1, i + dir)), 0, k);
      return n;
    });
  }

  const selectedRows = filtered.filter((r) => selected.has(r.key));

  const thS = "border-b border-[#dbe4ef] px-3 py-3 text-[9px] font-black uppercase tracking-wide text-[#62728a] whitespace-nowrap";
  function SortTh({ col, label }: { col: string; label: string }) {
    const a = sortCol === col;
    return (
      <th onClick={() => toggleSort(col)} className={`${thS} cursor-pointer select-none hover:text-[#0b5bbb]`}>
        {label} {a ? (sortDir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
      </th>
    );
  }

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#dbe4ef] bg-white px-5 py-4">
        <div>
          <div className="text-sm font-black text-[#10233f]">Historial de egresos</div>
          <div className="mt-0.5 text-[10px] text-[#62728a]">{cliente} · {allFlat.length.toLocaleString()} filas totales</div>
        </div>
      </div>

      {/* Filters: fechas → tipo → búsqueda */}
      <div className="flex flex-wrap items-end gap-3 border-b border-[#dbe4ef] bg-[#f8fafd] px-5 py-4">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className={`${L} flex items-center gap-1.5`}>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="h-9 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs normal-case outline-none focus:border-[#0b5bbb]" />
          </label>
          <span className="text-[10px] text-[#9aabb8]">—</span>
          <label className={`${L} flex items-center gap-1.5`}>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="h-9 rounded-lg border border-[#dbe4ef] bg-white px-2 text-xs normal-case outline-none focus:border-[#0b5bbb]" />
          </label>
        </div>

        {/* Tipo multi-select */}
        <TipoFilterDropdown selected={tipoFilter} onChange={setTipoFilter} />

        {/* Free-text search */}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar código, descripción, ID, provincia…"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#0b5bbb]" />

        <div className="ml-auto text-[10px] text-[#62728a]">
          {hasFilter ? <>{filtered.length.toLocaleString()} filas</> : <span className="italic opacity-60">sin filtros</span>}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-b border-[#dbe4ef] bg-white px-5 py-2">
        {selectedRows.length > 0 && (
          <button type="button" onClick={() => setDeleteTarget(selectedRows)}
            className="flex items-center gap-1.5 rounded-md border border-[#f0cfcc] bg-white px-2.5 py-1.5 text-[10px] font-black text-[#b7433f] hover:bg-[#fff0ef]">
            <Trash2 size={11} /> Eliminar {selectedRows.length} {selectedRows.length === 1 ? "fila" : "filas"}
          </button>
        )}
        <div className="relative ml-auto">
          <button type="button" onClick={() => setColPickerOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md border border-[#dbe4ef] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#62728a] hover:border-[#0b5bbb] hover:text-[#0b5bbb]">
            <Columns3 size={12} />
            Columnas
            <span className={`rounded-full px-1.5 text-white text-[9px] font-black ${visibleCols.length > 0 ? "bg-[#0b5bbb]" : "bg-[#b0bec9]"}`}>{visibleCols.length}</span>
          </button>
          {colPickerOpen && (
            <ColPicker visibleCols={visibleCols} allKeys={allDisplayKeys}
              onAdd={addCol} onRemove={removeCol} onMove={moveCol}
              onClose={() => setColPickerOpen(false)} />
          )}
        </div>
      </div>

      {/* Table or empty state */}
      {!hasFilter ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="text-5xl opacity-20">🔍</div>
          <div className="text-sm font-bold text-[#62728a]">Definí un filtro para ver los egresos</div>
          <div className="text-[11px] text-[#9aabb8]">Usá las fechas, el tipo de operación o la búsqueda libre.</div>
          {allFlat.length > 0 && <div className="text-[10px] text-[#b0bec9]">{allFlat.length.toLocaleString()} filas disponibles</div>}
        </div>
      ) : (
        <div className="max-h-[calc(100vh-460px)] min-h-[240px] overflow-auto overscroll-contain bg-white">
          <table className="w-full border-separate text-left text-[11px]" style={{ borderSpacing: 0 }}>
            <thead>
              <tr className="sticky top-0 z-10 bg-[#f8fafd]">
                <th className={`${thS} sticky left-0 z-20 w-8 bg-[#f8fafd]`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#0b5bbb]" />
                </th>
                <th className={`${thS} sticky left-8 z-20 w-16 bg-[#f8fafd]`}>Acciones</th>
                {visibleCols.map((k) => <SortTh key={k} col={k} label={colLabel(k)} />)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.key} className={selected.has(row.key) ? "bg-[#edf4fc]" : "hover:bg-[#f8fafd]"}>
                  <td className="sticky left-0 z-10 border-b border-[#e1e8f1] bg-inherit px-3 py-2">
                    <input type="checkbox" checked={selected.has(row.key)} onChange={() => toggleRow(row.key)} className="accent-[#0b5bbb]" />
                  </td>
                  <td className="sticky left-8 z-10 border-b border-[#e1e8f1] bg-inherit px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditTarget(row)}
                        className="grid h-6 w-6 place-items-center rounded border border-[#dbe4ef] text-[#0b5bbb] hover:bg-[#edf4fc]" title="Editar">
                        <Pencil size={11} />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget([row])}
                        className="grid h-6 w-6 place-items-center rounded border border-[#f0cfcc] text-[#b7433f] hover:bg-[#fff0ef]" title="Eliminar">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                  {visibleCols.map((k) => {
                    const td = "border-b border-[#e1e8f1] px-3 py-2";
                    if (k === "tipo") return (
                      <td key={k} className={td}>
                        <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${TIPO_COLORS[row.tipo]}`}>{TIPO_LABELS[row.tipo]}</span>
                      </td>
                    );
                    if (k === "codigo") return <td key={k} className={`${td} font-mono text-xs`}>{row.codigo || "—"}</td>;
                    if (k === "desc")   return <td key={k} className={`${td} max-w-[200px] truncate text-[#425979]`} title={row.desc}>{row.desc || "—"}</td>;
                    if (k === "cant")   return <td key={k} className={`${td} text-right tabular-nums font-semibold`}>{row.cant || "—"}</td>;
                    return <td key={k} className={`${td} max-w-[140px] truncate text-[#425979]`} title={row.raw[k]}>{row.raw[k] || "—"}</td>;
                  })}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={2 + visibleCols.length} className="px-4 py-12 text-center text-[11px] text-[#9aabb8]">
                    Sin filas para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-[#dbe4ef] bg-[#f8fafd] px-5 py-3 text-[10px] text-[#62728a]">
        {hasFilter
          ? `Mostrando ${filtered.length.toLocaleString()} de ${allFlat.length.toLocaleString()} filas.`
          : `${allFlat.length.toLocaleString()} filas disponibles. Aplicá un filtro para verlas.`}
      </div>

      {/* Delete confirm */}
      {deleteTarget !== null && (
        <Modal title={`Eliminar ${deleteTarget.length} ${deleteTarget.length === 1 ? "fila" : "filas"}`} onClose={() => setDeleteTarget(null)}>
          <p className="text-[12px] text-[#62728a]">¿Confirmás? Esta acción no se puede deshacer.</p>
          <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-[#dbe4ef] bg-[#f8fafd] p-3 text-[10px]">
            {deleteTarget.map((r) => (
              <div key={r.key} className="py-0.5">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[9px] font-black ${TIPO_COLORS[r.tipo]}`}>{TIPO_LABELS[r.tipo]}</span>
                {(() => { const [a,m,d] = r.fecha.split("-"); return `${d}/${m}/${a.slice(2)}`; })()} · <span className="font-mono">{r.codigo}</span> · {r.desc}
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button onClick={() => {
              onDeleteRows(deleteTarget.map((r) => ({ loteId: r.loteId, rowIdx: r.rowIdx })));
              setSelected((s) => { const n = new Set(s); deleteTarget.forEach((r) => n.delete(r.key)); return n; });
              setDeleteTarget(null);
            }} className="bg-[#b7433f] hover:bg-[#922e2b] focus:ring-[#f5d4d4]">
              <Trash2 size={15} /> Eliminar
            </Button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget !== null && (
        <Modal title="Editar registro" onClose={() => setEditTarget(null)} maxW="max-w-2xl">
          <EditForm
            fila={editTarget.raw} tipo={editTarget.tipo}
            configs={configs}
            cliente={lotes.find((l) => l.id === editTarget.loteId)?.cliente ?? ""}
            onSave={(f) => { onUpdateRow(editTarget.loteId, editTarget.rowIdx, f); setEditTarget(null); }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}
    </section>
  );
}

function EditForm({ fila, tipo, configs, cliente, onSave, onCancel }: {
  fila: Fila; tipo: TipoEgreso; configs: ClienteConfig[]; cliente: string;
  onSave: (f: Fila) => void; onCancel: () => void;
}) {
  const [data, setData] = useState({ ...fila });
  const cfg     = configs.find((c) => c.nombre === cliente) ?? configs[0];
  const colDefs = tipo === "CANJE"
    ? cfg.canje.columnas.map((c) => ({ key: c, label: c }))
    : (STD_COLS[tipo as Exclude<TipoEgreso, "CANJE">] ?? []);
  return (
    <>
      <div className="grid max-h-[60vh] gap-3 overflow-auto sm:grid-cols-2">
        {colDefs.map((c) => (
          <label key={c.key} className={L}>
            {c.label}
            <input
              type={"type" in c && (c as ColDef).type === "date" ? "date" : "type" in c && (c as ColDef).type === "number" ? "number" : "text"}
              value={data[c.key] ?? ""}
              onChange={(e) => setData((d) => ({ ...d, [c.key]: e.target.value }))}
              className={`mt-1 ${I}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => onSave(data)}><Check size={15} /> Guardar cambios</Button>
      </div>
    </>
  );
}

// ── EgressWorkspace ───────────────────────────────────────────────────────────

export function EgressWorkspace() {
  const [configs, setConfigs] = useState<ClienteConfig[]>(INITIAL_CONFIGS);
  const [lotes,   setLotes]   = useState<Lote[]>([...SANTANDER_LOTES, ...OTHER_MOCK_LOTES]);
  const [cliente, setCliente] = useState(INITIAL_CONFIGS[0].nombre);
  const [view,    setView]    = useState<"list" | "ops" | "canje" | "config">("list");

  const cfg          = configs.find((c) => c.nombre === cliente) ?? configs[0];
  const clienteLotes = lotes.filter((l) => l.cliente === cliente);

  function addLote(data: Omit<Lote, "id">) {
    setLotes((prev) => [{ ...data, id: String(Date.now()) }, ...prev]);
    setView("list");
  }

  function deleteRows(targets: { loteId: string; rowIdx: number }[]) {
    const byLote = new Map<string, Set<number>>();
    targets.forEach(({ loteId, rowIdx }) => {
      if (!byLote.has(loteId)) byLote.set(loteId, new Set());
      byLote.get(loteId)!.add(rowIdx);
    });
    setLotes((prev) =>
      prev
        .map((l) => {
          const idx = byLote.get(l.id);
          if (!idx) return l;
          return { ...l, filas: l.filas.filter((_, i) => !idx.has(i)) };
        })
        .filter((l) => l.filas.length > 0)
    );
  }

  function updateRow(loteId: string, rowIdx: number, fila: Fila) {
    setLotes((prev) => prev.map((l) =>
      l.id !== loteId ? l : { ...l, filas: l.filas.map((f, i) => (i === rowIdx ? fila : f)) }
    ));
  }

  function changeCliente(c: string) { setCliente(c); setView("list"); }

  return (
    <>
      <PageHeader eyebrow="Egresos" title="Egresos"
        description="Registrá canjes, pasajes, robos, cambios y reenvíos por cliente." />

      {/* Client bar */}
      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="text-[11px] font-black uppercase tracking-wide text-[#62728a]">Cliente</span>
        <div className="relative">
          <select value={cliente} onChange={(e) => changeCliente(e.target.value)}
            className="h-10 appearance-none rounded-xl border border-[#dbe4ef] bg-white pl-4 pr-9 text-sm font-black text-[#10233f] outline-none focus:border-[#0b5bbb] focus:ring-2 focus:ring-[#e5eef9]">
            {configs.map((c) => <option key={c.nombre}>{c.nombre}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#62728a]" />
        </div>

        <button type="button" onClick={() => setView(view === "config" ? "list" : "config")}
          className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
            view === "config"
              ? "border-[#7c2dd4] bg-[#f0e8fd] text-[#7c2dd4]"
              : "border-[#dbe4ef] bg-[#f8fafd] text-[#62728a] hover:border-[#7c2dd4] hover:text-[#7c2dd4]"
          }`}>
          <Settings size={14} /> Configurar importación CANJE
        </button>

        {cfg.configurado
          ? <span className="rounded-full bg-[#e8fdf0] px-2 py-0.5 text-[9px] font-black text-[#1a8a4a]">configurado</span>
          : <span className="rounded-full bg-[#fdf0e8] px-2 py-0.5 text-[9px] font-black text-[#c0520e]">sin configurar</span>}

        {cfg.configurado && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setView(view === "ops" ? "list" : "ops")}
              className="bg-[#f4f7fb] font-black">
              <Pencil size={15} /> Cargar otras operaciones
            </Button>
            <Button onClick={() => setView(view === "canje" ? "list" : "canje")}>
              <Layers size={15} /> Cargar CANJE
            </Button>
          </div>
        )}
      </div>

      {!cfg.configurado && view !== "config" && (
        <div className="mb-5 rounded-2xl border border-[#f5d4c4] bg-[#fff8f4] px-5 py-4">
          <div className="text-sm font-black text-[#7c3a1a]">Cliente sin configurar</div>
          <p className="mt-1 text-[12px] text-[#a05030]">
            Usá "Configurar columnas CANJE" para definir las columnas del Excel de <strong>{cliente}</strong>.
          </p>
        </div>
      )}

      {view === "config" && (
        <ConfigPanel config={cfg}
          onChange={(c) => setConfigs((p) => p.map((x) => x.nombre === c.nombre ? c : x))}
          onClose={() => setView("list")} />
      )}
      {view === "ops"   && <CargaOtrasOp cliente={cliente} cfg={cfg} onSave={addLote} onCancel={() => setView("list")} />}
      {view === "canje" && <CargaCanjeForm config={cfg} onSave={addLote} onCancel={() => setView("list")} />}

      <FlatHistoryTable
        lotes={clienteLotes} configs={configs} cliente={cliente}
        onDeleteRows={deleteRows} onUpdateRow={updateRow}
      />
    </>
  );
}
