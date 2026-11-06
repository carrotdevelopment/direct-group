// Cruza los pasajes abiertos con las recepciones que informa Urbano. Urbano no marca qué recepción es un
// pasaje: se reconoce por código del destino, cantidad y fecha. Lógica pura.

export type OpenPasaje = { id: string; toClient: string; toClientCode: string; quantity: number; requestDate: Date | null; createdAt: Date };
export type UrbanoReception<Id> = { id: Id; client: string | null; clientCode: string; quantity: number; date: Date; voucher: string | null };
export type PasajeMatch<Id> = { pasajeId: string; quantity: number; receptionIds: Id[]; vouchers: string[] };
export type PasajeReview = { pasajeId: string; received: number; vouchers: string[] };

const DAY_MS = 86_400_000;
const normalize = (value: string) => value.trim().toLowerCase();

// Una recepción anterior al pasaje es otra mercadería. Se toma desde la fecha de la solicitud a Urbano, que
// puede ser anterior a la carga en la plataforma, con un día de margen por las diferencias de horario.
export function urbanoSearchStart(pasaje: Pick<OpenPasaje, "requestDate" | "createdAt">) {
  return new Date((pasaje.requestDate ?? pasaje.createdAt).getTime() - DAY_MS);
}

function vouchersOf<Id>(receptions: UrbanoReception<Id>[]) {
  return [...new Set(receptions.map((item) => item.voucher).filter((voucher): voucher is string => !!voucher))];
}

// Se confirma solo si la cantidad coincide exacta: primero con una recepción, después sumando las de ese
// código en orden de fecha (Urbano puede recibir en partes). Si Urbano informó otra cantidad, no se toca
// nada y el pasaje queda para que lo revise una persona. Cada recepción se usa una sola vez.
export function matchUrbanoReceptions<Id>(pasajes: OpenPasaje[], receptions: UrbanoReception<Id>[]) {
  const oldestFirst = [...pasajes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const available = [...receptions]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const candidates = (pasaje: OpenPasaje) => {
    const from = urbanoSearchStart(pasaje).getTime();
    // Un mismo código puede existir en dos clientes. Si Urbano no informó el cliente, alcanza con el código.
    return available.filter((item) =>
      normalize(item.clientCode) === normalize(pasaje.toClientCode) &&
      (item.client === null || normalize(item.client) === normalize(pasaje.toClient)) &&
      item.date.getTime() >= from);
  };
  const take = (pasaje: OpenPasaje, used: UrbanoReception<Id>[]): PasajeMatch<Id> => {
    for (const item of used) available.splice(available.indexOf(item), 1);
    return { pasajeId: pasaje.id, quantity: pasaje.quantity, receptionIds: used.map((item) => item.id), vouchers: vouchersOf(used) };
  };

  const matches: PasajeMatch<Id>[] = [];
  const pending: OpenPasaje[] = [];
  for (const pasaje of oldestFirst) {
    const exact = candidates(pasaje).find((item) => item.quantity === pasaje.quantity);
    if (exact) matches.push(take(pasaje, [exact]));
    else pending.push(pasaje);
  }

  const review: PasajeReview[] = [];
  for (const pasaje of pending) {
    const found = candidates(pasaje);
    const used: UrbanoReception<Id>[] = [];
    let sum = 0;
    for (const item of found) {
      if (sum + item.quantity > pasaje.quantity) break;
      used.push(item);
      sum += item.quantity;
    }
    if (used.length > 0 && sum === pasaje.quantity) matches.push(take(pasaje, used));
    else if (found.length > 0) {
      review.push({ pasajeId: pasaje.id, received: found.reduce((total, item) => total + item.quantity, 0), vouchers: vouchersOf(found) });
    }
  }
  return { matches, review };
}
