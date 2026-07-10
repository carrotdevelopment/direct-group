import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectLocalDataFolder } from "@/lib/local-data-health";

const tempFolders: string[] = [];

function makeTempFolder() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "dg-local-data-"));
  tempFolders.push(folder);
  return folder;
}

afterEach(() => {
  for (const folder of tempFolders.splice(0)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

describe("inspectLocalDataFolder", () => {
  it("marca la carpeta como no lista si faltan archivos requeridos", () => {
    const folder = makeTempFolder();
    fs.writeFileSync(path.join(folder, "Base Productos DG.xlsx"), "stub");

    const health = inspectLocalDataFolder(folder);

    expect(health.folderExists).toBe(true);
    expect(health.ok).toBe(false);
    expect(health.missingRequired).toBeGreaterThan(0);
  });

  it("detecta archivos semilla generados que conviene revisar", () => {
    const folder = makeTempFolder();
    fs.writeFileSync(path.join(folder, "Base Categorias DG.xlsx"), "small");

    const health = inspectLocalDataFolder(folder);
    const categories = health.files.find(
      (file) => file.fileName === "Base Categorias DG.xlsx",
    );

    expect(categories?.exists).toBe(true);
    expect(categories?.reviewRecommended).toBe(true);
  });
});
