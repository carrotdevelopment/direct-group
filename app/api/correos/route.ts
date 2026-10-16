import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { listInbox, MailInboxError } from "@/lib/mail-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await checkApiAccess(["correos"], false);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await listInbox({ query: params.get("q") ?? "", page: Number(params.get("page") ?? 0) }));
  } catch (error) {
    if (error instanceof MailInboxError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
