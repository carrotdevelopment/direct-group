"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, FileSpreadsheet, FileText, RefreshCw, Sparkles, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Upload = { name: string; size: string; type: string };

export function ImportCenter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = (file?: File) => {
    if (!file) return;
    setUpload({ name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, type: file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "Excel" });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <section className="card animate-enter p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="text-base font-black">Nueva importación</div><p className="mt-1 text-xs leading-5 text-[#79827b]">Cargá ventas de clientes o listas de precios. La plataforma detectará la estructura y propondrá el mapeo.</p></div><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f2ec] text-[#1f6b48]"><Sparkles size={18} /></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[11px] font-extrabold text-[#4e5a52]">Tipo de carga<select className="mt-2 h-11 w-full rounded-xl border border-[#dfe4df] bg-white px-3 text-xs outline-none focus:border-[#8faf9a]"><option>Ventas de cliente</option><option>Precios de proveedor</option><option>Compras desde Tango</option></select></label>
          <label className="text-[11px] font-extrabold text-[#4e5a52]">Entidad<select className="mt-2 h-11 w-full rounded-xl border border-[#dfe4df] bg-white px-3 text-xs outline-none focus:border-[#8faf9a]"><option>Supermercados Norte SA</option><option>Mercado del Centro SRL</option><option>Distribuidora Sur</option></select></label>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={(event) => acceptFile(event.target.files?.[0])} />
        {!upload ? (
          <button onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }} className={`mt-5 flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition ${dragging ? "border-[#1f6b48] bg-[#eef6f1]" : "border-[#d7ddd8] bg-[#fafbfa] hover:border-[#9db7a5] hover:bg-[#f6faf7]"}`}>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f2ec] text-[#1f6b48]"><UploadCloud size={24} /></div>
            <div className="mt-4 text-sm font-black">Arrastrá el archivo o hacé clic para buscar</div><div className="mt-2 text-[11px] text-[#8a928c]">Excel, CSV o PDF · Máximo 25 MB</div>
          </button>
        ) : (
          <div className="mt-5 rounded-2xl border border-[#b9d5c3] bg-[#f2f8f4] p-5">
            <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-[#1f6b48] shadow-sm">{upload.type === "PDF" ? <FileText size={21} /> : <FileSpreadsheet size={21} />}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{upload.name}</div><div className="mt-1 text-[10px] text-[#758178]">{upload.type} · {upload.size} · Listo para procesar</div></div><button onClick={() => setUpload(null)} className="rounded-lg p-2 text-[#78837b] hover:bg-white hover:text-[#b7433f]"><X size={16} /></button></div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 text-[11px]"><span className="flex items-center gap-2 font-bold text-[#28734f]"><Check size={14} /> Validación de seguridad completa</span><Badge tone="success">Aceptado</Badge></div>
            <Button className="mt-4 w-full">Procesar con IA <Sparkles size={15} /></Button>
          </div>
        )}
      </section>

      <section className="card animate-enter p-5 sm:p-6" style={{ animationDelay: "70ms" }}>
        <div className="text-base font-black">Cómo funciona</div><div className="mt-1 text-xs text-[#79827b]">Control humano en cada paso crítico.</div>
        <ol className="mt-6 space-y-0">
          {[
            ["01", "Carga segura", "El archivo se valida y almacena fuera del directorio público.", UploadCloud],
            ["02", "Lectura asistida", "IA y reglas detectan encabezados, formatos y equivalencias.", Sparkles],
            ["03", "Revisión humana", "Corregís el mapeo y los registros con baja confianza.", RefreshCw],
            ["04", "Confirmación atómica", "Se crean operaciones, movimientos y auditoría en conjunto.", Check],
          ].map(([num, title, copy, Icon], index) => {
            const I = Icon as typeof UploadCloud;
            return <li key={String(num)} className="relative flex gap-4 pb-6 last:pb-0">{index < 3 && <span className="absolute left-[19px] top-10 h-[calc(100%-32px)] w-px bg-[#dfe5e0]" />}<div className="z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dfe5e0] bg-white text-[#1f6b48]"><I size={16} /></div><div><div className="flex items-center gap-2"><span className="text-[9px] font-black text-[#a0a7a2]">{String(num)}</span><span className="text-xs font-black">{String(title)}</span></div><p className="mt-1.5 text-[11px] leading-5 text-[#7b847d]">{String(copy)}</p></div></li>;
          })}
        </ol>
        <button className="mt-6 flex w-full items-center justify-between rounded-xl border border-[#e3e7e3] bg-[#fafbfa] px-4 py-3 text-left text-[11px] font-bold text-[#536057] hover:border-[#b8c9bd]"><span>Ver guía de formatos admitidos</span><ArrowRight size={14} /></button>
      </section>
    </div>
  );
}
