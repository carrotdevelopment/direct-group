// Prueba solo la conexión a Tango SQL Server, sin depender de la Plataforma
// DG (no usa TANGO_CONNECTOR_TOKEN ni TANGO_AGENT_API_URL). Correr con:
//   node test-sql.js

require("dotenv").config();
const sql = require("mssql");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} en .env.`);
  return value;
}

const INGRESOS_QUERY = `
SELECT TOP 20
    dep.NOMBRE_SUC AS Cliente,
    CASE LTRIM(RTRIM(h.T_COMP))
        WHEN 'REM' THEN 'COMPRA'
        WHEN 'FAC' THEN 'COMPRA'
        WHEN 'ENT' THEN 'ENTRADA'
        WHEN 'DEV' THEN 'DEVOLUCION'
        WHEN 'CAN' THEN 'CANCELACION DE CANJE'
        WHEN 'PAS' THEN 'PASAJE'
        WHEN 'AJN' THEN 'AJUSTE NO VALORIZADO'
        WHEN 'AJU' THEN 'AJUSTE VALORIZADO'
        WHEN 'ANM' THEN 'ANOMALOS'
        WHEN 'N/C' THEN 'NOTA DE CREDITO'
        ELSE 'OTRO'
    END AS Operacion,
    oc.FEC_EMISIO AS FechaPedido,
    d.N_ORDEN_CO AS OrdenDeCompra,
    d.COD_ARTICU AS CodigoCliente,
    d.CANTIDAD AS Cantidad,
    h.FECHA_MOV AS FechaEntrega,
    d.CANTIDAD AS Entregado,
    h.OBSERVACIO AS Comentarios
FROM STA14 h
INNER JOIN STA20 d ON d.ID_STA14 = h.ID_STA14
LEFT JOIN STA22 dep ON LTRIM(RTRIM(dep.COD_SUCURS)) = LTRIM(RTRIM(d.COD_DEPOSI))
LEFT JOIN CPA35 oc ON oc.N_ORDEN_CO = d.N_ORDEN_CO
WHERE d.TIPO_MOV = 'E'
ORDER BY h.FECHA_MOV DESC;
`;

async function main() {
  const instanceName = process.env.TANGO_SQL_INSTANCE || undefined;
  const port = process.env.TANGO_SQL_PORT ? Number(process.env.TANGO_SQL_PORT) : undefined;
  const host = requireEnv("TANGO_SQL_HOST");
  const database = requireEnv("TANGO_SQL_DATABASE");

  console.log(`Conectando a ${host}${instanceName ? `\\${instanceName}` : ""} / ${database}...`);

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
    console.log("Conexión establecida.");
    const result = await pool.request().query(INGRESOS_QUERY);
    console.log(`Filas devueltas: ${result.recordset.length}`);
    console.table(
      result.recordset.map((row) => ({
        Cliente: row.Cliente,
        Operacion: row.Operacion,
        FechaEntrega: row.FechaEntrega,
        CodigoCliente: row.CodigoCliente,
        Cantidad: row.Cantidad,
      })),
    );
  } finally {
    await pool.close();
  }
}

main()
  .then(() => console.log("\nPrueba de conexión OK."))
  .catch((error) => {
    console.error("\nFalló la prueba de conexión:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
