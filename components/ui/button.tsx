import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5bbb] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm",
        variant === "primary" && "bg-[#0b5bbb] text-white shadow-sm hover:bg-[#062b5b]",
        variant === "secondary" && "border border-[#d8e2ee] bg-white text-[#16365f] hover:bg-[#edf4fc]",
        variant === "ghost" && "text-[#60738d] hover:bg-[#e9f1fb] hover:text-[#062b5b]",
        variant === "danger" && "bg-[#b7433f] text-white hover:bg-[#963632]",
        className,
      )}
      {...props}
    />
  );
}
