import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import {
  readProductsFromExcel,
  type ExcelPrice,
  type ExcelProduct,
} from "@/lib/local-excel-db";

type ImportInput = {
  supplier: string;
  month: number;
  year: number;
  fileName: string;
  buffer: Buffer;
};

export type PriceImportPreview = {
  prices: ExcelPrice[];
  message: string;
  warnings: string[];
};

type ParsedPdf = {
  prices: ExcelPrice[];
  productCount: number;
  unmatchedCount: number;
  warnings?: string[];
};

PDFParse.setWorker(
  pathToFileURL(
    path.resolve(
      process.cwd(),
      "node_modules",
      "pdf-parse",
      "dist",
      "pdf-parse",
      "esm",
      "pdf.worker.mjs",
    ),
  ).href,
);

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  let normalized = raw;
  if (raw.includes(".") && raw.includes(",")) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    normalized = raw.replace(/,/g, "");
  } else {
    normalized = raw.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value: unknown) {
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (/^[12][,.]\d{2,4}$/.test(raw)) {
    const multiplier = Number(raw.replace(",", "."));
    if (Number.isFinite(multiplier)) return roundMoney((multiplier - 1) * 100);
  }
  const parsed = number(value);
  if (parsed > 0 && parsed <= 1) return roundMoney(parsed * 100);
  if (parsed > 1 && parsed <= 3) return roundMoney((parsed - 1) * 100);
  return parsed;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateMarkup(costDg: number, vatRate: number, publicPrice: number) {
  if (!costDg || !publicPrice) return 0;
  const netPublicPrice = publicPrice / (1 + vatRate / 100);
  return roundMoney(((netPublicPrice - costDg) / costDg) * 100);
}

function informedAt(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

function readAlias(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([key]) =>
    normalizedAliases.has(normalizeHeader(key)),
  );
  return entry?.[1] ?? "";
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    defval: "",
    header: 1,
    raw: false,
  });
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map((cell) => normalizeHeader(text(cell)));
    const hasProductPriceHeader =
      headers.includes("producto") &&
      (headers.includes("preciounitario") ||
        headers.includes("preciosugeridodeventa") ||
        headers.includes("preciopublico"));
    const hasCodePriceHeader =
      headers.includes("codigo") &&
      (headers.includes("pvp") ||
        headers.includes("preciovtasiva") ||
        headers.includes("preciovtasiniva") ||
        headers.includes("precioventasiniva"));
    return hasProductPriceHeader || hasCodePriceHeader;
  });

  if (headerIndex === -1) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
  }

  const headers = matrix[headerIndex].map((cell) => text(cell));
  return matrix.slice(headerIndex + 1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] ?? "";
    });
    return record;
  });
}

function sheetsForImport(input: ImportInput, workbook: XLSX.WorkBook) {
  const supplier = input.supplier.trim().toUpperCase();
  if (supplier === "ACEGAME") {
    const orderSheet = workbook.SheetNames.find(
      (sheetName) => normalizeHeader(sheetName) === "notadepedido",
    );
    if (orderSheet) return [orderSheet];
  }

  return workbook.SheetNames;
}

function isLikelyProductCode(value: string) {
  const normalized = normalizeHeader(value);
  return /\d/.test(normalized) && normalized !== "observaciones";
}

function productsForSupplier(supplier: string) {
  const canonicalSupplier = supplier.trim().toLowerCase();
  const products = readProductsFromExcel();
  const exactMatches = products.filter(
    (product) => product.supplier.trim().toLowerCase() === canonicalSupplier,
  );
  if (exactMatches.length) return exactMatches;
  if (canonicalSupplier === "alpaca") {
    return products.filter((product) =>
      product.supplier.trim().toLowerCase().includes("alpaca"),
    );
  }
  return [];
}

function productLookup(products: ExcelProduct[]) {
  const map = new Map<string, ExcelProduct>();
  for (const product of products) {
    for (const code of [product.code, product.supplierCode]) {
      const normalized = normalizeCode(code);
      if (normalized) map.set(normalized, product);
    }
  }
  return map;
}

function priceId(supplier: string, date: string, code: string, index: number) {
  const safeSupplier = supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeCode = code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `import-${safeSupplier}-${date}-${safeCode || index}-${randomUUID().slice(0, 8)}`;
}

function amountAfter(textValue: string, startIndex: number) {
  const segment = textValue.slice(startIndex, startIndex + 80);
  const match = segment.match(
    /(?:\$|ARS|\bPRECIO\b|\bLISTA\b|\bNETO\b)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d{4,})/i,
  );
  return match ? number(match[1]) : 0;
}

function amountMatches(textValue: string) {
  const matches: Array<{ amount: number; index: number; vatRate: number }> = [];
  const pattern = /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/g;
  for (const match of textValue.matchAll(pattern)) {
    const index = match.index ?? 0;
    const context = textValue.slice(index, index + 120);
    matches.push({
      amount: number(match[1]),
      index,
      vatRate: /10[,.]5/.test(context) ? 10.5 : 21,
    });
  }
  return matches;
}

