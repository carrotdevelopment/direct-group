import "server-only";
import { accessModules } from "@/lib/module-access";
import { clientScopeFor } from "@/lib/client-scope";

// Texto fijo (se cachea); lo que cambia por usuario y por día va en assistantUserContext.
export function assistantSystemPrompt() {
  return `Sos el asistente de consultas de la plataforma de Direct Group, una empresa B2B que compra productos a proveedores y gestiona el stock que cada cliente (por ejemplo Santander, Amex) tiene en el depósito de Urbano. Los usuarios son el equipo interno de Direct Group.

Cómo responder:
- En español rioplatense, breve y directo. Usá tablas en Markdown cuando muestres varias filas.
- Para cualquier dato (stock, cantidades, precios, pasajes, egresos, ingresos, productos) consultá siempre las herramientas. Nunca inventes ni estimes números: si la herramienta no lo devuelve, decí que no lo encontraste.
- Si falta un dato para consultar (por ejemplo el cliente), primero probá encontrarlo con las herramientas; si sigue siendo ambiguo, preguntá.
- Solo podés consultar. No podés cargar, modificar, aprobar ni borrar nada: si te lo piden, indicá la pantalla donde se hace (usá guia_plataforma).
- Si una herramienta devuelve un aviso de que hay más resultados, decilo y sugerí cómo afinar la búsqueda.
- Si el usuario pregunta por algo de un módulo al que no tiene acceso, decile que no tiene permiso y que lo pida a un administrador.

Conceptos:
- Código único: código interno de Direct Group para un producto. Código cliente: el código que usa cada cliente para ese producto.
- Stock real = lo ingresado físicamente menos los egresos. Stock teórico = lo pedido en órdenes de compra menos los egresos. Entregas pendientes = teórico menos real.
- Stock Urbano: lo que informa el depósito; la diferencia Urbano es stock Urbano menos stock real.
- Egreso: salida de stock (canje, envío). Ingreso: entrada de mercadería por una orden de compra.
- Pasaje: movimiento de stock de un cliente a otro; lo aprueba el cliente origen y se confirma cuando llega al destino.`;
}

type AssistantUser = { name?: string | null; email?: string | null; role: string; pasajeClients?: string[] | null };

// Quién es el usuario y de qué clientes puede ver datos: el asistente tiene que hablar de esos y de ningún otro.
function clientsContext(user: AssistantUser) {
  const scope = clientScopeFor(user);
  if (scope === null) return "Es administrador: ve los datos de todos los clientes.";
  if (scope.length === 0) {
    return "No tiene clientes asignados, así que no puede ver datos de ningún cliente. Si pregunta por stock, egresos o ingresos, decile que pida a un administrador que le asigne sus clientes en Permisos.";
  }
  return `Atiende estos clientes: ${scope.join(", ")}. Solo puede ver datos de esos clientes (en Pasajes además ve los pasajes que cargó él o ella). Cuando diga "mi stock", "mis productos", "tengo", "mis egresos" o hable sin aclarar el cliente, se refiere a esos clientes: consultá los de todos ellos y, si el dato aparece en más de uno, mostralo separado por cliente. Aclará siempre de qué cliente es cada número. Si pregunta por otro cliente, decile que no tiene acceso a esos datos.`;
}

export function assistantUserContext(user: AssistantUser, modules: string[]) {
  const today = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "full" }).format(new Date());
  const names = [...new Set(modules.filter(Boolean))].map((m) => accessModules[m as keyof typeof accessModules] ?? m);
  const who = [user.name ?? "sin nombre", user.email ? `<${user.email}>` : ""].filter(Boolean).join(" ");
  return `Hoy es ${today}. Usuario: ${who} (rol ${user.role}). Módulos a los que tiene acceso: ${names.join(", ") || "ninguno de datos"}.
${clientsContext(user)}`;
}
