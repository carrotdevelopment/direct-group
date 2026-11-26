"use client";

import { useRef } from "react";
import { Plus, X } from "lucide-react";

// Lista de columnas de una tabla: cuáles se ven, en qué orden (con flechas o arrastrando) y botón para
// guardarlas para el usuario. La usan Egresos y Stock.
export function ColPicker({ visibleCols, allKeys, labelOf = (k) => k, onAdd, onRemove, onMove, onMoveTo, onSave, saveState, onClose }: {
  visibleCols: string[]; allKeys: string[]; labelOf?: (k: string) => string;
  onAdd: (k: string) => void; onRemove: (k: string) => void;
  onMove: (k: string, dir: -1 | 1) => void; onMoveTo: (k: string, target: string) => void;
  onSave: () => void; saveState: "" | "saving" | "saved" | "error"; onClose: () => void;
}) {
  const hidden = allKeys.filter((k) => !visibleCols.includes(k));
  const dragged = useRef<string | null>(null);
  return (
    <div className="absolute right-0 top-9 z-30 w-64 overflow-hidden rounded-xl border border-[#dbe4ef] bg-white shadow-xl">
      <div className="flex items-center justify-between gap-2 border-b border-[#dbe4ef] px-3 py-2">
        <span className="text-[11px] font-black uppercase tracking-wide text-[#5a6a82]">Columnas</span>
        <button type="button" onClick={onSave} disabled={saveState === "saving"}
          title="Guarda el orden y las columnas visibles para tu usuario: se ven igual en cualquier computadora"
          className="ml-auto rounded-md border border-[#dbe4ef] px-2 py-0.5 text-[11px] font-bold text-[#0b5bbb] hover:bg-[#edf4fc] disabled:opacity-50">
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : saveState === "error" ? "No se guardó" : "Guardar"}
        </button>
        <button onClick={onClose} className="grid h-5 w-5 place-items-center rounded text-[#5a6a82] hover:text-[#10233f]"><X size={11} /></button>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {visibleCols.length > 0 && (
          <div className="mb-1">
            <div className="mb-1 px-1 text-[11px] font-bold uppercase text-[#5a6a82]">Visibles ({visibleCols.length})</div>
            {visibleCols.map((k, i) => (
              <div key={k} draggable
                onDragStart={() => { dragged.current = k; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragged.current) onMoveTo(dragged.current, k); dragged.current = null; }}
                title="Arrastrá para cambiar el orden"
                className="flex cursor-grab items-center gap-1 rounded px-1 py-0.5 bg-[#edf4fc] mb-0.5">
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => onMove(k, -1)}
                    className="text-[11px] leading-tight text-[#5a6a82] disabled:opacity-20 hover:text-[#0b5bbb]">▲</button>
                  <button type="button" disabled={i === visibleCols.length - 1} onClick={() => onMove(k, 1)}
                    className="text-[11px] leading-tight text-[#5a6a82] disabled:opacity-20 hover:text-[#0b5bbb]">▼</button>
                </div>
                <span className="flex-1 truncate text-[11px] text-[#10233f]">{labelOf(k)}</span>
                <button type="button" onClick={() => onRemove(k)}
                  className="rounded px-1 text-[11px] text-[#b7433f] hover:bg-[#fff0ef]" title="Ocultar">×</button>
              </div>
            ))}
          </div>
        )}
        {hidden.length > 0 && (
          <div>
            <div className="mb-1 px-1 text-[11px] font-bold uppercase text-[#5a6a82]">Ocultas ({hidden.length})</div>
            {hidden.map((k) => (
              <button key={k} type="button" onClick={() => onAdd(k)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[11px] text-[#5a6a82] hover:bg-[#f4f7fb]">
                <Plus size={10} className="shrink-0 text-[#0b5bbb]" /> {labelOf(k)}
              </button>
            ))}
          </div>
        )}
        {visibleCols.length === 0 && hidden.length === 0 && (
          <div className="py-4 text-center text-[11px] text-[#5a6a82]">Sin columnas disponibles.</div>
        )}
      </div>
    </div>
  );
}
