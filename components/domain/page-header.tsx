import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  eyebrow, title, description, action, secondaryAction,
}: {
  eyebrow?: string; title: string; description: string; action?: string; secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-enter">
        {eyebrow && <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#78827b]">Operación <ChevronRight size={11} /> <span className="text-[#1f6b48]">{eyebrow}</span></div>}
        <h1 className="text-[28px] font-black tracking-[-.035em] text-[#17211b] sm:text-[32px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d766f]">{description}</p>
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
