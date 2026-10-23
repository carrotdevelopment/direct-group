"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Mapping = { client: string; clientCode: string; uniqueCode: string; active: boolean; voidedAt?: string };
type Stock = { income: number; egress: number; stock: number };
type Plan = {
  client: string; oldCode: string; newCode: string; uniqueCode: string; newExists: boolean;
  product: string | null; oldStock: Stock; newStock: Stock;
};
type Migration = { id: string; client: string; oldCode: string; newCode: string; uniqueCode: string; product: string | null; quantity: string; createdBy: string; createdAt: string };

const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs normal-case outline-none focus:border-[#7da4d3]";

// Migración de código cliente: el stock de un código pasa a otro código del mismo cliente y producto,
// el código viejo queda no vigente y el nuevo vigente. onMigrated recarga los códigos de la pantalla,
// para que un "Guardar" posterior no deshaga el cambio.
export function ClientCodeMigration({ clients, mappings, defaultClient, onMigrated }: {
  clients: string[];
  mappings: Mapping[];
  defaultClient: string;
  onMigrated: () => Promise<unknown> | void;
}) {
  const [client, setClient] = useState(defaultClient);
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [migrations, setMigrations] = useState<Migration[]>([]);

  const clientCodes = useMemo(
    () => [...new Set(mappings
      .filter((m) => !m.voidedAt && m.client.trim().toLowerCase() === client.trim().toLowerCase())
      .map((m) => m.clientCode))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [mappings, client],
  );

  const loadMigrations = useCallback(async () => {
    try {
      const response = await fetch("/api/local-db/client-codes/migracion", { cache: "no-store" });
      const data = (await response.json()) as { migrations?: Migration[] };
      if (response.ok) setMigrations(data.migrations ?? []);
    } catch {
      // La lista de migraciones es informativa: si falla, la sección sigue funcionando.
    }
  }, []);

  useEffect(() => {
    // Synchronize the list of past migrations when the section opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMigrations();
  }, [loadMigrations]);

  async function call(preview: boolean) {
    setMessage(null);
    setBusy(true);
    try {
      const response = await fetch("/api/local-db/client-codes/migracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, oldCode, newCode, preview }),
      });
      const data = (await response.json()) as { plan?: Plan; quantity?: number; newCodeCreated?: boolean; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo procesar la migración.");
      if (preview) {
        setPlan(data.plan ?? null);
      } else {
        setMessage({
          tone: "success",
          text: `Listo: ${plan?.oldCode} → ${plan?.newCode}. ${data.quantity ? `Pasaron ${data.quantity} unidades de stock.` : "No había stock para pasar."}${data.newCodeCreated ? " El código nuevo se dio de alta." : ""}`,
        });
        setPlan(null);
        setOldCode("");
        setNewCode("");
        await onMigrated();
        await loadMigrations();
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "No se pudo procesar la migración." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card animate-enter mt-6 overflow-hidden">
      <div className="border-b border-[#e1e8f1] bg-white p-4">
        <h2 className="flex items-center gap-2 text-sm font-black text-[#10233f]"><ArrowRightLeft size={16} /> Migración de código cliente</h2>
        <p className="mt-1 max-w-3xl text-[11px] font-semibold text-[#62728a]">
          Para cuando un producto de un cliente cambia de código cliente (por ejemplo, Pampa 75-5030 → 76-5030). El stock
          del código a migrar pasa al código nuevo, el código a migrar queda no vigente y el nuevo vigente (si no existe, se
          da de alta con el mismo producto). Los dos tienen que ser del mismo cliente y del mismo producto.
        </p>
      </div>
      <div className="grid gap-3 bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="text-[11px] font-extrabold text-[#334b6b]">Cliente
          <select value={client} onChange={(event) => { setClient(event.target.value); setPlan(null); }} className={inputClass}>
            <option value="">Elegí un cliente</option>
            {clients.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-extrabold text-[#334b6b]">Código cliente a migrar
          <input list="migracion-codigos" value={oldCode} onChange={(event) => { setOldCode(event.target.value); setPlan(null); }} placeholder="Ej.: 75-5030" className={inputClass} />
          <datalist id="migracion-codigos">{clientCodes.map((code) => <option key={code} value={code} />)}</datalist>
        </label>
        <label className="text-[11px] font-extrabold text-[#334b6b]">Nuevo código cliente
          <input value={newCode} onChange={(event) => { setNewCode(event.target.value); setPlan(null); }} placeholder="Ej.: 76-5030" className={inputClass} />
        </label>
        <Button size="sm" variant="secondary" disabled={busy || !client || !oldCode.trim() || !newCode.trim()} onClick={() => void call(true)}>
          Revisar
        </Button>
      </div>

      {message && (
        <div className={`mx-4 mb-4 rounded-xl px-4 py-3 text-xs font-bold ${message.tone === "error" ? "bg-[#fce9e8] text-[#a43d39]" : "bg-[#e7f7eb] text-[#23783a]"}`}>{message.text}</div>
      )}

      {plan && (
        <div className="mx-4 mb-4 rounded-xl border border-[#d8e2ee] bg-[#f8fafd] p-4 text-xs">
          <div className="font-black text-[#10233f]">{plan.client} · {plan.product || plan.uniqueCode} <span className="font-semibold text-[#8a99ad]">({plan.uniqueCode})</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-[#e1e8f1]">
              <div className="text-[10px] font-bold uppercase text-[#8a99ad]">Código a migrar</div>
              <div className="font-black text-[#10233f]">{plan.oldCode}</div>
              <div className="text-[#62728a]">Stock {plan.oldStock.stock} → 0</div>
            </div>
            <ArrowRight size={18} className="text-[#8a99ad]" />
            <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-[#e1e8f1]">
              <div className="text-[10px] font-bold uppercase text-[#8a99ad]">Código nuevo {plan.newExists ? "" : "(se da de alta)"}</div>
              <div className="font-black text-[#10233f]">{plan.newCode}</div>
              <div className="text-[#62728a]">Stock {plan.newStock.stock} → {plan.newStock.stock + Math.max(0, plan.oldStock.stock)}</div>
            </div>
          </div>
          {plan.oldStock.stock < 0 ? (
            <p className="mt-3 font-bold text-[#a43d39]">El código a migrar tiene stock negativo: revisalo antes de migrarlo.</p>
          ) : (
            <div className="mt-4 flex justify-end">
              <Button size="sm" disabled={busy} onClick={() => {
                if (window.confirm(`Migrar ${plan.oldCode} → ${plan.newCode} (${plan.client})${plan.oldStock.stock ? ` y pasar ${plan.oldStock.stock} unidades de stock` : ""}?`)) void call(false);
              }}>
                Migrar
              </Button>
            </div>
          )}
        </div>
      )}

      {migrations.length > 0 && (
        <div className="border-t border-[#e1e8f1] bg-white">
          <div className="px-4 pt-3 text-[10px] font-extrabold uppercase tracking-wide text-[#8a99ad]">Últimas migraciones</div>
          <div className="divide-y divide-[#eef2f7]">
            {migrations.slice(0, 10).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px]">
                <span className="font-bold text-[#10233f]">{item.client} · {item.oldCode} → {item.newCode}</span>
                <span className="text-[#62728a]">{item.product || item.uniqueCode} · {Number(item.quantity)} u.</span>
                <span className="text-[#8a99ad]">{item.createdBy} · {new Date(item.createdAt).toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
