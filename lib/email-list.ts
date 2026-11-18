// Un contacto de proveedor puede tener varios correos (ej. "nbianucci@zecat.com / jmorales@zecat.com"):
// se aceptan separados por coma, punto y coma, barra o espacios y se guardan como "a@x.com, b@x.com".
const EMAIL = /^[^\s@,;/]+@[^\s@,;/]+\.[^\s@,;/]+$/;

export function splitEmails(text: string) {
  return String(text ?? "").split(/[\s,;/]+/).map((part) => part.trim()).filter(Boolean);
}

// Lista limpia y sin repetidos, o null si alguno no es un correo válido (o no hay ninguno).
export function parseEmailList(text: string): string[] | null {
  const parts = splitEmails(text);
  if (parts.length === 0 || parts.some((part) => !EMAIL.test(part))) return null;
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const formatEmailList = (emails: string[]) => emails.join(", ");
