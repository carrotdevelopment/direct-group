import "server-only";
import { z } from "zod";
import type OpenAI from "openai";
import { hasModule, type AccessUser } from "@/lib/module-access";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { readPricesFromPostgres, readProductsFromPostgres } from "@/lib/postgres-replica-db";
import { GET as stockGET } from "@/app/api/local-db/stock/route";
import { GET as pasajesGET } from "@/app/api/pasajes/route";
import { GET as ingresosGET } from "@/app/api/local-db/ingresos/route";

// Herramientas de solo lectura del asistente. Cada una pide un módulo: al usuario solo se le ofrecen
// las de los módulos que tiene. Stock, pasajes e ingresos reutilizan los mismos endpoints que las
// pantallas, así el asistente da los mismos números y aplica los mismos permisos.

const MAX_ROWS = 25;

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function matches(search: string | undefined, ...fields: unknown[]) {
  if (!search?.trim()) return true;
  const words = norm(search).split(/\s+/).filter(Boolean);
  const haystack = fields.map(norm).join(" ");
  return words.every((word) => haystack.includes(word));
}

async function callRoute(handler: (request: Request) => Promise<Response>, path: string, params: Record<string, string | string[] | undefined>) {
  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item) url.searchParams.append(key, item);
  }
  const response = await handler(new Request(url));
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.message ?? `Error ${response.status}`));
  return body;
}

type ToolDef<S extends z.ZodType> = {
  name: string;
  module: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<unknown>;
};

function tool<S extends z.ZodType>(def: ToolDef<S>) {
  return def as unknown as ToolDef<z.ZodType>;
}

const PASAJE_STATUS: Record<string, string> = {
  pending: "Pendiente de aprobación del cliente origen",
  approved: "Aprobado, esperando que llegue al destino",
  confirmed: "Confirmado (llegó al destino)",
  rejected: "Rechazado o cancelado",
  no_destination: "Sin destino asignado",
};

const SCREENS = [
  { module: "productos", path: "/productos", screen: "Productos", what: "Catálogo de productos con su código único, marca, proveedor y categoría." },
  { module: "clientes", path: "/codigos-clientes", screen: "Códigos cliente", what: "Equivalencias entre el código único y el código de cada cliente." },
  { module: "precios", path: "/precios", screen: "Precios", what: "Precios informados por los proveedores (costo DG, IVA, precio público)." },
  { module: "precios", path: "/estructura-costos", screen: "Estructura de costos", what: "Costos, fletes y rentabilidad por cliente y producto." },
  { module: "compras", path: "/ingresos", screen: "Ingresos", what: "Órdenes de compra e ingresos de mercadería (desde Tango), con lo entregado y lo pendiente." },
  { module: "ventas", path: "/egresos", screen: "Egresos", what: "Salidas de stock por cliente (canjes, envíos), cargadas desde los Excel de cada cliente." },
  { module: "pasajes", path: "/pasajes", screen: "Pasajes y Ajustes", what: "Pasajes de stock entre clientes (aprobación del origen, confirmación del destino) y ajustes." },
  { module: "stock", path: "/stock", screen: "Stock", what: "Stock por cliente: teórico, real, entregas pendientes, stock informado por Urbano y días de stock." },
  { module: "stock", path: "/stock/urbano", screen: "Carga Urbano", what: "Cargas del stock informado por Urbano." },
  { module: "correos", path: "/correos", screen: "Correos", what: "Casilla de proveedores: pedidos de precios y respuestas." },
  { module: "clientes", path: "/clientes", screen: "Clientes", what: "Alta y datos de clientes." },
  { module: "proveedores", path: "/proveedores", screen: "Proveedores", what: "Alta y datos de proveedores y sus contactos." },
  { module: "admin", path: "/permisos", screen: "Permisos", what: "Usuarios, roles y módulos habilitados (solo administradores)." },
  { module: "admin", path: "/configuracion", screen: "Configuración", what: "Ajustes generales de la plataforma (solo administradores)." },
];

