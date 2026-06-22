import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const tones: Record<Tone, string> = {
  success: "bg-[#e8f2ec] text-[#1f6b48]",
  warning: "bg-[#fff3df] text-[#9a5b17]",
  danger: "bg-[#fce9e8] text-[#ad3f3b]",
  neutral: "bg-[#eff1ef] text-[#606a63]",
  info: "bg-[#e8f0f7] text-[#35658a]",
};

export function Badge({ children, tone = "neutral", dot = false }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
