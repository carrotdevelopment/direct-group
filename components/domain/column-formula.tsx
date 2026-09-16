"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ColumnFormula({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return <>
    <button
      type="button"
      aria-label={`Ver fórmula u origen: ${text}`}
      aria-haspopup="dialog"
      title="Ver fórmula u origen de esta columna"
      className="mx-auto mt-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#8aafd6] bg-white/90 text-[10px] font-bold normal-case leading-none tracking-normal text-[#0b5bbb] hover:border-[#0b5bbb] hover:bg-[#e8f3ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5bbb]"
      onClick={event => { event.stopPropagation(); setOpen(true); }}
    >?</button>
    {open && createPortal(
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        className="fixed inset-0 m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-[#c3d0df] bg-white p-5 text-left text-[#10233f] shadow-xl backdrop:bg-black/30"
        onClose={() => setOpen(false)}
        onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <h2 id={headingId} className="text-sm font-bold">Fórmula u origen de la columna</h2>
        <p className="mt-3 text-sm font-normal leading-relaxed">{text}</p>
        <button type="button" autoFocus className="mt-4 rounded-lg bg-[#0b5bbb] px-4 py-2 text-xs font-bold text-white" onClick={() => dialog.current?.close()}>Cerrar</button>
      </dialog>, document.body,
    )}
  </>;
}
