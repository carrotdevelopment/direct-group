import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Las fotos de productos son archivos subidos por los usuarios (no se optimizan con next/image).
    rules: { "@next/next/no-img-element": "off" },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    // Agente de Tango: scripts de Node con require(), se instalan aparte en el servidor de la empresa.
    "tango-sync-agent/**",
    "dev/**",
    "local-data/**",
  ]),
]);
