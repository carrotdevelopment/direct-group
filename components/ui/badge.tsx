import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const tones: Record<Tone, string> = {
  success: "bg-[#e9f1fb] text-[#0b5bbb]",
  warning: "bg-[#fff3df] text-[#9a5b17]",
  danger: "bg-[#fce9e8] text-[#ad3f3b]",
  neutral: "bg-[#edf1f6] text-[#60738d]",
  info: "bg-[#e3edf9] text-[#174d8f]",
};

export function Badge({ children, tone = "neutral", dot = false }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
