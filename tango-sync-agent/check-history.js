// Solo para saber cuánto historial hay antes de traerlo todo. No modifica nada.
// Correr con: node check-history.js

require("dotenv").config();
const sql = require("mssql");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} en .env.`);
  return value;
}

const QUERY = `
SELECT
  COUNT(*) AS Total,
  MIN(h.FECHA_MOV) AS Desde,
  MAX(h.FECHA_MOV) AS Hasta
FROM STA14 h
INNER JOIN STA20 d ON d.ID_STA14 = h.ID_STA14
WHERE d.TIPO_MOV = 'E';
`;

const BY_YEAR_QUERY = `
SELECT YEAR(h.FECHA_MOV) AS Anio, COUNT(*) AS Filas
FROM STA14 h
INNER JOIN STA20 d ON d.ID_STA14 = h.ID_STA14
WHERE d.TIPO_MOV = 'E'
GROUP BY YEAR(h.FECHA_MOV)
ORDER BY Anio;
`;

async function main() {
  const instanceName = process.env.TANGO_SQL_INSTANCE || undefined;
  const port = process.env.TANGO_SQL_PORT ? Number(process.env.TANGO_SQL_PORT) : undefined;
  const host = requireEnv("TANGO_SQL_HOST");
  const database = requireEnv("TANGO_SQL_DATABASE");

  const pool = new sql.ConnectionPool({
    server: host,
    database,
    user: requireEnv("TANGO_SQL_USER"),
    password: requireEnv("TANGO_SQL_PASSWORD"),
    port: instanceName ? undefined : port || 1433,
    options: { instanceName, encrypt: process.env.TANGO_SQL_ENCRYPT === "true", trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  });

  try {
    await pool.connect();
    const totals = await pool.request().query(QUERY);
    console.log("Resumen total:");
    console.table(totals.recordset);

    const byYear = await pool.request().query(BY_YEAR_QUERY);
    console.log("Filas por año:");
    console.table(byYear.recordset);
  } finally {
    await pool.close();
  }
}

main()
  .then(() => console.log("Listo."))
  .catch((error) => {
    console.error("Falló la consulta:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
