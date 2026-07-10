"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, Calculator, ChartNoAxesCombined,
  ChevronDown, CircleDollarSign, ClipboardList, FileKey2, FileUp, LayoutDashboard,
  Menu, PackageSearch, Search, Settings, ShieldCheck, Truck, Users, Warehouse, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "Principal", items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  ]},
  { label: "Información Productos", items: [
    { label: "Productos", href: "/productos", icon: Boxes },
    { label: "Códigos cliente", href: "/codigos-clientes", icon: FileKey2 },
    { label: "Precios", href: "/precios", icon: CircleDollarSign },
  ]},
  { label: "Movimientos", items: [
    { label: "Ingresos", href: "/ingresos", icon: ArrowDownToLine },
    { label: "Egresos", href: "/egresos", icon: ArrowUpFromLine },
  ]},
  { label: "Estructura de Costos", items: [
    { label: "Estructura de costos", href: "/estructura-costos", icon: Calculator },
  ]},
  { label: "Stock", items: [
    { label: "Stock", href: "/stock", icon: Warehouse },
  ]},
  { label: "Entidades", items: [
    { label: "Clientes", href: "/clientes", icon: Users },
    { label: "Proveedores", href: "/proveedores", icon: Truck },
  ]},
  { label: "Sistema", items: [
    { label: "Importaciones", href: "/importaciones", icon: FileUp },
    { label: "Integraciones", href: "/integraciones", icon: ChartNoAxesCombined },
    { label: "Auditoría", href: "/auditoria", icon: ShieldCheck },
    { label: "Configuración", href: "/configuracion", icon: Settings },
  ]},
];

function SidebarContent({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[92px] items-center border-b border-[#dfe7f0] px-4">
        <Image src="/brand/logo-dg-original.png" alt="Direct Group" width={190} height={74} priority unoptimized className="h-[68px] w-auto object-contain" />
        {close && <button onClick={close} className="ml-auto rounded-lg p-2 text-[#60738d] hover:bg-[#e9f1fb] hover:text-[#062b5b]"><X size={18} /></button>}
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-5">
        {navigation.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[.18em] text-[#8190a4]">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} onClick={close} className={cn(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition",
                    active ? "bg-[#062b5b] text-white shadow-sm" : "text-[#425979] hover:bg-[#edf4fc] hover:text-[#062b5b]",
                  )}>
                    <item.icon size={17} strokeWidth={active ? 2.5 : 2} />
                    {item.label}
                    {item.label === "Importaciones" && <span className="ml-auto rounded-full bg-[#0b5bbb] px-1.5 py-0.5 text-[9px] font-black text-white">3</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-[#dbe4ef] bg-[#f4f7fb] p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dce9f8] text-xs font-black text-[#0b5bbb]">JM</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-[#10233f]">Juan Martín</div>
            <div className="text-[10px] font-semibold text-[#74849a]">Administrador</div>
          </div>
          <ChevronDown size={14} className="text-[#74849a]" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[246px] border-r border-[#dce5ef] bg-white lg:block"><SidebarContent /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Cerrar menú" className="absolute inset-0 bg-black/45" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-2xl"><SidebarContent close={() => setMobileOpen(false)} /></aside>
        </div>
      )}

      <div className="lg:pl-[246px]">
        <header className="sticky top-0 z-20 flex h-[78px] items-center border-b border-[#dfe6ef] bg-white/92 px-5 backdrop-blur-xl lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="mr-3 rounded-xl border border-[#dbe4ef] bg-white p-2.5 text-[#334b6b] lg:hidden"><Menu size={18} /></button>
          <Image src="/brand/logo-dg-original.png" alt="Direct Group" width={140} height={55} priority unoptimized className="mr-4 h-11 w-auto object-contain lg:hidden" />
          <div className="relative hidden w-full max-w-[260px] md:block xl:max-w-[390px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a938c]" />
            <input aria-label="Buscar" placeholder="Buscar productos, clientes, operaciones..." className="h-11 w-full rounded-xl border border-[#dbe4ef] bg-white pl-10 pr-4 text-xs outline-none transition placeholder:text-[#9aa8ba] focus:border-[#7da4d3] focus:ring-3 focus:ring-[#e5eef9]" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-[#e0e4e0] bg-white px-3 py-2 text-[11px] font-bold text-[#58645c] md:flex">
              <span className="h-2 w-2 rounded-full bg-[#0b5bbb] shadow-[0_0_0_3px_#dce9f8]" /> Sistema operativo
            </div>
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex"><ClipboardList size={15} /> Atajos</Button>
            <button aria-label="Centro de actividad" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#dbe4ef] bg-white text-[#60738d] hover:text-[#0b5bbb]">
              <PackageSearch size={17} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#0b5bbb] ring-2 ring-white" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
