// Reporte diario de lo que se cargó en la plataforma y hay que cargar también en Tango: pasajes confirmados,
// ajustes que suman (ingresos) o restan (egresos) y devoluciones. Lo migrado de las planillas y lo que vino
// desde Tango no entra: eso ya está en Tango.

export type TangoLoadKind = "pasaje" | "ajusteSuma" | "ajusteResta" | "devolucion";

export type TangoLoadItem = {
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

// Arma el correo; null si no hay nada que cargar (no se manda).
export function buildTangoLoadReport(items: TangoLoadItem[], period: { from: Date; to: Date }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort(
    (a, b) => clean(a.client).localeCompare(clean(b.client), "es") || clean(a.clientCode).localeCompare(clean(b.clientCode), "es", { numeric: true }) || a.at.getTime() - b.at.getTime(),
  );
  const range = day(period.from) === day(period.to) ? `del ${day(period.from)}` : `del ${day(period.from)} al ${day(period.to)}`;
  const counts = SECTIONS.map(({ kind, title }) => ({ title, rows: sorted.filter((item) => item.kind === kind) })).filter((section) => section.rows.length > 0);
  const text = [
    `Movimientos cargados en la plataforma ${range} que hay que cargar también en Tango (${items.length}):`,
    "",
    ...counts.flatMap((section) => [`${section.title} (${section.rows.length})`, ...section.rows.map(line), ""]),
    "Lo que ya se haya cargado en Tango antes de este reporte se puede ignorar.",
  ].join("\n");
  return { subject: `Para cargar en Tango: ${items.length} movimiento${items.length === 1 ? "" : "s"} ${range}`, text };
}
