// DG Tango Sync Agent — versión autónoma (sin dependencias del monorepo).
// Corre como una tarea programada dentro de la red de la empresa, con acceso
// a Tango SQL Server. Ver README.md de esta carpeta para instrucciones de
// instalación, y docs/ADR-002-TANGO-INGRESOS-INTEGRATION.md en el repo
// principal para el diseño completo.
//
// IMPORTANTE: si la consulta SQL de más abajo cambia en
// dg_platform/scripts/tango-sync-agent.ts, hay que actualizarla acá también:
// este archivo es una copia independiente, no se sincroniza solo.

require("dotenv").config();
const sql = require("mssql");

const TANGO_MAX_ROWS = 20000;
const TANGO_BATCH_SIZE = 200;

const INGRESOS_QUERY = `
SELECT
    d.ID_STA20 AS SourceId,
    h.ID_STA14 AS HeaderId,
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
    LTRIM(RTRIM(ISNULL(d.N_ORDEN_CO, ''))) AS OrdenDeCompra,
    LTRIM(RTRIM(d.COD_ARTICU)) AS CodigoCliente,
    d.CANTIDAD AS Cantidad,
    h.FECHA_MOV AS FechaEntrega,
    d.CANTIDAD AS Entregado,
    LTRIM(RTRIM(ISNULL(h.OBSERVACIO, ''))) AS Comentarios
FROM STA14 h
INNER JOIN STA20 d ON d.ID_STA14 = h.ID_STA14
LEFT JOIN STA22 dep ON LTRIM(RTRIM(dep.COD_SUCURS)) = LTRIM(RTRIM(d.COD_DEPOSI))
LEFT JOIN CPA35 oc ON oc.N_ORDEN_CO = d.N_ORDEN_CO
WHERE d.TIPO_MOV = 'E'
  AND h.FECHA_MOV >= @dateFrom AND h.FECHA_MOV <= @dateTo
ORDER BY h.FECHA_MOV ASC;
`;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} en .env.`);
  return value;
}

function toDateString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatQuantity(value) {
  const num = Number(value);
  return Number.isFinite(num) ? String(Math.round(num * 10000) / 10000) : "0";
}

async function connectSqlServer() {
  const instanceName = process.env.TANGO_SQL_INSTANCE || undefined;
  const port = process.env.TANGO_SQL_PORT ? Number(process.env.TANGO_SQL_PORT) : undefined;

  const pool = new sql.ConnectionPool({
    server: requireEnv("TANGO_SQL_HOST"),
    database: requireEnv("TANGO_SQL_DATABASE"),
    user: requireEnv("TANGO_SQL_USER"),
    password: requireEnv("TANGO_SQL_PASSWORD"),
    port: instanceName ? undefined : port || 1433,
    options: { instanceName, encrypt: process.env.TANGO_SQL_ENCRYPT === "true", trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });
  await pool.connect();
  return pool;
}

async function callAgent(body) {
  const apiUrl = requireEnv("TANGO_AGENT_API_URL").replace(/\/$/, "");
  const token = requireEnv("TANGO_CONNECTOR_TOKEN");
  const response = await fetch(`${apiUrl}/api/tango-sync/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `El servidor respondió ${response.status}.`);
  return payload;
}

async function processJob(pool, job) {
  const { id: jobId, claimToken, from, to } = job;
  console.log(`Importación tomada: ${jobId} (${from} a ${to}).`);

  async function fail(code) {
    try {
      await callAgent({ action: "fail", jobId, claimToken, code });
    } catch (error) {
      console.error("Además, no se pudo avisar la falla al servidor:", error);
    }
  }

  const result = await pool
    .request()
    .input("dateFrom", from)
    .input("dateTo", to)
    .query(INGRESOS_QUERY)
    .catch(async (error) => {
      await fail("SQL_QUERY");
      throw error;
    });

  if (result.recordset.length > TANGO_MAX_ROWS) {
    await fail("TOO_MANY_ROWS");
    throw new Error(`La consulta devolvió ${result.recordset.length} filas, más de las ${TANGO_MAX_ROWS} permitidas.`);
  }

  const rows = result.recordset.map((row) => ({
    sourceId: String(row.SourceId),
    headerId: String(row.HeaderId),
    client: String(row.Cliente ?? "").trim(),
    operation: String(row.Operacion),
    orderDate: toDateString(row.FechaPedido),
    purchaseOrder: String(row.OrdenDeCompra ?? "").trim().slice(0, 255),
    clientCode: String(row.CodigoCliente ?? "").trim().slice(0, 255),
    quantity: formatQuantity(row.Cantidad),
    deliveryDate: toDateString(row.FechaEntrega),
    deliveredQuantity: formatQuantity(row.Entregado),
    comments: String(row.Comentarios ?? "").trim().slice(0, 16000),
  }));

  if (rows.some((row) => !row.deliveryDate)) {
    await fail("INVALID_RESULT");
    throw new Error("Alguna fila no tiene fecha de entrega, y es un campo obligatorio.");
  }

  console.log(`Enviando ${rows.length} filas en lotes de ${TANGO_BATCH_SIZE}...`);
  const totalBatches = rows.length === 0 ? 0 : Math.ceil(rows.length / TANGO_BATCH_SIZE);
  for (let index = 0; index < totalBatches; index++) {
    const batch = rows.slice(index * TANGO_BATCH_SIZE, (index + 1) * TANGO_BATCH_SIZE);
    await callAgent({ action: "batch", jobId, claimToken, index, rows: batch }).catch(async (error) => {
      await fail("TRANSFER_FAILED");
      throw error;
    });
    console.log(`  Lote ${index + 1}/${totalBatches} enviado (${batch.length} filas).`);
  }

  await callAgent({ action: "finish", jobId, claimToken, totalRows: rows.length, totalBatches });
  console.log("Importación completada.");
}

async function main() {
  let pool;
  try {
    for (;;) {
      console.log("Consultando si hay una importación pendiente...");
      const claimed = await callAgent({ action: "claim" });
      if (!claimed.job) {
        console.log("No hay ninguna importación pendiente. Nada más para hacer.");
        break;
      }
      if (!pool) {
        try {
          pool = await connectSqlServer();
        } catch (error) {
          await callAgent({ action: "fail", jobId: claimed.job.id, claimToken: claimed.job.claimToken, code: "SQL_CONNECTION" }).catch(() => {});
          throw error;
        }
      }
      await processJob(pool, claimed.job);
    }
  } finally {
    if (pool) await pool.close();
  }
}

main().catch((error) => {
  console.error("El conector de Tango falló:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
