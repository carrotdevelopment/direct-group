"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProductChangeImpact } from "@/lib/egress-product-change";

type Mapping = { client: string; clientCode: string; uniqueCode: string; active: boolean };
type Product = { code: string; name: string };
type Change = {
  fromClientCode: string; fromProduct: string | null; fromQuantity: number;
  toClientCode: string; toProduct: string | null; toQuantity: number;
  reason: string | null; createdBy: string; createdAt: string;
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Cambio de producto de un canje ya cargado: se elige otro código del mismo cliente (y la cantidad) y se
// muestra cómo queda el stock de los dos códigos antes de confirmar.
export function EgressProductChangeModal({
  egressId,
  client,
  clientCode,
  product,
  quantity,
  onClose,
  onChanged,
}: {
  egressId: number;
  client: string;
  clientCode: string;
  product: string;
  quantity: number;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<Change[]>([]);
  const [search, setSearch] = useState("");
  const [targetCode, setTargetCode] = useState(clientCode);
  const [newQuantity, setNewQuantity] = useState(String(quantity));
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<ProductChangeImpact | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/lookups?kind=client-codes").then((response) => response.json() as Promise<{ mappings?: Mapping[] }>),
      fetch("/api/lookups?kind=products").then((response) => (response.ok ? (response.json() as Promise<{ products?: Product[] }>) : { products: [] })),
      fetch(`/api/local-db/egresos/cambio-producto?id=${egressId}`).then((response) => response.json() as Promise<{ changes?: Change[] }>),
    ])
      .then(([codes, catalog, changes]) => {
        setMappings(codes.mappings ?? []);
        setProducts(catalog.products ?? []);
        setHistory(changes.changes ?? []);
      })
      .catch(() => setError("No se pudieron leer los productos del cliente."));
  }, [egressId]);

  const productName = useMemo(() => new Map(products.map((item) => [item.code.toLowerCase(), item.name])), [products]);
  // Códigos vigentes del cliente, uno por código, con el nombre del producto.
  const options = useMemo(() => {
    const seen = new Set<string>();
    return mappings
      .filter((mapping) => mapping.active && sameText(mapping.client, client))
      .filter((mapping) => !seen.has(mapping.clientCode.toLowerCase()) && seen.add(mapping.clientCode.toLowerCase()))
      .map((mapping) => ({ code: mapping.clientCode, label: `${mapping.clientCode} · ${productName.get(mapping.uniqueCode.toLowerCase()) || mapping.uniqueCode}` }))
      .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  }, [mappings, client, productName]);
  const term = search.trim().toLowerCase();
  const visible = options.filter((option) => !term || option.label.toLowerCase().includes(term) || sameText(option.code, targetCode));

  const parsedQuantity = Number(newQuantity);
  const unchanged = sameText(targetCode, clientCode) && parsedQuantity === quantity;
  useEffect(() => {
    if (!targetCode || unchanged || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/local-db/egresos/cambio-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: egressId, client, clientCode: targetCode, quantity: parsedQuantity, preview: true }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = (await response.json()) as { impact?: ProductChangeImpact; message?: string };
          if (!response.ok) throw new Error(data.message || "No se pudo calcular el cambio.");
          setImpact(data.impact ?? null);
          setPreviewError("");
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setImpact(null);
          setPreviewError(err instanceof Error ? err.message : "No se pudo calcular el cambio.");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [egressId, client, targetCode, parsedQuantity, unchanged]);
  const shownImpact = unchanged ? null : impact;

  async function confirm() {
    if (!shownImpact) return;
    if (shownImpact.warnings.length && !window.confirm(`${shownImpact.warnings.join("\n")}\n\n¿Hacer el cambio igual?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/local-db/egresos/cambio-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: egressId, client, clientCode: targetCode, quantity: parsedQuantity, reason }),
      });
      const data = (await response.json()) as { ok?: boolean; impact?: ProductChangeImpact; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "No se pudo cambiar el producto del canje.");
      onChanged(`Canje modificado. ${data.impact?.messages.join(" ") ?? ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el producto del canje.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <button aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-lg p-2 text-[#7b847d] hover:bg-[#f0f2f0]">
          <X size={18} />
        </button>
        <div className="eyebrow">Egresos · {client}</div>
        <h2 className="mt-2 text-xl font-black">Cambiar producto del canje</h2>
        <p className="mt-1 text-xs text-[#62728a]">
          Si el producto del canje no se pudo entregar, elegí el que se entrega en su lugar. El código original recupera las
          unidades y el nuevo las descuenta del stock.
        </p>

        <div className="mt-4 rounded-xl bg-[#f4f7fb] px-4 py-3 text-xs text-[#334b6b]">
          <span className="font-bold">Canje actual:</span> <span className="font-mono">{clientCode}</span> · {product || "sin nombre"} ·{" "}
          {quantity} {quantity === 1 ? "unidad" : "unidades"}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]">
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Producto que se entrega
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar código o producto"
              className="mt-2 h-9 w-full rounded-lg border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#0b5bbb]"
            />
            <select
              value={targetCode}
              onChange={(event) => setTargetCode(event.target.value)}
              size={6}
              className="mt-2 w-full rounded-lg border border-[#dbe4ef] bg-white p-1 text-xs outline-none focus:border-[#0b5bbb]"
            >
              {visible.map((option) => (
                <option key={option.code} value={option.code} className="rounded px-2 py-1">
                  {option.label}
                  {sameText(option.code, clientCode) ? " (actual)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-extrabold text-[#334b6b]">
            Cantidad
            <input
              type="number"
              min="1"
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
              className="mt-2 h-9 w-full rounded-lg border border-[#dbe4ef] px-3 text-right text-xs outline-none focus:border-[#0b5bbb]"
            />
          </label>
        </div>
        <label className="mt-3 text-[11px] font-extrabold text-[#334b6b]">
          Motivo (opcional)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Ej.: no hay aspiradoras negras para entregar"
            className="mt-2 h-9 w-full rounded-lg border border-[#dbe4ef] px-3 text-xs outline-none focus:border-[#0b5bbb]"
          />
        </label>

        {unchanged && <p className="mt-4 text-xs text-[#8a99ad]">Elegí otro producto u otra cantidad para ver cómo impacta en el stock.</p>}
        {!unchanged && previewError && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{previewError}</div>}
        {shownImpact && !previewError && (
          <div className="mt-4 rounded-xl border border-[#cfe0f5] bg-[#f3f8fe] px-4 py-3 text-xs text-[#16365f]">
            <div className="flex items-center gap-2 font-black">
              <ArrowRightLeft size={14} /> Qué va a pasar con el stock
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {shownImpact.messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
            {shownImpact.warnings.map((warning) => (
              <div key={warning} className="mt-2 flex items-start gap-2 font-bold text-[#985b00]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
              </div>
            ))}
            <p className="mt-2 text-[11px] text-[#62728a]">El cambio queda en los comentarios del canje y en su historial.</p>
          </div>
        )}
        {error && <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}

        {history.length > 0 && (
          <div className="mt-4 text-[11px] text-[#62728a]">
            <div className="font-black text-[#334b6b]">Cambios anteriores de este canje</div>
            {history.map((change) => (
              <div key={change.createdAt}>
                {new Date(change.createdAt).toLocaleString("es-AR", { hourCycle: "h23" })} · {change.createdBy}: {change.fromClientCode} x
                {change.fromQuantity} → {change.toClientCode} x{change.toQuantity}
                {change.reason ? ` · ${change.reason}` : ""}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={busy || !shownImpact || !!previewError} onClick={() => void confirm()}>
            <ArrowRightLeft size={15} /> Confirmar cambio
          </Button>
        </div>
      </div>
    </div>
  );
}
