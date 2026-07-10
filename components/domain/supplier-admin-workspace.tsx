"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Tag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { providerRows } from "@/lib/demo-data";

type AdminItem = {
  id: string;
  name: string;
  active: boolean;
};

type ApiKey = "suppliers" | "categories";

function AdminList({
  title,
  eyebrow,
  description,
  endpoint,
  apiKey,
  placeholder,
}: {
  title: string;
  eyebrow: string;
  description: string;
  endpoint: string;
  apiKey: ApiKey;
  placeholder: string;
}) {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Leyendo Excel local...");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(endpoint)
      .then(
        (response) => response.json() as Promise<Record<ApiKey, AdminItem[]>>,
      )
      .then((data) => {
        setItems(data[apiKey] ?? []);
        setStatus("Excel local sincronizado");
      })
      .catch(() => setStatus("No pude leer el Excel local"));
  }, [apiKey, endpoint]);

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

  async function persist(next: AdminItem[]) {
    setItems(next);
    setStatus("Guardando en Excel...");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [apiKey]: next }),
      });
      if (!response.ok) throw new Error("write failed");
      setStatus("Excel local sincronizado");
    } catch {
      setStatus("No pude guardar en el Excel local");
    }
  }

  async function addItem() {
    const name = draft.trim().toUpperCase();
    if (!name) return;
    if (items.some((item) => item.name.trim().toUpperCase() === name)) {
      setStatus("Ese valor ya existe");
      return;
    }
    await persist([...items, { id: crypto.randomUUID(), name, active: true }]);
    setDraft("");
  }

  async function toggleItem(id: string) {
    await persist(
      items.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
      ),
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[#e1e8f1] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="mt-1 text-base font-black text-[#10233f]">{title}</h2>
          <p className="mt-1 text-[11px] font-medium text-[#62728a]">
            {description}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addItem();
              }
            }}
            placeholder={placeholder}
            className="h-10 flex-1 rounded-xl border border-[#dbe4ef] bg-[#f8fafd] px-3 text-xs font-semibold uppercase outline-none focus:border-[#7da4d3]"
          />
          <Button size="sm" onClick={addItem}>
            <Plus size={14} /> Agregar
          </Button>
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
      <div className="flex max-h-[260px] flex-wrap items-start gap-2 overflow-y-auto p-4">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void toggleItem(item.id)}
            title={item.active ? "Desactivar" : "Activar"}
            className={`rounded-full border px-3 py-1 text-[10px] font-extrabold transition ${
              item.active
                ? "border-[#dbe4ef] bg-[#edf4fc] text-[#0b5bbb] hover:border-[#0b5bbb]"
                : "border-[#e5e7eb] bg-[#f3f4f6] text-[#9aa3ad]"
            }`}
          >
            {item.name}
          </button>
        ))}
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
          eyebrow="Perfil admin"
          title="Administrar proveedores"
          description="Estos proveedores alimentan el desplegable del módulo Productos."
          endpoint="/api/local-db/suppliers"
          apiKey="suppliers"
          placeholder="Nuevo proveedor..."
        />
        <AdminList
          eyebrow="Perfil admin"
          title="Administrar categorías"
          description="Estas categorías alimentan el desplegable del módulo Productos."
          endpoint="/api/local-db/categories"
          apiKey="categories"
          placeholder="Nueva categoría..."
        />
      </div>
      <section className="mt-4">
        <DataList
          columns={[
            "Proveedor",
            "Catálogo",
            "Moneda",
            "Última lista",
            "Vigencia",
            "Documentos",
          ]}
          rows={providerRows}
          searchPlaceholder="Buscar proveedor por nombre o CUIT..."
        />
      </section>
    </>
  );
}
