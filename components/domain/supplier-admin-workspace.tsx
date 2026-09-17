"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Tag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

type AdminItem = {
  id: string;
  name: string;
  active: boolean;
};

type ApiKey = "suppliers" | "categories";

function canonicalAdminKey(value: string) {
  return normalizeForDuplicateCheck(value).replace(/[^A-Z0-9]+/g, " ");
}

function uniqueAdminItems(items: AdminItem[]) {
  return Array.from(
    new Map(
      items
        .filter((item) => item.name.trim())
        .map((item) => [
          canonicalAdminKey(item.name),
          { ...item, name: item.name.trim().replace(/\s+/g, " ") },
        ]),
    ).values(),
  );
}

function AdminList({
  id,
  title,
  eyebrow,
  description,
  endpoint,
  apiKey,
  placeholder,
}: {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  endpoint: string;
  apiKey: ApiKey;
  placeholder: string;
}) {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState("");
  const [status, setStatus] = useState("Leyendo base de datos...");
  const [query, setQuery] = useState("");
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const highlightedRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!highlightKey) return;
    highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => setHighlightKey(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [highlightKey]);

  useEffect(() => {
    fetch(endpoint)
      .then(
        (response) => response.json() as Promise<Record<ApiKey, AdminItem[]>>,
      )
      .then((data) => {
        setItems(uniqueAdminItems(data[apiKey] ?? []));
        setStatus("PostgreSQL sincronizado");
      })
      .catch(() => setStatus("No pude leer PostgreSQL"));
  }, [apiKey, endpoint]);

  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      draftInputRef.current?.focus();
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [id]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items
      .filter((item) => item.name.toLowerCase().includes(normalized))
      .sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          left.name.localeCompare(right.name, "es"),
      );
  }, [items, query]);

  async function persist(next: AdminItem[]): Promise<string | null> {
    const uniqueNext = uniqueAdminItems(next);
    setStatus("Guardando en PostgreSQL...");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [apiKey]: uniqueNext }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        const message = body.message ?? "No pude guardar en PostgreSQL";
        setStatus(message);
        return message;
      }
      // Use the server's response (real numeric ids) instead of uniqueNext:
      // items created in this call only get a database id once saved, and
      // reusing the client-side placeholder id on the next save would create
      // a duplicate row.
      const data = (await response.json()) as Record<ApiKey, AdminItem[]>;
      setItems(uniqueAdminItems(data[apiKey] ?? uniqueNext));
      setStatus("PostgreSQL sincronizado");
      return null;
    } catch {
      setStatus("No pude guardar en PostgreSQL");
      return null;
    }
  }

  async function addItem() {
    const name = normalizeForDuplicateCheck(draft);
    if (!name) return;
    if (items.some((item) => canonicalAdminKey(item.name) === canonicalAdminKey(name))) {
      setInputError("Ese nombre ya existe.");
      return;
    }
    setInputError("");
    const error = await persist([
      ...items,
      { id: crypto.randomUUID(), name, active: true },
    ]);
    if (error) {
      setInputError(error);
    } else {
      setDraft("");
      setQuery("");
      setHighlightKey(canonicalAdminKey(name));
    }
  }

  async function toggleItem(id: string) {
    await persist(
      items.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
      ),
    );
  }

  return (
    <section id={id} className="card scroll-mt-6 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[#e1e8f1] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">{title}</h2>
          <p className="mt-1 text-[11px] font-medium text-[#62728a]">
            {description}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 lg:max-w-xl">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={draftInputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInputError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addItem();
                }
              }}
              placeholder={placeholder}
              className={`h-10 flex-1 rounded-xl border bg-[#f8fafd] px-3 text-xs font-semibold uppercase outline-none ${inputError ? "border-red-400 focus:border-red-400" : "border-[#dbe4ef] focus:border-[#7da4d3]"}`}
            />
            <Button size="sm" onClick={addItem}>
              <Plus size={14} /> Agregar
            </Button>
          </div>
          {inputError && (
            <p className="pl-1 text-[11px] font-semibold text-red-600">{inputError}</p>
          )}
        </div>
      </div>
      <div className="border-b border-[#e7edf4] bg-[#fafcff] p-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar..."
          className="h-9 w-full max-w-xs rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-4 text-[11px] font-semibold text-[#9aa3ad]">
            Sin resultados para esta búsqueda.
          </p>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {visible.map((item) => {
              const isHighlighted = highlightKey === canonicalAdminKey(item.name);
              return (
              <li
                key={`${apiKey}-${canonicalAdminKey(item.name)}-${item.id}`}
                ref={isHighlighted ? highlightedRowRef : undefined}
                className={`flex items-center justify-between gap-3 px-4 py-2 transition-colors duration-500 ${
                  isHighlighted ? "bg-[#fff6d9]" : ""
                }`}
              >
                <span
                  className={`truncate text-[11.5px] font-bold ${
                    item.active ? "text-[#10233f]" : "text-[#9aa3ad] line-through"
                  }`}
                  title={item.name}
                >
                  {item.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black ${
                      item.active
                        ? "bg-[#e8f6ed] text-[#277345]"
                        : "bg-[#eceff3] text-[#687789]"
                    }`}
                  >
                    {item.active ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleItem(item.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[9px] font-extrabold transition ${
                      item.active
                        ? "border-[#f0d3d2] bg-[#fce9e8] text-[#a43d39] hover:border-[#a43d39]"
                        : "border-[#cfe3d6] bg-[#e8f6ed] text-[#277345] hover:border-[#277345]"
                    }`}
                  >
                    {item.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e9ece9] bg-[#fafbfa] px-5 py-3 text-[10px] font-semibold text-[#7e8780]">
        <span>
          {items.filter((item) => item.active).length} activos · {items.length}{" "}
          total
        </span>
        <span>{status}</span>
      </div>
    </section>
  );
}

export function SupplierAdminWorkspace() {
  return (
    <>
      <PageHeader
        eyebrow="Proveedores"
        title="Red de proveedores"
        description="Gestioná proveedores, categorías, catálogos, documentos y vigencia de costos desde un único lugar."
      />
      <SummaryStrip
        items={[
          {
            label: "Listas maestras",
            value: "2",
            meta: "Proveedores y categorías",
            icon: Truck,
          },
          {
            label: "Uso en productos",
            value: "Activo",
            meta: "Desplegables del catálogo",
            icon: Tag,
            tone: "blue",
          },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminList
          id="proveedores"
          eyebrow="Perfil admin"
          title="Administrar proveedores"
          description="Estos proveedores alimentan el desplegable del módulo Productos."
          endpoint="/api/local-db/suppliers"
          apiKey="suppliers"
          placeholder="Nuevo proveedor..."
        />
        <AdminList
          id="categorias"
          eyebrow="Perfil admin"
          title="Administrar categorías"
          description="Estas categorías alimentan el desplegable del módulo Productos."
          endpoint="/api/local-db/categories"
          apiKey="categories"
          placeholder="Nueva categoría..."
        />
      </div>
    </>
  );
}
