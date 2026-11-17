"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

type AdminItem = {
  id: string;
  name: string;
  active: boolean;
  managerUserId?: string | null;
};

type ApiKey = "suppliers" | "categories";
type Manager = { id: string; name: string };
// Encargado de un proveedor: se muestra el nombre y la lista se arma recién al tocarlo (antes cada fila
// tenía su desplegable completo y la página se hacía pesada con cientos de proveedores).
function ManagerPicker({ supplier, value, managers, managerName, onChange }: {
  supplier: string; value: string; managers: Manager[]; managerName: Map<string, string>; onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!editing || !selectRef.current) return;
    selectRef.current.focus();
    try { selectRef.current.showPicker(); } catch { /* algunos navegadores no lo permiten: queda enfocado */ }
  }, [editing]);
  const label = value ? managerName.get(value) ?? "Usuario dado de baja" : "Sin encargado";
  const tone = value ? "border-[#cfdcec] text-[#16365f]" : "border-dashed border-[#dbe4ef] text-[#5a6a82]";
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} aria-label={`Encargado de ${supplier}: ${label}. Cambiar`}
        className={`h-7 max-w-[150px] truncate rounded-lg border bg-white px-2 text-[11px] font-bold hover:border-[#0b5bbb] ${tone}`}>
        {label}
      </button>
    );
  }
  return (
    <select
      ref={selectRef}
      aria-label={`Encargado de ${supplier}`}
      value={value}
      onChange={(event) => { onChange(event.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}
      className={`h-7 max-w-[150px] rounded-lg border bg-white px-2 text-[11px] font-bold outline-none focus:border-[#7da4d3] ${tone}`}
    >
      <option value="">Sin encargado</option>
      {value && !managerName.has(value) && <option value={value}>Usuario dado de baja</option>}
      {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
    </select>
  );
}

type ListResponse = Partial<Record<ApiKey, AdminItem[]>> & { managers?: Manager[]; currentUserId?: string | null };

// Filtro por encargado: todos, los del usuario que mira, los que no tienen o los de un usuario puntual.
const MINE = "__mine__";
const NONE = "__none__";

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
  withManagers = false,
}: {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  endpoint: string;
  apiKey: ApiKey;
  placeholder: string;
  withManagers?: boolean;
}) {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [managerFilter, setManagerFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState("");
  const [status, setStatus] = useState("Cargando...");
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
        (response) => response.json() as Promise<ListResponse>,
      )
      .then((data) => {
        setItems(uniqueAdminItems(data[apiKey] ?? []));
        setManagers(data.managers ?? []);
        setCurrentUserId(data.currentUserId ?? null);
        setStatus("");
      })
      .catch(() => setStatus("No se pudo cargar la lista."));
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
      .filter((item) => {
        if (!withManagers || !managerFilter) return true;
        if (managerFilter === NONE) return !item.managerUserId;
        const wanted = managerFilter === MINE ? currentUserId : managerFilter;
        return !!wanted && item.managerUserId === wanted;
      })
      .sort(
        (left, right) =>
          Number(right.active) - Number(left.active) ||
          left.name.localeCompare(right.name, "es"),
      );
  }, [items, query, withManagers, managerFilter, currentUserId]);

  const managerName = useMemo(() => new Map(managers.map((manager) => [manager.id, manager.name])), [managers]);

  async function persist(next: AdminItem[]): Promise<string | null> {
    const uniqueNext = uniqueAdminItems(next);
    setStatus("Guardando...");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [apiKey]: uniqueNext }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        const message = body.message ?? "No se pudo guardar.";
        setStatus(message);
        return message;
      }
      // Use the server's response (real numeric ids) instead of uniqueNext:
      // items created in this call only get a database id once saved, and
      // reusing the client-side placeholder id on the next save would create
      // a duplicate row.
      const data = (await response.json()) as ListResponse;
      setItems(uniqueAdminItems(data[apiKey] ?? uniqueNext));
      setStatus("");
      return null;
    } catch {
      setStatus("No se pudo guardar.");
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

  async function setManager(id: string, managerUserId: string) {
    await persist(
      items.map((item) => (item.id === id ? { ...item, managerUserId: managerUserId || null } : item)),
    );
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
          <p className="mt-1 text-[11px] font-medium text-[#5a6a82]">
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
              className={`h-10 flex-1 rounded-xl border bg-[#f8fafd] px-3 text-xs font-semibold outline-none ${inputError ? "border-red-400 focus:border-red-400" : "border-[#dbe4ef] focus:border-[#7da4d3]"}`}
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
      <div className="flex flex-wrap gap-2 border-b border-[#e7edf4] bg-[#fafcff] p-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar..."
          className="h-9 w-full max-w-xs rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
        />
        {withManagers && (
          <select
            aria-label="Filtrar por encargado"
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className="h-9 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs font-semibold text-[#334b6b] outline-none focus:border-[#7da4d3]"
          >
            <option value="">Todos los encargados</option>
            {currentUserId && <option value={MINE}>Mis proveedores</option>}
            <option value={NONE}>Sin encargado</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>{manager.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-4 text-[11px] font-semibold text-[#5a6a82]">
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
                    item.active ? "text-[#10233f]" : "text-[#5a6a82] line-through"
                  }`}
                  title={item.name}
                >
                  {item.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {withManagers && (
                    <ManagerPicker
                      supplier={item.name}
                      value={item.managerUserId ?? ""}
                      managers={managers}
                      managerName={managerName}
                      onChange={(value) => void setManager(item.id, value)}
                    />
                  )}
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-black ${
                      item.active
                        ? "bg-[#e8f6ed] text-[#277345]"
                        : "bg-[#eceff3] text-[#5a6a82]"
                    }`}
                  >
                    {item.active ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleItem(item.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-extrabold transition ${
                      item.active
                        ? "border-[#dbe4ef] bg-white text-[#5a6a82] hover:border-[#a43d39] hover:bg-[#fce9e8] hover:text-[#a43d39]"
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4eaf2] bg-[#f8fafd] px-5 py-3 text-[11px] font-semibold text-[#5a6a82]">
        <span>
          {items.filter((item) => item.active).length} activos · {items.length}{" "}
          total
          {withManagers && ` · ${items.filter((item) => !item.managerUserId).length} sin encargado`}
        </span>
        {status && <span>{status}</span>}
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
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminList
          id="proveedores"
          eyebrow="Perfil admin"
          title="Administrar proveedores"
          description="Estos proveedores alimentan el desplegable del módulo Productos. Cada uno puede tener un encargado."
          endpoint="/api/local-db/suppliers"
          apiKey="suppliers"
          placeholder="Nuevo proveedor..."
          withManagers
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
