// Reporte diario de lo que se cargó en la plataforma y hay que cargar también en Tango: pasajes confirmados,
// ajustes que suman (ingresos) o restan (egresos) y devoluciones. Lo migrado de las planillas y lo que vino
// desde Tango no entra: eso ya está en Tango.

export type TangoLoadKind = "pasaje" | "ajusteSuma" | "ajusteResta" | "devolucion";

export type TangoLoadItem = {
  // Identifica la fila de origen (p: pasaje, i: ingreso, e: egreso).
  id: string;
  // Código con el que el movimiento vuelve desde Tango (en un pasaje, el del destino).
  tangoCode: string;
  kind: TangoLoadKind;
  // Cuándo se cargó o confirmó en la plataforma.
  at: Date;
  client: string;
  clientCode: string;
  quantity: number;
  // Pasajes: hacia dónde va (cliente y código destino).
  toClient?: string;
  toClientCode?: string;
  uniqueCode?: string;
  product?: string;
  detail?: string;
  by?: string;
};

// Fila que llegó desde Tango por el conector.
export type TangoReturnedRow = { externalKey: string; operation: string; clientCode: string; quantity: number; date: Date };

// Operaciones con las que vuelve cada movimiento desde Tango. Los ajustes que restan no vuelven: el conector
// trae solo ingresos, así que no se pueden corroborar.
const RETURNED_AS: Record<TangoLoadKind, string[]> = {
  pasaje: ["PASAJE", "AJUSTE VALORIZADO", "AJUSTE NO VALORIZADO"],
  ajusteSuma: ["AJUSTE VALORIZADO", "AJUSTE NO VALORIZADO"],
  devolucion: ["DEVOLUCION"],
  ajusteResta: [],
};
export const canVerifyInTango = (item: TangoLoadItem) => RETURNED_AS[item.kind].length > 0;

const DAY_MS = 86_400_000;
const DAYS_BEFORE = 7;
const DAYS_AFTER = 30;
// En Tango los productos de Credicoop van como "CREDI4797"; en la plataforma, "4797".
const tangoCode = (value: string) => value.trim().toLowerCase().replace(/^credi(\d+)$/, "$1");

// Movimientos de la plataforma que ya volvieron desde Tango: mismo código, misma cantidad y fecha de Tango
// entre una semana antes y un mes después de cargarlo. De a uno y los más viejos primero, así dos
// movimientos iguales necesitan dos filas de Tango.
export function loadedInTango(items: TangoLoadItem[], returned: TangoReturnedRow[]) {
  const available = [...returned].sort((a, b) => a.date.getTime() - b.date.getTime() || a.externalKey.localeCompare(b.externalKey));
  const loaded = new Set<string>();
  for (const item of [...items].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const operations = RETURNED_AS[item.kind];
    const from = item.at.getTime() - DAYS_BEFORE * DAY_MS;
    const to = item.at.getTime() + DAYS_AFTER * DAY_MS;
    const index = available.findIndex(
      (row) =>
        operations.includes(row.operation) &&
        tangoCode(row.clientCode) === tangoCode(item.tangoCode) &&
        Math.abs(row.quantity - item.quantity) < 0.0001 &&
        row.date.getTime() >= from &&
        row.date.getTime() <= to,
    );
    if (index < 0) continue;
    loaded.add(item.id);
    available.splice(index, 1);
  }
  return loaded;
}

const SECTIONS: { kind: TangoLoadKind; title: string }[] = [
  { kind: "pasaje", title: "Pasajes confirmados" },
  { kind: "ajusteSuma", title: "Ajustes que suman stock" },
  { kind: "ajusteResta", title: "Ajustes que restan stock" },
  { kind: "devolucion", title: "Devoluciones" },
];

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const day = (date: Date) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
const dayTime = (date: Date) =>
  `${new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }).format(date)} ${new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)}`;
const quantity = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function line(item: TangoLoadItem) {
  const from = `${clean(item.client)} ${clean(item.clientCode)}`.trim();
  const parts =
    item.kind === "pasaje"
      ? [`${from} → ${`${clean(item.toClient)} ${clean(item.toClientCode)}`.trim() || "destino a definir"}`]
      : [from];
  parts.push(`${quantity(item.quantity)} u.`);
  const product = [clean(item.uniqueCode), clean(item.product)].filter(Boolean).join(" ");
  if (product) parts.push(product);
  if (clean(item.detail)) parts.push(clean(item.detail));
  parts.push(`${dayTime(item.at)}${clean(item.by) ? `, ${clean(item.by)}` : ""}`);
  return `• ${parts.join(" · ")}`;
}

const bySortKey = (a: TangoLoadItem, b: TangoLoadItem) =>
  clean(a.client).localeCompare(clean(b.client), "es") || clean(a.clientCode).localeCompare(clean(b.clientCode), "es", { numeric: true }) || a.at.getTime() - b.at.getTime();
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const sectionTitle = (kind: TangoLoadKind) => SECTIONS.find((section) => section.kind === kind)?.title.toLowerCase() ?? "";

// Arma el correo con lo nuevo del período y lo de antes que todavía no volvió desde Tango; null si no hay
// nada (no se manda).
export function buildTangoLoadReport(items: TangoLoadItem[], period: { from: Date; to: Date }, stillMissing: TangoLoadItem[] = []) {
  if (items.length === 0 && stillMissing.length === 0) return null;
  const range = day(period.from) === day(period.to) ? `del ${day(period.from)}` : `del ${day(period.from)} al ${day(period.to)}`;
  const sorted = [...items].sort(bySortKey);
  const sections = SECTIONS.map(({ kind, title }) => ({ title, rows: sorted.filter((item) => item.kind === kind) })).filter((section) => section.rows.length > 0);
  const missing = [...stillMissing].sort(bySortKey);
  const text = [
    ...(items.length
      ? [
          `Movimientos cargados en la plataforma ${range} que hay que cargar también en Tango (${items.length}):`,
          "",
          ...sections.flatMap((section) => [`${section.title} (${section.rows.length})`, ...section.rows.map(line), ""]),
        ]
      : [`No hubo movimientos nuevos ${range} para cargar en Tango.`, ""]),
    ...(missing.length
      ? [
          `Siguen sin aparecer en Tango (${missing.length})`,
          "Son de días anteriores y el conector de Tango todavía no los trajo. Si ya se cargaron, revisar que el código, la cantidad y el tipo de movimiento coincidan.",
          ...missing.map((item) => `${line(item)} · ${sectionTitle(item.kind)}`),
          "",
        ]
      : []),
    "Los pasajes, ajustes que suman y devoluciones se corroboran solos cuando vuelven desde Tango. Los ajustes que restan no se pueden corroborar: Tango no los devuelve.",
  ].join("\n");
  const parts = [
    items.length ? `${plural(items.length, "movimiento", "movimientos")} ${range}` : "",
    missing.length ? plural(missing.length, "pendiente anterior", "pendientes anteriores") : "",
  ].filter(Boolean);
  return { subject: `Para cargar en Tango: ${parts.join(" y ")}`, text };
}
