import Link from "next/link";
import { requireAnyPageModule } from "@/server/lib/access";
import { AlertTriangle, Bell, CheckCircle2, Database, ExternalLink, LockKeyhole, Mail, Settings, Users } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { NotificationsForm, OrganizationForm } from "@/components/domain/settings-forms";
import { SupplierMailForm } from "@/components/domain/supplier-mail-settings-form";
import { accessModules, hasModule } from "@/lib/module-access";
import { prisma } from "@/server/lib/prisma";
import { backupHealth, displayDateTime, listBackups, readSetting, tangoHealth, urbanoHealth, withoutRecentLogin, type HealthCheck } from "@/lib/system-health";

const sections = [
  { key: "general", label: "General", icon: Settings },
  { key: "usuarios", label: "Usuarios y roles", icon: Users },
  { key: "seguridad", label: "Seguridad", icon: LockKeyhole },
  { key: "notificaciones", label: "Notificaciones", icon: Bell },
  { key: "datos", label: "Datos y backups", icon: Database },
  { key: "correos", label: "Correos a proveedores", icon: Mail },
] as const;
type SectionKey = (typeof sections)[number]["key"];

const ROLE_LABELS: Record<string, string> = { ADMIN: "Administrador", VENDEDOR: "Operador", DEPOSITO: "Depósito", LECTURA: "Solo lectura" };

