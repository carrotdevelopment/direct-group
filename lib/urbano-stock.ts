// Reporte "Stock en línea" del portal de clientes de Urbano (Warehousing): un renglón por código, estado,
// ubicación y lote. Acá se agrupa por código cliente. Lógica pura: lectura del reporte (Excel exportado
// o tabla del portal) y cruce con los códigos cliente.

export type UrbanoStockRow = {
  row: number;
  clientCode: string;
  product: string;
  // Cant. Física en estado DISPONIBLE: es la columna "Stk. Urbano" de la pantalla Stock.
  quantity: number;
  // Cant. Física en los demás estados (no disponible, cuarentena, rotura, a verificar).
  unavailable: number;
  pendingPickup: number;
  company: string;
};
export type UrbanoStockStatus = "ok" | "warning" | "error";
export type ResolvedUrbanoStockRow = UrbanoStockRow & {
  client: string | null;
  uniqueCode: string | null;
  status: UrbanoStockStatus;
  messages: string[];
};
export type UrbanoClientCode = { client: string; clientCode: string; uniqueCode: string; active: boolean; voided: boolean };

const text = (value: unknown) => String(value ?? "").trim();
const header = (value: unknown) =>
  text(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// El portal muestra "5.00"; un Excel argentino puede traer "1.234,5". El último separador es el decimal,
// salvo que el número tenga solo grupos de miles ("1.234").
export function urbanoNumber(value: unknown) {
  if (typeof value === "number") return value;
  const raw = text(value).replace(/\s/g, "");
  if (!raw || raw === "-") return 0;
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let normalized = raw;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

// El portal completa el código con ceros adelante: "00000000URB-021" → "URB-021".
export const urbanoClientCode = (value: unknown) => text(value).replace(/^0+(?=[A-Za-z])/, "");

const CODE_TITLE = /^cod(igo)? (de )?producto$/;

// Busca la fila de títulos y toma cada columna por su título. firstRow es el número de fila de Excel de
// la primera fila de la matriz, para numerar como en el archivo.
export function parseUrbanoStockSheet(matrix: unknown[][], firstRow = 1): UrbanoStockRow[] {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => CODE_TITLE.test(header(cell))));
  if (headerIndex < 0) throw new Error('No encontré la columna "Cod. Producto" en el reporte de stock de Urbano.');
  const titles = matrix[headerIndex].map(header);
  const column = (test: (title: string) => boolean) => titles.findIndex(test);
  const codeColumn = column((title) => CODE_TITLE.test(title));
  const productColumn = column((title) => title === "producto");
  const physicalColumn = column((title) => title === "cant fisica" || title === "cantidad fisica");
  const pendingColumn = column((title) => title === "cant pendiente recogida");
  const stateIdColumn = column((title) => title === "id estado");
  const stateColumn = column((title) => title === "estado");
  const companyColumn = column((title) => title === "cod compania");
  if (physicalColumn < 0) {
    throw new Error(
      'El reporte no trae la columna "Cant. Fisica". En el portal, antes de exportar, mostrá todas las columnas con "Mostrar/Ocultar Columnas".',
    );
  }

  const byCode = new Map<string, UrbanoStockRow>();
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    const clientCode = urbanoClientCode(row[codeColumn]);
    if (!clientCode) continue;
    // Se agrupa por el código tal como viene: dos códigos de Urbano distintos que quedan iguales sin los
    // ceros ("0000000URB-372" y "00000000URB-372") son productos distintos y se marcan como repetidos.
    const key = text(row[codeColumn]).toLowerCase();
    const current = byCode.get(key) ?? {
      row: firstRow + index,
      clientCode,
      product: productColumn >= 0 ? text(row[productColumn]).replace(/\s+/g, " ") : "",
      quantity: 0,
      unavailable: 0,
      pendingPickup: 0,
      company: companyColumn >= 0 ? text(row[companyColumn]) : "",
    };
    const stateId = stateIdColumn >= 0 ? text(row[stateIdColumn]).toUpperCase() : "";
    const state = stateColumn >= 0 ? header(row[stateColumn]) : "";
    const available = stateIdColumn >= 0 ? stateId === "DIS" : stateColumn >= 0 ? state === "disponible" : true;
    const physical = urbanoNumber(row[physicalColumn]);
    if (available) current.quantity += physical;
    else current.unavailable += physical;
    if (pendingColumn >= 0) current.pendingPickup += urbanoNumber(row[pendingColumn]);
    byCode.set(key, current);
  }
  return [...byCode.values()];
}

// Tabla HTML del reporte del portal → matriz de celdas (la primera fila son los títulos).
export function urbanoStockTableFromHtml(html: string): string[][] {
  const table = /<table[^>]*id="table-wms-stock"[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (!table) throw new Error("El portal de Urbano no devolvió la tabla de stock.");
  const decode = (value: string) =>
    value
      .replace(/<[^>]+>/g, "")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
      .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .trim();
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => decode(cell[1])),
  );
}

// "Stock en Linea-22-10-2026.xlsx" → "2026-10-22". El portal pone la fecha del día en el nombre.
export function reportDateFromFileName(fileName: string) {
  const match = /(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})/.exec(fileName);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date.toISOString().slice(0, 10);
}

// Cruza cada código con Códigos cliente. Un código desconocido o no vigente se guarda igual (es lo que
// informa Urbano) pero queda con aviso; una cantidad inválida no se guarda.
export function resolveUrbanoStock(rows: UrbanoStockRow[], codes: UrbanoClientCode[]): ResolvedUrbanoStockRow[] {
  const byCode = new Map<string, UrbanoClientCode[]>();
  for (const code of codes) {
    if (code.voided) continue;
    const key = code.clientCode.trim().toLowerCase();
    byCode.set(key, [...(byCode.get(key) ?? []), code]);
  }
  // Si el mismo código aparece en más de un renglón no se sabe cuál es el producto: no se guarda ninguno.
  const rowsByCode = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.clientCode.toLowerCase();
    rowsByCode.set(key, [...(rowsByCode.get(key) ?? []), row.row]);
  }
  return rows.map((row) => {
    const key = row.clientCode.toLowerCase();
    const messages: string[] = [];
    let status: UrbanoStockStatus = "ok";
    const matches = byCode.get(key) ?? [];
    const match = matches.find((code) => code.active) ?? matches[0];
    if ([row.quantity, row.unavailable, row.pendingPickup].some((value) => !Number.isFinite(value) || value < 0)) {
      status = "error";
      messages.push("La cantidad no es un número válido.");
    }
    const repeated = (rowsByCode.get(key) ?? []).filter((other) => other !== row.row);
    if (repeated.length) {
      status = "error";
      messages.push(`El código está repetido en ${repeated.length === 1 ? "la fila" : "las filas"} ${repeated.join(", ")}: no se guarda ninguno hasta aclararlo con Urbano.`);
    }
    if (!match) {
      if (status === "ok") status = "warning";
      messages.push(`El código ${row.clientCode} no está en Códigos cliente.`);
    } else if (!match.active) {
      if (status === "ok") status = "warning";
      messages.push(`El código ${row.clientCode} de ${match.client} no está vigente.`);
    }
    return { ...row, client: match?.client ?? null, uniqueCode: match?.uniqueCode ?? null, status, messages };
  });
}
