"use client";
import { useEffect, useState } from "react";
import { accessModules } from "@/lib/module-access";

type User = { id: string; name: string; email: string; role: string; active: boolean; moduleAccess: string[]; lastLoginAt?: string | null };
const empty = { id: "", name: "", email: "", role: "VENDEDOR", active: true, moduleAccess: [] as string[], password: "" };
const inputClass = "mt-1 w-full rounded-lg border bg-white p-2 text-sm";

export function PermissionsWorkspace({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    const response = await fetch("/api/users"); const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setUsers(data.users);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users").then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message); return data.users as User[]; })
      .then(data => { if (!cancelled) setUsers(data); })
      .catch(() => { if (!cancelled) setMessage("No se pudieron cargar los usuarios. Recargá la página."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-[#062b5b]">Permisos y usuarios</h1><p className="mt-2 text-sm text-slate-600">Administrá las cuentas y su acceso a cada módulo. Los cambios se aplican en la siguiente solicitud.</p></div>
    {message && <p role="status" className="rounded-lg border bg-white p-3">{message}</p>}
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead><tr>{["Usuario", "Estado", "Acceso", "Último ingreso", ""].map((title, index) => <th key={index} className="p-3">{title}</th>)}</tr></thead><tbody>{users.map(user => <tr key={user.id} className="border-t"><td className="p-3"><strong>{user.name}</strong><div>{user.email}</div></td><td className="p-3">{user.active ? "Activo" : "Deshabilitado"}</td><td className="p-3">{user.role === "ADMIN" ? "Administrador · Todos los módulos" : `${user.role === "LECTURA" ? "Solo lectura" : "Operador"} · ${user.moduleAccess.map(key => accessModules[key as keyof typeof accessModules]).join(", ") || "Sin módulos"}`}</td><td className="p-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-AR") : "Nunca"}</td><td className="p-3"><button disabled={busy} className="text-blue-700 underline" onClick={() => { setForm({ ...user, password: "" }); setMessage(""); }}>Editar permisos</button></td></tr>)}</tbody></table>{loading && <p className="p-4">Cargando usuarios…</p>}{!loading && !users.length && <p className="p-4">No hay usuarios para mostrar.</p>}</div>
    <form method="post" className="space-y-4 rounded-xl border bg-white p-5" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try {
        const response = await fetch("/api/users", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, password: form.password || undefined }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.message);
        setForm(empty); setMessage("Usuario guardado. Los permisos ya están vigentes."); await load();
      } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); } finally { setBusy(false); }
    }}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{form.id ? "Editar usuario" : "Crear usuario"}</h2><button type="button" disabled={busy} className="text-sm underline" onClick={() => setForm(empty)}>Nuevo usuario</button></div>
      <fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label>Nombre<input required maxLength={120} className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Email<input required type="email" className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Tipo de acceso<select className={inputClass} disabled={form.id === currentUserId} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="VENDEDOR">Operador</option><option value="DEPOSITO">Depósito</option><option value="LECTURA">Solo lectura</option><option value="ADMIN">Administrador (acceso completo)</option></select></label><label>{form.id ? "Nueva contraseña (opcional)" : "Contraseña"}<input required={!form.id} type="password" autoComplete="new-password" minLength={12} maxLength={72} className={inputClass} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><span className="text-xs text-slate-500">Mínimo 12 caracteres.</span></label></div>
      <label className="flex gap-2"><input type="checkbox" disabled={form.id === currentUserId} checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />Cuenta habilitada</label>
      <fieldset className="rounded-lg border p-4"><legend className="px-2 font-semibold">Módulos habilitados</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(accessModules).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={form.role === "ADMIN"} checked={form.role === "ADMIN" || form.moduleAccess.includes(key)} onChange={e => setForm({ ...form, moduleAccess: e.target.checked ? [...form.moduleAccess, key] : form.moduleAccess.filter(value => value !== key) })} />{label}</label>)}</div></fieldset>
      <p className="text-xs text-slate-600">Solo los administradores acceden a Permisos, Dashboard, Auditoría, Integraciones y Configuración. Solo lectura permite consultar sin modificar datos.</p><button disabled={busy} className="rounded-lg bg-[#062b5b] px-5 py-2 text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar usuario"}</button></fieldset>
    </form></div>;
}
