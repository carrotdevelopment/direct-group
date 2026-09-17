import { Prisma } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { egressSchemas, type EgressClient, type EgressRow } from "@/lib/operation-excel-db";
import { egressSourceHash, validateEgressScope, type EgressBulkScope } from "@/lib/egress-controls";

export type CanonicalEgressField =
  | "dateDay"
  | "dateMonth"
  | "dateYear"
  | "date"
  | "clientCode"
  | "product"
  | "quantity"
  | "destination"
  | "comments"
  | "operation";

export type EgressFieldMapping = Record<CanonicalEgressField, string[]>;

export type EgressProfile = {
  client: EgressClient;
  version: number;
  active: boolean;
  sheetName: string;
  headerRow: number;
  columns: string[];
  mapping: EgressFieldMapping;
};

const aliases = (...values: string[]) => values;

export const defaultEgressMappings: Record<EgressClient, EgressFieldMapping> = {
  Amex: {
    dateDay: aliases("Día", "Dia"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha"),
    clientCode: aliases("Codigo cliente", "Código Cliente"), product: aliases("Descripcion"), quantity: aliases("Cantidad", "Amount"),
    destination: aliases("Destino"), comments: aliases("Comentarios", "Observaciones"), operation: aliases("Operación", "Operacion"),
  },
  Credicoop: {
    dateDay: aliases("Día", "Dia"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha"),
    clientCode: aliases("IdRedencion", "IdRecompensa"), product: aliases("Descripcion", "Apellido_nombre"), quantity: aliases("Cantidad"),
    destination: aliases("Destino"), comments: aliases("Comentarios"), operation: aliases("Operación", "Operacion"),
  },
  HSBC: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("fecha", "Fecha"),
    clientCode: aliases("Código Cliente", "Codigo Cliente"), product: aliases("nombre_producto", "descripcion_corta"), quantity: aliases("Cantidad"),
    destination: aliases("Destino", "Provincia"), comments: aliases("Comentarios"), operation: aliases("Operación", "Operacion"),
  },
  Importados: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases(),
    clientCode: aliases("Código Cliente", "Codigo Cliente"), product: aliases("PRODUCTO", "Producto"), quantity: aliases("Cantidad"),
    destination: aliases("Destino"), comments: aliases("Comentarios"), operation: aliases("Operación", "Operacion"),
  },
  Massalin: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha"),
    clientCode: aliases("Código Cliente", "Codigo Cliente"), product: aliases("Descripcion"), quantity: aliases("Cantidad"),
    destination: aliases("Destino"), comments: aliases("Comentarios", "Observaciones"), operation: aliases("Operación", "Operacion", "Tipo de operacion"),
  },
  Pampa: {
    dateDay: aliases("Día", "Dia"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha Canje"),
    clientCode: aliases("SKU", "cli_código", "cli_codigo"), product: aliases("Descripcion"), quantity: aliases("Cantidad", "u"),
    destination: aliases("Destino", "Provincia"), comments: aliases("Comentarios", "Observaciones"), operation: aliases("Operación", "Operacion"),
  },
  Producteca: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases(),
    clientCode: aliases("Código Cliente", "Codigo Cliente", "SKU", "Código"), product: aliases("Descripcion", "Artículo", "Articulo"), quantity: aliases("Cantidad"),
    destination: aliases("Destino", "Provincia"), comments: aliases("Comentarios", "Notas Pedido"), operation: aliases("Operación", "Operacion"),
  },
  Santander: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha"),
    clientCode: aliases("SKU"), product: aliases("ID"), quantity: aliases("Cantidad"),
    destination: aliases("Destino"), comments: aliases("Comentario", "Comentarios"), operation: aliases("Operación", "Operacion"),
  },
  Syngenta: {
    dateDay: aliases("Día", "Dia"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha pedido"),
    clientCode: aliases("Código producto", "Codigo producto", "IdCliente"), product: aliases("Producto"), quantity: aliases("Cantidad"),
    destination: aliases("Destino", "Provincia"), comments: aliases("Comentarios"), operation: aliases("Operación", "Operacion"),
  },
  Umiles: {
    dateDay: aliases("Dia", "Día"), dateMonth: aliases("Mes"), dateYear: aliases("Año", "Anio"), date: aliases("Fecha canje"),
    clientCode: aliases("Código Cliente", "Codigo Cliente"), product: aliases("PRODUCTO", "Producto"), quantity: aliases("Cantidad"),
    destination: aliases("Destino"), comments: aliases("Comentarios"), operation: aliases("Operación", "Operacion"),
  },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function valueFrom(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (Object.hasOwn(row, name) && text(row[name])) return row[name];
  }
  const wanted = new Set(names.map(normalized));
  return Object.entries(row).find(([key, value]) => wanted.has(normalized(key)) && text(value))?.[1];
}

