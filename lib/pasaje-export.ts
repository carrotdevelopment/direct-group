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
};

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const parts = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return { year, month, day };
};

// Cliente en el N° de certificado y en el nombre del archivo: en mayúsculas, sin acentos ni espacios (AMEX, PAMPA).
export function certificateClient(client: string) {
  return client.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// N° de certificado de Urbano: PAS + día + mes + cliente + número (PAS1211AMEX1 = 12/11, Amex, primera fila).
export function certificate(requestDate: string, client: string, number: number) {
  const { day, month } = parts(requestDate);
  return `PAS${day}${month}${certificateClient(client)}${number}`;
}

export const REQUEST_HEADER = ["FECHA", "SH", "SKU VIEJO", "DESCRIPCION", "CANT", "SH", "SKU NUEVO", "DESCRIPCION", "CANT"];

// Solicitud para mandar a Urbano por correo: la misma planilla que se puede volver a subir en la plataforma.
export function requestSheet(pasajes: ExportPasaje[]) {
  const date = (iso: string | null) => {
    if (!iso) return "";
    const { year, month, day } = parts(iso);
    return `${day}/${month}/${year}`;
  };
  return [
    REQUEST_HEADER,
    ...pasajes.map((p) => [
      date(p.requestDate), p.fromShipper, p.fromClientCode, p.fromDescription, p.quantity,
      p.toShipper, p.toClientCode, p.toDescription, p.quantity,
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
      p.fromDescription, p.fromClientCode, "", certificate(requestDate, p.fromClient, firstNumber + index), "PASAJE DE STOCK",
      "ASCASUBI 3380", "", "", "", "BSAS", 9996, "E", p.quantity,
    ]),
  ];
}

export function urbanoUploadFileName(requestDate: string, client: string, shipper: string) {
  const { day, month } = parts(requestDate);
  return `PASAJE ${Number(day)} ${MONTHS[Number(month) - 1]} ${certificateClient(client)} ${shipper}.xlsx`.replace(/\s+/g, " ");
}

export function requestFileName(requestDate: string) {
  const { day, month } = parts(requestDate);
  return `SOLICITUD PASAJE DE STOCK ${Number(day)} ${MONTHS[Number(month) - 1]}.xlsx`;
}
