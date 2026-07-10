import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { getLocalDbFolder } from "@/lib/local-excel-db";

export const egressSchemas = {
  Amex: [
    "Día",
    "Mes",
    "Año",
    "Descripcion",
    "Codigo cliente",
    "N° MR",
    "N° certificado",
    "Nombre y Apellido",
    "Direccion",
    "Observaciones",
    "Localidad",
    "CP",
    "Amount",
    "Email",
    "Fecha",
    "Cantidad",
    "Operación",
    "Destino",
    "Comentarios",
  ],
  Credicoop: [
    "Día",
    "Mes",
    "Año",
    "IdRedencion",
    "Apellido_nombre",
    "Domicilio",
    "Codigo_postal",
    "Localidad",
    "Provincia",
    "IdRecompensa",
    "Estado",
    "Puntos",
    "Fecha",
    "Descripcion",
    "Telefono1",
    "Telefono2",
    "Cantidad",
    "Operación",
    "Destino",
  ],
  HSBC: [
    "Dia",
    "Mes",
    "Año",
    "id_orden",
    "fecha",
    "referencia",
    "nombre y apellido",
    "dni",
    "direccion",
    "altura",
    "piso",
    "departamento",
    "cp",
    "localidad",
    "telefono",
    "mail",
    "nombre_producto",
    "Código Cliente",
    "descripcion_corta",
    "id_categoria",
    "descripcion_categoria",
    "Cantidad",
    "precio total",
    "puntos",
    "forma de pago",
    "monto pagado puntos",
    "monto pagado pesos",
    "cantidad cuotas",
    "valor cuota",
    "numero guia correo",
    "estado del pedido",
    "Operación",
    "Destino",
    "Comentarios",
    "Provincia",
    "Tipo de documento",
  ],
  Importados: [
    "Dia",
    "Mes",
    "Año",
    "Código Cliente",
    "PRODUCTO",
    "Cantidad",
    "Operación",
    "Destino",
    "Comentarios",
    "Fecha reenvio",
  ],
  Massalin: [
    "Dia",
    "Mes",
    "Año",
    "Descripcion",
    "Código Cliente",
    "Nº Seguimiento",
    "Nombre y apellido RRHH",
    "Nombre y apellido",
    "Direccion",
    "Observaciones",
    "Localidad",
    "CP",
    "PVA",
    "Tipo de operacion",
    "Cantidad",
    "Company Code",
    "Ceco Facturacion",
    "Ceco",
    "Legajo",
    "Fecha",
    "Procedencia",
    "DNI",
    "Puntos Canjeados",
    "Importe",
    "Operación",
    "Destino",
    "Comentarios",
  ],
  Pampa: [
    "Día",
    "Mes",
    "Año",
    "Fecha Canje",
    "Nro de Canje",
    "cli_código",
    "Descripcion",
    "SKU",
    "u",
    "PVB",
    "Nro de Socio",
    "Tipo Documento Socio",
    "Nro Documento Socio",
    "Apellido y Nombre",
    "Observaciones",
    "Observaciones2",
    "Direccion",
    "EntreCalles",
    "Localidad",
    "Provincia",
    "CP",
    "Telefono",
    "Celular",
    "Cantidad",
    "Operación",
    "Destino",
    "Comentarios",
  ],
  Producteca: [
    "Dia",
    "Mes",
    "Año",
    "Nro Pedido",
    "Id Venta del Canal",
    "Cliente",
    "Estado del Pedido",
    "Estado de Pago",
    "Estado de Entrega",
    "Nro de Guía",
    "Notas Pedido",
    "Descripcion",
    "Código",
    "Código Cliente",
    "Marca",
    "Color",
    "Talle",
    "Cantidad",
    "Moneda",
    "Precio",
    "Monto",
    "Costo de Envío Discriminado",
    "Canal",
    "Depósito",
    "Medio de Pago",
    "Metodo de Pago",
    "Id Pago MercadoPago",
    "Persona de Contacto",
    "Email",
    "Teléfono",
    "CUIT/DNI",
    "Lista de Precios",
    "Dirección",
    "Provincia",
    "Localidad",
    "Código Postal",
    "Barrio",
    "Notas Contacto",
    "Tipo de documento",
    "Nº de documento",
    "Dirección de facturación",
    "Comentarios",
    "Código Postal",
    "Localidad",
    "Provincia",
    "Razón social",
    "Registro estatal",
    "Condición ante el IVA",
    "Nombre del comprador",
    "Apellido del comprador",
    "Tags",
    "Id factura",
    "Recibe",
    "Medio de envío",
    "Nro de Envío",
    "Id alternativo",
    "Nº de carrito",
    "Notas de envío",
    "Modalidad de envío",
    "Operación",
    "Destino",
    "Comentarios",
  ],
  Santander: [
    "Dia",
    "Mes",
    "Año",
    "Nro guia",
    "Fecha",
    "ID",
    "SKU",
    "Localidad",
    "Provincia",
    "CP",
    "Cantidad",
    "Operación",
    "Destino",
    "Comentario",
  ],
  Syngenta: [
    "Día",
    "Mes",
    "Año",
    "ID",
    "IdCliente",
    "Nombre y Apellido",
    "Calle",
    "Número",
    "Depto/Piso",
    "Provincia",
    "Localidad",
    "CP",
    "Cod_Area",
    "Telefono/Celular",
    "Mail de contacto",
    "Producto",
    "Código producto",
    "Cantidad",
    "Fecha pedido",
    "Operación",
    "Destino",
    "Comentarios",
  ],
  Umiles: [
    "Dia",
    "Mes",
    "Año",
    "PRODUCTO",
    "Código Cliente",
    "Nº Seg",
    "Nombre y apellido Usuario",
    "EMAIL",
    "legajo",
    "Direccion",
    "Localidad",
    "CP",
    "PVA",
    "Puntos Canjeados",
    "Fecha canje",
    "Cantidad",
    "Operación",
    "Destino",
    "Comentarios",
  ],
} as const;