function rowToPrice(
  input: ImportInput,
  product: ExcelProduct,
  index: number,
  values: Partial<
    Pick<ExcelPrice, "costDg" | "vatRate" | "publicPrice" | "markup">
  >,
): ExcelPrice {
  const date = informedAt(input.year, input.month);
  const costDg = values.costDg ?? 0;
  const vatRate = values.vatRate && values.vatRate > 0 ? values.vatRate : 21;
  const publicPrice = values.publicPrice ?? 0;
  return {
    id: priceId(input.supplier, date, product.code, index),
    supplier: input.supplier,
    uniqueCode: product.code,
    informedAt: date,
    costDg,
    vatRate,
    publicPrice,
    markup: calculateMarkup(costDg, vatRate, publicPrice),
  };
}

function parseExcel(input: ImportInput): PriceImportPreview {
  const products = productsForSupplier(input.supplier);
  const lookup = productLookup(products);
  const workbook = XLSX.read(input.buffer, {
    type: "buffer",
    cellDates: false,
  });
  const sheetNames = sheetsForImport(input, workbook);
  const rows = sheetNames.flatMap((sheetName) =>
    rowsFromSheet(workbook.Sheets[sheetName] ?? {}),
  );
  let unmatchedCount = 0;
  const unmatchedCodes = new Set<string>();
  const prices = rows
    .map((row, index) => {
      const sourceCode = text(
        readAlias(row, [
          "Codigo Unico",
          "Codigo",
          "SKU",
          "Modelo",
          "Producto",
          "Cod Producto",
          "Codigo Producto",
        ]),
      );
      if (!sourceCode || !isLikelyProductCode(sourceCode)) return null;
      const product = lookup.get(normalizeCode(sourceCode));
      if (!product) {
        unmatchedCount += 1;
        unmatchedCodes.add(sourceCode);
        return null;
      }
      return rowToPrice(input, product, index, {
        costDg: number(
          readAlias(row, [
            "Costo DG",
            "Costo",
            "Neto",
            "Precio",
            "Precio Unitario",
            "Precio Vta S IVA",
            "Precio VTA. S/IVA",
            "PRECIO VTA. S/IVA",
            "Precio Venta S IVA",
            "Precio Vta Sin IVA",
            "Precio Venta Sin IVA",
            "Contado",
            "Precio Contado",
          ]),
        ),
        vatRate: percent(readAlias(row, ["IVA", "Alicuota IVA", "IMP"])),
        publicPrice: number(
          readAlias(row, [
            "Precio Publico",
            "PVP",
            "Precio Lista",
            "Lista",
            "Precio Sugerido de Venta",
          ]),
        ),
        markup: percent(readAlias(row, ["Mark Up", "Markup", "Margen"])),
      });
    })
    .filter((row): row is ExcelPrice => Boolean(row));
  const message = prices.length
    ? `Se detectaron ${prices.length} filas validas desde ${input.fileName}.`
    : unmatchedCount > 0
      ? `No hay precios para cargar: los codigos del archivo no existen en Productos DG para ${input.supplier}.`
      : `No pude detectar filas de precios en ${input.fileName}. Revisá si el formato del proveedor está preparado.`;

  return {
    prices,
    message,
    warnings: [
      `${products.length} productos de ${input.supplier} encontrados en Base Productos DG.`,
      `Hojas procesadas: ${sheetNames.join(", ")}.`,
      `${unmatchedCount} filas se omitieron porque el codigo no existe en productos.`,
      ...(unmatchedCodes.size
        ? [
            `Codigos no encontrados: ${Array.from(unmatchedCodes)
              .slice(0, 12)
              .join(", ")}${unmatchedCodes.size > 12 ? "..." : ""}.`,
          ]
        : []),
      ...(prices.length
        ? []
        : ["No encontre filas que crucen contra el listado de productos."]),
    ],
  };
}

function parseSilvestrinCatalogText(
  textContent: string,
  input: ImportInput,
): ParsedPdf {
  const products = productsForSupplier(input.supplier);
  const lookup = productLookup(products);
  const seen = new Set<string>();
  const unmatched = new Set<string>();
  const prices: ExcelPrice[] = [];
  const entryPattern =
    /([A-Z0-9][A-Z0-9 /+&-]{1,70}?)\s*\.\s*([A-Z0-9][A-Z0-9/-]*[A-Z0-9i])\b/g;

  for (const line of textContent
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\r?\n/)) {
    for (const match of line.matchAll(entryPattern)) {
      const sourceCode = match[2].replace(/\s+/g, "").trim();
      if (!/[A-Z]/.test(sourceCode) || !/\d/.test(sourceCode)) continue;
      const normalizedCode = normalizeCode(sourceCode);
      if (seen.has(normalizedCode)) continue;
      const product = lookup.get(normalizedCode);
      if (!product) {
        unmatched.add(sourceCode);
        continue;
      }
      seen.add(normalizedCode);
      prices.push(
        rowToPrice(input, product, prices.length, {
          costDg: amountAfter(line, (match.index ?? 0) + match[0].length),
          vatRate: 21,
        }),
      );
    }
  }

  return {
    prices,
    unmatchedCount: unmatched.size,
    productCount: products.length,
  };
}

