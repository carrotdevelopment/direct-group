import type { LucideIcon } from "lucide-react";

export function SummaryStrip({ items }: { items: Array<{ label: string; value: string; meta: string; icon: LucideIcon; tone?: "green" | "orange" | "red" | "blue" }> }) {
  const tones = { green: "bg-[#e9f1fb] text-[#0b5bbb]", orange: "bg-[#edf4fc] text-[#3979c8]", red: "bg-[#fce9e8] text-[#b7433f]", blue: "bg-[#e3edf9] text-[#174d8f]" };
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => <div key={item.label} className="card animate-enter flex items-center gap-4 p-4" style={{ animationDelay: `${index * 45}ms` }}><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[item.tone ?? "green"]}`}><item.icon size={19} /></div><div><div className="text-[10px] font-bold uppercase tracking-[.08em] text-[#89918b]">{item.label}</div><div className="tabular mt-1 text-xl font-black tracking-tight">{item.value}</div><div className="mt-0.5 text-[10px] text-[#879089]">{item.meta}</div></div></div>)}
    </div>
  );
}
