"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SUPPLIER_MAIL, MAIL_PLACEHOLDERS, renderMailTemplate, type SupplierMailTemplates } from "@/lib/org-settings";

type Saved = { updatedBy: string | null; updatedAt: string | null };

const inputClass =
  "mt-2 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3] focus:ring-3 focus:ring-[#e5eef9]";

// Ejemplo para la vista previa: un proveedor real del envío mensual y el mes actual.
const SAMPLE = {
  contacto: "Francisco Tedin",
  proveedor: "ACEGAME",
  mes: new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()),
};

function MailEditor({
  title,
  help,
  subject,
  body,
  onSubject,
  onBody,
}: {
  title: string;
  help: string;
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-[#e1e8f1] p-4 2xl:grid-cols-2">
      <div>
        <div className="text-sm font-black text-[#10233f]">{title}</div>
        <p className="mt-0.5 text-[11px] text-[#62728a]">{help}</p>
        <label className="mt-3 block text-[11px] font-extrabold text-[#334b6b]">
          Asunto
          <input value={subject} onChange={(event) => onSubject(event.target.value)} className={`${inputClass} h-10`} />
        </label>
        <label className="mt-3 block text-[11px] font-extrabold text-[#334b6b]">
          Texto
          <textarea value={body} onChange={(event) => onBody(event.target.value)} rows={11} className={`${inputClass} py-2 leading-relaxed`} />
        </label>
      </div>
      <div>
        <div className="text-[11px] font-extrabold text-[#334b6b]">Vista previa (ejemplo: {SAMPLE.proveedor}, {SAMPLE.contacto})</div>
        <div className="mt-2 rounded-xl border border-[#e1e8f1] bg-[#f8fafd] p-4 text-xs text-[#263b57]">
          <div className="border-b border-[#e1e8f1] pb-2 font-bold">{renderMailTemplate(subject, SAMPLE) || "(sin asunto)"}</div>
          <div className="mt-2 whitespace-pre-wrap leading-relaxed">{renderMailTemplate(body, SAMPLE)}</div>
        </div>
      </div>
    </div>
  );
}

export function SupplierMailForm({ initial, saved: initialSaved }: { initial: SupplierMailTemplates; saved: Saved }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isDefault = useMemo(
    () => (Object.keys(DEFAULT_SUPPLIER_MAIL) as (keyof SupplierMailTemplates)[]).every((key) => form[key] === DEFAULT_SUPPLIER_MAIL[key]),
    [form],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "correoProveedores", value: form }),
      });
      const data = (await response.json()) as Saved & { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo guardar.");
      setSaved(data);
      setNotice("Se guardaron los textos. Los próximos correos a proveedores salen así.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="rounded-xl bg-[#f2f6fb] px-4 py-3 text-[11px] text-[#425979]">
        Se pueden usar {MAIL_PLACEHOLDERS.map((placeholder) => <code key={placeholder} className="mx-0.5 rounded bg-white px-1 font-bold text-[#0b5bbb]">{placeholder}</code>)}:
        se reemplazan por el nombre del contacto, el proveedor y el mes del pedido (por ejemplo &quot;{SAMPLE.mes}&quot;).
        Si el contacto no tiene nombre, &quot;Hola {"{contacto}"}, buenas tardes.&quot; sale como &quot;Hola, buenas tardes.&quot;.
      </p>
      <MailEditor
        title="Pedido de catálogo"
        help="Se manda solo el primer día hábil de cada mes a los proveedores activos (y con el botón Enviar prueba)."
        subject={form.requestSubject}
        body={form.requestBody}
        onSubject={(value) => setForm({ ...form, requestSubject: value })}
        onBody={(value) => setForm({ ...form, requestBody: value })}
      />
      <MailEditor
        title="Reconsulta"
        help="Se manda con el botón Reconsulta a un proveedor que todavía no contestó. {mes} es el mes del pedido."
        subject={form.followUpSubject}
        body={form.followUpBody}
        onSubject={(value) => setForm({ ...form, followUpSubject: value })}
        onBody={(value) => setForm({ ...form, followUpBody: value })}
      />
      {error && <div className="rounded-xl bg-[#fce9e8] px-4 py-3 text-xs font-bold text-[#a43d39]">{error}</div>}
      {notice && <div className="rounded-xl bg-[#e7f7eb] px-4 py-3 text-xs font-bold text-[#23783a]">{notice}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8f1] pt-5">
        <span className="text-[11px] text-[#8a99ad]">
          {saved.updatedAt
            ? `Último cambio: ${saved.updatedBy ?? "—"}, ${new Date(saved.updatedAt).toLocaleString("es-AR", { hourCycle: "h23" })}`
            : "Se están usando los textos originales."}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={busy || isDefault} onClick={() => setForm(DEFAULT_SUPPLIER_MAIL)}>
            <RotateCcw size={15} /> Volver a los textos originales
          </Button>
          <Button type="submit" disabled={busy}>
            <Save size={15} /> Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  );
}
