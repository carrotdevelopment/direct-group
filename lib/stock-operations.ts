// Qué operaciones suman y restan en el stock real de un código cliente. Lo usan la pantalla de Stock
// y la migración de código cliente, para que las dos hagan la misma cuenta.

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

// Los egresos importados guardan "ROBO_AJUSTE" y los cargados desde Pasajes "ROBO/AJUSTE": son lo mismo.
export function stockOperation(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/_/g, "/");
}

export function stockIncomeOperations(client: string) {
  const operations = new Set(["COMPRA", "PASAJE", "ROBO/AJUSTE", "DEVOLUCION"]);
  // En Tango los pasajes que entran a Umiles se registran como ajustes de ingreso.
  if (normalize(client) === "umiles") {
    operations.add("AJUSTE NO VALORIZADO");
    operations.add("AJUSTE VALORIZADO");
  }
  return operations;
}

export const STOCK_EGRESS_OPERATIONS = new Set(["CANJE", "ROBO/AJUSTE", "PASAJE", "CAMBIO"]);

type IncomeRow = { clientCode: string; operation: string; delivered: number };
type EgressRow = { clientCode: string; operation: string; quantity: number };

// Stock real de un código: lo entregado de las operaciones de ingreso menos los egresos.
export function realStockForCode(client: string, clientCode: string, incomes: IncomeRow[], egresses: EgressRow[]) {
  const code = normalize(clientCode);
  const incomeOperations = stockIncomeOperations(client);
  const income = incomes
    .filter((row) => normalize(row.clientCode) === code && incomeOperations.has(stockOperation(row.operation)))
    .reduce((sum, row) => sum + (Number(row.delivered) || 0), 0);
  const egress = egresses
    .filter((row) => normalize(row.clientCode) === code && STOCK_EGRESS_OPERATIONS.has(stockOperation(row.operation)))
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  return { income, egress, stock: income - egress };
}
