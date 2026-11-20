// Ubica los datos de un archivo de egresos a partir de las columnas configuradas para el cliente.
// Busca la fila de títulos (la primera, entre las 30 primeras, que contiene al menos la mitad de las
// columnas configuradas) y toma los datos desde la fila siguiente, leyendo cada columna por su
// título. Si no encuentra los títulos, usa la fila de inicio configurada (contando desde 0) y lee
// las columnas por posición, como antes.

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

export function locateEgressData(rows: unknown[][], columns: string[], fallbackStartRow: number) {
  const wanted = columns.map(normalize);
  const configured = new Set(wanted.filter(Boolean));
  const needed = Math.max(2, Math.ceil(configured.size / 2));
  const headerIndex = configured.size
    ? rows.slice(0, 30).findIndex((row) => new Set(row.map(normalize).filter((cell) => configured.has(cell))).size >= needed)
    : -1;

  if (headerIndex < 0) {
    return {
      headerFound: false,
      headerIndex: Math.max(0, fallbackStartRow - 1),
      dataStart: fallbackStartRow,
      positions: columns.map((_, index) => index),
    };
  }
  const header = rows[headerIndex].map(normalize);
  return {
    headerFound: true,
    headerIndex,
    dataStart: headerIndex + 1,
    // Cada columna configurada se lee donde está su título; si no aparece, por su posición.
    positions: wanted.map((name, index) => {
      const found = name ? header.indexOf(name) : -1;
      return found >= 0 ? found : index;
    }),
  };
}

// Caracteres de Windows-1252 en 0x80-0x9F: así se ven esos bytes cuando un texto UTF-8 se leyó como Latin-1.
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

// Algunos sistemas de los clientes exportan el texto con los acentos rotos ("SÃBANAS", "VELLÃ“N", "2 Â½"):
// eran letras UTF-8 leídas como Latin-1. Se recomponen; si el texto no tiene esa forma, queda como está.
export function repairMojibake(value: string) {
  if (!/[ÃÂ][^\x00-\x7f]/.test(value)) return value;
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const byte = code <= 0xff ? code : CP1252[char];
    if (byte === undefined) return value;
    bytes.push(byte);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

// Fecha con barras o guiones de un Excel de cliente: "18/11/2026" (día/mes, lo habitual acá) o el formato
// de EE.UU. que exportan algunos sistemas, "11/18/2026 8:25:00 PM" (mes/día). Es mes/día si el segundo número
// pasa de 12, o si trae AM/PM y el primero no pasa de 12. Devuelve null si no es una fecha válida.
export function slashDate(raw: string) {
  const match = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return null;
  const [first, second] = [Number(match[1]), Number(match[2])];
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const monthFirst = (second > 12 && first <= 12) || (/\b[ap]\.?\s?m\.?$/i.test(raw.trim()) && first <= 12);
  const [month, day] = monthFirst ? [first, second] : [second, first];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, iso: date.toISOString().slice(0, 10), date };
}
