import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  eyebrow, title, description, action, secondaryAction,
}: {
  eyebrow?: string; title: string; description: string; action?: string; secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-enter">
        {eyebrow && <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#74849a]">Operación <ChevronRight size={11} /> <span className="text-[#0b5bbb]">{eyebrow}</span></div>}
        <h1 className="text-[22px] font-extrabold tracking-[-.025em] text-[#10233f] sm:text-[24px]">{title}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-[#62728a]">{description}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="flex shrink-0 items-center gap-2 animate-enter">
          {secondaryAction}
          {action && <Button><Plus size={16} strokeWidth={2.5} /> {action}</Button>}
        </div>
      )}
    </div>
  );
}
