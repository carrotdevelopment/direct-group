import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type SummaryItem = {
  label: string;
  value: string;
  meta: string;
  icon: LucideIcon;
  tone?: "green" | "orange" | "red" | "blue";
  href?: string;
};

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  const tones = { green: "bg-[#e9f1fb] text-[#0b5bbb]", orange: "bg-[#edf4fc] text-[#3979c8]", red: "bg-[#fce9e8] text-[#b7433f]", blue: "bg-[#e3edf9] text-[#174d8f]" };
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const className = `card animate-enter flex items-center gap-3 px-3 py-2.5 ${item.href ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-[#b9cce4] hover:!bg-[#edf4fc] hover:shadow-lg" : ""}`;
        const content = (
          <>
            <div className={`hidden h-9 w-9 shrink-0 place-items-center rounded-lg sm:grid ${tones[item.tone ?? "green"]}`}>
              <item.icon size={17} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold uppercase tracking-[.08em] text-[#5a6a82]">{item.label}</div>
              <div className="tabular text-lg font-black leading-tight tracking-tight text-[#10233f]">{item.value}</div>
              <div className="truncate text-[11px] text-[#5a6a82]">{item.meta}</div>
            </div>
          </>
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={className}
            style={{ animationDelay: `${index * 45}ms` }}
            title={`Ir a ${item.label.toLowerCase()}`}
          >
            {content}
          </Link>
        ) : (
          <div
            key={item.label}
            className={className}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