export const incomeSchema = [
  "Cliente",
  "Operación",
  "Día pedido",
  "Mes pedido",
  "Año pedido",
  "Orden de compra",
  "Código Cliente",
  "Cantidad",
  "Origen del pasaje",
  "Día entrega",
  "Mes entrega",
  "Año entrega",
  "Entregado",
  "Comentarios",
] as const;

export type EgressClient = keyof typeof egressSchemas;

function ensureFolder() {
  const folder = getLocalDbFolder();
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

export function getEgressFilePath(client: EgressClient) {
  return path.join(ensureFolder(), `Base Egresos ${client} DG.xlsx`);
}

export function getIncomeFilePath() {
  return path.join(ensureFolder(), "Base Ingresos DG.xlsx");
}

function readSheet(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  return workbook.Sheets[workbook.SheetNames[0]];
}

function jsonPath(filePath: string) {
  return filePath.replace(/\.xlsx$/i, ".json");
}

function countRows(filePath: string) {
  const sidecarPath = jsonPath(filePath);
  if (fs.existsSync(sidecarPath)) {
    return JSON.parse(fs.readFileSync(sidecarPath, "utf8")).length;
  }
  if (!fs.existsSync(filePath)) return 0;
  const sheet = readSheet(filePath);
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  return Math.max(0, range.e.r - range.s.r);
}

function headerKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueHeader(header: string, index: number, allHeaders: string[]) {
  const previousCount = allHeaders
    .slice(0, index)
    .filter((value) => value === header).length;
  return previousCount === 0 ? header : `${header}__${previousCount + 1}`;
}

function rowToObject(row: unknown[], headers: readonly string[]) {
  return headers.reduce<Record<string, unknown>>((record, header, index) => {
    record[uniqueHeader(header, index, [...headers])] = row[index] ?? "";
    return record;
  }, {});
}

function parseWorkbook(buffer: Buffer, expectedHeaders: readonly string[]) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerRow = rows.findIndex(
    (row) =>
      row.length >= expectedHeaders.length &&
      expectedHeaders.every(
        (header, index) => headerKey(row[index]) === headerKey(header),
      ),
  );
  if (headerRow < 0) {
    const firstRow = rows.find((row) => row.some((cell) => headerKey(cell)));
    return {
      ok: false as const,
      message: "La estructura del archivo no coincide con la plantilla esperada.",
      receivedHeaders: firstRow?.map(String) ?? [],
      rows: [],
    };
  }

  const dataRows = rows
    .slice(headerRow + 1)
    .filter((row) => row.some((cell) => headerKey(cell)))
    .map((row) => rowToObject(row, expectedHeaders));

  return { ok: true as const, rows: dataRows };
}

function readRows(filePath: string) {
  const sidecarPath = jsonPath(filePath);
  if (fs.existsSync(sidecarPath)) {
    return JSON.parse(fs.readFileSync(sidecarPath, "utf8")) as Record<
      string,
      unknown
    >[];
  }
  if (!fs.existsSync(filePath)) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(readSheet(filePath), {
    defval: "",
  });
}

