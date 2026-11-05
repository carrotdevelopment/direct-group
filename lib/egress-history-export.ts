// Armado del Excel del historial de egresos: las columnas visibles, en el mismo orden de la pantalla.

// Tope por exportación, medido en producción (2 GB de memoria): 20.000 filas suman unos 320 MB al
// proceso y 50.000 unos 750 MB; un rango completo de Santander (270.000) tiraría la app para todos.
export const EGRESS_EXPORT_MAX_ROWS = 20000;

export function egressExportTooLargeMessage(rows: number) {
  return `El rango elegido tiene ${rows.toLocaleString("es-AR")} egresos y se pueden exportar hasta ${EGRESS_EXPORT_MAX_ROWS.toLocaleString("es-AR")} por vez. Acotá las fechas.`;
}

export type EgressExportRow = {
  cliente: string;
  tipoLabel: string;
  codigo: string;
  desc: string;
  cant: string;
  raw: Record<string, string>;
};

export function egressExportCell(row: EgressExportRow, column: string): string | number {
  if (column === "cliente") return row.cliente;
  if (column === "tipo") return row.tipoLabel;
  if (column === "codigo") return row.codigo;
  if (column === "desc") return row.desc;
  if (column === "cant") {
    const quantity = Number(row.cant);
    return row.cant.trim() !== "" && Number.isFinite(quantity) ? quantity : row.cant;
  }
  return row.raw[column] ?? "";
}

export function egressExportSheet(rows: EgressExportRow[], columns: { key: string; label: string }[]) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => egressExportCell(row, column.key))),
  ];
}

export function egressExportFileName(client: string, from: string, to: string) {
  const safeClient = client.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cliente";
  return `egresos-${safeClient}-${from}-a-${to}.xlsx`;
}
