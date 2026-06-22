"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes, ChartNoAxesCombined, ChevronDown, CircleDollarSign, ClipboardList,
  FileUp, HandCoins, LayoutDashboard, Menu, PackageSearch, Search, Settings, ShieldCheck,
  ShoppingCart, Truck, Users, Warehouse, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "Principal", items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Productos", href: "/productos", icon: Boxes },
    { label: "Clientes", href: "/clientes", icon: Users },
    { label: "Proveedores", href: "/proveedores", icon: Truck },
  ]},
  { label: "Operación", items: [
    { label: "Pricing", href: "/pricing", icon: CircleDollarSign },
    { label: "Compras", href: "/compras", icon: ShoppingCart },
    { label: "Ventas", href: "/ventas", icon: HandCoins },
    { label: "Stock", href: "/stock", icon: Warehouse },
    { label: "Importaciones", href: "/importaciones", icon: FileUp },
  ]},
  { label: "Sistema", items: [
    { label: "Integraciones", href: "/integraciones", icon: ChartNoAxesCombined },
    { label: "Auditoría", href: "/auditoria", icon: ShieldCheck },
    { label: "Configuración", href: "/configuracion", icon: Settings },
  ]},
];

function SidebarContent({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#ef7b45] text-sm font-black text-white">DG</div>
        <div>
          <div className="text-sm font-black tracking-tight text-white">Direct Group</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Plataforma B2B</div>
        </div>
        {close && <button onClick={close} className="ml-auto rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>}
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-5">
        {navigation.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[.18em] text-white/30">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} onClick={close} className={cn(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition",
                    active ? "bg-white text-[#1a3f2e] shadow-sm" : "text-white/62 hover:bg-white/8 hover:text-white",
                  )}>
                    <item.icon size={17} strokeWidth={active ? 2.5 : 2} />
                    {item.label}
                    {item.label === "Importaciones" && <span className="ml-auto rounded-full bg-[#ef7b45] px-1.5 py-0.5 text-[9px] font-black text-white">3</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d9e9de] text-xs font-black text-[#1f6b48]">JM</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">Juan Martín</div>
            <div className="text-[10px] font-semibold text-white/40">Administrador</div>
          </div>
          <ChevronDown size={14} className="text-white/35" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f4f5f2]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[246px] bg-[#183d2d] lg:block"><SidebarContent /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Cerrar menú" className="absolute inset-0 bg-black/45" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-[#183d2d] shadow-2xl"><SidebarContent close={() => setMobileOpen(false)} /></aside>
        </div>
      )}

      <div className="lg:pl-[246px]">
        <header className="sticky top-0 z-20 flex h-[78px] items-center border-b border-[#e1e5e1] bg-[#f4f5f2]/92 px-5 backdrop-blur-xl lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="mr-3 rounded-xl border border-[#dde2de] bg-white p-2.5 text-[#435047] lg:hidden"><Menu size={18} /></button>
          <div className="relative hidden w-full max-w-[390px] sm:block">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a938c]" />
            <input aria-label="Buscar" placeholder="Buscar productos, clientes, operaciones..." className="h-11 w-full rounded-xl border border-[#e0e4e0] bg-white pl-10 pr-4 text-xs outline-none transition placeholder:text-[#a1a8a3] focus:border-[#9bb9a6] focus:ring-3 focus:ring-[#dfece3]" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#e0e4e0] bg-white px-3 py-2 text-[11px] font-bold text-[#58645c] md:flex">
              <span className="h-2 w-2 rounded-full bg-[#47a46e] shadow-[0_0_0_3px_#e1f2e8]" /> Sistema operativo
            </div>
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex"><ClipboardList size={15} /> Atajos</Button>
            <button aria-label="Centro de actividad" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e0e4e0] bg-white text-[#69736c] hover:text-[#1f6b48]">
              <PackageSearch size={17} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#ef7b45] ring-2 ring-white" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