function readAllRowsWithIndex(filePath: string) {
  return readRows(filePath).map(
    (row, index): Record<string, unknown> => ({ ...row, __rowIndex: index }),
  );
}

function writeRows(filePath: string, sheetName: string, rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  fs.writeFileSync(filePath, buffer);
  fs.writeFileSync(jsonPath(filePath), JSON.stringify(rows));
}

export function appendEgressRows(client: EgressClient, buffer: Buffer) {
  const parsed = parseWorkbook(buffer, egressSchemas[client]);
  if (!parsed.ok) return parsed;
  const filePath = getEgressFilePath(client);
  const existingRows = readRows(filePath);
  writeRows(filePath, client, [...existingRows, ...parsed.rows]);
  return {
    ok: true as const,
    filePath,
    insertedRows: parsed.rows.length,
    totalRows: existingRows.length + parsed.rows.length,
  };
}

export function appendIncomeRows(buffer: Buffer) {
  const parsed = parseWorkbook(buffer, incomeSchema);
  if (!parsed.ok) return parsed;
  const filePath = getIncomeFilePath();
  const existingRows = readRows(filePath);
  writeRows(filePath, "Ingresos", [...existingRows, ...parsed.rows]);
  return {
    ok: true as const,
    filePath,
    insertedRows: parsed.rows.length,
    totalRows: existingRows.length + parsed.rows.length,
  };
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const parsed = Number(asText(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesMonthYear(row: Record<string, unknown>, month?: number, year?: number) {
  if (month && asNumber(row["Mes pedido"]) !== month) return false;
  if (year && asNumber(row["Año pedido"]) !== year) return false;
  return true;
}

export function readIncomeRows(options: {
  client?: string;
  month?: number;
  year?: number;
  limit?: number;
} = {}) {
  const rows = readAllRowsWithIndex(getIncomeFilePath()).filter((row) => {
    if (
      options.client &&
      asText(row["Cliente"]).toLowerCase() !== options.client.toLowerCase()
    ) {
      return false;
    }
    return matchesMonthYear(row, options.month, options.year);
  });
  const limit = options.limit ?? 500;
  return rows.slice(Math.max(0, rows.length - limit)).reverse();
}

export function updateIncomeRow(
  rowIndex: number,
  values: { quantity?: string; delivered?: string },
) {
  const filePath = getIncomeFilePath();
  const rows = readRows(filePath);
  if (!rows[rowIndex]) return false;
  if (values.quantity !== undefined) rows[rowIndex]["Cantidad"] = values.quantity;
  if (values.delivered !== undefined) rows[rowIndex]["Entregado"] = values.delivered;
  writeRows(filePath, "Ingresos", rows);
  return true;
}

export function deleteIncomeRow(rowIndex: number) {
  const filePath = getIncomeFilePath();
  const rows = readRows(filePath);
  if (!rows[rowIndex]) return false;
  rows.splice(rowIndex, 1);
  writeRows(filePath, "Ingresos", rows);
  return true;
}

function dateValue(row: Record<string, unknown>) {
  const day = asNumber(row["Día"] || row["Dia"] || row["Día pedido"]);
  const month = asNumber(row["Mes"] || row["Mes pedido"]);
  const year = asNumber(row["Año"] || row["Anio"] || row["Año pedido"]);
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function readEgressRows(options: {
  client?: EgressClient;
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  const clients = options.client
    ? [options.client]
    : (Object.keys(egressSchemas) as EgressClient[]);
  const rows = clients.flatMap((client) =>
    readAllRowsWithIndex(getEgressFilePath(client)).map((row) => ({
      ...row,
      __client: client,
      __date: dateValue(row),
    })),
  );
  const filtered = rows.filter((row) => {
    const date = asText(row.__date);
    if (options.from && date && date < options.from) return false;
    if (options.to && date && date > options.to) return false;
    return true;
  });
  const limit = options.limit ?? 500;
  return filtered.slice(Math.max(0, filtered.length - limit)).reverse();
}

export function getOperationsSummary() {
  const egress = (Object.keys(egressSchemas) as EgressClient[]).map((client) => {
    const filePath = getEgressFilePath(client);
    return {
      client,
      columns: egressSchemas[client].length,
      rows: countRows(filePath),
      exists: fs.existsSync(filePath),
    };
  });
  const incomeFilePath = getIncomeFilePath();
  return {
    egress,
    income: {
      columns: incomeSchema.length,
      rows: countRows(incomeFilePath),
      exists: fs.existsSync(incomeFilePath),
    },
  };
}
