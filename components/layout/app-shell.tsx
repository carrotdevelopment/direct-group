"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, Calculator,
  CircleDollarSign, ClipboardList, FileKey2,
  Mail, Menu, PackageSearch, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Truck, Users, Warehouse, X,
} from "lucide-react";
import { hasModule, pageModule } from "@/lib/module-access";
import { cn } from "@/lib/utils";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

type NavItem = { label: string; href: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  { label: "Información Productos", items: [
    { label: "Productos", href: "/productos", icon: Boxes },
    { label: "Códigos cliente", href: "/codigos-clientes", icon: FileKey2 },
    { label: "Precios", href: "/precios", icon: CircleDollarSign },
  ]},
  { label: "Estructura de Costos", items: [
    { label: "Estructura de costos", href: "/estructura-costos", icon: Calculator },
  ]},
  { label: "Movimientos", items: [
    { label: "Ingresos", href: "/ingresos", icon: ArrowDownToLine },
    { label: "Egresos", href: "/egresos", icon: ArrowUpFromLine },
    { label: "Pasajes y Ajustes", href: "/pasajes", icon: ClipboardList },
  ]},
  { label: "Stock", items: [
    { label: "Stock", href: "/stock", icon: Warehouse },
    { label: "Carga Urbano", href: "/stock/urbano", icon: PackageSearch },
  ]},
  { label: "Comunicación", items: [
    { label: "Correos", href: "/correos", icon: Mail },
  ]},
  { label: "Entidades", items: [
    { label: "Clientes", href: "/clientes", icon: Users },
    { label: "Proveedores", href: "/proveedores", icon: Truck },
  ]},
  { label: "Sistema", items: [
    { label: "Permisos", href: "/permisos", icon: ShieldCheck },
    { label: "Configuración", href: "/configuracion", icon: Settings },
  ]},
];

function SidebarContent({ close, collapse }: { close?: () => void; collapse?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[76px] items-center border-b border-[#dfe7f0] px-4">
        <Image src="/brand/logo-dg-original.png" alt="Direct Group" width={190} height={74} priority unoptimized className="h-[56px] w-auto object-contain" />
        {close && <button onClick={close} className="ml-auto rounded-lg p-2 text-[#5a6a82] hover:bg-[#e9f1fb] hover:text-[#062b5b]"><X size={18} /></button>}
        {collapse && (
          <button onClick={collapse} aria-label="Ocultar menú" title="Ocultar menú" className="ml-auto rounded-lg p-2 text-[#5a6a82] hover:bg-[#e9f1fb] hover:text-[#062b5b]">
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-5">
        {navigation.map((group) => {
          const visibleItems = group.items.filter((item) => hasModule(session?.user, pageModule(item.href)));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <div className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[.18em] text-[#5a6a82]">{group.label}</div>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  // Con /stock y /stock/urbano, se marca solo la entrada más específica.
                  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
                  const active = matches(item.href) && !visibleItems.some((other) => other.href.length > item.href.length && matches(other.href));
                  return (
                    <Link key={item.href} href={item.href} onClick={close} className={cn(
                      "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition",
                      active ? "bg-[#062b5b] text-white shadow-sm" : "text-[#425979] hover:bg-[#edf4fc] hover:text-[#062b5b]",
                    )}>
                      <item.icon size={17} strokeWidth={active ? 2.5 : 2} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="m-3 rounded-2xl border border-[#dbe4ef] bg-[#f4f7fb] p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dce9f8] text-xs font-black text-[#0b5bbb]">{session?.user?.name?.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-[#10233f]">{session?.user?.name}</div>
            <div className="text-[11px] font-semibold text-[#5a6a82]">{session?.user?.role === "ADMIN" ? "Administrador" : "Usuario"}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-xs text-[#0b5bbb]">Salir</button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // Restore the sidebar preference saved in this browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem("dg-sidebar-collapsed") === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("dg-sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden w-[246px] border-r border-[#dce5ef] bg-white", !collapsed && "lg:block")}><SidebarContent collapse={toggleCollapsed} /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Cerrar menú" className="absolute inset-0 bg-black/45" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-white shadow-2xl"><SidebarContent close={() => setMobileOpen(false)} /></aside>
        </div>
      )}

      <div className={collapsed ? "" : "lg:pl-[246px]"}>
        {/* En escritorio no hay barra superior: el botón para ocultar el menú está en el menú, y con el menú oculto queda uno flotante para volver a mostrarlo. En celular sigue la barra con el botón de menú. */}
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-[#dfe6ef] bg-white/92 px-5 backdrop-blur-xl lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className="mr-3 rounded-xl border border-[#dbe4ef] bg-white p-2 text-[#334b6b]"><Menu size={18} /></button>
          <Image src="/brand/logo-dg-original.png" alt="Direct Group" width={140} height={55} priority unoptimized className="mr-4 h-9 w-auto object-contain" />
        </header>
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Mostrar menú"
            title="Mostrar menú"
            className="fixed left-3 top-4 z-20 hidden rounded-xl border border-[#dbe4ef] bg-white p-2 text-[#334b6b] shadow-sm hover:text-[#0b5bbb] lg:block"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <main className={cn("mx-auto px-4 py-4 lg:px-6 lg:py-5", collapsed ? "max-w-none lg:pl-16" : "max-w-[1600px]")}>{children}</main>
      </div>
      <AssistantPanel />
    </div>
  );
}
