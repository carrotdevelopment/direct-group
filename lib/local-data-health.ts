import fs from "node:fs";
import path from "node:path";
import { getLocalDbFolder } from "@/lib/local-excel-db";

export type LocalDataFileSpec = {
  fileName: string;
  required: boolean;
  description: string;
  generatedByApp?: boolean;
};

export type LocalDataFileStatus = LocalDataFileSpec & {
  path: string;
  exists: boolean;
  sizeBytes: number;
  sizeLabel: string;
  updatedAt: string | null;
  reviewRecommended: boolean;
};

export type LocalDataHealth = {
  folder: string;
  folderExists: boolean;
  totalFiles: number;
  presentRequired: number;
  missingRequired: number;
  presentOptional: number;
  missingOptional: number;
  ok: boolean;
  files: LocalDataFileStatus[];
};

export const localDataFileSpecs: LocalDataFileSpec[] = [
  {
    fileName: "Base Productos DG.xlsx",
    required: true,
    description: "Maestro de productos y códigos únicos internos.",
  },
  {
    fileName: "Base Codigo Cliente DG.xlsx",
    required: true,
    description: "Equivalencias código cliente ↔ código único por período.",
    generatedByApp: true,
  },
  {
    fileName: "Base Proveedores DG.xlsx",
    required: true,
    description: "Maestro de proveedores disponibles para carga y pricing.",
  },
  {
    fileName: "Base Categorias DG.xlsx",
    required: true,
    description: "Maestro de categorías de producto.",
    generatedByApp: true,
  },
  {
    fileName: "Base Precios DG.xlsx",
    required: true,
    description: "Histórico principal de precios cargados por proveedor.",
  },
  {
    fileName: "Base Precios DG.json",
    required: false,
    description: "Cache derivado para acelerar lectura de precios.",
    generatedByApp: true,
  },
  {
    fileName: "Base Estructura Costos Santander DG.xlsx",
    required: true,
    description: "Estructura de costos vigente para Santander.",
  },
  {
    fileName: "Base Stock Santander DG.xlsx",
    required: true,
    description: "Vista base de stock Santander.",
  },
  {
    fileName: "Base Ingresos DG.xlsx",
    required: true,
    description: "Ingresos/órdenes acumuladas.",
  },
  {
    fileName: "Base Ingresos DG.json",
    required: false,
    description: "Cache derivado para ingresos.",
    generatedByApp: true,
  },
  ...[
    "Amex",
    "Credicoop",
    "HSBC",
    "Importados",
    "Massalin",
    "Pampa",
    "Producteca",
    "Santander",
    "Syngenta",
    "Umiles",
  ].flatMap((client): LocalDataFileSpec[] => [
    {
      fileName: `Base Egresos ${client} DG.xlsx`,
      required: client === "Santander",
      description: `Egresos históricos ${client}.`,
    },
    {
      fileName: `Base Egresos ${client} DG.json`,
      required: false,
      description: `Cache derivado de egresos ${client}.`,
      generatedByApp: true,
    },
  ]),
];

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function isProbablyGeneratedSeed(spec: LocalDataFileSpec, sizeBytes: number) {
  return Boolean(spec.generatedByApp && spec.required && sizeBytes > 0 && sizeBytes < 30_000);
}

export function inspectLocalDataFolder(folder = getLocalDbFolder()): LocalDataHealth {
  const resolvedFolder = path.resolve(folder);
  const folderExists = fs.existsSync(resolvedFolder);
  const files = localDataFileSpecs.map((spec): LocalDataFileStatus => {
    const filePath = path.join(resolvedFolder, spec.fileName);
    const exists = fs.existsSync(filePath);
    const stats = exists ? fs.statSync(filePath) : null;
    const sizeBytes = stats?.size ?? 0;

    return {
      ...spec,
      path: filePath,
      exists,
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
      updatedAt: stats?.mtime.toISOString() ?? null,
      reviewRecommended: exists && isProbablyGeneratedSeed(spec, sizeBytes),
    };
  });
  const required = files.filter((file) => file.required);
  const optional = files.filter((file) => !file.required);
  const presentRequired = required.filter((file) => file.exists).length;
  const missingRequired = required.length - presentRequired;
  const presentOptional = optional.filter((file) => file.exists).length;

  return {
    folder: resolvedFolder,
    folderExists,
    totalFiles: folderExists ? fs.readdirSync(resolvedFolder).length : 0,
    presentRequired,
    missingRequired,
    presentOptional,
    missingOptional: optional.length - presentOptional,
    ok: folderExists && missingRequired === 0,
    files,
  };
}
