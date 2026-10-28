// Solicitud de pasaje de stock a Urbano (Excel): lectura de la planilla y resolución de cada fila.
// Sin dependencias de servidor: lo usa la pantalla para leer el archivo y el servidor para validarlo.
//
// La planilla trae, por fila: FECHA · SH · SKU VIEJO · DESCRIPCION · CANT (origen) y
// SH · SKU NUEVO · DESCRIPCION · CANT (destino). El cliente sale del shipper de Urbano (SH), y el
// código cliente decide cuando el shipper corresponde a más de un cliente. Si el código es de otro
// cliente que el del shipper, se usa el dueño del código y la fila queda con aviso. Las filas donde
// origen y destino son del mismo cliente son cambios de código del mismo producto: no se cargan como
// pasajes (status "excluded"), se hacen desde otra sección.

export type SolicitudRow = {
  row: number;
  requestDate: string | null;
  fromShipper: string;
  fromClientCode: string;
  fromDescription: string;
  fromQuantity: number | null;
  toShipper: string;
  toClientCode: string;
  toDescription: string;
  toQuantity: number | null;
};

export type ClientCodeRecord = { client: string; clientCode: string; uniqueCode: string; active: boolean; voided: boolean };
export type ShipperRecord = { code: string; name: string; clients: string[]; active: boolean };

export type ResolvedRow = SolicitudRow & {
  status: "ok" | "warning" | "error" | "excluded";
  messages: string[];
  fromClient: string | null;
  toClient: string | null;
  uniqueCode: string | null;
  quantity: number | null;
};

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();

