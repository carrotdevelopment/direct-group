// Armado del Excel del historial de egresos: las columnas visibles, en el mismo orden de la pantalla.

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
