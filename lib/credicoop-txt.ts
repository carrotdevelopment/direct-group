// Solicitud de canjes de Credicoop (SOLIC_*.TXT): primera línea "lote.cantidad.fecha" y después un canje por
// línea, separado por punto y coma y sin títulos. Se lleva a una grilla con los títulos de su planilla, así
// sigue el mismo camino que un Excel. Si algo no cierra, no se lee nada.

export class CredicoopTxtError extends Error {}

const HEADERS = [
  "Día", "Mes", "Año", "IdRedencion", "Apellido_nombre", "Domicilio", "Codigo_postal", "Localidad", "Provincia",
  "IdRecompensa", "Estado", "Puntos", "Fecha", "Descripcion", "Telefono1", "Telefono2", "Cantidad",
];
const FIELDS = 15;

export function isTxtFile(name: string) {
  return /\.txt$/i.test(name);
}

// El banco puede mandarlo en UTF-8 o en el formato de Windows.
export function decodeTxt(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const clean = (value: string) => {
  const text = value.trim();
  return text.toLowerCase() === "null" ? "" : text;
};

export function credicoopTxtRows(content: string): string[][] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/).map((line, index) => ({ line, number: index + 1 })).filter(({ line }) => line.trim());
  const header = lines[0]?.line.trim().match(/^\d+\.(\d+)\.\d{8}$/);
  if (!header) throw new CredicoopTxtError("El TXT no tiene la primera línea de Credicoop (lote.cantidad.fecha).");
  const data = lines.slice(1);
  if (data.length !== Number(header[1])) {
    throw new CredicoopTxtError(`El TXT dice que trae ${Number(header[1])} canjes pero tiene ${data.length}. Puede estar incompleto: pedilo de nuevo.`);
  }
  return [HEADERS, ...data.map(({ line, number }) => {
    const cells = line.split(";").map(clean);
    if (cells.length !== FIELDS) throw new CredicoopTxtError(`Línea ${number}: tiene ${cells.length} datos y se esperan ${FIELDS}.`);
    // El séptimo dato es un número interno del banco que la planilla no guarda; el código del producto es el último.
    const [id, name, address, zip, province, city, , status, points, date, description, , phone1, phone2, code] = cells;
    const parts = date.match(/^(\d{4})(\d{2})(\d{2})$/);
    const iso = parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : "";
    if (!parts || Number.isNaN(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) {
      throw new CredicoopTxtError(`Línea ${number}: la fecha "${date}" no es válida.`);
    }
    if (!id || !code) throw new CredicoopTxtError(`Línea ${number}: falta el número de canje o el código del producto.`);
    // Cada línea es una unidad, como en la planilla. Otro número acá podría ser una cantidad: no se adivina.
    if (!/^(1|E)$/i.test(status)) throw new CredicoopTxtError(`Línea ${number}: el estado "${status}" no se conoce (se espera 1 o E).`);
    return [
      String(Number(parts[3])), String(Number(parts[2])), parts[1], id, name, address, zip, city, province,
      code, status, points, iso, description, phone1, phone2, "1",
    ];
  })];
}