function findAlpacaPriceNearCode(textContent: string, code: string) {
  const normalizedText = textContent.toUpperCase();
  const normalizedCode = code.toUpperCase();
  const codeIndex = normalizedText.indexOf(normalizedCode);
  if (codeIndex === -1) return null;

  const afterCode = normalizedText.slice(codeIndex, codeIndex + 260);
  const agotadoIndex = afterCode.indexOf("AGOTADO");
  const nextBarcodeIndex = afterCode.indexOf("CÓDIGODEBARRAS");
  if (
    agotadoIndex >= 0 &&
    (nextBarcodeIndex === -1 || agotadoIndex < nextBarcodeIndex)
  ) {
    return null;
  }

  const windowStart = Math.max(0, codeIndex - 520);
  const windowEnd = Math.min(textContent.length, codeIndex + 520);
  const windowText = textContent.slice(windowStart, windowEnd);
  const localCodeIndex = codeIndex - windowStart;
  const matches = amountMatches(windowText)
    .filter((match) => match.amount > 0)
    .map((match) => ({
      ...match,
      distance: Math.abs(match.index - localCodeIndex),
    }))
    .sort((left, right) => left.distance - right.distance);

  return matches[0] ?? null;
}

function parseAlpacaCatalogText(
  textContent: string,
  input: ImportInput,
): ParsedPdf {
  const products = productsForSupplier(input.supplier);
  const prices: ExcelPrice[] = [];
  let unmatchedCount = 0;

  for (const product of products) {
    const codes = Array.from(
      new Set([product.supplierCode, product.code].map(text).filter(Boolean)),
    ).sort((left, right) => right.length - left.length);
    const match = codes
      .map((code) => findAlpacaPriceNearCode(textContent, code))
      .find(Boolean);

    if (!match) {
      unmatchedCount += 1;
      continue;
    }

    const grossPrice = match.amount;
    const vatRate = match.vatRate;
    prices.push(
      rowToPrice(input, product, prices.length, {
        costDg: roundMoney(grossPrice / (1 + vatRate / 100)),
        vatRate,
        publicPrice: 0,
      }),
    );
  }

  return {
    prices,
    unmatchedCount,
    productCount: products.length,
    warnings: [
      "ALPACA se procesa por cercanía entre código y precio dentro del PDF ilustrado; revisá el preview antes de confirmar.",
      "El PDF informa costo con IVA incluido: se carga Costo DG neto calculado y Precio público en 0 porque no figura.",
    ],
  };
}

async function parsePdf(input: ImportInput): Promise<PriceImportPreview> {
  const parser = new PDFParse({ data: input.buffer });
  try {
    const result = await parser.getText();
    const supplier = input.supplier.trim().toUpperCase();
    const parsed = supplier.includes("ALPACA")
      ? parseAlpacaCatalogText(result.text || "", input)
      : supplier === "SILVESTRIN"
        ? parseSilvestrinCatalogText(result.text || "", input)
        : { prices: [], unmatchedCount: 0, productCount: 0, warnings: [] };

    return {
      prices: parsed.prices,
      message: `Se proceso ${input.fileName}.`,
      warnings: [
        `${parsed.productCount} productos de ${input.supplier} encontrados en Base Productos DG.`,
        ...(parsed.warnings ?? []),
        `${parsed.unmatchedCount} codigos/modelos del PDF se omitieron porque no existen en productos.`,
        ...(parsed.prices.length
          ? []
          : [
              "No pude detectar codigos que existan en el listado de productos.",
            ]),
        ...(parsed.prices.some((price) => price.costDg > 0)
          ? []
          : [
              "No detecte importes asociados a los codigos validados. Si el PDF tiene precios como imagen, cargalos manualmente en el preview o usa un Excel con importes.",
            ]),
      ],
    };
  } finally {
    await parser.destroy();
  }
}

export async function previewPriceImport(
  input: ImportInput,
): Promise<PriceImportPreview> {
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return parsePdf(input);
  if (["xlsx", "xls", "xlsm", "csv"].includes(extension || "")) {
    return parseExcel(input);
  }
  return {
    prices: [],
    message: "Formato no soportado.",
    warnings: ["Usa PDF, XLSX, XLS, XLSM o CSV."],
  };
}