export function assistantTools(user: AccessUser) {
  const all = [
    tool({
      name: "guia_plataforma",
      module: "",
      description: "Lista las pantallas de la plataforma a las que el usuario tiene acceso, con su dirección y para qué sirve cada una. Usala para preguntas de dónde se hace algo o cómo se usa la plataforma.",
      schema: z.object({}),
      run: async () => ({ pantallas: SCREENS.filter((s) => hasModule(user, s.module)) }),
    }),
    tool({
      name: "consultar_stock",
      module: "stock",
      description: "Stock por cliente, igual que la pantalla Stock. Sin cliente devuelve la lista de clientes con stock. Con cliente devuelve, por producto: stock real (ingresado físicamente menos egresos), stock teórico (pedido menos egresos), entregas pendientes, stock informado por Urbano y su diferencia, disponible web y días de stock.",
      schema: z.object({
        cliente: z.string().optional().describe("Nombre del cliente, tal como figura en la lista de clientes."),
        busqueda: z.string().optional().describe("Texto para filtrar por código de cliente, código único o nombre del producto."),
      }),
      run: async ({ cliente, busqueda }) => {
        if (!cliente?.trim()) return { clientes: (await callRoute(stockGET, "/api/local-db/stock", { clients: "1" })).clients };
        const body = await callRoute(stockGET, "/api/local-db/stock", { client: cliente });
        const rows = ((body.rows as Record<string, unknown>[]) ?? []).filter((row) => matches(busqueda, row.clientCode, row.uniqueCode, row.product));
        rows.sort((a, b) => Number(b.vigente) - Number(a.vigente));
        return {
          resumen: body.message,
          productosEncontrados: rows.length,
          productos: rows.slice(0, MAX_ROWS).map((row) => ({
            vigente: row.vigente, codigoCliente: row.clientCode, codigoUnico: row.uniqueCode, producto: row.product,
            stockReal: row.realStock, stockTeorico: row.theoreticalStock, entregasPendientes: row.pendingDeliveries,
            stockUrbano: row.urbanoStock, diferenciaUrbano: row.urbanoDifference, disponibleWeb: row.webAvailable,
            egresos: row.egress, diasDeStock: Math.round(Number(row.stockDays) || 0),
          })),
          ...(rows.length > MAX_ROWS ? { aviso: `Se muestran ${MAX_ROWS} de ${rows.length}; pedí una búsqueda más precisa.` } : {}),
        };
      },
    }),
    tool({
      name: "buscar_productos",
      module: "productos",
      description: "Busca productos del catálogo por código único, nombre, marca, proveedor, código de proveedor o categoría.",
      schema: z.object({
        busqueda: z.string().describe("Texto a buscar."),
        incluirInactivos: z.boolean().optional(),
      }),
      run: async ({ busqueda, incluirInactivos }) => {
        const found = (await readProductsFromPostgres()).filter((p) => (incluirInactivos || p.active) && matches(busqueda, p.code, p.name, p.brand, p.supplier, p.supplierCode, p.category));
        return {
          encontrados: found.length,
          productos: found.slice(0, MAX_ROWS).map((p) => ({ codigoUnico: p.code, nombre: p.name, activo: p.active, marca: p.brand, proveedor: p.supplier, codigoProveedor: p.supplierCode, categoria: p.category, unidadesPorBulto: p.unitsPerPackage })),
        };
      },
    }),
    tool({
      name: "consultar_pasajes",
      module: "pasajes",
      description: `Pasajes de stock entre clientes que el usuario puede ver. Estados: ${Object.entries(PASAJE_STATUS).map(([k, v]) => `${k} = ${v}`).join("; ")}.`,
      schema: z.object({
        estado: z.enum(["pending", "approved", "confirmed", "rejected", "no_destination"]).optional(),
        cliente: z.string().optional().describe("Cliente de origen o de destino."),
        busqueda: z.string().optional().describe("Código, producto o ID de Urbano."),
      }),
      run: async ({ estado, cliente, busqueda }) => {
        const body = await callRoute(pasajesGET, "/api/pasajes", { status: estado });
        const rows = ((body.pasajes as Record<string, unknown>[]) ?? []).filter((p) =>
          matches(cliente, p.fromClient, p.toClient) && matches(busqueda, p.uniqueCode, p.product, p.fromClientCode, p.toClientCode, p.urbanoCertificate));
        return {
          encontrados: rows.length,
          pasajes: rows.slice(0, MAX_ROWS).map((p) => ({
            estado: PASAJE_STATUS[String(p.status)] ?? p.status, origen: p.fromClient, destino: p.toClient, codigoUnico: p.uniqueCode, producto: p.product,
            cantidad: Number(p.quantity), cantidadConfirmada: p.confirmedQuantity == null ? null : Number(p.confirmedQuantity),
            cargadoPor: p.createdBy, fecha: String(p.createdAt).slice(0, 10), idUrbano: p.urbanoCertificate, aviso: p.warning,
          })),
        };
      },
    }),
    tool({
      name: "consultar_egresos",
      module: "ventas",
      description: "Totales de egresos (salidas de stock) agrupados por producto, filtrables por cliente, fechas y texto. No devuelve datos de destinatarios.",
      schema: z.object({
        cliente: z.string().optional(),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha AAAA-MM-DD"),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha AAAA-MM-DD"),
        busqueda: z.string().optional().describe("Código de cliente, código único o producto."),
      }),
      run: async ({ cliente, desde, hasta, busqueda }) => {
        const groups = await excelPostgres.egress.groupBy({
          by: ["client", "operation", "clientCode", "uniqueCode", "product"],
          where: {
            deletedAt: null,
            client: cliente ? { equals: cliente.trim(), mode: "insensitive" } : undefined,
            date: { gte: desde ? new Date(`${desde}T00:00:00.000Z`) : undefined, lte: hasta ? new Date(`${hasta}T23:59:59.999Z`) : undefined },
          },
          _sum: { quantity: true },
          _count: { _all: true },
          _max: { date: true },
        });
        const rows = groups
          .filter((g) => matches(busqueda, g.clientCode, g.uniqueCode, g.product))
          .map((g) => ({ cliente: g.client, operacion: g.operation, codigoCliente: g.clientCode, codigoUnico: g.uniqueCode, producto: g.product, cantidad: Number(g._sum.quantity ?? 0), registros: g._count._all, ultimaFecha: g._max.date?.toISOString().slice(0, 10) ?? null }))
          .sort((a, b) => b.cantidad - a.cantidad);
        return {
          cantidadTotal: rows.reduce((sum, r) => sum + r.cantidad, 0),
          gruposEncontrados: rows.length,
          porProducto: rows.slice(0, MAX_ROWS),
        };
      },
    }),
    tool({
      name: "consultar_precios",
      module: "precios",
      description: "Precios informados por proveedores, del más reciente al más antiguo. Filtrar por código único y/o proveedor.",
      schema: z.object({
        codigoUnico: z.string().optional(),
        proveedor: z.string().optional(),
      }),
      run: async ({ codigoUnico, proveedor }) => {
        const prices = (await readPricesFromPostgres())
          .filter((p) => (!codigoUnico || norm(p.uniqueCode) === norm(codigoUnico)) && matches(proveedor, p.supplier))
          .sort((a, b) => b.informedAt.localeCompare(a.informedAt));
        return {
          encontrados: prices.length,
          precios: prices.slice(0, MAX_ROWS).map((p) => ({ codigoUnico: p.uniqueCode, proveedor: p.supplier, fechaInformado: p.informedAt, costoDg: p.costDg, iva: p.vatRate, precioPublico: p.publicPrice, markup: p.markup })),
        };
      },
    }),
    tool({
      name: "consultar_ingresos",
      module: "compras",
      description: "Ingresos y órdenes de compra (desde Tango), con cantidad pedida, entregada y pendiente.",
      schema: z.object({
        cliente: z.string().optional(),
        busqueda: z.string().optional().describe("Orden de compra, código o comentario."),
        soloPendientes: z.boolean().optional(),
      }),
      run: async ({ cliente, busqueda, soloPendientes }) => {
        const body = await callRoute(ingresosGET, "/api/local-db/ingresos", { client: cliente, search: busqueda, status: soloPendientes ? "pending" : undefined, limit: String(MAX_ROWS) });
        return {
          totalEncontrados: body.totalFiltered,
          resumen: body.viewSummary,
          ingresos: ((body.rows as Record<string, unknown>[]) ?? []).map((r) => ({
            cliente: r.client, operacion: r.operation, ordenDeCompra: r.orderNumber, fechaPedido: r.orderDate, codigoCliente: r.clientCode, codigoUnico: r.uniqueCode,
            cantidad: r.quantity, entregado: r.delivered, pendiente: r.pending, fechaEntrega: r.deliveryDate, comentarios: r.comments,
          })),
        };
      },
    }),
  ];
  return all.filter((t) => !t.module || hasModule(user, t.module));
}

export type AssistantTool = ReturnType<typeof assistantTools>[number];

export function toApiTool(t: AssistantTool): OpenAI.Chat.ChatCompletionFunctionTool {
  const parameters = z.toJSONSchema(t.schema) as Record<string, unknown>;
  delete parameters.$schema;
  return { type: "function", function: { name: t.name, description: t.description, parameters } };
}

export async function runAssistantTool(t: AssistantTool, input: unknown) {
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false as const, content: `Parámetros inválidos: ${parsed.error.message}` };
  try {
    return { ok: true as const, content: JSON.stringify(await t.run(parsed.data)) };
  } catch (error) {
    return { ok: false as const, content: error instanceof Error ? error.message : "No se pudo hacer la consulta." };
  }
}
