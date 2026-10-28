// Cambio de producto en un canje ya cargado. El canje se mueve de código: el código original recupera
// la cantidad del canje (esas unidades nunca salieron) y el código nuevo la descuenta. Lógica pura para
// mostrar el impacto en el stock antes de confirmar.

export type ProductSide = { clientCode: string; product: string; quantity: number; stockBefore: number };

export type ProductChangeImpact = {
  sameCode: boolean;
  from: ProductSide & { stockAfter: number };
  to: ProductSide & { stockAfter: number };
  messages: string[];
  warnings: string[];
};

const fmt = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
const signed = (value: number) => (value > 0 ? `+${fmt(value)}` : fmt(value));
const units = (value: number) => `${fmt(value)} ${value === 1 ? "unidad" : "unidades"}`;

export function productChangeImpact(from: ProductSide, to: ProductSide): ProductChangeImpact {
  const sameCode = from.clientCode.trim().toLowerCase() === to.clientCode.trim().toLowerCase();
  const messages: string[] = [];
  const warnings: string[] = [];
  if (sameCode) {
    // Mismo código, otra cantidad: solo cambia lo que se descuenta.
    const after = from.stockBefore + from.quantity - to.quantity;
    messages.push(
      `${from.clientCode} (${from.product || "sin nombre"}): el canje pasa de ${fmt(from.quantity)} a ${units(to.quantity)}. ` +
        `Stock ${fmt(from.stockBefore)} → ${fmt(after)} (${signed(from.quantity - to.quantity)}).`,
    );
    if (after < 0) warnings.push(`${from.clientCode} quedaría con stock negativo (${fmt(after)}).`);
    return { sameCode, from: { ...from, stockAfter: after }, to: { ...to, stockAfter: after }, messages, warnings };
  }
  const fromAfter = from.stockBefore + from.quantity;
  const toAfter = to.stockBefore - to.quantity;
  messages.push(
    `${from.clientCode} (${from.product || "sin nombre"}) recupera ${units(from.quantity)}, porque no se ${from.quantity === 1 ? "entregó" : "entregaron"}: ` +
      `stock ${fmt(from.stockBefore)} → ${fmt(fromAfter)}.`,
  );
  messages.push(
    `${to.clientCode} (${to.product || "sin nombre"}) descuenta ${units(to.quantity)}, porque se ${to.quantity === 1 ? "entrega" : "entregan"} en su lugar: ` +
      `stock ${fmt(to.stockBefore)} → ${fmt(toAfter)}.`,
  );
  if (toAfter < 0) warnings.push(`${to.clientCode} no tiene stock suficiente: quedaría en ${fmt(toAfter)}.`);
  return { sameCode, from: { ...from, stockAfter: fromAfter }, to: { ...to, stockAfter: toAfter }, messages, warnings };
}

// Texto que queda en los comentarios del canje para que se vea el cambio en la grilla.
export function productChangeComment(from: ProductSide, to: ProductSide, actor: string, when: Date, reason: string) {
  const day = when.toISOString().slice(0, 10).split("-").reverse().join("/");
  const change = from.clientCode.trim().toLowerCase() === to.clientCode.trim().toLowerCase()
    ? `cantidad ${fmt(from.quantity)} → ${fmt(to.quantity)}`
    : `${from.clientCode} x${fmt(from.quantity)} → ${to.clientCode} x${fmt(to.quantity)}`;
  return `[Cambio de producto ${day}, ${actor}: ${change}${reason ? ` · ${reason}` : ""}]`;
}