export const metadata = { title: "Configuración" };
export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  // Los textos de los correos a proveedores los editan también quienes tienen el módulo Precios;
  // el resto de Configuración es solo para administradores.
  const user = await requireAnyPageModule(["admin", "precios"]);
  const isAdmin = hasModule(user, "admin");
  const visible = sections.filter((section) => isAdmin || section.key === "correos");
  const requested = (await searchParams).seccion;
  const current: SectionKey = visible.find((section) => section.key === requested)?.key ?? visible[0].key;

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Datos de la organización, usuarios, seguridad, avisos por correo y respaldos de la base."
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="card h-fit animate-enter p-2">
          {visible.map((section) => (
            <Link
              key={section.key}
              href={`/configuracion?seccion=${section.key}`}
              aria-current={section.key === current ? "page" : undefined}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-bold ${section.key === current ? "bg-[#e9f1fb] text-[#0b5bbb]" : "text-[#60738d] hover:bg-[#f2f6fb]"}`}
            >
              <section.icon size={16} />
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="grid gap-4">
          {current === "general" && <GeneralSection />}
          {current === "usuarios" && <UsersSection />}
          {current === "seguridad" && <SecuritySection />}
          {current === "notificaciones" && <NotificationsSection />}
          {current === "datos" && <DataSection />}
          {current === "correos" && <SupplierMailSection />}
        </div>
      </div>
    </>
  );
}

function Card({ title, description, children, aside }: { title: string; description: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card animate-enter p-5 sm:p-7">
      <div className="flex flex-col gap-3 border-b border-[#e1e8f1] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="mt-1 text-xs text-[#62728a]">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Status({ name, check }: { name: string; check: HealthCheck }) {
  return (
    <div className={`rounded-2xl border p-4 ${check.ok ? "border-[#cfe9d6] bg-[#f3fbf5]" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-2">
        {check.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />}
        <div>
          <div className="text-xs font-black text-[#10233f]">{name}</div>
          <div className={`mt-0.5 text-xs ${check.ok ? "text-[#23783a]" : "text-amber-900"}`}>{check.summary}</div>
          {check.details.map((detail) => <div key={detail} className="mt-0.5 text-[11px] text-[#62728a]">{detail}</div>)}
        </div>
      </div>
    </div>
  );
}

const lastLogin = (date: Date | null) => (date ? displayDateTime(date) : "Nunca");

async function GeneralSection() {
  const { value, updatedBy, updatedAt } = await readSetting("organizacion");
  return (
    <Card title="Información general" description="Datos de la organización y preferencias regionales.">
      <OrganizationForm initial={value} saved={{ updatedBy, updatedAt }} />
    </Card>
  );
}

async function UsersSection() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, moduleAccess: true, pasajeClients: true, lastLoginAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return (
    <Card
      title="Usuarios y roles"
      description="Quién tiene acceso a la plataforma y a qué módulos. Para dar de alta usuarios o cambiar permisos, usá Permisos."
      aside={
        <Link href="/permisos" className="inline-flex items-center gap-1.5 rounded-xl bg-[#062b5b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b3d7a]">
          Ir a Permisos <ExternalLink size={13} />
        </Link>
      }
    >
      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#dbe4ef]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f2f6fb] text-[10px] font-black uppercase tracking-[0.12em] text-[#6a7f98]">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Módulos</th>
              <th className="px-4 py-3">Último ingreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7edf5]">
            {users.map((user) => (
              <tr key={user.id} className={user.active ? "bg-white" : "bg-[#f8f9fb] text-[#8a99ad]"}>
                <td className="px-4 py-3">
                  <div className="font-bold text-[#10233f]">{user.name}</div>
                  <div className="text-[11px] text-[#62728a]">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  {ROLE_LABELS[user.role] ?? user.role}
                  {!user.active && <Badge tone="danger">Deshabilitado</Badge>}
                </td>
                <td className="max-w-[380px] px-4 py-3 text-[#425979]">
                  {user.role === "ADMIN"
                    ? "Todos"
                    : user.moduleAccess.map((key) => accessModules[key as keyof typeof accessModules] ?? key).join(", ") || "Sin módulos"}
                  {user.moduleAccess.includes("pasajes") && user.role !== "ADMIN" && (
                    <div className="text-[11px] text-[#8a99ad]">Pasajes: {user.pasajeClients.length ? user.pasajeClients.join(", ") : "sin clientes"}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[#425979]">{lastLogin(user.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-3 text-[11px] text-[#425979] sm:grid-cols-2">
        <p><strong>Administrador:</strong> acceso completo, incluidos Permisos, Configuración y Auditoría.</p>
        <p><strong>Operador y Depósito:</strong> ven y modifican solo los módulos que tienen asignados.</p>
        <p><strong>Solo lectura:</strong> ven sus módulos pero no pueden cargar ni modificar datos.</p>
        <p><strong>Pasajes:</strong> además del módulo, cada usuario aprueba los pasajes de los clientes que tiene asignados.</p>
      </div>
    </Card>
  );
}

async function SecuritySection() {
  const users = await prisma.user.findMany({ select: { name: true, role: true, active: true, lastLoginAt: true } });
  const active = users.filter((user) => user.active);
  const idle = withoutRecentLogin(active, 30);
  const admins = active.filter((user) => user.role === "ADMIN");
  const rules = [
    "Las contraseñas tienen como mínimo 12 caracteres y se guardan cifradas (bcrypt): nadie, ni un administrador, puede verlas.",
    "La sesión dura 8 horas; después hay que volver a ingresar.",
    "Si se cambia la contraseña de un usuario o se lo deshabilita, sus sesiones abiertas se cierran solas.",
    "Cada pantalla y cada operación controla el rol y los módulos del usuario en el servidor.",
    "Los cambios sobre los datos quedan registrados en Auditoría.",
  ];
  return (
    <Card title="Seguridad" description="Cómo se protege el acceso a la plataforma y qué conviene revisar.">
      <ul className="mt-5 space-y-2 text-xs text-[#334b6b]">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-700" />{rule}</li>
        ))}
      </ul>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Usuarios activos" value={String(active.length)} />
        <Metric label="Administradores" value={String(admins.length)} />
        <Metric label="Sin ingresar en 30 días" value={String(idle.length)} />
      </div>
      {idle.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <p>
              Usuarios activos que no ingresan hace más de 30 días: {idle.map((user) => `${user.name} (${lastLogin(user.lastLoginAt)})`).join(", ")}.
              Si ya no usan la plataforma, conviene deshabilitarlos en <Link href="/permisos" className="font-bold underline">Permisos</Link>.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

async function NotificationsSection() {
  const { value, updatedBy, updatedAt } = await readSetting("notificaciones");
  const [urbano, tango] = await Promise.all([urbanoHealth(), tangoHealth(value.tangoIdleBusinessDays)]);
  const backups = backupHealth();
  return (
    <>
      <Card title="Estado de las integraciones" description="Se revisa todos los días a las 8:00. Si algo falla, se avisa por correo a los destinatarios de abajo.">
        <div className="mt-5 grid gap-3">
          <Status name="Stock de Urbano (todos los días 7:00)" check={urbano} />
          <Status name="Conector de Tango (todos los días 6:00)" check={tango} />
          <Status name="Respaldo de la base (todas las noches 3:00)" check={backups} />
        </div>
      </Card>
      <Card title="Avisos por correo" description="A quién avisar y de qué. Los correos salen de proveedores@directgroup.com.ar.">
        <NotificationsForm initial={value} saved={{ updatedBy, updatedAt }} />
      </Card>
    </>
  );
}

async function SupplierMailSection() {
  const { value, updatedBy, updatedAt } = await readSetting("correoProveedores");
  return (
    <Card
      title="Correos a proveedores"
      description="Asunto y texto del pedido mensual de catálogo y de la reconsulta (Precios > Proveedores y destinatarios)."
      aside={
        <Link href="/precios" className="inline-flex items-center gap-1.5 rounded-xl bg-[#062b5b] px-4 py-2 text-xs font-bold text-white hover:bg-[#0b3d7a]">
          Ir a Precios <ExternalLink size={13} />
        </Link>
      }
    >
      <SupplierMailForm initial={value} saved={{ updatedBy, updatedAt }} />
    </Card>
  );
}

function DataSection() {
  const { folder, available, files } = listBackups();
  const health = backupHealth();
  const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
  return (
    <Card
      title="Datos y backups"
      description="Respaldos de las bases de producción. Todas las noches a las 3:00 se hace uno automático y se guardan los últimos 14 días."
      aside={<Badge tone={health.ok ? "success" : "danger"}>{health.ok ? "Al día" : "Revisar"}</Badge>}
    >
      <div className="mt-5"><Status name="Último respaldo automático" check={health} /></div>
      {!available ? (
        <p className="mt-5 text-xs text-[#8a99ad]">No se puede leer la carpeta de respaldos ({folder}) desde este servidor.</p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#dbe4ef]">
          <div className="grid grid-cols-[1fr_110px_150px] bg-[#f2f6fb] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#6a7f98]">
            <span>Archivo</span>
            <span>Tamaño</span>
            <span>Fecha</span>
          </div>
          {files.length === 0 && <p className="border-t border-[#e7edf5] px-4 py-6 text-center text-xs text-[#8a99ad]">Todavía no hay respaldos.</p>}
          {files.slice(0, 30).map((file) => (
            <div key={`${file.automatic}-${file.name}`} className="grid grid-cols-[1fr_110px_150px] items-center border-t border-[#e7edf5] px-4 py-3 text-xs">
              <span className="min-w-0 truncate font-mono text-[11px] text-[#263b57]" title={file.name}>
                {file.name}
                <span className="ml-2 font-sans text-[10px] font-bold text-[#8a99ad]">{file.automatic ? "automático" : "manual"}</span>
              </span>
              <span className="font-mono text-[11px] text-[#536980]">{mb(file.sizeBytes)}</span>
              <span className="text-[11px] text-[#536980]">{lastLogin(new Date(file.modifiedAt))}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] text-[#8a99ad]">
        Los respaldos quedan en el servidor ({folder}). Para restaurar uno hay que hacerlo desde el servidor: pedíselo a soporte técnico.
      </p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e8f1] bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7b8da3]">{label}</p>
      <p className="mt-1 text-lg font-black text-[#243a57]">{value}</p>
    </div>
  );
}
