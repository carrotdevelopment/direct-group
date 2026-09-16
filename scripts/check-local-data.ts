import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { inspectLocalDataFolder } = await import("../lib/local-data-health");
  const health = inspectLocalDataFolder();

  console.log(`Carpeta Excel: ${health.folder}`);
  for (const file of health.files) {
    const requirement = file.required ? "requerido" : "opcional";
    const status = file.exists ? `OK (${file.sizeLabel})` : "FALTA";
    console.log(`${status.padEnd(16)} ${requirement.padEnd(10)} ${file.fileName}`);
  }

  if (!health.ok) {
    console.error(
      `La carpeta no está lista: faltan ${health.missingRequired} archivos requeridos.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("La carpeta local contiene todas las fuentes requeridas.");
}

void main();