function numeric(value: unknown) {
  const raw = text(value).replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const result = Number(raw);
  return Number.isFinite(result) ? result : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function dateFromRow(row: Record<string, unknown>, mapping: EgressFieldMapping) {
  const day = numeric(valueFrom(row, mapping.dateDay));
  const month = numeric(valueFrom(row, mapping.dateMonth));
  const yearValue = numeric(valueFrom(row, mapping.dateYear));
  if (day && month && yearValue) {
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
  }
  const raw = text(valueFrom(row, mapping.date));
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const local = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (local) {
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return new Date(Date.UTC(year, Number(local[2]) - 1, Number(local[1])));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function operationValue(value: unknown, fallback = "CANJE") {
  const result = normalized(value).replace(/\s+/g, "_").toUpperCase();
  if (result.includes("PASAJE")) return "PASAJE";
  if (result.includes("ROBO") || result.includes("AJUSTE")) return "ROBO_AJUSTE";
  if (result.includes("CAMBIO")) return "CAMBIO";
  if (result.includes("REENVIO")) return "REENVIO";
  return fallback;
}

export function canonicalizeEgressRecord(
  record: Record<string, unknown>,
  mapping: EgressFieldMapping,
  options: {
    fallbackOperation?: string;
    resolveUniqueCode?: (clientCode: string) => string;
    resolveProduct?: (uniqueCode: string) => string;
  } = {},
) {
  const clientCode = text(valueFrom(record, mapping.clientCode));
  const uniqueCode = options.resolveUniqueCode?.(clientCode) ?? "";
  return {
    operation: operationValue(valueFrom(record, mapping.operation), options.fallbackOperation ?? "CANJE"),
    date: dateFromRow(record, mapping),
    clientCode,
    uniqueCode,
    product: options.resolveProduct?.(uniqueCode) || text(valueFrom(record, mapping.product)),
    quantity: numeric(valueFrom(record, mapping.quantity)),
    destination: text(valueFrom(record, mapping.destination)),
    comments: text(valueFrom(record, mapping.comments)),
  };
}

export function defaultEgressProfiles(): EgressProfile[] {
  return (Object.keys(egressSchemas) as EgressClient[]).map((client) => ({
    client,
    version: 1,
    active: true,
    sheetName: "",
    headerRow: 2,
    columns: [...egressSchemas[client]],
    mapping: defaultEgressMappings[client],
  }));
}

export async function seedAndReadEgressProfiles() {
  const defaults = defaultEgressProfiles();
  for (const profile of defaults) {
    await excelPostgres.egressImportProfile.upsert({
      where: { client_version: { client: profile.client, version: profile.version } },
      update: {},
      create: {
        client: profile.client, version: profile.version, active: true,
        sheetName: profile.sheetName || null, headerRow: profile.headerRow,
        columns: profile.columns, mapping: profile.mapping,
      },
    });
  }
  const rows = await excelPostgres.egressImportProfile.findMany({ where: { active: true }, orderBy: { client: "asc" } });
  return rows.map((row): EgressProfile => ({
    client: row.client as EgressClient,
    version: row.version,
    active: row.active,
    sheetName: row.sheetName ?? "",
    headerRow: row.headerRow,
    columns: row.columns as string[],
    mapping: row.mapping as EgressFieldMapping,
  }));
}

export async function saveEgressProfile(profile: EgressProfile) {
  return excelPostgres.egressImportProfile.upsert({
    where: { client_version: { client: profile.client, version: profile.version } },
    update: {
      active: profile.active, sheetName: profile.sheetName || null, headerRow: profile.headerRow,
      columns: profile.columns, mapping: profile.mapping,
    },
    create: {
      client: profile.client, version: profile.version, active: profile.active,
      sheetName: profile.sheetName || null, headerRow: profile.headerRow,
      columns: profile.columns, mapping: profile.mapping,
    },
  });
}

type ImportSource = {
  type?: "FILE" | "PASTE" | "MANUAL" | "MIGRATION";
  fileName?: string;
  fileHash?: string;
  sheetName?: string;
  headers?: string[];
  values?: unknown[][];
};

export class DuplicateEgressImportError extends Error {}

export async function appendGenericEgressRecords(
  client: EgressClient,
  records: Record<string, unknown>[],
  source: ImportSource = {},
  actor?: string,
) {
  if (source.fileHash) {
    const duplicate = await excelPostgres.egressImportBatch.findUnique({
      where: { client_fileHash: { client, fileHash: source.fileHash } },
    });
    if (duplicate) throw new DuplicateEgressImportError(`El archivo ${source.fileName || "seleccionado"} ya fue importado para ${client}.`);
  }
  const profiles = await seedAndReadEgressProfiles();
  const profile = profiles.find((item) => item.client === client) ?? defaultEgressProfiles().find((item) => item.client === client)!;
  const [clientCodes, products] = await Promise.all([
    excelPostgres.excelClientCode.findMany({
      where: { client: { equals: client, mode: "insensitive" }, active: true },
      orderBy: [{ assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
    }),
    excelPostgres.excelProduct.findMany(),
  ]);
  const codeMap = new Map<string, string>();
  clientCodes.forEach((item) => {
    const key = normalized(item.clientCode);
    if (key && !codeMap.has(key)) codeMap.set(key, text(item.uniqueCode));
  });
  const productMap = new Map(products.map((item) => [normalized(item.uniqueCode), text(item.product)]));
  const headers = source.headers ?? Object.keys(records[0] ?? {});
  const batch = await excelPostgres.egressImportBatch.create({
    data: {
      client, sourceType: source.type ?? "MANUAL", fileName: source.fileName || null,
      fileHash: source.fileHash || null, sheetName: source.sheetName || null,
      headers, status: "PROCESSING", totalRows: records.length,
    },
  });
  try {
    const prepared = records.map((record, index) => ({
      record,
      sourceHash: egressSourceHash(record),
      sourceRowNumber: index + profile.headerRow + 1,
      canonical: canonicalizeEgressRecord(record, profile.mapping, {
        resolveUniqueCode: (clientCode) => codeMap.get(normalized(clientCode)) ?? "",
        resolveProduct: (uniqueCode) => productMap.get(normalized(uniqueCode)) ?? "",
      }),
      values: jsonValue(source.values?.[index] ?? headers.map((header) => record[header] ?? "")),
    }));
    await excelPostgres.$transaction(async (transaction) => {
      // Serializes imports for this client, including different files submitted together.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`egress-import:${client}`}))`;
      const hashes = new Set<string>();
      for (const item of prepared) {
        if (hashes.has(item.sourceHash)) throw new DuplicateEgressImportError(`Fila ${item.sourceRowNumber}: registro repetido dentro de la carga. No se importó ninguna fila.`);
        hashes.add(item.sourceHash);
      }
      // Postgres caps prepared statements at ~32k bind parameters: chunk large
      // imports (e.g. Credicoop's ~129k rows) instead of sending one giant IN(...).
      const hashList = [...hashes];
      const hashChunkSize = 20000;
      const previousSelect = { id: true, sourceHash: true, rawRow: { select: { payload: true } } } as const;
      const previousChunks = await Promise.all(
        Array.from({ length: Math.ceil(hashList.length / hashChunkSize) }, (_, index) =>
          transaction.egress.findMany({
            where: { client, sourceHash: { in: hashList.slice(index * hashChunkSize, (index + 1) * hashChunkSize) } },
            select: previousSelect,
          }),
        ),
      );
      const previous = [
        ...previousChunks.flat(),
        ...(await transaction.egress.findMany({ where: { client, sourceHash: null }, select: previousSelect })),
      ];
      for (const row of previous) {
        const hash = row.sourceHash ?? (row.rawRow?.payload && typeof row.rawRow.payload === "object" && !Array.isArray(row.rawRow.payload)
          ? egressSourceHash(row.rawRow.payload as Record<string, unknown>) : null);
        if (hash && hashes.has(hash)) throw new DuplicateEgressImportError(`La carga contiene un registro ya importado (ID ${row.id}). No se importó ninguna fila.`);
      }
      for (let offset = 0; offset < prepared.length; offset += 500) {
        const chunk = prepared.slice(offset, offset + 500);
        const rawRows = await transaction.egressRawRow.createManyAndReturn({
          data: chunk.map((item) => ({
            batchId: batch.id,
            client,
            sourceRowNumber: item.sourceRowNumber,
            headers,
            values: item.values,
            payload: item.record as Prisma.InputJsonObject,
          })),
          select: { id: true, sourceRowNumber: true },
        });
        const rawIdBySourceRow = new Map(rawRows.map((row) => [row.sourceRowNumber, row.id]));
        await transaction.egress.createMany({
          data: chunk.map(({ canonical, sourceRowNumber, sourceHash }) => ({
            client,
            sourceHash,
            createdBy: actor ?? null,
            modifiedBy: actor ?? null,
            operation: canonical.operation,
            date: canonical.date,
            clientCode: canonical.clientCode || null,
            uniqueCode: canonical.uniqueCode || null,
            product: canonical.product || null,
            quantity: canonical.quantity,
            destination: canonical.destination || null,
            comments: canonical.comments || null,
            rawRowId: rawIdBySourceRow.get(sourceRowNumber)!,
          })),
        });
      }
    }, { timeout: 600_000 });
    await excelPostgres.egressImportBatch.update({
      where: { id: batch.id },
      data: { status: "COMPLETED", importedRows: records.length, finishedAt: new Date() },
    });
    return { insertedRows: records.length, totalRows: await excelPostgres.egress.count({ where: { client, deletedAt: null } }) };
  } catch (error) {
    await excelPostgres.egressImportBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", fileHash: null, errorDetail: error instanceof Error ? error.message : String(error), finishedAt: new Date() },
    });
    throw error;
  }
}

function rowForUi(row: Awaited<ReturnType<typeof excelPostgres.egress.findFirst>> & { rawRow?: { payload: unknown } | null }, mapping?: EgressFieldMapping) {
  if (!row) return null;
  const payload = row.rawRow?.payload && typeof row.rawRow.payload === "object" && !Array.isArray(row.rawRow.payload)
    ? row.rawRow.payload as Record<string, unknown>
    : {};
  const date = row.date?.toISOString().slice(0, 10) ?? "";
  const currentPayload = { ...payload };
  const current = { date, dateDay: date.slice(8), dateMonth: date.slice(5, 7), dateYear: date.slice(0, 4), clientCode: row.clientCode, product: row.product, quantity: number(row.quantity), destination: row.destination, comments: row.comments, operation: row.operation };
  if (mapping) {
    for (const field of Object.keys(current) as CanonicalEgressField[]) {
      for (const alias of mapping[field] ?? []) {
        if (Object.hasOwn(currentPayload, alias)) currentPayload[alias] = current[field] ?? "";
      }
    }
  }
  return {
    ...currentPayload,
    "ID egreso": row.id.toString(),
    "Modificado por": row.modifiedBy ?? "",
    Cliente: row.client,
    fecha: date,
    codigo_cliente: text(row.clientCode),
    codigo_unico: text(row.uniqueCode),
    producto: text(row.product),
    cantidad: number(row.quantity),
    destino: text(row.destination),
    comentarios: text(row.comments),
    Operación: row.operation,
    __rowIndex: Number(row.id), __client: row.client as EgressClient, __date: date,
  } as EgressRow;
}

function number(value: { toString(): string } | number | null | undefined) {
  return value == null ? 0 : Number(value.toString());
}

export async function readGenericEgressRows(options: { client?: EgressClient; from?: string; to?: string; limit?: number } = {}) {
  const rows = await excelPostgres.egress.findMany({
    where: {
      client: options.client ? { equals: options.client, mode: "insensitive" } : undefined,
      deletedAt: null,
      date: {
        gte: options.from ? new Date(`${options.from}T00:00:00.000Z`) : undefined,
        lte: options.to ? new Date(`${options.to}T23:59:59.999Z`) : undefined,
      },
    },
    include: { rawRow: { select: { payload: true } } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: options.limit ?? 1000,
  });
  const profiles = await excelPostgres.egressImportProfile.findMany({ where: { active: true } });
  return rows.map(row => rowForUi(row, (profiles.find(p => p.client === row.client)?.mapping as EgressFieldMapping | undefined) ?? defaultEgressMappings[row.client as EgressClient]))
    .filter((row): row is EgressRow => row !== null);
}

export async function updateGenericEgress(id: number, client: EgressClient, values: Record<string, unknown>, actor?: string) {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const profile = (await seedAndReadEgressProfiles()).find((item) => item.client === client)!;
  const existing = await excelPostgres.egress.findFirst({ where: { id: BigInt(id), client, deletedAt: null } });
  if (!existing) return false;
  const clientCode = text(valueFrom(values, profile.mapping.clientCode)) || text(values.codigo_cliente);
  const mapping = await excelPostgres.excelClientCode.findFirst({
    where: { client: { equals: client, mode: "insensitive" }, clientCode: { equals: clientCode, mode: "insensitive" }, active: true },
    orderBy: [{ assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
  });
  await excelPostgres.egress.update({
    where: { id: BigInt(id) },
    data: {
      modifiedBy: actor ?? null,
      operation: operationValue(valueFrom(values, profile.mapping.operation), existing.operation),
      date: dateFromRow(values, profile.mapping) ?? existing.date,
      clientCode: clientCode || existing.clientCode,
      uniqueCode: text(mapping?.uniqueCode) || existing.uniqueCode,
      product: text(valueFrom(values, profile.mapping.product)) || text(values.producto) || existing.product,
      quantity: numeric(valueFrom(values, profile.mapping.quantity) ?? values.cantidad) ?? existing.quantity,
      destination: text(valueFrom(values, profile.mapping.destination) ?? values.destino),
      comments: text(valueFrom(values, profile.mapping.comments) ?? values.comentarios),
    },
  });
  return true;
}

export async function softDeleteGenericEgresses(ids: number[], client: EgressClient, actor?: string) {
  const valid = ids.filter((id) => Number.isSafeInteger(id) && id > 0).map(BigInt);
  if (!valid.length) return 0;
  const result = await excelPostgres.egress.updateMany({
    where: { id: { in: valid }, client, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: actor ?? null, modifiedBy: actor ?? null },
  });
  return result.count;
}

function bulkWhere(client: EgressClient, scope: EgressBulkScope): Prisma.EgressWhereInput {
  if (!validateEgressScope(scope)) throw new Error("Elegí una subida o un rango de fechas válido y completo.");
  return {
    client, deletedAt: null,
    ...(scope.batchId ? { rawRow: { batchId: BigInt(scope.batchId) } } : {
      date: { gte: new Date(`${scope.from}T00:00:00Z`), lte: new Date(`${scope.to}T00:00:00Z`) },
    }),
  };
}

export async function previewEgressDeactivation(client: EgressClient, scope: EgressBulkScope) {
  return excelPostgres.egress.count({ where: bulkWhere(client, scope) });
}

export async function deactivateEgressScope(client: EgressClient, scope: EgressBulkScope, actor: string) {
  return (await excelPostgres.egress.updateMany({
    where: bulkWhere(client, scope),
    data: { deletedAt: new Date(), deletedBy: actor, modifiedBy: actor },
  })).count;
}

export async function readEgressBatches(client: EgressClient) {
  const batches = await excelPostgres.egressImportBatch.findMany({
    where: { client, status: "COMPLETED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, fileName: true, createdAt: true, importedRows: true },
  });
  return batches.map(batch => ({ ...batch, id: batch.id.toString(), createdAt: batch.createdAt.toISOString() }));
}

export async function getGenericEgressSummary() {
  const groups = await excelPostgres.egress.groupBy({
    by: ["client"], where: { deletedAt: null }, _count: { _all: true },
  });
  const counts = new Map(groups.map((group) => [group.client, group._count._all]));
  return (Object.keys(egressSchemas) as EgressClient[]).map((client) => ({
    client, columns: egressSchemas[client].length, rows: counts.get(client) ?? 0, exists: (counts.get(client) ?? 0) > 0,
  }));
}

export async function readGenericStockEgressRows() {
  const groups = await excelPostgres.egress.groupBy({
    by: ["clientCode", "operation"],
    where: { client: { equals: "Santander", mode: "insensitive" }, deletedAt: null },
    _sum: { quantity: true },
  });
  return groups.map((row) => ({
    SKU: text(row.clientCode), Operación: text(row.operation), Cantidad: number(row._sum.quantity),
  }));
}
