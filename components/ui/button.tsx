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
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b48] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm",
        variant === "primary" && "bg-[#1f6b48] text-white shadow-sm hover:bg-[#174d36]",
        variant === "secondary" && "border border-[#dde2de] bg-white text-[#27332b] hover:bg-[#f6f7f5]",
        variant === "ghost" && "text-[#667169] hover:bg-[#edf0ed] hover:text-[#17211b]",
        variant === "danger" && "bg-[#b7433f] text-white hover:bg-[#963632]",
        className,
      )}
      {...props}
    />
  );
}
