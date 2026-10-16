import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { getInboxThread, MailInboxError } from "@/lib/mail-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["correos"], false);
  if (denied) return denied;
  try {
    return NextResponse.json({ thread: await getInboxThread((await params).id) });
  } catch (error) {
    if (error instanceof MailInboxError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
