"use client";

import { useState } from "react";
import { Mail, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationSettings, OrganizationSettings, SettingKey } from "@/lib/org-settings";

type Saved = { updatedBy: string | null; updatedAt: string | null };

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3] focus:ring-3 focus:ring-[#e5eef9]";

async function save(key: SettingKey, value: unknown) {
  const response = await fetch("/api/configuracion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = (await response.json()) as Saved & { message?: string };
  if (!response.ok) throw new Error(data.message || "No se pudo guardar.");
  return data;
}

function SavedNote({ saved }: { saved: Saved }) {
  if (!saved.updatedAt) return <span className="text-[11px] text-[#8a99ad]">Todavía no se guardó ningún cambio.</span>;
  return (
    <span className="text-[11px] text-[#8a99ad]">
      Último cambio: {saved.updatedBy ?? "—"}, {new Date(saved.updatedAt).toLocaleString("es-AR", { hourCycle: "h23" })}
    </span>
  );
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <div className="mt-4 rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>;
  if (notice) return <div className="mt-4 rounded-xl bg-[#e7f7eb] px-4 py-3 text-xs font-bold text-[#23783a]">{notice}</div>;
  return null;
}

const ORGANIZATION_FIELDS: { key: keyof OrganizationSettings; label: string }[] = [
  { key: "name", label: "Nombre de la organización" },
  { key: "legalName", label: "Razón social" },
  { key: "cuit", label: "CUIT" },
  { key: "timeZone", label: "Zona horaria" },
  { key: "currency", label: "Moneda predeterminada" },
  { key: "language", label: "Idioma" },
];

export function OrganizationForm({ initial, saved: initialSaved }: { initial: OrganizationSettings; saved: Saved }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSaved(await save("organizacion", form));
      setNotice("Se guardaron los datos de la organización.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {ORGANIZATION_FIELDS.map((field) => (
          <label key={field.key} className="text-[11px] font-extrabold text-[#334b6b]">
            {field.label}
            <input
              value={form[field.key]}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <Feedback error={error} notice={notice} />
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8f1] pt-5">
        <SavedNote saved={saved} />
        <Button type="submit" disabled={busy}>
          <Save size={15} /> Guardar cambios
        </Button>
      </div>
    </form>
  );
}

const ALERTS: { key: "urbano" | "tango" | "backups"; label: string; help: string }[] = [
  { key: "urbano", label: "Stock de Urbano", help: "Si a la mañana no se trajo el reporte de stock del portal de Urbano." },
  { key: "tango", label: "Conector de Tango", help: "Si el conector no se conecta en más de un día, si una consulta falla o si pasan varios días hábiles sin ingresos nuevos." },
  { key: "backups", label: "Respaldos de la base", help: "Si no se hizo el respaldo automático de la noche." },
];

export function NotificationsForm({ initial, saved: initialSaved }: { initial: NotificationSettings; saved: Saved }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initialSaved);
  const [newRecipient, setNewRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function addRecipient() {
    const email = newRecipient.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("El correo no es válido.");
    if (!form.recipients.includes(email)) setForm({ ...form, recipients: [...form.recipients, email] });
    setNewRecipient("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSaved(await save("notificaciones", form));
      setNotice("Se guardó la configuración de avisos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = (await response.json()) as { sent?: string[]; message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo enviar el correo de prueba.");
      setNotice(`Se mandó un correo de prueba a ${data.sent?.join(", ")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el correo de prueba.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mt-6">
        <div className="text-[11px] font-extrabold text-[#334b6b]">Destinatarios de los avisos</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {form.recipients.length === 0 && <span className="text-xs text-[#8a99ad]">Sin destinatarios: los problemas se ven acá pero no se avisa por correo.</span>}
          {form.recipients.map((email) => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full bg-[#e9f1fb] px-3 py-1 text-xs font-bold text-[#0b5bbb]">
              {email}
              <button
                type="button"
                aria-label={`Quitar ${email}`}
                onClick={() => setForm({ ...form, recipients: form.recipients.filter((item) => item !== email) })}
                className="rounded-full p-0.5 hover:bg-[#d6e5f7]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex max-w-md gap-2">
          <input
            type="email"
            value={newRecipient}
            onChange={(event) => setNewRecipient(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRecipient();
              }
            }}
            placeholder="correo@directgroup.com.ar"
            className="h-10 flex-1 rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3]"
          />
          <Button type="button" variant="secondary" onClick={addRecipient}>Agregar</Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-[11px] font-extrabold text-[#334b6b]">Avisar cuando falle</div>
        {ALERTS.map((alert) => (
          <label key={alert.key} className="flex items-start gap-3 rounded-xl border border-[#e1e8f1] p-3">
            <input
              type="checkbox"
              checked={form[alert.key]}
              onChange={(event) => setForm({ ...form, [alert.key]: event.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-bold text-[#10233f]">{alert.label}</span>
              <span className="block text-[11px] text-[#62728a]">{alert.help}</span>
              {alert.key === "tango" && form.tango && (
                <span className="mt-2 flex items-center gap-2 text-[11px] text-[#334b6b]">
                  Avisar después de
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={form.tangoIdleBusinessDays}
                    onChange={(event) => setForm({ ...form, tangoIdleBusinessDays: Math.max(0, Math.min(30, Number(event.target.value) || 0)) })}
                    className="h-8 w-16 rounded-lg border border-[#dbe4ef] px-2 text-right text-xs"
                  />
                  días hábiles sin ingresos (0 = no avisar por eso)
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <Feedback error={error} notice={notice} />
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8f1] pt-5">
        <SavedNote saved={saved} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy || !saved.updatedAt} onClick={() => void sendTest()}>
            <Mail size={15} /> Enviar correo de prueba
          </Button>
          <Button type="submit" disabled={busy}>
            <Save size={15} /> Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}
