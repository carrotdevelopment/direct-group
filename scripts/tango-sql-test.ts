import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Same classification and columns as the ingresos query defined with the user
// while exploring the Tango schema (see docs/ADR-002-TANGO-INGRESOS-INTEGRATION.md).
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
    NULL AS OrigenDelPasaje,
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

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} en .env.`);
  }
  return value;
}

async function main() {
  const { default: sql } = await import("mssql");

  const host = requireEnv("TANGO_SQL_HOST");
  const database = requireEnv("TANGO_SQL_DATABASE");
  const user = requireEnv("TANGO_SQL_USER");
  const password = requireEnv("TANGO_SQL_PASSWORD");
  const instanceName = process.env.TANGO_SQL_INSTANCE || undefined;
  const port = process.env.TANGO_SQL_PORT ? Number(process.env.TANGO_SQL_PORT) : undefined;
  const encrypt = process.env.TANGO_SQL_ENCRYPT === "true";

  console.log(`Conectando a ${host}${instanceName ? `\\${instanceName}` : ""} / ${database}...`);

  const pool = new sql.ConnectionPool({
    server: host,
    database,
    user,
    password,
    port: instanceName ? undefined : port ?? 1433,
    options: {
      instanceName,
      encrypt,
      trustServerCertificate: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  });

  try {
    await pool.connect();
    console.log("Conexión establecida.");

    const health = await pool.request().query("SELECT DB_NAME() AS db_name, @@VERSION AS version");
    console.log(`Base conectada: ${health.recordset[0].db_name}`);
    console.log(String(health.recordset[0].version).split("\n")[0]);

    console.log("\nCorriendo la consulta de ingresos (TOP 20, más reciente primero)...\n");
    const result = await pool.request().query(INGRESOS_QUERY);
    console.log(`Filas devueltas: ${result.recordset.length}`);
    console.table(
      result.recordset.map((row) => ({
        Cliente: row.Cliente,
        Operacion: row.Operacion,
        FechaEntrega: row.FechaEntrega,
        CodigoCliente: row.CodigoCliente,
        Cantidad: row.Cantidad,
        OrdenDeCompra: row.OrdenDeCompra,
      })),
    );
  } finally {
    await pool.close();
  }
}

main()
  .then(() => {
    console.log("\nPrueba de conexión OK.");
  })
  .catch((error) => {
    console.error("\nFalló la prueba de conexión:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
