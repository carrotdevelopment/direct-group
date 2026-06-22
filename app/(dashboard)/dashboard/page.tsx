import { ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CircleAlert, FileClock, HandCoins, PackageCheck, ShoppingCart, Sparkles, Warehouse } from "lucide-react";
import { OperationsChart } from "@/components/charts/operations-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/utils";

const metrics = [
  { label: "Stock valorizado", value: formatCurrency(184_620_400), detail: "+8,2% vs. mes anterior", trend: "up", icon: Warehouse, tint: "bg-[#e8f2ec] text-[#1f6b48]" },
  { label: "Ventas del mes", value: formatCurrency(42_810_200), detail: "+12,4% vs. mes anterior", trend: "up", icon: HandCoins, tint: "bg-[#fff0e8] text-[#d66a37]" },
  { label: "Órdenes abiertas", value: "148", detail: "23 próximas a vencer", trend: "neutral", icon: ShoppingCart, tint: "bg-[#e9eef7] text-[#456b90]" },
  { label: "Stock crítico", value: "17", detail: "5 requieren acción hoy", trend: "down", icon: CircleAlert, tint: "bg-[#fce9e8] text-[#b7433f]" },
];

const movements = [
  { code: "DG-002841", product: "Aceite Girasol 1,5 L", client: "Supermercados Norte", type: "Venta", qty: "− 480", time: "Hace 8 min", tone: "danger" as const },
  { code: "DG-001772", product: "Yerba Mate 1 kg", client: "Mercado del Centro", type: "Compra", qty: "+ 1.200", time: "Hace 24 min", tone: "success" as const },
  { code: "DG-003091", product: "Harina 000 1 kg", client: "Distribuidora Sur", type: "Transferencia", qty: "350", time: "Hace 41 min", tone: "info" as const },
  { code: "DG-000648", product: "Azúcar refinada 1 kg", client: "Hiper Mayorista SA", type: "Ajuste", qty: "+ 24", time: "Hace 1 h", tone: "warning" as const },
];

const alerts = [
  { title: "5 productos sin stock", meta: "Cliente: Supermercados Norte", color: "bg-[#b7433f]", icon: CircleAlert },
  { title: "3 importaciones para revisar", meta: "Ventas · Mapeo asistido por IA", color: "bg-[#ef7b45]", icon: Sparkles },
  { title: "12 precios vencen esta semana", meta: "Listas de 4 proveedores", color: "bg-[#d39b36]", icon: FileClock },
  { title: "Sincronización Tango completa", meta: "246 compras procesadas", color: "bg-[#3d9464]", icon: PackageCheck },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-enter">
        <div>
          <div className="eyebrow mb-2">Resumen operativo</div>
          <h1 className="text-[30px] font-black tracking-[-.04em] sm:text-[34px]">Buen día, Juan Martín.</h1>
          <p className="mt-2 text-sm text-[#6d766f]">Esto es lo que está pasando en tu operación hoy, 22 de junio.</p>
        </div>
        <Button variant="secondary"><Boxes size={16} /> Ver actividad</Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <article key={metric.label} className="card animate-enter p-5" style={{ animationDelay: `${index * 55}ms` }}>
            <div className="flex items-start justify-between">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${metric.tint}`}><metric.icon size={19} /></div>
              <span className="text-[#8c958f]">{metric.trend === "up" ? <ArrowUpRight size={16} /> : metric.trend === "down" ? <ArrowDownRight size={16} /> : null}</span>
            </div>
            <div className="mt-5 text-xs font-bold text-[#778078]">{metric.label}</div>
            <div className="tabular mt-1.5 text-[25px] font-black tracking-[-.035em]">{metric.value}</div>
            <div className={`mt-2 text-[11px] font-semibold ${metric.trend === "up" ? "text-[#35815a]" : metric.trend === "down" ? "text-[#b7433f]" : "text-[#858d87]"}`}>{metric.detail}</div>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <article className="card animate-enter p-5 sm:p-6" style={{ animationDelay: "220ms" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="text-base font-black">Evolución comercial</div><div className="mt-1 text-xs text-[#7b847d]">Compras y ventas acumuladas · últimos 12 meses</div></div>
            <div className="flex items-center gap-4 text-[10px] font-bold text-[#6e776f]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#1f6b48]" /> Compras</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#ef7b45]" /> Ventas</span></div>
          </div>
          <div className="mt-3"><OperationsChart /></div>
        </article>

        <article className="card animate-enter p-5 sm:p-6" style={{ animationDelay: "275ms" }}>
          <div className="flex items-center justify-between"><div><div className="text-base font-black">Centro de atención</div><div className="mt-1 text-xs text-[#7b847d]">Prioridades y novedades</div></div><Badge tone="warning">8 pendientes</Badge></div>
          <div className="mt-4 divide-y divide-[#edf0ed]">
            {alerts.map((alert) => (
              <div key={alert.title} className="group flex items-center gap-3 py-3.5 first:pt-1">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white ${alert.color}`}><alert.icon size={16} /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-extrabold">{alert.title}</div><div className="mt-1 truncate text-[10px] text-[#89918c]">{alert.meta}</div></div>
                <ArrowRight size={14} className="text-[#b1b7b2] transition group-hover:translate-x-0.5 group-hover:text-[#1f6b48]" />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card mt-4 animate-enter overflow-hidden" style={{ animationDelay: "330ms" }}>
        <div className="flex items-center justify-between border-b border-[#e9ece9] px-5 py-5 sm:px-6">
          <div><div className="text-base font-black">Movimientos recientes</div><div className="mt-1 text-xs text-[#7b847d]">Últimas operaciones que afectaron el stock</div></div>
          <Button variant="ghost" size="sm">Ver todos <ArrowRight size={14} /></Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-[#edf0ed] bg-[#fafbfa] text-[9px] font-black uppercase tracking-[.12em] text-[#929a94]"><th className="px-6 py-3">Producto</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Movimiento</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-6 py-3 text-right">Actualización</th></tr></thead>
            <tbody className="divide-y divide-[#eff1ef]">
              {movements.map((item) => (
                <tr key={item.code} className="text-xs transition hover:bg-[#fafbfa]">
                  <td className="px-6 py-4"><div className="font-extrabold">{item.product}</div><div className="mt-1 font-mono text-[10px] text-[#909892]">{item.code}</div></td>
                  <td className="px-4 py-4 font-semibold text-[#566159]">{item.client}</td>
                  <td className="px-4 py-4"><Badge tone={item.tone}>{item.type}</Badge></td>
                  <td className={`tabular px-4 py-4 text-right font-black ${item.qty.includes("−") ? "text-[#b7433f]" : "text-[#27734f]"}`}>{item.qty}</td>
                  <td className="px-6 py-4 text-right text-[11px] text-[#8a928c]">{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#edf0ed] bg-[#fafbfa] px-6 py-3 text-[10px] font-semibold text-[#7c857e]">{formatNumber(12_849)} movimientos registrados este año</div>
      </section>
    </div>
  );
}
