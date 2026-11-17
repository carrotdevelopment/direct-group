// Los dos Excel de un lote de pasajes: la solicitud que se manda a Urbano por correo y la planilla de
// egresos que se sube directo en Urbano. Lógica pura: arma las filas; el servidor arma el archivo.

export type ExportPasaje = {
  requestDate: string | null; // AAAA-MM-DD
  fromShipper: string;
  fromClient: string;
  fromClientCode: string;
  fromDescription: string;
  toShipper: string;
  toClientCode: string;
  toDescription: string;
  quantity: number;
  certificate?: string | null; // ID ya asignado al pasaje (PAS2409PAMPA1); si falta se calcula.
};

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const parts = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return { year, month, day };
};

// Nombre del cliente en mayúsculas, sin acentos ni espacios (AMEX, PAMPA).
function plainClient(client: string) {
  return client.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Abreviaturas que usa Urbano en el N° de certificado cuando no es el nombre entero.
const CERTIFICATE_ABBREVIATIONS: Record<string, string> = { CREDICOOP: "CREDI", MASSALIN: "MASS", PRODUCTECA: "PR", SYNGENTA: "SYN" };

// Cliente en el N° de certificado: la abreviatura de Urbano o el nombre en mayúsculas (AMEX, CREDI, PAMPA).
export function certificateClient(client: string) {
  const plain = plainClient(client);
  return CERTIFICATE_ABBREVIATIONS[plain] ?? plain;
}

// N° de certificado de Urbano: PAS + día + mes + cliente + número (PAS1211AMEX1 = 12/11, Amex, primera fila).
export function certificate(requestDate: string, client: string, number: number, prefix = "PAS") {
  return `${certificateBase(requestDate, client, prefix)}${number}`;
}

// El certificado sin el número (PAS1211AMEX): los pasajes que lo comparten se numeran 1, 2, 3...
export function certificateBase(requestDate: string, client: string, prefix = "PAS") {
  const { day, month } = parts(requestDate);
  return `${prefix}${day}${month}${certificateClient(client)}`;
}

// Prefijo del certificado según el shipper origen: PAS, salvo los que usan otro (Umiles: PJE).
export function certificatePrefix(shipper: string) {
  return URBANO_TEMPLATES[shipper.trim()]?.certificatePrefix ?? "PAS";
}

// Siguiente número libre para una base, mirando los certificados ya asignados (PAS2409PAMPA3 → 4). Así
// un ID no se repite aunque se rechacen pasajes o se exporten en otro orden.
export function nextCertificateNumber(base: string, taken: string[]) {
  let max = 0;
  for (const cert of taken) {
    if (!cert.startsWith(base)) continue;
    const rest = cert.slice(base.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return max + 1;
}

export const REQUEST_HEADER = ["FECHA", "SH", "SKU VIEJO", "DESCRIPCION", "CANT", "SH", "SKU NUEVO", "DESCRIPCION", "CANT"];

// Solicitud para mandar a Urbano por correo: la misma planilla que se puede volver a subir en la plataforma.
const sheetDate = (iso: string | null) => {
  if (!iso) return "";
  const { year, month, day } = parts(iso);
  return `${day}/${month}/${year}`;
};

export function requestSheet(pasajes: ExportPasaje[]) {
  return [
    REQUEST_HEADER,
    ...pasajes.map((p) => [
      sheetDate(p.requestDate), p.fromShipper, p.fromClientCode, p.fromDescription, p.quantity,
      p.toShipper, p.toClientCode, p.toDescription, p.quantity,
    ]),
  ];
}

// Solicitud armada desde la grilla de carga, antes de cargar los pasajes: cada lado con su propia cantidad
// (si una falta se usa la otra), como se completó.
export type DraftRequestRow = {
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

export function draftRequestSheet(rows: DraftRequestRow[]) {
  return [
    REQUEST_HEADER,
    ...rows.map((row) => [
      sheetDate(row.requestDate), row.fromShipper, row.fromClientCode, row.fromDescription, row.fromQuantity ?? row.toQuantity ?? "",
      row.toShipper, row.toClientCode, row.toDescription, row.toQuantity ?? row.fromQuantity ?? "",
    ]),
  ];
}

// Encabezado de la planilla de carga de Urbano, tal cual la usan (la segunda columna no tiene título y
// "Observaciones" va dos veces).
export const URBANO_UPLOAD_HEADER = [
  "Descripcion", "", "N° cta MR", "N° Certificado", "Nombre y Apellido", "Domicilo", "Observaciones", "mail",
  "Observaciones", "Localidad", "Cod Postal", "MODALIDAD", "CANTIDAD",
];

// Planilla de egresos para subir en Urbano, de un shipper origen. firstNumber es el número de certificado de
// la primera fila: sigue la numeración del día para ese cliente si ya hubo otro lote.
export function urbanoUploadSheet(pasajes: ExportPasaje[], requestDate: string, firstNumber = 1) {
  return [
    URBANO_UPLOAD_HEADER,
    ...pasajes.map((p, index) => [
      p.fromDescription, p.fromClientCode, "", p.certificate || certificate(requestDate, p.fromClient, firstNumber + index), "PASAJE DE STOCK",
      "ASCASUBI 3380", "", "", "", "BSAS", 9996, "E", p.quantity,
    ]),
  ];
}

// Segundo formato de carga de Urbano: una fila por egreso con el ID (el mismo N° de certificado), la
// dirección de Direct Group y la fecha.
export const URBANO_ID_HEADER = [
  "ID", "NOMBRE Y APELLIDO", "DIRECCIÓN", "CP", "PROVINCIA", "LOCALIDAD", "Código", "Cantidad", "Puntaje", "Fecha",
  "Producto", "Servicio", "Tel", "Celular",
];
// Columna de la fecha, que se guarda como fecha de Excel con formato d-mmm (10-nov).
export const URBANO_ID_DATE_COLUMN = 9;

// Número de serie de Excel de un día (días desde el 30/12/1899).
export function excelSerial(iso: string) {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

// Los códigos solo numéricos van como número, como los escriben en Urbano (4158).
const codeCell = (code: string) => (/^\d{1,15}$/.test(code.trim()) ? Number(code.trim()) : code);

export function urbanoIdSheet(pasajes: ExportPasaje[], requestDate: string, firstNumber = 1) {
  return [
    URBANO_ID_HEADER,
    ...pasajes.map((p, index) => [
      p.certificate || certificate(requestDate, p.fromClient, firstNumber + index), "PASAJE DE STOCK", "ASCASUBI 3380", 9996, "CABA", "BARRACAS",
      codeCell(p.fromClientCode), p.quantity, "", excelSerial(requestDate), p.fromDescription, "E", "", "",
    ]),
  ];
}

export function urbanoUploadFileName(requestDate: string, client: string, shipper: string) {
  const { day, month } = parts(requestDate);
  return `PASAJE ${Number(day)} ${MONTHS[Number(month) - 1]} ${plainClient(client)} ${shipper}.xlsx`.replace(/\s+/g, " ");
}

export function requestFileName(requestDate: string) {
  const { day, month } = parts(requestDate);
  return `SOLICITUD PASAJE DE STOCK ${Number(day)} ${MONTHS[Number(month) - 1]}.xlsx`;
}

// Planilla de egresos propia de cada shipper: Urbano la sube con la misma planilla que usa ese cliente para
// sus canjes, así que cada shipper tiene sus columnas. Armadas copiando los Excel de pasajes del 24/09/2026
// que mandó Aire Club (uno por shipper): solo cambian el certificado, el producto, la cantidad y la fecha.
type TemplateRow = { cert: string; p: ExportPasaje; date: number; client: string };
export type UrbanoTemplate = {
  sheetName: string;
  header: (string | null)[];
  row: (r: TemplateRow) => unknown[];
  dateColumns: Record<number, string>; // Columna → formato de fecha de Excel.
  certificatePrefix?: string; // PAS salvo que el cliente use otro (Umiles: PJE).
};

// Fila de n celdas vacías con algunas completas.
const filled = (length: number, values: Record<number, unknown>) =>
  Array.from({ length }, (_, index) => (index in values ? values[index] : ""));
const blanks = (count: number) => Array<null>(count).fill(null);

export const URBANO_TEMPLATES: Record<string, UrbanoTemplate> = {
  // Amex
  "1258": {
    sheetName: "Hoja1", header: URBANO_UPLOAD_HEADER, dateColumns: {},
    row: ({ cert, p }) => [p.fromDescription, p.fromClientCode, "", cert, "PASAJE DE STOCK", "ASCASUBI 3380", "", "", "", "BSAS", 9996, "E", p.quantity],
  },
  // Credicoop
  "1247": {
    sheetName: "Hoja1", header: URBANO_ID_HEADER, dateColumns: { 9: "d-mmm" },
    row: ({ cert, p, date }) => [
      cert, "PASAJE DE STOCK", "ASCASUBI 3381", 9996, "CABA", "BARRACAS", codeCell(p.fromClientCode), p.quantity, "", date, p.fromDescription, "E", "", "",
    ],
  },
  // Massalin
  "1369": {
    sheetName: "canjes_procesados - 2020-11-26T", dateColumns: {},
    header: [
      "Descripcion", "Codigo", "Nº Seguimiento", "Nombre y apellido RRHH", "Nombre y apellido", "Direccion", "Observaciones", "Localidad",
      "CP", "PVA", "Tipo de operacion", "Cantidad", "Company Code", "Ceco Facturacion", "Ceco", "Legajo", "Fecha", "Procedencia", "DNI",
      "Puntos Canjeados", "Importe",
    ],
    row: ({ cert, p, client }) => filled(21, {
      0: p.fromDescription, 1: p.fromClientCode, 2: cert, 3: `PASAJE DE STOCK ${client}`, 4: `PASAJE DE STOCK ${client}`,
      5: "ASCASUBI 3380", 7: "CABA", 8: 9996, 10: "E", 11: p.quantity,
    }),
  },
  // Banco La Pampa
  "1315": {
    sheetName: "Hoja1", dateColumns: { 0: "mm-dd-yy" },
    header: [
      "Fecha Canje", "Nro de Canje", "cli_código", "Descripcion", "SKU", null, null, "Nro de Socio", "Tipo Documento Socio",
      "Nro Documento Socio", "Apellido y Nombre", "Observaciones", "Observaciones2", "Direccion", "EntreCalles", "Localidad", "Provincia",
      "CP", "Telefono", "Celular", "MODALIDAD", "CANTIDAD",
    ],
    row: ({ cert, p, date, client }) => filled(22, {
      0: date, 2: cert, 3: p.fromDescription, 4: p.fromClientCode, 10: `PASAJE DE STOCK ${client}`, 11: "Buenos Aires ",
      13: "ASCASUBI 3381", 15: "BARRACAS", 16: "BSAS", 17: 9996, 20: "E", 21: p.quantity,
    }),
  },
  // Producteca / Comafi
  "1955": {
    sheetName: "Hoja 1", dateColumns: { 0: "mm-dd-yy" },
    header: [
      "Fecha", "ID", null, "NOMBRE Y APELLIDO", "SERVICIO", ...blanks(6), "SKU", ...blanks(3), "Cantidad", ...blanks(13),
      "Dirección", "Provincia", "Localidad", "Código Postal", ...blanks(23),
    ],
    row: ({ cert, p, date }) => filled(56, {
      0: date, 1: cert, 3: "PASAJE DE STOCK", 4: "E", 11: p.fromClientCode, 15: p.quantity,
      29: "ASCASUBI 3380", 30: "CABA", 31: "BARRACAS", 32: 9996,
    }),
  },
  // Syngenta. Así viene su planilla: la descripción va bajo "Código" y el código bajo "Producto".
  "3817": {
    sheetName: "Hoja1", dateColumns: { 15: "mm-dd-yy" },
    header: [
      "ID", "IdCliente", "Nombre y Apellido", "Calle", "Número", "Depto/Piso", "Provincia", "Localidad", "CP", "Cod_Area",
      "Telefono/Celular", "Mail de contacto", "Código", "Producto", "Cantidad", "Fecha Pedido", "SERVICIO", null,
      "Fecha Tomado Rambla", "Fecha Envío a Correo", "Fecha Entrega", "Link Andreani", "Observaciones",
    ],
    row: ({ cert, p, date }) => filled(23, {
      0: cert, 1: cert, 2: cert, 3: "ASCASUBI 3380", 5: "BARRACAS", 6: "BSAS", 8: 9996,
      12: p.fromDescription, 13: p.fromClientCode, 14: p.quantity, 15: date, 16: "E",
    }),
  },
  // Umiles / Macro
  "3102": {
    sheetName: "TRANSACCIONES", dateColumns: {}, certificatePrefix: "PJE",
    header: [
      "Fecha_creacion_orden", "Fecha_pago", "Orden_#", "Orden_pública_#", "ID", "Fabricante", "Cantidad", "GP_SKU", "SKU",
      "Producto_nombre", "Variantes", "Apellido", "NOMBRE", "Email", "DNI", "DIRECCIÓN", "CODIGO POSTAL", null, "LOCALIDAD",
      "Provincia", "SERVICIO",
    ],
    row: ({ cert, p }) => filled(21, {
      4: cert, 6: p.quantity, 8: p.fromClientCode, 12: "PASAJE DE STOCK", 15: "ASCASUBI 3380", 16: 9996, 18: "BARRACAS", 19: "CABA", 20: "E",
    }),
  },
};

export function urbanoTemplate(shipper: string) {
  return URBANO_TEMPLATES[shipper.trim()] ?? null;
}

// Planilla de egresos de un shipper con su propio formato. El cliente del nombre del archivo y del
// "PASAJE DE STOCK <CLIENTE>" es el del pasaje, también cuando el shipper agrupa varios (Producteca/Comafi).
export function urbanoTemplateSheet(template: UrbanoTemplate, pasajes: ExportPasaje[], requestDate: string, firstNumber = 1) {
  const date = excelSerial(requestDate);
  return [
    template.header.map((cell) => cell ?? ""),
    ...pasajes.map((p, index) => {
      const cert = p.certificate || certificate(requestDate, p.fromClient, firstNumber + index, template.certificatePrefix);
      return template.row({ cert, p, date, client: plainClient(p.fromClient) });
    }),
  ];
}

// Cliente en el nombre del archivo: el nombre en mayúsculas o la abreviatura que usan (MASSA, PR, SYN).
const FILE_LABELS: Record<string, string> = { MASSALIN: "MASSA", PRODUCTECA: "PR", SYNGENTA: "SYN" };

export function urbanoTemplateFileName(requestDate: string, client: string, shipper: string) {
  const { day, month } = parts(requestDate);
  const label = FILE_LABELS[plainClient(client)] ?? plainClient(client);
  return `PASAJE ${Number(day)} ${MONTHS[Number(month) - 1]} ${label} ${shipper}.xlsx`.replace(/\s+/g, " ");
}
