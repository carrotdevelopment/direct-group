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