function number(value: unknown) {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown) {
  const raw = text(value);
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = Math.floor(Number(raw));
    if (serial > 30000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (local) return `${local[3].length === 2 ? "20" + local[3] : local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

// Lee la hoja de la solicitud: busca la fila de títulos (la que tiene "SKU VIEJO" y "SKU NUEVO") y
// toma cada columna por su título. firstRow es la fila de Excel (desde 1) donde empieza la matriz,
// para informar los números de fila como los ve el usuario.
export function parseSolicitudSheet(matrix: unknown[][], firstRow = 1): SolicitudRow[] {
  const headerIndex = matrix.findIndex((row) => {
    const cells = row.map(normalize);
    return cells.includes("sku viejo") && cells.includes("sku nuevo");
  });
  if (headerIndex < 0) throw new Error('No encontré la fila de títulos de la solicitud (con "SKU VIEJO" y "SKU NUEVO").');
  const header = matrix[headerIndex].map(normalize);
  const oldSku = header.indexOf("sku viejo");
  const newSku = header.indexOf("sku nuevo");
  const last = (name: string, before: number) => header.slice(0, before).lastIndexOf(name);
  const next = (name: string, after: number, until = header.length) => {
    const found = header.slice(after + 1, until).findIndex((cell) => cell === name);
    return found < 0 ? -1 : after + 1 + found;
  };
  const columns = {
    date: header.indexOf("fecha"),
    fromShipper: last("sh", oldSku),
    fromDescription: next("descripcion", oldSku, newSku),
    fromQuantity: next("cant", oldSku, newSku),
    toShipper: last("sh", newSku),
    toDescription: next("descripcion", newSku),
    toQuantity: next("cant", newSku),
  };
  const cell = (row: unknown[], index: number) => (index >= 0 ? row[index] : "");
  return matrix
    .slice(headerIndex + 1)
    .map((row, offset) => ({ row, number: firstRow + headerIndex + offset + 1 }))
    .filter(({ row }) => text(row[oldSku]) || text(row[newSku]))
    .map(({ row, number: excelRow }) => ({
      row: excelRow,
      requestDate: isoDate(cell(row, columns.date)),
      fromShipper: text(cell(row, columns.fromShipper)),
      fromClientCode: text(row[oldSku]),
      fromDescription: text(cell(row, columns.fromDescription)),
      fromQuantity: number(cell(row, columns.fromQuantity)),
      toShipper: text(cell(row, columns.toShipper)),
      toClientCode: text(row[newSku]),
      toDescription: text(cell(row, columns.toDescription)),
      toQuantity: number(cell(row, columns.toQuantity)),
    }));
}

type Side = { client: string; uniqueCode: string } | { error: string };

function resolveSide(
  label: "origen" | "destino",
  clientCode: string,
  shipperCode: string,
  codes: Map<string, ClientCodeRecord[]>,
  shippers: Map<string, ShipperRecord>,
  warnings: string[],
): Side {
  if (!clientCode) return { error: `Falta el código del ${label}.` };
  const shipper = shippers.get(normalize(shipperCode));
  const shipperClients = new Set((shipper?.clients ?? []).map(normalize));
  // El origen puede ser un código que se da de baja (SKU viejo); el destino tiene que estar vigente.
  const candidates = (codes.get(normalize(clientCode)) ?? []).filter((code) => !code.voided && (label === "origen" || code.active));
  if (candidates.length === 0) {
    const inactive = label === "destino" && (codes.get(normalize(clientCode)) ?? []).some((code) => !code.voided);
    return { error: inactive ? `El código ${clientCode} (destino) no está vigente.` : `El código ${clientCode} (${label}) no está en Códigos cliente.` };
  }
  const byShipper = candidates.filter((code) => shipperClients.has(normalize(code.client)));
  const pool = byShipper.length ? byShipper : candidates;
  const clients = [...new Set(pool.map((code) => code.client))];
  if (clients.length > 1) return { error: `El código ${clientCode} (${label}) está asignado a varios clientes: ${clients.join(", ")}.` };
  // Del mismo cliente puede haber varias asignaciones: se prefiere la vigente.
  const chosen = pool.find((code) => code.active) ?? pool[0];
  if (!shipper) {
    warnings.push(`El shipper ${shipperCode || "(vacío)"} del ${label} no está en la tabla de shippers: se usa el cliente del código, ${chosen.client}.`);
  } else if (!byShipper.length) {
    warnings.push(`El shipper ${shipper.code} (${shipper.name}) del ${label} no corresponde al código ${clientCode}, que es de ${chosen.client}: se usa ${chosen.client}.`);
  }
  return { client: chosen.client, uniqueCode: chosen.uniqueCode };
}

export function resolveSolicitud(rows: SolicitudRow[], codeList: ClientCodeRecord[], shipperList: ShipperRecord[]): ResolvedRow[] {
  const codes = new Map<string, ClientCodeRecord[]>();
  for (const code of codeList) {
    const key = normalize(code.clientCode);
    codes.set(key, [...(codes.get(key) ?? []), code]);
  }
  const shippers = new Map(shipperList.map((shipper) => [normalize(shipper.code), shipper]));

  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const from = resolveSide("origen", row.fromClientCode, row.fromShipper, codes, shippers, warnings);
    const to = resolveSide("destino", row.toClientCode, row.toShipper, codes, shippers, warnings);
    if ("error" in from) errors.push(from.error);
    if ("error" in to) errors.push(to.error);
    if ("uniqueCode" in from && "uniqueCode" in to) {
      if (normalize(from.uniqueCode) !== normalize(to.uniqueCode)) {
        errors.push(`El origen (${row.fromClientCode} = ${from.uniqueCode}) y el destino (${row.toClientCode} = ${to.uniqueCode}) no son el mismo producto.`);
      } else if (normalize(from.client) === normalize(to.client) && normalize(row.fromClientCode) === normalize(row.toClientCode)) {
        errors.push("El origen y el destino son el mismo código cliente.");
      }
    }
    const quantity = row.fromQuantity ?? row.toQuantity;
    if (!quantity || quantity <= 0) errors.push("La cantidad tiene que ser mayor a cero.");
    else if (row.toQuantity !== null && row.fromQuantity !== null && row.toQuantity !== row.fromQuantity) {
      warnings.push(`La cantidad del origen (${row.fromQuantity}) y la del destino (${row.toQuantity}) no coinciden: se solicita ${row.fromQuantity}.`);
    }
    const sameClient = !errors.length && "client" in from && "client" in to && normalize(from.client) === normalize(to.client);
    return {
      ...row,
      status: errors.length ? "error" : sameClient ? "excluded" : warnings.length ? "warning" : "ok",
      messages: sameClient
        ? [`Cambio de código del mismo cliente (${"client" in from ? from.client : ""}): no se carga como pasaje: se hace desde Códigos cliente → Migración de código cliente.`]
        : [...errors, ...warnings],
      fromClient: "client" in from ? from.client : null,
      toClient: "client" in to ? to.client : null,
      uniqueCode: "uniqueCode" in from ? from.uniqueCode : "uniqueCode" in to ? to.uniqueCode : null,
      quantity: quantity && quantity > 0 ? quantity : null,
    };
  });
}

export type ExistingPasaje = {
  fromClientCode: string;
  toClientCode: string;
  quantity: number;
  requestDate: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
};

const statusText: Record<string, string> = { pending: "pendiente", approved: "aprobado", confirmed: "confirmado", accepted: "aceptado" };

function displayDate(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

// Marca como error las filas que ya están cargadas como pasaje (mismo origen, destino, cantidad y
// fecha de solicitud; los rechazados no cuentan) y avisa las filas repetidas dentro del archivo.
// Evita duplicar pasajes si vuelven a subir la solicitud para cargar una fila corregida.
export function markDuplicates(rows: ResolvedRow[], existing: ExistingPasaje[]): ResolvedRow[] {
  const key = (from: string, to: string, quantity: number | null, date: string | null) =>
    [normalize(from), normalize(to), Number(quantity), (date ?? "").slice(0, 10)].join("|");
  const loaded = new Map<string, ExistingPasaje>();
  for (const pasaje of existing) {
    if (pasaje.status === "rejected") continue;
    loaded.set(key(pasaje.fromClientCode, pasaje.toClientCode, pasaje.quantity, pasaje.requestDate), pasaje);
  }
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.status === "error" || row.status === "excluded") return row;
    const rowKey = key(row.fromClientCode, row.toClientCode, row.quantity, row.requestDate);
    const previous = loaded.get(rowKey);
    if (previous) {
      return {
        ...row,
        status: "error",
        messages: [`Ya está cargado: hay un pasaje igual (${statusText[previous.status] ?? previous.status}) de la solicitud del ${displayDate(previous.requestDate)}, cargado por ${previous.createdBy} el ${displayDate(previous.createdAt)}.`],
      };
    }
    const repeatedRow = seen.get(rowKey);
    seen.set(rowKey, row.row);
    if (repeatedRow) {
      return { ...row, status: "warning", messages: [...row.messages, `Es igual a la fila ${repeatedRow} del archivo.`] };
    }
    return row;
  });
}

// Avisa las filas que piden más de lo que tiene el código origen. available es el stock disponible por
// "cliente|código" (en minúsculas); varias filas del mismo código se van sumando en el orden del archivo.
export function markStockShortages(rows: ResolvedRow[], available: Map<string, number>): ResolvedRow[] {
  const used = new Map<string, number>();
  return rows.map((row) => {
    if ((row.status !== "ok" && row.status !== "warning") || !row.fromClient || !row.quantity) return row;
    const key = `${normalize(row.fromClient)}|${normalize(row.fromClientCode)}`;
    const stock = available.get(key);
    if (stock === undefined) return row;
    const total = (used.get(key) ?? 0) + row.quantity;
    used.set(key, total);
    if (total <= stock) return row;
    const message = total === row.quantity
      ? `Stock insuficiente: ${row.fromClientCode} de ${row.fromClient} tiene ${stock} disponibles y se piden ${row.quantity}.`
      : `Stock insuficiente: ${row.fromClientCode} de ${row.fromClient} tiene ${stock} disponibles y el archivo ya pide ${total} sumando esta fila.`;
    return { ...row, status: "warning", messages: [...row.messages, message] };
  });
}
