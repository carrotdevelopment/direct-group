import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REQUEST_TEMPLATE_FILE } from "@/lib/pasaje-request-workbook";

// Planilla original de la solicitud de pasaje (con el logo de Urbano), leída una vez del disco.
let cached: Promise<Uint8Array> | null = null;
export function readRequestTemplate() {
  cached ??= readFile(path.join(process.cwd(), REQUEST_TEMPLATE_FILE)).then((buffer) => new Uint8Array(buffer));
  cached.catch(() => { cached = null; });
  return cached;
}
