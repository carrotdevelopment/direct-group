// Borrador de un formulario guardado en el navegador, para seguir después de ir a otra pantalla. Si el navegador
// no deja guardar, la pantalla funciona igual sin borrador.
const key = (name: string) => `dg-borrador:${name}`;

export function readDraft<T>(name: string): T | null {
  try {
    const raw = window.localStorage.getItem(key(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(name: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key(name));
    else window.localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible no hay borrador.
  }
}
