import { createHash } from "node:crypto";
import { urbanoClientCode, type UrbanoClientCode, type UrbanoStockRow } from "@/lib/urbano-stock";

// Respuestas de la API de Urbano para Direct Group, ya convertidas a lo que guarda la plataforma. Lógica pura.

export type UrbanoApiProduct = { shipper?: unknown; codigo?: unknown; nombre?: unknown; stock?: unknown; estado?: unknown };
export type UrbanoApiMovement = {
  tipo?: unknown; fecha?: unknown; numerocomprobante?: unknown; proveedor?: unknown; comp_id?: unknown; prod_id?: unknown;
  prod_descripcion?: unknown; lote?: unknown; serie?: unknown; entrada?: unknown; salida?: unknown; saldo?: unknown;
  razonsocial?: unknown;
};

export type UrbanoMovementRow = {
  key: string;
  type: string;
  date: Date;
  voucher: string | null;
  reference: string | null;
  company: string | null;
  urbanoCode: string;
  clientCode: string;
  product: string | null;
  lot: string | null;
  serial: string | null;
  inQuantity: number;
  outQuantity: number;
  balance: number;
  pasajeOutgoing: boolean;
};

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
// La API siempre usa punto decimal: "-1.000" es una unidad, no mil. Por eso no sirve urbanoNumber, que
// también acepta el formato argentino de los Excel.
const apiNumber = (value: unknown) => Number(text(value) || 0);

// La API identifica la cuenta por nombre en los productos y por número en los movimientos.
const COMPANY_BY_ACCOUNT: Record<string, string> = {
  "DIRECT GROUP (CREDICOOP)": "247",
  "DIRECT GROUP (AMEX)": "258",
  "DIRECT GROUP - MACRO": "310",
  "BANCO DE LA PAMPA DG": "315",
  "DIRECT GROUP SYNGENTA": "317",
  "DG MASSALIN 2": "369",
  "DIRECT GROUP (COMAFI)": "955",
};
const companyOf = (account: string) => COMPANY_BY_ACCOUNT[account.toUpperCase()] ?? account.slice(0, 20);

// Un código puede venir en varias filas (otro estado u otra ubicación): se suman, como en "Stock en línea".
export function urbanoApiStockRows(products: UrbanoApiProduct[]): UrbanoStockRow[] {
  const byCode = new Map<string, UrbanoStockRow>();
  products.forEach((product, index) => {
    const raw = text(product.codigo);
    if (!raw) return;
    const key = raw.toLowerCase();
    const current = byCode.get(key) ?? {
      row: index + 1,
      clientCode: urbanoClientCode(raw),
      product: "",
      quantity: 0,
      unavailable: 0,
      pendingPickup: 0,
      company: companyOf(text(product.shipper)),
    };
    const quantity = apiNumber(product.stock);
    current.quantity += quantity;
    if (text(product.estado).toUpperCase() !== "DISPONIBLE") current.unavailable += quantity;
    if (!current.product) current.product = text(product.nombre).replace(/\s+/g, " ");
    byCode.set(key, current);
  });
  return [...byCode.values()];
}

// La fecha llega como "05-11-2026 10:36:27", en hora de Argentina.
export function urbanoApiDate(value: unknown) {
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(text(value));
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Urbano marca las salidas por pasaje de stock con ese destinatario: "PASAJE DE STOCK", a veces seguido del
// nombre de la cuenta origen. No dice a qué cliente va.
export const isPasajeOutgoing = (type: string, recipient: unknown) => type === "PICKING" && /^PASAJE DE STOCK(\s|$)/i.test(text(recipient));

// No se guardan el usuario de Urbano ni la razón social, que en los picking es el nombre del destinatario
// (una persona): solo si la salida es un pasaje.
// Como la API repite los últimos días en cada consulta, la clave evita cargar dos veces el mismo movimiento.
export function urbanoApiMovementRows(movements: UrbanoApiMovement[]) {
  const rows: UrbanoMovementRow[] = [];
  let skipped = 0;
  for (const movement of movements) {
    const date = urbanoApiDate(movement.fecha);
    const urbanoCode = text(movement.prod_id);
    const type = text(movement.tipo).toUpperCase();
    const inQuantity = apiNumber(movement.entrada);
    const outQuantity = apiNumber(movement.salida);
    const balance = apiNumber(movement.saldo);
    if (!date || !urbanoCode || !type || ![inQuantity, outQuantity, balance].every(Number.isFinite)) {
      skipped += 1;
      continue;
    }
    const fields = {
      voucher: text(movement.numerocomprobante), reference: text(movement.proveedor), company: text(movement.comp_id),
      lot: text(movement.lote), serial: text(movement.serie),
    };
    const key = createHash("sha256")
      .update([date.toISOString(), type, fields.voucher, fields.company, urbanoCode, inQuantity, outQuantity, balance, fields.lot, fields.serial].join("|"))
      .digest("hex");
    rows.push({
      key, type, date, urbanoCode,
      clientCode: urbanoClientCode(urbanoCode),
      product: text(movement.prod_descripcion).replace(/\s+/g, " ") || null,
      voucher: fields.voucher || null, reference: fields.reference || null, company: fields.company || null,
      lot: fields.lot || null, serial: fields.serial || null,
      // La API informa la salida en negativo; se guarda como cantidad positiva.
      inQuantity, outQuantity: Math.abs(outQuantity), balance,
      pasajeOutgoing: isPasajeOutgoing(type, movement.razonsocial),
    });
  }
  return { rows, skipped };
}

// Cliente de cada código, con el mismo criterio que la carga de stock: primero el código vigente.
export function urbanoCodeFinder(codes: UrbanoClientCode[]) {
  const byCode = new Map<string, UrbanoClientCode[]>();
  for (const code of codes) {
    if (code.voided) continue;
    const key = code.clientCode.trim().toLowerCase();
    byCode.set(key, [...(byCode.get(key) ?? []), code]);
  }
  return (clientCode: string) => {
    const matches = byCode.get(clientCode.toLowerCase()) ?? [];
    return matches.find((code) => code.active) ?? matches[0] ?? null;
  };
}
