import { NextResponse } from "next/server";
import {
  appendEgressRows,
  egressSchemas,
  getOperationsSummary,
  readEgressRows,
  type EgressClient,
} from "@/lib/operation-excel-db";
import { validateUploadedFile } from "@/lib/upload-validation";

export const runtime = "nodejs";

function isEgressClient(value: string): value is EgressClient {
  return Object.hasOwn(egressSchemas, value);
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const selectedClient = isEgressClient(client) ? client : undefined;
  return NextResponse.json({
    clients: Object.keys(egressSchemas),
    summary: getOperationsSummary().egress,
    rows: readEgressRows({ client: selectedClient, from, to }),
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const client = String(formData.get("client") || "");
  const file = formData.get("file");

  if (!isEgressClient(client)) {
    return NextResponse.json(
      { ok: false, message: "Cliente inválido para egresos." },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "Tenés que adjuntar un archivo Excel." },
      { status: 400 },
    );
  }
  const validation = validateUploadedFile(file, {
    allowedExtensions: ["xlsx", "xls"],
    label: `El archivo de egresos ${client}`,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: validation.message },
      { status: 400 },
    );
  }

  const result = appendEgressRows(
    client,
    Buffer.from(await file.arrayBuffer()),
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, receivedHeaders: result.receivedHeaders },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...result,
    message: `${result.insertedRows} egresos ${client} cargados. Total acumulado: ${result.totalRows}.`,
  });
}
