// El menú ya muestra en qué sección se está: el título queda solo para lectores de pantalla.
export function PageHeader({ title }: { title: string }) {
  return <h1 className="sr-only">{title}</h1>;
}
