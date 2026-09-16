export type DataSource = "postgresql";

export function getDataSource(): DataSource {
  // Operational data always lives in PostgreSQL. Legacy environment values
  // must never reactivate local workbooks as a database.
  return "postgresql";
}

export function usesPostgres() {
  return getDataSource() === "postgresql";
}
